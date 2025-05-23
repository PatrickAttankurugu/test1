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

  // Model parameters - adjusted for better mobile performance
  const confidenceThreshold = isMobile ? 0.6 : 0.7;
  const minConsecutiveDetections = isMobile ? 3 : 5;
  const minDetectionAreaRatio = isMobile ? 0.3 : 0.4;
  const maxDetectionAreaRatio = 0.9;

  // Mobile detection and orientation handling
  useEffect(() => {
    const checkMobile = () => {
      const mobile = isMobileDevice();
      setIsMobile(mobile);
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

  // Loading and Initializing TensorFlow
  useEffect(() => {
    console.log("[Smart-Capture] Initializing TensorFlow.js...");
    const init = async () => {
      setStatus("Checking TensorFlow.js...");
      if (typeof window === 'undefined' || !window.tf || !window.tflite) {
        console.error("[Smart-Capture] TensorFlow.js or TFLite not found");
        setStatus("TensorFlow.js or TFLite not found");
        setIsLoading(false);
        return;
      }

      console.log("[Smart-Capture] TensorFlow.js detected, waiting for ready state...");
      await tf.ready();
      setStatus("Loading model...");
      console.log("[Smart-Capture] TensorFlow.js ready, loading model...");

      try {
        console.log("[Smart-Capture] Loading TFLite model from /model/autocapture.tflite");
        const loadedModel = await tflite.loadTFLiteModel("/model/autocapture.tflite");
        modelRef.current = loadedModel;

        console.log("[Smart-Capture] Model loaded successfully");
        setStatus("Model loaded successfully");
        setModelStatus("Model loaded: YOLOv8 TFLite (model/autocapture.tflite)");

        await startCamera();
        setIsLoading(false);
      } catch (err) {
        console.error("[Smart-Capture] Error loading model:", err);
        setStatus("Error loading model: " + err.message);
        setIsLoading(false);
      }
    };
    init();
  }, []);

  // Function to start the camera with mobile-optimized constraints
  const startCamera = async () => {
    console.log("[Smart-Capture] Attempting to start camera...");
    
    const runningOnMobile = isMobile;
    console.log(`[Smart-Capture] Is mobile device: ${runningOnMobile}`);

    let dynamicConstraints;

    if (runningOnMobile) {
      console.log("[Smart-Capture] Applying mobile-specific camera constraints");
      dynamicConstraints = {
        video: {
          facingMode: "environment",
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          aspectRatio: { ideal: 16 / 9 },
          frameRate: { ideal: 24, max: 30 }
        },
      };
    } else {
      console.log("[Smart-Capture] Applying desktop camera constraints");
      dynamicConstraints = {
        video: {
          facingMode: "environment",
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 30 }
        },
      };
    }

    try {
      if (typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoDevices = devices.filter(device => device.kind === 'videoinput');
          console.log('[Smart-Capture] Available video devices:', videoDevices);
          if (videoDevices.length === 0) {
            console.warn('[Smart-Capture] No video input devices found!');
          }
        } catch (err) {
          console.error('[Smart-Capture] Error enumerating devices:', err);
        }
      }

      setStatus("Requesting camera access...");
      console.log("[Smart-Capture] Requesting media stream with constraints:", dynamicConstraints);
      
      if (typeof navigator === 'undefined' || !navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
        setStatus("Camera API not available in this environment.");
        console.error("[Smart-Capture] getUserMedia not available.");
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia(dynamicConstraints);

      const video = videoRef.current;
      if (!video) {
        console.error("[Smart-Capture] Video ref not available after getUserMedia.");
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      
      video.srcObject = stream;

      await new Promise((resolve, reject) => {
        if (!video) {
          reject(new Error("Video element became unavailable during metadata load setup."));
          return;
        }
        
        video.onloadedmetadata = () => {
          console.log(
            "[Smart-Capture] Video metadata loaded, dimensions:",
            video.videoWidth, "x", video.videoHeight
          );
          
          video.play().then(() => {
            resolve();
          }).catch(playError => {
            console.error("[Smart-Capture] Error playing video:", playError);
            setStatus("Error playing video. Please check browser permissions.");
            reject(playError);
          });
        };
        
        video.onerror = (err) => {
          console.error("[Smart-Capture] Video element error:", err);
          setStatus("Error with video element.");
          reject(err);
        };
      });

      const canvas = canvasRef.current;
      if (!canvas || !video.videoWidth || !video.videoHeight) {
        console.error("[Smart-Capture] Canvas or video dimensions not ready.");
        setStatus("Error setting up display canvas.");
        return;
      }
      
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      console.log("[Smart-Capture] Canvas dimensions set to:", canvas.width, "x", canvas.height);

      cameraRef.current = stream;
      setCameraStatus(true);
      setStatus("Camera active. Position a Ghana Card in the frame.");
      isDetectionActiveRef.current = true;
      startDetectionLoop();
    } catch (err) {
      console.error("[Smart-Capture] Error starting camera:", err);
      
      let errorMessage = err.message;
      if (err.name === "NotAllowedError") {
        errorMessage = "Camera permission denied. Please allow camera access.";
      } else if (err.name === "NotFoundError") {
        errorMessage = "No camera found. Please check your device.";
      } else if (err.name === "OverconstrainedError") {
        errorMessage = "Camera settings not supported. Trying with basic settings...";
        
        // Fallback to basic constraints
        try {
          const basicConstraints = { video: { facingMode: "environment" } };
          const stream = await navigator.mediaDevices.getUserMedia(basicConstraints);
          const video = videoRef.current;
          if (video) {
            video.srcObject = stream;
            await new Promise((resolve) => {
              video.onloadedmetadata = () => {
                video.play();
                resolve();
              };
            });
            
            const canvas = canvasRef.current;
            if (canvas) {
              canvas.width = video.videoWidth;
              canvas.height = video.videoHeight;
            }
            
            cameraRef.current = stream;
            setCameraStatus(true);
            setStatus("Camera active with basic settings. Position a Ghana Card in the frame.");
            isDetectionActiveRef.current = true;
            startDetectionLoop();
            return;
          }
        } catch (fallbackErr) {
          console.error("[Smart-Capture] Fallback camera start failed:", fallbackErr);
          errorMessage = "Unable to start camera with any settings.";
        }
      }
      
      setStatus("Error starting camera: " + errorMessage);
    }
  };

  const stopCamera = () => {
    console.log("[Smart-Capture] Stopping camera...");
    const stream = videoRef.current?.srcObject;

    if (stream && typeof stream.getTracks === 'function') {
      stream.getTracks().forEach((track) => track.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
      setCameraStatus(false);
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
        setStatus("Detection error. Please refresh if issues persist.");
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
          drawDetections(detections, canvasRef, invalidCardDetected);
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

    const areaRatio = (detection.box.width * detection.box.height) / (videoWidth * videoHeight);

    const isValidCard =
      detection.confidence > confidenceThreshold &&
      detection.aspectRatio > 1.3 &&
      detection.aspectRatio < 1.9 &&
      areaRatio > minDetectionAreaRatio &&
      areaRatio < maxDetectionAreaRatio;

    if (!isValidCard) {
      setInvalidCardDetected(true);
      setStatus("Position Ghana Card clearly in the frame");
      setConsecutiveDetections(0);
      return;
    }

    setInvalidCardDetected(false);
    const alignmentScore = detection.alignmentScore;

    if (alignmentScore > (isMobile ? 0.3 : 0.4)) {
      setConsecutiveDetections((prev) => {
        const next = prev + 1;
        setStatus(`Ghana Card detected - Hold steady: ${next}/${minConsecutiveDetections}`);

        if (next >= minConsecutiveDetections) {
          console.log("[Smart-Capture] Auto-capturing card...");
          captureCard(
            detection,
            videoRef,
            captureRef,
            setStatus,
            setCaptureMessage,
            setSubmitEnabled
          );
          setStatus("Ghana Card captured successfully!");
          isDetectionActiveRef.current = false;

          // Clear detection canvas
          if (canvasRef.current) {
            const canvas = canvasRef.current;
            const ctx = canvas.getContext("2d");
            if (canvas.width > 0 && canvas.height > 0) {
              ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
          }
          return 0;
        }
        return next;
      });
    } else {
      setConsecutiveDetections((prev) => Math.max(0, prev - 1));
      setStatus("Align Ghana Card better for capture");
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
          </div>

          {invalidCardDetected && (
            <div className="invalid-card-warning text-red-500 text-center mt-2">
              Invalid card detected. Please use a Ghana Card.
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