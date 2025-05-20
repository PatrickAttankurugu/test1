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

export default function GhanaCardScanner() {
  console.log("[Smart-Capture] Initializing GhanaCardScanner component");

  // Get URL parameters
  const searchParams = useSearchParams();
  const verification_id = searchParams.get("verification_id");
  const verification_type = searchParams.get("verification_type");

  console.log(`[Smart-Capture] Received verification_id: ${verification_id}`);
  console.log(
    `[Smart-Capture] Received verification_type: ${verification_type}`
  );

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

  // Capture and Detection States
  const [captureMessage, setCaptureMessage] = useState("No card captured yet");
  const [consecutiveDetections, setConsecutiveDetections] = useState(0);
  const [submitEnabled, setSubmitEnabled] = useState(false);

  // Model parameters
  const confidenceThreshold = 0.5;
  const minConsecutiveDetections = 3;
  const minDetectionAreaRatio = 0.02;
  const maxDetectionAreaRatio = 0.8;

  // Notify parent window when component mounts
  useEffect(() => {
    console.log(
      "[Smart-Capture] Notifying parent window that scanner is ready"
    );
    window.parent.postMessage(
      {
        type: "GHANA_CARD_SCANNER_READY",
        data: { verification_id, verification_type },
      },
      "*"
    );

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
      if (!window.tf || !window.tflite) {
        console.error("[Smart-Capture] TensorFlow.js or TFLite not found");
        setStatus("TensorFlow.js or TFLite not found");
        return;
      }

      console.log(
        "[Smart-Capture] TensorFlow.js detected, waiting for ready state..."
      );
      await tf.ready();
      setStatus("Loading model...");
      console.log("[Smart-Capture] TensorFlow.js ready, loading model...");

      try {
        console.log(
          "[Smart-Capture] Loading TFLite model from /model/autocapture.tflite"
        );
        const loadedModel = await tflite.loadTFLiteModel(
          "/model/autocapture.tflite"
        );
        modelRef.current = loadedModel;

        console.log("[Smart-Capture] Model loaded successfully");
        setStatus("Model loaded successfully");
        setModelStatus(
          "Model loaded: YOLOv8 TFLite (model/autocapture.tflite)"
        );

        await startCamera();
      } catch (err) {
        console.error("[Smart-Capture] Error loading model:", err);
        setStatus("Error loading model: " + err.message);
      }
    };
    init();
  }, []);

  // Function to start the camera
  const startCamera = async () => {
    console.log("[Smart-Capture] Attempting to start camera...");
    try {
      // Log available devices (for debugging)
      if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
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
      } else {
        console.warn('[Smart-Capture] enumerateDevices is not supported in this browser.');
      }

      setStatus("Requesting camera access...");
      const constraints = {
        video: {
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      };

      console.log( // Log the constraints being used
        "[Smart-Capture] Requesting media stream with constraints:",
        constraints
      );
      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      const video = videoRef.current;
      video.srcObject = stream;

      await new Promise((resolve) => {
        video.onloadedmetadata = () => {
          console.log(
            "[Smart-Capture] Video metadata loaded, dimensions:",
            video.videoWidth,
            "x",
            video.videoHeight
          );
          video.play();
          resolve();
        };
      });

      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      console.log(
        "[Smart-Capture] Canvas dimensions set to:",
        canvas.width,
        "x",
        canvas.height
      );

      cameraRef.current = stream;
      setCameraStatus(true);

      console.log("[Smart-Capture] Camera started successfully");
      setStatus("Camera active. Position a Ghana Card in the frame.");

      isDetectionActiveRef.current = true;
      startDetectionLoop();
    } catch (err) {
      console.error("[Smart-Capture] Error starting camera:", err);
      setStatus("Error starting camera: " + err.message);
    }
  };

  // Function to stop the camera
  const stopCamera = () => {
    console.log("[Smart-Capture] Stopping camera...");
    const stream = videoRef.current?.srcObject;

    if (stream) {
      console.log("[Smart-Capture] Stopping all media tracks");
      stream.getTracks().forEach((track) => {
        console.log("[Smart-Capture] Stopping track:", track.kind);
        track.stop();
      });
      if (videoRef.current) videoRef.current.srcObject = null;
      setCameraStatus(false);
      setStatus("Camera stopped.");
    }

    if (canvasRef.current) {
        const ctx = canvasRef.current.getContext("2d");
        const canvas = canvasRef.current;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }


    if (animationFrameRef.current) {
      console.log("[Smart-Capture] Cancelling animation frame");
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    cameraRef.current = null;
    processingRef.current = false;
    isDetectionActiveRef.current = false;
    console.log("[Smart-Capture] Camera stopped and resources cleaned up");
  };

  // Function to start the detection loop
  const startDetectionLoop = () => {
    if (!isDetectionActiveRef.current) {
      console.log("[Smart-Capture] Detection loop inactive, exiting");
      return;
    }

    if (
      !videoRef.current ||
      !canvasRef.current ||
      !cameraRef.current ||
      !modelRef.current
    ) {
      console.log("[Smart-Capture] Waiting for required refs to be ready for detection loop...");
      animationFrameRef.current = requestAnimationFrame(startDetectionLoop);
      return;
    }

    if (
      videoRef.current.videoWidth === 0 ||
      videoRef.current.videoHeight === 0 ||
      videoRef.current.readyState < 2
    ) {
      console.log("[Smart-Capture] Waiting for valid video dimensions or readyState...");
      animationFrameRef.current = requestAnimationFrame(startDetectionLoop);
      return;
    }

    if (!processingRef.current) {
      try {
        detectCard();
      } catch (error) {
        console.error("[Smart-Capture] Detection error in loop:", error);
        setStatus("Error during card detection: " + error.message);
      }
    }

    animationFrameRef.current = requestAnimationFrame(startDetectionLoop);
  };

  // Function to detect card
  const detectCard = async () => {
    if (
      !videoRef.current ||
      !canvasRef.current ||
      !cameraRef.current ||
      !modelRef.current ||
      videoRef.current.videoWidth === 0 ||
      videoRef.current.videoHeight === 0 ||
      videoRef.current.readyState < 2
    ) {
      return;
    }

    if (processingRef.current) {
      return;
    }

    processingRef.current = true;

    try {
      const { tensor, imageDims } = await preprocessFrame(videoRef);
      const predictions = await modelRef.current.predict(tensor);
      const detections = await processYoloOutput(predictions, imageDims);
      detectionRef.current = detections;

      if (canvasRef.current) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);

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
      console.error("[Smart-Capture] Detection error in detectCard:", err);
      setStatus("Error detecting card: " + err.message);
    } finally {
      processingRef.current = false;
    }
  };

  // Auto-capture logic
  const checkForAutoCapture = (detections) => {
    if (!detections || detections.length === 0 || !videoRef.current) {
      setConsecutiveDetections(0);
      setInvalidCardDetected(false);
      return;
    }

    const detection = detections[0];
    const areaRatio =
      (detection.box.width * detection.box.height) /
      (videoRef.current.videoWidth * videoRef.current.videoHeight);

    const isValidCard =
      detection.confidence > confidenceThreshold &&
      detection.aspectRatio > 1.3 &&
      detection.aspectRatio < 1.9 &&
      areaRatio > minDetectionAreaRatio &&
      areaRatio < maxDetectionAreaRatio;

    if (!isValidCard) {
      console.log("[Smart-Capture] Invalid card detected for auto-capture");
      setInvalidCardDetected(true);
      setStatus("Invalid card detected - Please use a Ghana Card");
      setConsecutiveDetections(0);
      return;
    }

    setInvalidCardDetected(false);
    const distanceAdjustedScore = Math.min(
      1,
      detection.alignmentScore * (0.5 + 0.5 * (areaRatio / 0.3))
    );

    if (distanceAdjustedScore > 0.4) {
      setConsecutiveDetections((prev) => {
        const next = prev + 1;
        setStatus(
          `Ghana Card detected - Holding steady: ${next}/${minConsecutiveDetections}`
        );

        if (next >= minConsecutiveDetections) {
          captureCard( // This is imported from @/utilities/captureUtilities
            detection,
            videoRef,
            captureRef,
            setStatus,
            setCaptureMessage,
            setSubmitEnabled
          );
          setStatus("Ghana Card captured successfully");
          return 0;
        }
        return next;
      });
    } else {
      setConsecutiveDetections((prev) => Math.max(0, prev - 1));
      setStatus("Position Ghana Card properly in the frame");
    }
  };

  // Send card to backend and notify parent
  const sendToBackend = async () => {
    console.log(
      "[Smart-Capture] Preparing to send captured card to backend..."
    );
    if (!captureRef.current || captureRef.current.width === 0 || captureRef.current.height === 0) {
      console.log("[Smart-Capture] No valid card captured (or canvas is empty) - cannot send to backend");
      setStatus("No valid card captured yet or captured image is empty.");
      setCaptureMessage("No valid card captured to submit.");
      return;
    }

    setStatus("Sending card to backend for verification...");
    console.log("[Smart-Capture] Converting canvas to base64 (PNG format)...");

    try {
      // Get base64 image from canvas - CHANGED TO PNG
      const base64Image = captureRef.current.toDataURL("image/png");
      // ADDED for inspection: Log the base64 string. You can copy this and paste it into an online base64 viewer to see the exact image.
      console.log("[Smart-Capture] Base64 for OCR (copy and view in a base64 image viewer):", base64Image.substring(0, 100) + "..."); // Log snippet


      // Extract just the base64 data part (remove the data:image/png;base64, prefix)
      const base64Data = base64Image.split(",")[1];

      if (!base64Data) {
        console.error("[Smart-Capture] Failed to extract base64 data from image string.");
        setStatus("Error preparing image for sending.");
        setCaptureMessage("Error preparing image.");
        return;
      }

      // Prepare the payload
      const payload = {
        card_front: base64Data,
      };

      console.log(
        `[Smart-Capture] Sending to backend API with verification_id: ${verification_id}`
      );

      const response = await fetch(
        `https://staging-videokyc.agregartech.com/api/v1/video-kyc/verifications/${verification_id}/verify-card-front/`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        // Try to get more detailed error from backend response
        let errorData;
        try {
            errorData = await response.json();
        } catch (e) {
            // If response is not JSON or some other error
            throw new Error(`HTTP error! Status: ${response.status}, Response not JSON or unreadable.`);
        }
        console.error("[Smart-Capture] Backend error response data:", errorData);
        throw new Error(`HTTP error! Status: ${response.status}. Message: ${errorData.message || errorData.detail || JSON.stringify(errorData)}`);
      }

      const data = await response.json();
      console.log("[Smart-Capture] Backend response:", data);

      // Notify parent window of successful capture and verification
      console.log(
        "[Smart-Capture] Notifying parent window of successful capture and verification"
      );
      window.parent.postMessage(
        {
          type: "GHANA_CARD_CAPTURE_SUCCESS",
          data: {
            verification_id,
            verification_type,
            card_data: data,
          },
        },
        "*"
      );

      setStatus("Verification submitted successfully!");
      setCaptureMessage("Card front image successfully verified");
      setSubmitEnabled(false);
    } catch (error) {
      console.error("[Smart-Capture] Error sending to backend:", error);
      setStatus(`Error sending to backend: ${error.message}`);
      setCaptureMessage("Error during verification submission");
    }
  };

  return (
    <div className="min-h-screen bg-white text-[#245C94] poppins p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl md:text-4xl font-bold mb-4 text-[#245C94] text-center">
          Ghana Card Auto-Capture
        </h1>

        <div className="status-container mb-6">
          <div className="status text-center font-medium" id="status">
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
              // Set initial width/height for placeholder, or style with CSS min-height/width
              width="320" // Example initial width
              height="202" // Example initial height (maintaining ~1.585 ratio)
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
              Submit
            </button>
          </div>
        </div>

        <div className="footer">
          <p className="footer-text">
            By proceeding, you consent to processing your personal data
            according to our{" "}
            <Link
              href="/https://videokyc-frontend2.vercel.app/consent"
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