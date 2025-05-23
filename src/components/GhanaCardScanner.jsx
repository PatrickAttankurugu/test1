"use client";
import { useState, useEffect, useRef } from "react";
import { captureCard } from "@/utilities/captureUtilities";
import { preprocessFrame, processYoloOutput } from "@/utilities/tfUtilities";
import { drawDetections } from "@/utilities/drawUtilities";
import { useSearchParams } from "next/navigation";
import Autheo from "../assets/Autheo_this.png";
import Image from "next/image";
import Link from "next/link";
import "../style/style.css";

// Helper function to detect mobile devices
function isMobileDevice() {
  const hasWindow = typeof window !== 'undefined';
  const hasNavigator = typeof navigator !== 'undefined';

  const hasTouchEvents = hasWindow && ('ontouchstart' in window || (hasNavigator && navigator.maxTouchPoints > 0));
  const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
  const isMobileUserAgent = hasNavigator && mobileRegex.test(navigator.userAgent);

  return hasTouchEvents || isMobileUserAgent;
}

export default function GhanaCardScanner() {
  console.log("[Smart-Capture] Initializing GhanaCardScanner component");

  // Get URL parameters
  const searchParams = useSearchParams();
  const verification_id = searchParams.get("verification_id");
  const verification_type = searchParams.get("verification_type");

  console.log(`[Smart-Capture] Received verification_id: ${verification_id}`);
  console.log(`[Smart-Capture] Received verification_type: ${verification_type}`);

  // Camera, Video and Canvas Refs
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const captureRef = useRef(null);
  const cameraRef = useRef(null);

  // Model and Processing Refs
  const modelRef = useRef(null);
  const processingRef = useRef(false);
  const detectionRef = useRef([]);

  // Detection Loop Control Refs
  const animationFrameRef = useRef(null);
  const isDetectionActiveRef = useRef(false);

  // App Status States
  const [status, setStatus] = useState("Initializing...");
  const [modelStatus, setModelStatus] = useState("Initializing");
  const [cameraStatus, setCameraStatus] = useState(false);
  const [invalidCardDetected, setInvalidCardDetected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Capture and Detection States
  const [captureMessage, setCaptureMessage] = useState("No card captured yet");
  const [consecutiveDetections, setConsecutiveDetections] = useState(0);
  const [submitEnabled, setSubmitEnabled] = useState(false);

  // Mobile-specific states
  const [isMobile, setIsMobile] = useState(false);
  const [orientation, setOrientation] = useState('portrait');
  const [modelLoadingProgress, setModelLoadingProgress] = useState(0);
  const [cameraPermissionState, setCameraPermissionState] = useState('requesting');

  // Dynamic parameters based on device type
  const getDeviceSpecificParams = () => {
    if (isMobile) {
      return {
        confidenceThreshold: 0.45, // Lower for mobile
        minConsecutiveDetections: 2, // Faster capture on mobile
        minDetectionAreaRatio: 0.15, // More lenient area requirements
        maxDetectionAreaRatio: 0.85,
        alignmentThreshold: 0.25, // More lenient alignment
        aspectRatioMin: 1.2, // More lenient aspect ratio
        aspectRatioMax: 2.0
      };
    } else {
      return {
        confidenceThreshold: 0.6,
        minConsecutiveDetections: 4,
        minDetectionAreaRatio: 0.3,
        maxDetectionAreaRatio: 0.9,
        alignmentThreshold: 0.4,
        aspectRatioMin: 1.3,
        aspectRatioMax: 1.9
      };
    }
  };

  // Mobile detection and orientation handling
  useEffect(() => {
    const checkMobile = () => {
      const mobile = isMobileDevice();
      setIsMobile(mobile);
      console.log(`[Smart-Capture] Device type: ${mobile ? 'Mobile' : 'Desktop'}`);
      
      if (typeof window !== 'undefined') {
        setOrientation(window.innerHeight > window.innerWidth ? 'portrait' : 'landscape');
      }
    };

    const handleResize = () => {
      checkMobile();
      // Adjust video container on orientation change
      if (videoRef.current && canvasRef.current) {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        setTimeout(() => {
          if (video.videoWidth && video.videoHeight) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
          }
        }, 100);
      }
    };

    if (typeof window !== 'undefined') {
      checkMobile();
      window.addEventListener('resize', handleResize);
      window.addEventListener('orientationchange', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('orientationchange', handleResize);
      };
    }
  }, []);

  // Prevent zoom on mobile
  useEffect(() => {
    if (isMobile && typeof document !== 'undefined') {
      const preventDefault = (e) => {
        if (e.touches && e.touches.length > 1) {
          e.preventDefault();
        }
      };

      document.addEventListener('touchstart', preventDefault, { passive: false });
      document.addEventListener('touchmove', preventDefault, { passive: false });

      return () => {
        document.removeEventListener('touchstart', preventDefault);
        document.removeEventListener('touchmove', preventDefault);
      };
    }
  }, [isMobile]);

  // Notify parent window when component mounts
  useEffect(() => {
    console.log("[Smart-Capture] Notifying parent window that scanner is ready");
    if (typeof window !== 'undefined' && window.parent) {
      window.parent.postMessage(
        {
          type: "GHANA_CARD_SCANNER_READY",
          data: { verification_id, verification_type },
        },
        "*"
      );
    }

    return () => {
      console.log("[Smart-Capture] Component unmounting, cleaning up...");
      stopCamera();
    };
  }, [verification_id, verification_type]);

  // Enhanced TensorFlow initialization with progress tracking
  useEffect(() => {
    console.log("[Smart-Capture] Initializing TensorFlow.js...");
    const init = async () => {
      try {
        // Check TensorFlow availability
        setStatus("Checking AI components...");
        setModelLoadingProgress(10);
        
        if (typeof window === 'undefined' || !window.tf || !window.tflite) {
          console.error("[Smart-Capture] TensorFlow.js or TFLite not found");
          setStatus("AI components not available. Please refresh the page.");
          setIsLoading(false);
          return;
        }

        console.log("[Smart-Capture] TensorFlow.js detected, initializing...");
        setStatus(isMobile ? "Preparing AI model for mobile..." : "Preparing AI model...");
        setModelLoadingProgress(25);
        
        // Wait for TensorFlow to be ready
        await tf.ready();
        setModelLoadingProgress(40);
        
        // Set backend for better mobile performance
        if (isMobile) {
          setStatus("Optimizing for mobile device...");
          try {
            await tf.setBackend('webgl');
            console.log("[Smart-Capture] WebGL backend set for mobile");
          } catch (backendError) {
            console.warn("[Smart-Capture] WebGL not available, using CPU backend");
            await tf.setBackend('cpu');
          }
        }
        
        setModelLoadingProgress(60);
        setStatus("Loading Ghana Card detection model...");
        console.log("[Smart-Capture] Loading TFLite model from /model/autocapture.tflite");

        // Load model with error handling
        const loadedModel = await tflite.loadTFLiteModel("/model/autocapture.tflite");
        modelRef.current = loadedModel;
        
        setModelLoadingProgress(90);
        console.log("[Smart-Capture] Model loaded successfully");
        setStatus("AI model ready. Initializing camera...");
        setModelStatus("Ghana Card Detection AI: Ready");

        setModelLoadingProgress(100);
        await startCamera();
        setIsLoading(false);
        
      } catch (err) {
        console.error("[Smart-Capture] Error during initialization:", err);
        setStatus(`Initialization failed: ${err.message}. Please refresh and try again.`);
        setIsLoading(false);
      }
    };
    
    init();
  }, [isMobile]);

  // Enhanced camera start function with better mobile support
  const startCamera = async () => {
    console.log("[Smart-Capture] Attempting to start camera...");
    setCameraPermissionState('requesting');
    
    const runningOnMobile = isMobile;
    console.log(`[Smart-Capture] Device type: ${runningOnMobile ? 'Mobile' : 'Desktop'}`);

    // Enhanced constraints for better mobile performance
    const getConstraints = (fallbackLevel = 0) => {
      const baseConstraints = {
        audio: false,
        video: {
          facingMode: "environment"
        }
      };

      if (runningOnMobile) {
        switch (fallbackLevel) {
          case 0: // Optimal mobile settings
            return {
              ...baseConstraints,
              video: {
                ...baseConstraints.video,
                width: { ideal: 1280, min: 640, max: 1920 },
                height: { ideal: 720, min: 480, max: 1080 },
                aspectRatio: { ideal: 16/9 },
                frameRate: { ideal: 24, max: 30 },
                focusMode: "continuous"
              }
            };
          case 1: // Reduced quality
            return {
              ...baseConstraints,
              video: {
                ...baseConstraints.video,
                width: { ideal: 960, min: 480 },
                height: { ideal: 540, min: 360 },
                frameRate: { ideal: 20, max: 24 }
              }
            };
          case 2: // Basic mobile
            return {
              ...baseConstraints,
              video: {
                ...baseConstraints.video,
                width: { ideal: 640 },
                height: { ideal: 480 }
              }
            };
          default: // Minimal constraints
            return { video: { facingMode: "environment" } };
        }
      } else {
        // Desktop constraints
        return {
          ...baseConstraints,
          video: {
            ...baseConstraints.video,
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 720, max: 1080 },
            frameRate: { ideal: 30 }
          }
        };
      }
    };

    const tryStartCamera = async (fallbackLevel = 0) => {
      const constraints = getConstraints(fallbackLevel);
      
      try {
        if (fallbackLevel === 0) {
          setStatus("Requesting camera permission...");
        } else {
          setStatus(`Trying camera settings (${fallbackLevel + 1}/4)...`);
        }

        console.log(`[Smart-Capture] Trying constraints level ${fallbackLevel}:`, constraints);
        
        if (typeof navigator === 'undefined' || !navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
          throw new Error("Camera API not available in this browser");
        }

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        const video = videoRef.current;
        if (!video) {
          stream.getTracks().forEach(track => track.stop());
          throw new Error("Video element not available");
        }
        
        video.srcObject = stream;
        setCameraPermissionState('granted');
        setStatus("Camera permission granted. Loading video...");

        await new Promise((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            reject(new Error("Video loading timeout"));
          }, 10000); // 10 second timeout

          video.onloadedmetadata = () => {
            clearTimeout(timeoutId);
            console.log(
              "[Smart-Capture] Video metadata loaded, dimensions:",
              video.videoWidth, "x", video.videoHeight
            );
            
            video.play().then(() => {
              resolve();
            }).catch(playError => {
              console.error("[Smart-Capture] Error playing video:", playError);
              reject(playError);
            });
          };
          
          video.onerror = (err) => {
            clearTimeout(timeoutId);
            console.error("[Smart-Capture] Video element error:", err);
            reject(new Error("Video playback error"));
          };
        });

        const canvas = canvasRef.current;
        if (!canvas || !video.videoWidth || !video.videoHeight) {
          throw new Error("Canvas setup failed - invalid video dimensions");
        }
        
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        console.log("[Smart-Capture] Canvas dimensions set to:", canvas.width, "x", canvas.height);

        cameraRef.current = stream;
        setCameraStatus(true);
        setCameraPermissionState('active');
        setStatus("Camera active. Position your Ghana Card clearly in the frame.");
        
        // Start detection after a brief delay to ensure everything is ready
        setTimeout(() => {
          isDetectionActiveRef.current = true;
          startDetectionLoop();
        }, 500);

        return true;

      } catch (err) {
        console.error(`[Smart-Capture] Camera start attempt ${fallbackLevel + 1} failed:`, err);
        
        if (err.name === "NotAllowedError") {
          setCameraPermissionState('denied');
          setStatus("Camera permission denied. Please allow camera access and refresh the page.");
          return false;
        } else if (err.name === "NotFoundError") {
          setStatus("No camera found. Please check your device has a camera.");
          return false;
        } else if (fallbackLevel < 3) {
          // Try next fallback level
          return await tryStartCamera(fallbackLevel + 1);
        } else {
          setStatus(`Camera error: ${err.message}. Please refresh and try again.`);
          return false;
        }
      }
    };

    try {
      // Check for available cameras first
      if (typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoDevices = devices.filter(device => device.kind === 'videoinput');
          console.log('[Smart-Capture] Available video devices:', videoDevices.length);
          
          if (videoDevices.length === 0) {
            setStatus("No cameras found on this device.");
            return;
          }
        } catch (err) {
          console.warn('[Smart-Capture] Could not enumerate devices:', err);
        }
      }

      await tryStartCamera();
      
    } catch (err) {
      console.error("[Smart-Capture] Unexpected error starting camera:", err);
      setStatus("Unexpected camera error. Please refresh the page.");
    }
  };

  const stopCamera = () => {
    console.log("[Smart-Capture] Stopping camera...");
    const stream = videoRef.current?.srcObject;

    if (stream && typeof stream.getTracks === 'function') {
      stream.getTracks().forEach((track) => track.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
      setCameraStatus(false);
      setCameraPermissionState('inactive');
      setStatus("Camera stopped.");
    }

    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext("2d");
      if (canvasRef.current.width > 0 && canvasRef.current.height > 0) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    cameraRef.current = null;
    processingRef.current = false;
    isDetectionActiveRef.current = false;
    console.log("[Smart-Capture] Camera stopped and resources cleaned up");
  };

  const startDetectionLoop = () => {
    if (!isDetectionActiveRef.current) return;

    if (
      !videoRef.current || videoRef.current.paused || videoRef.current.ended ||
      !canvasRef.current || !cameraRef.current || !modelRef.current ||
      videoRef.current.videoWidth === 0 || videoRef.current.videoHeight === 0 ||
      videoRef.current.readyState < 2
    ) {
      animationFrameRef.current = requestAnimationFrame(startDetectionLoop);
      return;
    }

    if (!processingRef.current) {
      detectCard().catch(error => {
        console.error("[Smart-Capture] Error in detectCard:", error);
        setStatus("Detection error. Please ensure good lighting and try again.");
      });
    }

    if (isDetectionActiveRef.current) {
      animationFrameRef.current = requestAnimationFrame(startDetectionLoop);
    }
  };

  const detectCard = async () => {
    if (
      !videoRef.current || videoRef.current.paused || videoRef.current.ended ||
      !canvasRef.current || !modelRef.current ||
      videoRef.current.videoWidth === 0 || videoRef.current.videoHeight === 0 ||
      videoRef.current.readyState < 2
    ) {
      processingRef.current = false;
      return;
    }

    if (processingRef.current) return;
    processingRef.current = true;

    try {
      const { tensor, imageDims } = await preprocessFrame(videoRef);
      const predictions = await modelRef.current.predict(tensor);
      const detections = await processYoloOutput(predictions, imageDims);
      detectionRef.current = detections;

      if (canvasRef.current) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        if (canvas.width > 0 && canvas.height > 0) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        
        if (detections.length > 0) {
          drawDetections(detections, canvasRef, invalidCardDetected, isMobile);
          checkForAutoCapture(detections);
        } else {
          setConsecutiveDetections(0);
          setInvalidCardDetected(false);
        }
      }

      tensor.dispose();
      if (Array.isArray(predictions)) {
        predictions.forEach((p) => p?.dispose?.());
      } else {
        predictions?.dispose?.();
      }
    } catch (err) {
      console.error("[Smart-Capture] Detection error:", err);
      setStatus("Detection error: " + err.message);
    } finally {
      processingRef.current = false;
    }
  };

  const checkForAutoCapture = (detections) => {
    if (!detections || detections.length === 0 || !videoRef.current) {
      setConsecutiveDetections(0);
      setInvalidCardDetected(false);
      return;
    }

    const detection = detections[0];
    const videoWidth = videoRef.current.videoWidth;
    const videoHeight = videoRef.current.videoHeight;

    if (!videoWidth || !videoHeight) {
      setConsecutiveDetections(0);
      return;
    }

    const params = getDeviceSpecificParams();
    const areaRatio = (detection.box.width * detection.box.height) / (videoWidth * videoHeight);

    console.log(`[Smart-Capture] Detection check - Confidence: ${detection.confidence}, Aspect: ${detection.aspectRatio}, Area: ${areaRatio}`);

    // Enhanced detection logic with better messaging
    const hasGoodConfidence = detection.confidence > params.confidenceThreshold;
    const hasGoodAspectRatio = detection.aspectRatio >= params.aspectRatioMin && detection.aspectRatio <= params.aspectRatioMax;
    const hasGoodSize = areaRatio >= params.minDetectionAreaRatio && areaRatio <= params.maxDetectionAreaRatio;

    // Determine what's wrong and provide specific feedback
    if (!hasGoodConfidence) {
      setInvalidCardDetected(true);
      setStatus("Move closer to the camera for better detection");
      setConsecutiveDetections(0);
      return;
    }

    if (!hasGoodAspectRatio) {
      setInvalidCardDetected(true);
      setStatus("Please show a Ghana Card (ID card shape detected is incorrect)");
      setConsecutiveDetections(0);
      return;
    }

    if (!hasGoodSize) {
      if (areaRatio < params.minDetectionAreaRatio) {
        setInvalidCardDetected(true);
        setStatus("Card is too far - move closer to the camera");
        setConsecutiveDetections(0);
        return;
      } else {
        setInvalidCardDetected(true);
        setStatus("Card is too close - move back slightly");
        setConsecutiveDetections(0);
        return;
      }
    }

    // Card is valid, check alignment
    setInvalidCardDetected(false);
    const alignmentScore = detection.alignmentScore || 0;

    if (alignmentScore > params.alignmentThreshold) {
      setConsecutiveDetections((prev) => {
        const next = prev + 1;
        const remaining = params.minConsecutiveDetections - next;
        
        if (remaining > 0) {
          setStatus(`Ghana Card detected - Hold steady (${remaining} more seconds)`);
        } else {
          setStatus("Perfect! Capturing card...");
        }

        if (next >= params.minConsecutiveDetections) {
          console.log("[Smart-Capture] Auto-capturing card...");
          
          // Stop detection before capture
          isDetectionActiveRef.current = false;
          
          setTimeout(() => {
            captureCard(
              detection,
              videoRef,
              captureRef,
              setStatus,
              setCaptureMessage,
              setSubmitEnabled
            );
            setStatus("Ghana Card captured successfully!");
            
            // Clear detection canvas
            if (canvasRef.current) {
              const canvas = canvasRef.current;
              const ctx = canvas.getContext("2d");
              if (canvas.width > 0 && canvas.height > 0) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
              }
            }
          }, 100);
          
          return 0;
        }
        return next;
      });
    } else {
      setConsecutiveDetections((prev) => Math.max(0, prev - 1));
      setStatus("Hold the card steady and flat for better alignment");
    }
  };

  const sendToBackend = async () => {
    console.log("[Smart-Capture] Sending to backend...");
    
    if (!captureRef.current || captureRef.current.width === 0 || captureRef.current.height === 0) {
      setStatus("No valid card captured yet.");
      setCaptureMessage("No card captured to submit.");
      return;
    }

    setStatus("Submitting for verification...");

    try {
      const base64Image = captureRef.current.toDataURL("image/jpeg", 0.85);
      const base64Data = base64Image.split(",")[1];
      
      if (!base64Data) {
        setStatus("Error preparing image.");
        return;
      }

      const payload = { card_front: base64Data };
      
      const response = await fetch(
        `https://staging-videokyc.agregartech.com/api/v1/video-kyc/verifications/${verification_id}/verify-card-front/`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        let errorData = { message: `HTTP ${response.status}` };
        try { 
          errorData = await response.json(); 
        } catch (e) { 
          // Ignore parsing errors
        }
        throw new Error(`Verification failed: ${errorData.message || errorData.detail || 'Unknown error'}`);
      }

      const data = await response.json();
      console.log("[Smart-Capture] Verification successful:", data);

      if (typeof window !== 'undefined' && window.parent) {
        window.parent.postMessage(
          {
            type: "GHANA_CARD_CAPTURE_SUCCESS",
            data: { verification_id, verification_type, card_data: data },
          },
          "*"
        );
      }

      setStatus("Verification completed successfully!");
      setCaptureMessage("Card successfully verified");
      setSubmitEnabled(false);
    } catch (error) {
      console.error("[Smart-Capture] Backend error:", error);
      setStatus(`Verification failed: ${error.message}`);
      setCaptureMessage("Verification failed. Please try again.");
    }
  };

  // Loading progress component
  const LoadingProgress = () => (
    <div className="loading-progress mb-4">
      <div className="progress-bar bg-gray-200 rounded-full h-2 mb-2">
        <div 
          className="progress-fill bg-blue-600 h-2 rounded-full transition-all duration-300"
          style={{ width: `${modelLoadingProgress}%` }}
        ></div>
      </div>
      <div className="text-sm text-gray-600 text-center">
        {modelLoadingProgress}% Complete
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-white text-[#245C94] poppins p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl md:text-4xl font-bold mb-4 text-[#245C94] text-center">
          Ghana Card Auto-Capture
        </h1>

        <div className="status-container mb-6">
          <div className={`status text-center font-medium ${isLoading ? 'loading' : ''}`} id="status">
            {status}
          </div>
          {isLoading && modelLoadingProgress > 0 && <LoadingProgress />}
        </div>

        <div className="camera-container mb-8">
          <div id="video-container" className="relative">
            <video
              id="webcam"
              ref={videoRef}
              className="w-full rounded-lg"
              autoPlay
              playsInline
              muted
            />
            <canvas
              id="detection-canvas"
              ref={canvasRef}
              className="absolute top-0 left-0 w-full h-full"
            />
            <div className="guide-overlay">
              <div className="card-guide"></div>
            </div>
            
            {/* Camera permission overlay */}
            {cameraPermissionState === 'requesting' && cameraStatus === false && (
              <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center rounded-lg">
                <div className="text-white text-center p-4">
                  <div className="mb-2">📹</div>
                  <div className="font-medium">Camera Permission Required</div>
                  <div className="text-sm opacity-80">Please allow camera access to continue</div>
                </div>
              </div>
            )}
          </div>

          {invalidCardDetected && (
            <div className="invalid-card-warning text-red-500 text-center mt-2">
              {status.includes("too far") ? "📏 " : status.includes("too close") ? "📏 " : "⚠️ "}
              {status}
            </div>
          )}
        </div>

        <div className="result-container mb-8">
          <h2 className="text-xl font-bold text-[#245C94] mb-4 text-center">
            Captured Card
          </h2>
          <div className="flex justify-center mb-4">
            <canvas
              id="captured-card"
              ref={captureRef}
              className="border-2 border-gray-200 rounded-lg"
              width="320"
              height="202"
            />
          </div>
          <div className="capture-info text-center">
            <div id="capture-status" className="text-[#245C94] mb-4">
              {captureMessage}
            </div>
            <button
              className={`submit-button ${!submitEnabled ? "disabled" : ""}`}
              disabled={!submitEnabled}
              onClick={sendToBackend}
            >
              {submitEnabled ? 'Submit for Verification' : 'Waiting for Capture...'}
            </button>
          </div>
        </div>

        <div className="footer">
          <p className="footer-text">
            By proceeding, you consent to processing your personal data
            according to our{" "}
            <Link
              href="https://videokyc-frontend2.vercel.app/consent"
              className="footer-link"
            >
              Consent to Personal Data Processing Document
            </Link>
          </p>
          <div className="footer-powered-by">
            <p className="footer-powered-by-text">Powered by</p>
            <Image
              src={Autheo}
              alt="Autheo"
              width={100}
              height={100}
              className="footer-logo"
            />
          </div>
        </div>
      </div>
    </div>
  );
}