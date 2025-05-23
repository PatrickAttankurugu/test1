// Helper function to detect mobile devices
function isMobileDevice() {
  const hasWindow = typeof window !== 'undefined';
  const hasNavigator = typeof navigator !== 'undefined';

  const hasTouchEvents = hasWindow && ('ontouchstart' in window || (hasNavigator && navigator.maxTouchPoints > 0));
  const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
  const isMobileUserAgent = hasNavigator && mobileRegex.test(navigator.userAgent);

  return hasTouchEvents || isMobileUserAgent;
}

// Get device-specific parameters
function getDeviceSpecificParams() {
  const isMobile = isMobileDevice();
  
  if (isMobile) {
    return {
      // More lenient thresholds for mobile
      confidenceThreshold: 0.45,
      minDetectionAreaRatio: 0.12, // Smaller cards acceptable on mobile
      maxDetectionAreaRatio: 0.88,
      alignmentThreshold: 0.25,
      aspectRatioMin: 1.15, // More flexible aspect ratio
      aspectRatioMax: 2.1,
      // Box dimension constraints
      minBoxWidth: 80,  // Smaller minimum for mobile
      minBoxHeight: 50,
      // Additional mobile-specific params
      edgeDistanceThreshold: 0.08, // More lenient edge detection
      stabilityThreshold: 0.15 // Less strict stability requirements
    };
  } else {
    return {
      // Standard desktop thresholds
      confidenceThreshold: 0.6,
      minDetectionAreaRatio: 0.25,
      maxDetectionAreaRatio: 0.85,
      alignmentThreshold: 0.35,
      aspectRatioMin: 1.3,
      aspectRatioMax: 1.9,
      // Box dimension constraints
      minBoxWidth: 120,
      minBoxHeight: 75,
      // Desktop-specific params
      edgeDistanceThreshold: 0.12,
      stabilityThreshold: 0.25
    };
  }
}

// CORRECTED preprocessing function with proper aspect ratio preservation
export async function preprocessFrame(videoRef) {
  console.log("[TF-Utils] Starting frame preprocessing...");
  
  if (!videoRef.current || videoRef.current.videoWidth === 0 || videoRef.current.videoHeight === 0) {
    console.warn("[TF-Utils] preprocessFrame: video size is 0x0", {
      videoWidth: videoRef.current?.videoWidth,
      videoHeight: videoRef.current?.videoHeight,
    });
    throw new Error("Video not ready or has invalid dimensions.");
  }

  const video = videoRef.current;
  console.log(`[TF-Utils] Original video dimensions: ${video.videoWidth}x${video.videoHeight}`);

  return tf.tidy(() => {
    console.log("[TF-Utils] Converting video to tensor...");
    const videoTensor = tf.browser.fromPixels(video);

    const [h, w] = videoTensor.shape.slice(0, 2);
    console.log(`[TF-Utils] Tensor dimensions: ${w}x${h}`);

    const inputSize = 640;
    const scale = Math.min(inputSize / w, inputSize / h);
    const scaledWidth = Math.round(w * scale);
    const scaledHeight = Math.round(h * scale);
    console.log(`[TF-Utils] Scaled dimensions: ${scaledWidth}x${scaledHeight}, scale=${scale}`);

    console.log("[TF-Utils] Resizing tensor...");
    const resized = tf.image.resizeBilinear(videoTensor, [scaledHeight, scaledWidth]);

    const paddingHeight = inputSize - scaledHeight;
    const paddingWidth = inputSize - scaledWidth;
    const topPadding = Math.floor(paddingHeight / 2);
    const leftPadding = Math.floor(paddingWidth / 2);
    console.log(`[TF-Utils] Padding - top: ${topPadding}, left: ${leftPadding}`);

    console.log("[TF-Utils] Padding tensor...");
    const padded = tf.pad(resized, [
      [topPadding, paddingHeight - topPadding],
      [leftPadding, paddingWidth - leftPadding],
      [0, 0],
    ]);

    console.log("[TF-Utils] Normalizing tensor values...");
    const normalized = padded.div(tf.scalar(255));

    console.log("[TF-Utils] Adding batch dimension...");
    const batched = normalized.expandDims(0);

    const imageDims = {
      inputSize,
      originalWidth: w,
      originalHeight: h,
      scale,
      topPadding,
      leftPadding,
    };

    console.log("[TF-Utils] Image dimensions:", imageDims);
    console.log("[TF-Utils] Preprocessing complete");
    return { tensor: batched, imageDims };
  });
}

