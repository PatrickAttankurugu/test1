// Helper function to detect mobile devices
function isMobileDevice() {
  const hasWindow = typeof window !== 'undefined';
  const hasNavigator = typeof navigator !== 'undefined';

  const hasTouchEvents = hasWindow && ('ontouchstart' in window || (hasNavigator && navigator.maxTouchPoints > 0));
  const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
  const isMobileUserAgent = hasNavigator && mobileRegex.test(navigator.userAgent);

  return hasTouchEvents || isMobileUserAgent;
}

// Get device capabilities for adaptive processing
function getDeviceCapabilities() {
  const isMobile = isMobileDevice();
  const pixelRatio = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const isHighDPI = pixelRatio > 1.5;
  
  // Detect device performance tier
  let performanceTier = 'high';
  if (typeof navigator !== 'undefined') {
    const memory = navigator.deviceMemory;
    const cores = navigator.hardwareConcurrency;
    
    if (memory && memory < 4) performanceTier = 'low';
    else if (memory && memory < 8) performanceTier = 'medium';
    
    if (cores && cores < 4 && performanceTier !== 'low') performanceTier = 'medium';
  }
  
  return {
    isMobile,
    pixelRatio,
    isHighDPI,
    performanceTier,
    // Determine optimal output resolution based on device
    optimalResolution: getOptimalResolution(isMobile, performanceTier, isHighDPI)
  };
}

// Get optimal resolution based on device capabilities
function getOptimalResolution(isMobile, performanceTier, isHighDPI) {
  if (isMobile) {
    switch (performanceTier) {
      case 'low':
        return { width: 1024, height: 646 }; // Lower resolution for older devices
      case 'medium':
        return { width: 1280, height: 808 }; // Balanced resolution
      case 'high':
      default:
        return isHighDPI 
          ? { width: 1600, height: 1010 } // Higher resolution for flagship phones
          : { width: 1280, height: 808 };
    }
  } else {
    // Desktop - can handle higher resolutions
    return { width: 1920, height: 1211 };
  }
}

// Enhanced capture function with adaptive quality and performance
export const captureCard = (
  detection,
  videoRef,
  captureRef,
  setStatus,
  setCaptureMessage,
  setSubmitEnabled
) => {
  console.log("[Smart-Capture] Starting enhanced mobile-optimized card capture...");
  
  if (!detection || !detection.box || !videoRef.current || !captureRef.current) {
    console.error("[Smart-Capture] Invalid parameters for capture");
    setStatus("Capture failed - invalid parameters");
    return null;
  }

  const { box } = detection;
  const video = videoRef.current;
  const canvas = captureRef.current;
  const context = canvas.getContext("2d", { 
    willReadFrequently: true, 
    alpha: false,
    desynchronized: true // Better performance on mobile
  });

  // Get device capabilities
  const deviceCaps = getDeviceCapabilities();
  const { optimalResolution, isMobile, performanceTier, isHighDPI } = deviceCaps;
  
  console.log(`[Smart-Capture] Device capabilities:`, {
    isMobile,
    performanceTier,
    isHighDPI,
    resolution: `${optimalResolution.width}x${optimalResolution.height}`
  });

  // Set canvas to optimized resolution
  canvas.width = optimalResolution.width;
  canvas.height = optimalResolution.height;

  // Calculate crop area with adaptive margins based on device and detection quality
  const baseMargin = isMobile ? 0.02 : 0.04; // Smaller margin for mobile
  const qualityMargin = detection.alignmentScore > 0.8 ? 0.01 : baseMargin;
  
  const marginX = box.width * qualityMargin;
  const marginY = box.height * qualityMargin;

  const cropX = Math.max(0, box.x - marginX);
  const cropY = Math.max(0, box.y - marginY);
  const cropWidth = Math.min(box.width + 2 * marginX, video.videoWidth - cropX);
  const cropHeight = Math.min(box.height + 2 * marginY, video.videoHeight - cropY);

  // Validate crop dimensions
  if (cropWidth <= 0 || cropHeight <= 0) {
    console.error("[Smart-Capture] Invalid crop dimensions");
    setStatus("Capture failed - invalid crop area");
    return null;
  }

  console.log(`[Smart-Capture] Crop area: ${cropWidth}x${cropHeight} at (${cropX}, ${cropY})`);

  try {
    // Clear canvas with white background
    context.fillStyle = "#FFFFFF";
    context.fillRect(0, 0, optimalResolution.width, optimalResolution.height);

    // Configure high-quality rendering
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = performanceTier === 'low' ? 'medium' : 'high';

    // Draw the captured image with proper scaling
    context.drawImage(
      video,
      cropX, cropY, cropWidth, cropHeight,
      0, 0, optimalResolution.width, optimalResolution.height
    );

    // Apply appropriate enhancement based on device capabilities
    const enhancementResult = applyImageEnhancement(canvas, context, deviceCaps);
    
    if (!enhancementResult.success) {
      console.warn("[Smart-Capture] Enhancement failed, using basic capture");
    }

    console.log("[Smart-Capture] Card captured and enhanced successfully");
    setStatus("Ghana Card captured successfully!");
    setCaptureMessage(`High-quality card captured (${optimalResolution.width}x${optimalResolution.height})`);
    setSubmitEnabled(true);

    return { 
      canvas, 
      context, 
      metadata: {
        resolution: optimalResolution,
        deviceType: isMobile ? 'mobile' : 'desktop',
        performanceTier,
        enhancementApplied: enhancementResult.success,
        captureTime: new Date().toISOString()
      }
    };

  } catch (error) {
    console.error("[Smart-Capture] Error during capture:", error);
    setStatus("Capture failed - please try again");
    setCaptureMessage("Capture failed");
    return null;
  }
};