// CORRECTED YOLO output processing with proper coordinate transformation
export async function processYoloOutput(predictions, imageDims) {
  console.log("[TF-Utils] Processing YOLO output...");
  const detections = [];

  try {
    let outputArray;
    console.log("[TF-Utils] Determining output format...");

    if (Array.isArray(predictions)) {
      console.log("[TF-Utils] Array output format detected");
      outputArray = await predictions[0].array();
    } else {
      console.log("[TF-Utils] Single output format detected");
      outputArray = await predictions.array();
    }

    if (outputArray[0].length > outputArray[0][0].length) {
      console.log("[TF-Utils] Processing format 1: [batch, predictions, outputs]");
      const numDetections = outputArray[0].length;
      console.log(`[TF-Utils] Number of detections: ${numDetections}`);

      for (let i = 0; i < numDetections; i++) {
        const conf = outputArray[0][i][4];
        if (conf > 0.4) { // Lower threshold for better detection
          console.log(`[TF-Utils] Processing detection ${i} with confidence ${conf}`);
          const x = outputArray[0][i][0];
          const y = outputArray[0][i][1];
          const w = outputArray[0][i][2];
          const h = outputArray[0][i][3];

          // Convert from normalized coordinates to model coordinates (640x640)
          const modelCenterX = x * imageDims.inputSize;
          const modelCenterY = y * imageDims.inputSize;
          const modelWidth = w * imageDims.inputSize;
          const modelHeight = h * imageDims.inputSize;

          // Convert to corner coordinates in model space
          const modelX1 = modelCenterX - modelWidth / 2;
          const modelY1 = modelCenterY - modelHeight / 2;
          const modelX2 = modelCenterX + modelWidth / 2;
          const modelY2 = modelCenterY + modelHeight / 2;

          // CRITICAL: Transform back to original video coordinates
          // Remove padding first, then scale back to original size
          const originalX1 = (modelX1 - imageDims.leftPadding) / imageDims.scale;
          const originalY1 = (modelY1 - imageDims.topPadding) / imageDims.scale;
          const originalX2 = (modelX2 - imageDims.leftPadding) / imageDims.scale;
          const originalY2 = (modelY2 - imageDims.topPadding) / imageDims.scale;

          // Clamp to original video bounds
          const clampedX1 = Math.max(0, Math.min(originalX1, imageDims.originalWidth));
          const clampedY1 = Math.max(0, Math.min(originalY1, imageDims.originalHeight));
          const clampedX2 = Math.max(0, Math.min(originalX2, imageDims.originalWidth));
          const clampedY2 = Math.max(0, Math.min(originalY2, imageDims.originalHeight));

          const originalWidth = clampedX2 - clampedX1;
          const originalHeight = clampedY2 - clampedY1;

          // Skip invalid detections
          if (originalWidth <= 0 || originalHeight <= 0) {
            continue;
          }

          const aspectRatio = originalWidth / originalHeight;
          console.log(`[TF-Utils] Processed detection - x: ${clampedX1.toFixed(1)}, y: ${clampedY1.toFixed(1)}, width: ${originalWidth.toFixed(1)}, height: ${originalHeight.toFixed(1)}, aspect: ${aspectRatio.toFixed(2)}`);

          detections.push({
            box: {
              x: clampedX1,
              y: clampedY1,
              width: originalWidth,
              height: originalHeight,
            },
            confidence: conf,
            aspectRatio: aspectRatio,
            alignmentScore: calculateAlignmentScore(
              aspectRatio,
              originalHeight * originalWidth,
              {
                originalHeight: imageDims.originalHeight,
                originalWidth: imageDims.originalWidth,
              }
            ),
          });
        }
      }
    } else {
      console.log("[TF-Utils] Processing format 2: [batch, outputs, predictions]");
      const numDetections = outputArray[0][0].length;
      console.log(`[TF-Utils] Number of detections: ${numDetections}`);

      for (let i = 0; i < numDetections; i++) {
        const conf = outputArray[0][4][i];
        if (conf > 0.4) { // Lower threshold for better detection
          console.log(`[TF-Utils] Processing detection ${i} with confidence ${conf}`);
          const x = outputArray[0][0][i];
          const y = outputArray[0][1][i];
          const w = outputArray[0][2][i];
          const h = outputArray[0][3][i];

          // Convert from normalized coordinates to model coordinates (640x640)
          const modelCenterX = x * imageDims.inputSize;
          const modelCenterY = y * imageDims.inputSize;
          const modelWidth = w * imageDims.inputSize;
          const modelHeight = h * imageDims.inputSize;

          // Convert to corner coordinates in model space
          const modelX1 = modelCenterX - modelWidth / 2;
          const modelY1 = modelCenterY - modelHeight / 2;
          const modelX2 = modelCenterX + modelWidth / 2;
          const modelY2 = modelCenterY + modelHeight / 2;

          // CRITICAL: Transform back to original video coordinates
          // Remove padding first, then scale back to original size
          const originalX1 = (modelX1 - imageDims.leftPadding) / imageDims.scale;
          const originalY1 = (modelY1 - imageDims.topPadding) / imageDims.scale;
          const originalX2 = (modelX2 - imageDims.leftPadding) / imageDims.scale;
          const originalY2 = (modelY2 - imageDims.topPadding) / imageDims.scale;

          // Clamp to original video bounds
          const clampedX1 = Math.max(0, Math.min(originalX1, imageDims.originalWidth));
          const clampedY1 = Math.max(0, Math.min(originalY1, imageDims.originalHeight));
          const clampedX2 = Math.max(0, Math.min(originalX2, imageDims.originalWidth));
          const clampedY2 = Math.max(0, Math.min(originalY2, imageDims.originalHeight));

          const originalWidth = clampedX2 - clampedX1;
          const originalHeight = clampedY2 - clampedY1;

          // Skip invalid detections
          if (originalWidth <= 0 || originalHeight <= 0) {
            continue;
          }

          const aspectRatio = originalWidth / originalHeight;
          console.log(`[TF-Utils] Processed detection - x: ${clampedX1.toFixed(1)}, y: ${clampedY1.toFixed(1)}, width: ${originalWidth.toFixed(1)}, height: ${originalHeight.toFixed(1)}, aspect: ${aspectRatio.toFixed(2)}`);

          detections.push({
            box: {
              x: clampedX1,
              y: clampedY1,
              width: originalWidth,
              height: originalHeight,
            },
            confidence: conf,
            aspectRatio: aspectRatio,
            alignmentScore: calculateAlignmentScore(
              aspectRatio,
              originalHeight * originalWidth,
              {
                originalHeight: imageDims.originalHeight,
                originalWidth: imageDims.originalWidth,
              }
            ),
          });
        }
      }
    }
  } catch (err) {
    console.error("[TF-Utils] Error processing predictions:", err);
  }

  console.log(`[TF-Utils] Found ${detections.length} valid detections`);
  return detections.sort((a, b) => b.confidence - a.confidence);
}