// Adaptive image enhancement based on device capabilities
function applyImageEnhancement(canvas, ctx, deviceCaps) {
  const { isMobile, performanceTier, isHighDPI } = deviceCaps;
  
  try {
    console.log(`[Smart-Capture] Applying ${performanceTier} enhancement for ${isMobile ? 'mobile' : 'desktop'}`);
    
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    switch (performanceTier) {
      case 'low':
        return applyBasicEnhancement(imageData, ctx);
      case 'medium':
        return isMobile ? 
          applyMobileOptimizedEnhancement(imageData, ctx) :
          applyStandardEnhancement(imageData, ctx);
      case 'high':
      default:
        return applyAdvancedEnhancement(imageData, ctx, isHighDPI);
    }
    
  } catch (error) {
    console.error("[Smart-Capture] Enhancement error:", error);
    return { success: false, error: error.message };
  }
}

// Basic enhancement for low-performance devices
function applyBasicEnhancement(imageData, ctx) {
  const data = imageData.data;
  
  // Simple contrast enhancement
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    
    // Apply basic contrast curve
    data[i] = Math.min(255, Math.max(0, (r - 128) * 1.1 + 128));
    data[i + 1] = Math.min(255, Math.max(0, (g - 128) * 1.1 + 128));
    data[i + 2] = Math.min(255, Math.max(0, (b - 128) * 1.1 + 128));
  }
  
  ctx.putImageData(imageData, 0, 0);
  console.log("[Smart-Capture] Basic enhancement applied");
  return { success: true, type: 'basic' };
}

// Mobile-optimized enhancement (balanced quality/performance)
function applyMobileOptimizedEnhancement(imageData, ctx) {
  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;
  
  // Enhanced contrast with selective sharpening
  const originalData = new Uint8ClampedArray(data);
  
  // Apply contrast enhancement
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    
    // Enhanced contrast curve for document text
    data[i] = Math.min(255, Math.max(0, (r - 128) * 1.25 + 128));
    data[i + 1] = Math.min(255, Math.max(0, (g - 128) * 1.25 + 128));
    data[i + 2] = Math.min(255, Math.max(0, (b - 128) * 1.25 + 128));
  }
  
  // Apply selective sharpening (3x3 kernel)
  applySelectiveSharpening(data, originalData, width, height, 0.4);
  
  ctx.putImageData(imageData, 0, 0);
  console.log("[Smart-Capture] Mobile enhancement applied");
  return { success: true, type: 'mobile-optimized' };
}