// Enhanced alignment score calculation
export const calculateAlignmentScore = (aspectRatio, area, imageDims) => {
  console.log("[TF-Utils] Calculating alignment score...");
  const idealAspectRatio = 1.585;
  const aspectRatioTolerance = 0.3; // Increased tolerance from 0.2

  if (!aspectRatio || !area || area <= 0 || aspectRatio <= 0) {
    console.log("[TF-Utils] Invalid inputs for alignment calculation");
    return 0;
  }

  // More lenient aspect ratio scoring
  const aspectRatioError = Math.abs(aspectRatio - idealAspectRatio);
  const aspectRatioScore = Math.max(
    0,
    1 - aspectRatioError / aspectRatioTolerance
  );
  console.log(`[TF-Utils] Aspect ratio score: ${aspectRatioScore}`);

  // Improved area scoring that works at different distances
  const totalArea = imageDims.originalWidth * imageDims.originalHeight;
  const areaRatio = area / totalArea;
  console.log(`[TF-Utils] Area ratio: ${areaRatio}`);

  let areaScore = 0;
  // More generous area scoring
  if (areaRatio > 0.02) {
    // Lowered from 0.03
    if (areaRatio > 0.05 && areaRatio < 0.8) {
      // Wider range
      areaScore = 1.0;
    } else {
      areaScore = 0.5 + 0.5 * Math.min(1, areaRatio / 0.05);
    }
  }
  console.log(`[TF-Utils] Area score: ${areaScore}`);

  // Weighted scoring favoring aspect ratio slightly less
  const combinedScore = aspectRatioScore * 0.5 + areaScore * 0.5;
  console.log(`[TF-Utils] Combined alignment score: ${combinedScore}`);
  return combinedScore;
};

// Enhanced detection quality assessment
function assessDetectionQuality(box, imageDims, confidence, aspectRatio, params) {
  const isMobile = isMobileDevice();
  
  // Calculate area ratio
  const areaRatio = (box.width * box.height) / (imageDims.originalWidth * imageDims.originalHeight);
  
  // Check basic constraints
  const hasGoodConfidence = confidence >= params.confidenceThreshold;
  const hasGoodAspectRatio = aspectRatio >= params.aspectRatioMin && aspectRatio <= params.aspectRatioMax;
  const hasGoodSize = areaRatio >= params.minDetectionAreaRatio && areaRatio <= params.maxDetectionAreaRatio;
  
  // Calculate distance from edges (normalized)
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  const edgeDistanceX = Math.min(centerX, imageDims.originalWidth - centerX) / imageDims.originalWidth;
  const edgeDistanceY = Math.min(centerY, imageDims.originalHeight - centerY) / imageDims.originalHeight;
  const edgeDistance = Math.min(edgeDistanceX, edgeDistanceY);
  
  // Calculate alignment score (how well-aligned the detection is)
  const centerDistanceFromMiddleX = Math.abs(centerX - imageDims.originalWidth / 2) / imageDims.originalWidth;
  const centerDistanceFromMiddleY = Math.abs(centerY - imageDims.originalHeight / 2) / imageDims.originalHeight;
  const alignmentScore = 1.0 - Math.sqrt(centerDistanceFromMiddleX * centerDistanceFromMiddleX + 
                                        centerDistanceFromMiddleY * centerDistanceFromMiddleY);
  
  // Calculate stability score (how stable the detection appears)
  const sizeStabilityScore = Math.min(1.0, areaRatio / 0.4); // Prefer medium-sized detections
  const aspectStabilityScore = 1.0 - Math.abs(aspectRatio - 1.6) / 1.6; // Prefer ~1.6 aspect ratio
  const stabilityScore = (sizeStabilityScore + aspectStabilityScore) / 2;
  
  // Overall quality score
  const overallScore = (
    confidence * 0.4 +
    alignmentScore * 0.3 +
    stabilityScore * 0.2 +
    (edgeDistance > params.edgeDistanceThreshold ? 0.1 : 0)
  );
  
  // Determine if detection is valid with specific reasons
  let isValid = true;
  let reason = "";
  
  if (!hasGoodConfidence) {
    isValid = false;
    reason = `Low confidence: ${confidence.toFixed(3)} < ${params.confidenceThreshold}`;
  } else if (!hasGoodAspectRatio) {
    isValid = false;
    reason = `Invalid aspect ratio: ${aspectRatio.toFixed(2)} not in [${params.aspectRatioMin}, ${params.aspectRatioMax}]`;
  } else if (!hasGoodSize) {
    isValid = false;
    if (areaRatio < params.minDetectionAreaRatio) {
      reason = `Too small: ${areaRatio.toFixed(3)} < ${params.minDetectionAreaRatio}`;
    } else {
      reason = `Too large: ${areaRatio.toFixed(3)} > ${params.maxDetectionAreaRatio}`;
    }
  } else if (edgeDistance < params.edgeDistanceThreshold) {
    isValid = false;
    reason = `Too close to edge: ${edgeDistance.toFixed(3)} < ${params.edgeDistanceThreshold}`;
  } else if (alignmentScore < params.alignmentThreshold && !isMobile) {
    // More lenient alignment for mobile
    isValid = false;
    reason = `Poor alignment: ${alignmentScore.toFixed(3)} < ${params.alignmentThreshold}`;
  }

  return {
    isValid,
    reason,
    alignmentScore,
    stabilityScore,
    edgeDistance,
    overallScore,
    metrics: {
      confidence,
      aspectRatio,
      areaRatio,
      centerX: centerX / imageDims.originalWidth,
      centerY: centerY / imageDims.originalHeight
    }
  };
}