// Standard enhancement for medium-performance devices
function applyStandardEnhancement(imageData, ctx) {
  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;
  
  // Apply standard unsharp mask
  const yuv = convertRGBtoYUV(data, width, height);
  applyUnsharpMask(yuv.y, width, height, 0.6, 0.8, 4);
  convertYUVtoRGB(yuv, data, width, height);
  applyLevelsAdjustment(data, 8, 248);
  
  ctx.putImageData(imageData, 0, 0);
  console.log("[Smart-Capture] Standard enhancement applied");
  return { success: true, type: 'standard' };
}

// Advanced enhancement for high-performance devices
function applyAdvancedEnhancement(imageData, ctx, isHighDPI) {
  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;
  
  // Advanced processing pipeline
  const yuv = convertRGBtoYUV(data, width, height);
  
  // Apply advanced unsharp mask with higher quality settings
  const sharpAmount = isHighDPI ? 0.8 : 0.7;
  const sharpRadius = isHighDPI ? 1.0 : 0.8;
  applyUnsharpMask(yuv.y, width, height, sharpAmount, sharpRadius, 3);
  
  // Advanced noise reduction on chrominance channels
  applyNoiseReduction(yuv.u, width, height, 0.3);
  applyNoiseReduction(yuv.v, width, height, 0.3);
  
  convertYUVtoRGB(yuv, data, width, height);
  
  // Advanced levels adjustment with gamma correction
  applyAdvancedLevelsAdjustment(data, 5, 250, 1.1);
  
  ctx.putImageData(imageData, 0, 0);
  console.log("[Smart-Capture] Advanced enhancement applied");
  return { success: true, type: 'advanced' };
}

// Selective sharpening for mobile (edge-preserving)
function applySelectiveSharpening(data, original, width, height, amount) {
  const kernel = [
    0, -1, 0,
    -1, 5, -1,
    0, -1, 0
  ];
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        let edgeStrength = 0;
        
        // Calculate edge strength
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const pixelIndex = ((y + ky) * width + (x + kx)) * 4 + c;
            const centerIndex = (y * width + x) * 4 + c;
            edgeStrength += Math.abs(original[pixelIndex] - original[centerIndex]);
          }
        }
        
        // Only apply sharpening on edges (selective sharpening)
        if (edgeStrength > 50) { // Threshold for edge detection
          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              const pixelIndex = ((y + ky) * width + (x + kx)) * 4 + c;
              const kernelIndex = (ky + 1) * 3 + (kx + 1);
              sum += original[pixelIndex] * kernel[kernelIndex];
            }
          }
          
          const currentIndex = (y * width + x) * 4 + c;
          const enhanced = original[currentIndex] + (sum - original[currentIndex]) * amount;
          data[currentIndex] = Math.min(255, Math.max(0, enhanced));
        }
      }
    }
  }
}

// Advanced noise reduction
function applyNoiseReduction(channel, width, height, strength) {
  const original = new Uint8ClampedArray(channel);
  const kernel = [
    1, 2, 1,
    2, 4, 2,
    1, 2, 1
  ];
  const kernelSum = 16;
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let sum = 0;
      
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const pixelIndex = (y + ky) * width + (x + kx);
          const kernelIndex = (ky + 1) * 3 + (kx + 1);
          sum += original[pixelIndex] * kernel[kernelIndex];
        }
      }
      
      const currentIndex = y * width + x;
      const smoothed = sum / kernelSum;
      const diff = Math.abs(original[currentIndex] - smoothed);
      
      // Only apply noise reduction if difference is small (likely noise)
      if (diff < 20) {
        channel[currentIndex] = original[currentIndex] * (1 - strength) + smoothed * strength;
      }
    }
  }
}

// Convert RGB to YUV colorspace
function convertRGBtoYUV(data, width, height) {
  const size = width * height;
  const y = new Uint8ClampedArray(size);
  const u = new Uint8ClampedArray(size);
  const v = new Uint8ClampedArray(size);
  
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    
    y[j] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    u[j] = Math.round(-0.14713 * r - 0.28886 * g + 0.436 * b + 128);
    v[j] = Math.round(0.615 * r - 0.51499 * g - 0.10001 * b + 128);
  }
  
  return { y, u, v };
}