// Utility function to validate detection for specific use cases
export function validateGhanaCardDetection(detection, imageDims) {
  const params = getDeviceSpecificParams();
  const isMobile = isMobileDevice();
  
  if (!detection || !detection.box) {
    return {
      isValid: false,
      reason: "No detection provided",
      feedback: "No card detected in frame"
    };
  }

  const quality = assessDetectionQuality(
    detection.box, 
    imageDims, 
    detection.confidence, 
    detection.aspectRatio,
    params
  );

  // Provide user-friendly feedback
  let userFeedback = "";
  
  if (!quality.isValid) {
    if (quality.reason.includes("Low confidence") || quality.reason.includes("Too small")) {
      userFeedback = "Move closer to the camera for better detection";
    } else if (quality.reason.includes("Too large")) {
      userFeedback = "Move back slightly - card is too close";
    } else if (quality.reason.includes("Invalid aspect ratio")) {
      userFeedback = "Please show a Ghana Card (detected shape is not a valid ID card)";
    } else if (quality.reason.includes("Too close to edge")) {
      userFeedback = "Center the card in the frame";
    } else if (quality.reason.includes("Poor alignment")) {
      userFeedback = "Hold the card straight and steady";
    } else {
      userFeedback = "Adjust card position for better detection";
    }
  } else {
    if (quality.alignmentScore > 0.8) {
      userFeedback = "Perfect positioning - hold steady";
    } else if (quality.alignmentScore > 0.6) {
      userFeedback = "Good positioning - hold steady";
    } else {
      userFeedback = "Hold the card steady for capture";
    }
  }

  return {
    isValid: quality.isValid,
    reason: quality.reason,
    feedback: userFeedback,
    quality: quality,
    readyForCapture: quality.isValid && quality.alignmentScore > params.alignmentThreshold,
    confidence: detection.confidence,
    alignmentScore: quality.alignmentScore
  };
}

// Non-Maximum Suppression for overlapping detections
export function nonMaxSuppression(detections, overlapThreshold = 0.5) {
  if (!detections || detections.length === 0) return [];
  
  // Sort by confidence
  const sorted = [...detections].sort((a, b) => b.confidence - a.confidence);
  const keep = [];
  
  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i];
    let shouldKeep = true;
    
    for (let j = 0; j < keep.length; j++) {
      const kept = keep[j];
      const overlap = calculateIoU(current.box, kept.box);
      
      if (overlap > overlapThreshold) {
        shouldKeep = false;
        break;
      }
    }
    
    if (shouldKeep) {
      keep.push(current);
    }
  }
  
  return keep;
}

// Calculate Intersection over Union (IoU) for two bounding boxes
function calculateIoU(boxA, boxB) {
  const xA = Math.max(boxA.x, boxB.x);
  const yA = Math.max(boxA.y, boxB.y);
  const xB = Math.min(boxA.x + boxA.width, boxB.x + boxB.width);
  const yB = Math.min(boxA.y + boxA.height, boxB.y + boxB.height);
  
  const interArea = Math.max(0, xB - xA) * Math.max(0, yB - yA);
  const boxAArea = boxA.width * boxA.height;
  const boxBArea = boxB.width * boxB.height;
  const unionArea = boxAArea + boxBArea - interArea;
  
  return unionArea === 0 ? 0 : interArea / unionArea;
}

// Utility function to log detection statistics
export function logDetectionStats(detections) {
  if (!detections || detections.length === 0) {
    console.log("[TF-Utils] No detections to analyze");
    return;
  }

  const stats = {
    count: detections.length,
    avgConfidence: detections.reduce((sum, d) => sum + d.confidence, 0) / detections.length,
    avgAspectRatio: detections.reduce((sum, d) => sum + d.aspectRatio, 0) / detections.length,
    avgAreaRatio: detections.reduce((sum, d) => sum + (d.areaRatio || 0), 0) / detections.length,
    maxConfidence: Math.max(...detections.map(d => d.confidence)),
    minConfidence: Math.min(...detections.map(d => d.confidence))
  };

  console.log("[TF-Utils] Detection Statistics:", {
    count: stats.count,
    confidence: `${stats.avgConfidence.toFixed(3)} (${stats.minConfidence.toFixed(3)}-${stats.maxConfidence.toFixed(3)})`,
    aspectRatio: stats.avgAspectRatio.toFixed(2),
    areaRatio: stats.avgAreaRatio.toFixed(3),
    device: isMobileDevice() ? 'Mobile' : 'Desktop'
  });
}

// Memory cleanup utility
export function cleanupTensors(...tensors) {
  tensors.forEach(tensor => {
    if (tensor && typeof tensor.dispose === 'function') {
      try {
        tensor.dispose();
      } catch (error) {
        console.warn("[TF-Utils] Error disposing tensor:", error);
      }
    }
  });
}

// Performance monitoring utility
export function measurePerformance(label, fn) {
  return async function(...args) {
    const start = performance.now();
    try {
      const result = await fn.apply(this, args);
      const end = performance.now();
      console.log(`[TF-Utils] ${label} took ${(end - start).toFixed(2)}ms`);
      return result;
    } catch (error) {
      const end = performance.now();
      console.error(`[TF-Utils] ${label} failed after ${(end - start).toFixed(2)}ms:`, error);
      throw error;
    }
  };
}