// Convert YUV back to RGB
function convertYUVtoRGB(yuv, data, width, height) {
  const { y, u, v } = yuv;
  
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    const yVal = y[j];
    const uVal = u[j] - 128;
    const vVal = v[j] - 128;
    
    data[i] = Math.max(0, Math.min(255, Math.round(yVal + 1.13983 * vVal)));
    data[i + 1] = Math.max(0, Math.min(255, Math.round(yVal - 0.39465 * uVal - 0.58060 * vVal)));
    data[i + 2] = Math.max(0, Math.min(255, Math.round(yVal + 2.03211 * uVal)));
  }
}

// Apply unsharp mask algorithm
function applyUnsharpMask(channel, width, height, amount, radius, threshold) {
  const original = new Uint8ClampedArray(channel);
  
  // Apply Gaussian blur
  applyGaussianBlur(channel, width, height, radius);
  
  // Apply unsharp mask formula
  for (let i = 0; i < channel.length; i++) {
    const diff = original[i] - channel[i];
    
    if (Math.abs(diff) > threshold) {
      channel[i] = Math.max(0, Math.min(255, Math.round(original[i] + amount * diff)));
    } else {
      channel[i] = original[i];
    }
  }
}

// Apply Gaussian blur using separable convolution
function applyGaussianBlur(channel, width, height, radius) {
  const sigma = radius * 2.0;
  const kernelSize = Math.max(3, Math.floor(sigma * 3) | 1);
  const kernel = createGaussianKernel(kernelSize, sigma);
  
  const tempChannel = new Uint8ClampedArray(channel.length);
  
  // Horizontal pass
  applyGaussianPass(channel, tempChannel, width, height, kernel, kernelSize, true);
  // Vertical pass
  applyGaussianPass(tempChannel, channel, width, height, kernel, kernelSize, false);
}

// Create Gaussian kernel
function createGaussianKernel(size, sigma) {
  const kernel = new Float32Array(size);
  const halfSize = Math.floor(size / 2);
  let sum = 0;
  
  for (let i = 0; i < size; i++) {
    const x = i - halfSize;
    kernel[i] = Math.exp(-(x * x) / (2 * sigma * sigma));
    sum += kernel[i];
  }
  
  // Normalize
  for (let i = 0; i < size; i++) {
    kernel[i] /= sum;
  }
  
  return kernel;
}

// Apply Gaussian blur pass (horizontal or vertical)
function applyGaussianPass(src, dst, width, height, kernel, kernelSize, horizontal) {
  const halfKernel = Math.floor(kernelSize / 2);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      
      for (let k = -halfKernel; k <= halfKernel; k++) {
        let pixelPos;
        
        if (horizontal) {
          const xPos = Math.min(width - 1, Math.max(0, x + k));
          pixelPos = y * width + xPos;
        } else {
          const yPos = Math.min(height - 1, Math.max(0, y + k));
          pixelPos = yPos * width + x;
        }
        
        sum += src[pixelPos] * kernel[k + halfKernel];
      }
      
      dst[y * width + x] = Math.round(sum);
    }
  }
}

// Standard levels adjustment
function applyLevelsAdjustment(data, blackPoint, whitePoint) {
  const range = whitePoint - blackPoint;
  if (range === 0) return;
  
  for (let i = 0; i < data.length; i += 4) {
    for (let j = 0; j < 3; j++) {
      const value = data[i + j];
      
      let newValue;
      if (value <= blackPoint) {
        newValue = 0;
      } else if (value >= whitePoint) {
        newValue = 255;
      } else {
        newValue = Math.round(((value - blackPoint) / range) * 255);
      }
      
      data[i + j] = newValue;
    }
  }
}

// Advanced levels adjustment with gamma correction
function applyAdvancedLevelsAdjustment(data, blackPoint, whitePoint, gamma) {
  const range = whitePoint - blackPoint;
  if (range === 0) return;
  
  for (let i = 0; i < data.length; i += 4) {
    for (let j = 0; j < 3; j++) {
      const value = data[i + j];
      
      let newValue;
      if (value <= blackPoint) {
        newValue = 0;
      } else if (value >= whitePoint) {
        newValue = 255;
      } else {
        const normalized = (value - blackPoint) / range;
        const gammaCorrected = Math.pow(normalized, 1 / gamma);
        newValue = Math.round(gammaCorrected * 255);
      }
      
      data[i + j] = Math.min(255, Math.max(0, newValue));
    }
  }
}

// Convert to grayscale utility
export const convertToGrayscale = (canvas, ctx) => {
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  
  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round(data[i] * 0.299 + data[i+1] * 0.587 + data[i+2] * 0.114);
    data[i] = gray;
    data[i+1] = gray;
    data[i+2] = gray;
  }
  
  ctx.putImageData(imageData, 0, 0);
  return { canvas, ctx };
};

// Create multiple processing variants for different use cases
export const createCaptureVariants = (detection, videoRef, captureRef) => {
  const standardCapture = captureCard(detection, videoRef, captureRef);
  
  if (!standardCapture) {
    console.error("[Smart-Capture] Failed to create standard capture");
    return null;
  }
  
  try {
    // Create grayscale version
    const grayscaleCanvas = document.createElement('canvas');
    grayscaleCanvas.width = captureRef.current.width;
    grayscaleCanvas.height = captureRef.current.height;
    const grayscaleCtx = grayscaleCanvas.getContext('2d');
    grayscaleCtx.drawImage(captureRef.current, 0, 0);
    convertToGrayscale(grayscaleCanvas, grayscaleCtx);
    
    // Create high-contrast version
    const contrastCanvas = document.createElement('canvas');
    contrastCanvas.width = captureRef.current.width;
    contrastCanvas.height = captureRef.current.height;
    const contrastCtx = contrastCanvas.getContext('2d');
    contrastCtx.drawImage(captureRef.current, 0, 0);
    
    const contrastData = contrastCtx.getImageData(0, 0, contrastCanvas.width, contrastCanvas.height);
    applyLevelsAdjustment(contrastData.data, 30, 220);
    contrastCtx.putImageData(contrastData, 0, 0);
    
    return {
      standard: captureRef.current.toDataURL('image/jpeg', 0.92),
      grayscale: grayscaleCanvas.toDataURL('image/jpeg', 0.92),
      highContrast: contrastCanvas.toDataURL('image/jpeg', 0.92),
      metadata: standardCapture.metadata
    };
    
  } catch (error) {
    console.error("[Smart-Capture] Error creating capture variants:", error);
    return {
      standard: captureRef.current.toDataURL('image/jpeg', 0.92),
      metadata: standardCapture.metadata
    };
  }
};

// Utility to get optimal JPEG quality based on device
export const getOptimalJPEGQuality = () => {
  const deviceCaps = getDeviceCapabilities();
  
  if (deviceCaps.performanceTier === 'low') {
    return 0.85; // Lower quality for storage/bandwidth savings
  } else if (deviceCaps.performanceTier === 'medium') {
    return 0.90; // Balanced quality
  } else {
    return 0.95; // High quality for capable devices
  }
};

// Performance monitoring wrapper
export const measureCapturePerformance = (captureFunction) => {
  return function(...args) {
    const startTime = performance.now();
    const startMemory = performance.memory ? performance.memory.usedJSHeapSize : 0;
    
    try {
      const result = captureFunction.apply(this, args);
      const endTime = performance.now();
      const endMemory = performance.memory ? performance.memory.usedJSHeapSize : 0;
      
      console.log(`[Smart-Capture] Capture performance:`, {
        duration: `${(endTime - startTime).toFixed(2)}ms`,
        memoryDelta: `${((endMemory - startMemory) / 1024 / 1024).toFixed(2)}MB`,
        device: isMobileDevice() ? 'mobile' : 'desktop'
      });
      
      return result;
    } catch (error) {
      const endTime = performance.now();
      console.error(`[Smart-Capture] Capture failed after ${(endTime - startTime).toFixed(2)}ms:`, error);
      throw error;
    }
  };
};