//smart-capture/src/app/utilities/captureUtilities.js
export const captureCard = (
  detection,
  videoRef,
  captureRef,
  setStatus,
  setCaptureMessage,
  setSubmitEnabled
) => {
  console.log("[Smart-Capture] Starting high-quality card capture process...");
  const { box } = detection;
  const video = videoRef.current;
  const canvas = captureRef.current;
  const context = canvas.getContext("2d", { willReadFrequently: true, alpha: false });

  // Increase the output resolution significantly for better OCR
  const outputWidth = 1920; // Increased from 1280 for higher detail
  const outputHeight = Math.round(outputWidth / 1.585); // Ghana Card aspect ratio

  // Set canvas to higher resolution
  canvas.width = outputWidth;
  canvas.height = outputHeight;

  // Calculate crop area with more precise margins
  const margin = 0.05; // Increased from 0.03 to ensure full card is captured
  const marginX = box.width * margin;
  const marginY = (box.width / 1.585) * margin;

  const cropX = Math.max(0, box.x - marginX);
  const cropY = Math.max(0, box.y - marginY);
  const cropWidth = Math.min(box.width + 2 * marginX, video.videoWidth - cropX);
  const cropHeight = Math.min(
    box.width / 1.585 + 2 * marginY,
    video.videoHeight - cropY
  );

  // Clear the canvas first to prevent ghosting
  context.fillStyle = "#FFFFFF";
  context.fillRect(0, 0, outputWidth, outputHeight);

  // Enable image smoothing for better quality
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  // Draw the captured image with high quality settings
  context.drawImage(
    video,
    cropX,
    cropY,
    cropWidth,
    cropHeight, // source rectangle
    0,
    0,
    outputWidth,
    outputHeight // destination rectangle
  );

  // Apply professional unsharp mask for OCR-optimal sharpening
  applyUnsharpMaskForOCR(canvas, context);

  console.log("[Smart-Capture] High-quality card captured successfully");
  setStatus("High-quality card captured successfully.");
  setCaptureMessage("Card captured successfully.");
  setSubmitEnabled(true);

  // Automatically submit if in iframe context
  if (window.self !== window.top) {
    console.log("[Smart-Capture] In iframe context, auto-submitting...");
    setTimeout(() => {
      const event = new Event("click");
      document.querySelector(".send-btn")?.dispatchEvent(event);
    }, 1000);
  }

  return { canvas, context };
};

// Professional Unsharp Mask implementation optimized for document OCR
const applyUnsharpMaskForOCR = (canvas, ctx) => {
  console.log("[Smart-Capture] Applying professional unsharp mask for OCR optimization");
  
  // Step 1: Get image data
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  
  // Step 2: Convert to YUV to separate luminance from color information
  const yuv = convertRGBtoYUV(data, canvas.width, canvas.height);
  
  // Step 3: Apply unsharp mask to luminance channel only (better for OCR)
  applyUnsharpMask(
    yuv.y, 
    canvas.width, 
    canvas.height, 
    0.7,   // Amount: 0.7 is optimal for document text
    0.7,   // Radius: 0.7px works well for text edges at this resolution
    5      // Threshold: 5 prevents noise amplification in solid areas
  );
  
  // Step 4: Convert back to RGB colorspace
  convertYUVtoRGB(yuv, data, canvas.width, canvas.height);
  
  // Step 5: Apply subtle level adjustment for better OCR contrast
  applyLevelsAdjustment(data, 10, 245);
  
  // Apply the enhanced image data back to the canvas
  ctx.putImageData(imageData, 0, 0);
  
  console.log("[Smart-Capture] Unsharp mask applied successfully for OCR optimization");
};

// Convert RGB to YUV colorspace to separate luminance (Y) from chrominance (UV)
const convertRGBtoYUV = (data, width, height) => {
  const size = width * height;
  const y = new Uint8ClampedArray(size);
  const u = new Uint8ClampedArray(size);
  const v = new Uint8ClampedArray(size);
  
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    
    // Standard RGB to YUV conversion formula
    y[j] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    u[j] = Math.round(-0.14713 * r - 0.28886 * g + 0.436 * b + 128);
    v[j] = Math.round(0.615 * r - 0.51499 * g - 0.10001 * b + 128);
  }
  
  return { y, u, v };
};

// Convert YUV back to RGB colorspace
const convertYUVtoRGB = (yuv, data, width, height) => {
  const { y, u, v } = yuv;
  
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    const yVal = y[j];
    const uVal = u[j] - 128;
    const vVal = v[j] - 128;
    
    // Standard YUV to RGB conversion formula
    data[i] = Math.max(0, Math.min(255, Math.round(yVal + 1.13983 * vVal)));
    data[i + 1] = Math.max(0, Math.min(255, Math.round(yVal - 0.39465 * uVal - 0.58060 * vVal)));
    data[i + 2] = Math.max(0, Math.min(255, Math.round(yVal + 2.03211 * uVal)));
    // Alpha channel remains unchanged
  }
};

// Apply unsharp mask algorithm (industry standard sharpening)
const applyUnsharpMask = (channel, width, height, amount, radius, threshold) => {
  // Step 1: Create a copy of the original channel
  const original = new Uint8ClampedArray(channel.length);
  for (let i = 0; i < channel.length; i++) {
    original[i] = channel[i];
  }
  
  // Step 2: Apply Gaussian blur to create the "unsharp" version
  applyGaussianBlur(channel, width, height, radius);
  
  // Step 3: Apply unsharp mask formula: original + amount * (original - blurred)
  for (let i = 0; i < channel.length; i++) {
    const diff = original[i] - channel[i];
    
    // Only apply sharpening if difference exceeds threshold (prevents noise amplification)
    if (Math.abs(diff) > threshold) {
      // Apply unsharp mask formula with the specified amount
      channel[i] = Math.max(0, Math.min(255, Math.round(original[i] + amount * diff)));
    } else {
      // Keep original for areas with subtle differences (likely noise)
      channel[i] = original[i];
    }
  }
};

// Apply Gaussian blur (used by unsharp mask)
const applyGaussianBlur = (channel, width, height, radius) => {
  // Convert radius to sigma (standard deviation)
  const sigma = radius * 3.0;
  
  // Create appropriate size Gaussian kernel based on sigma
  const kernelSize = Math.max(3, Math.floor(sigma * 6 + 1) | 1); // Ensure odd number
  const kernel = createGaussianKernel(kernelSize, sigma);
  
  // For efficiency, blur separately in horizontal and vertical directions
  // (separable convolution - much faster than 2D convolution)
  const tempChannel = new Uint8ClampedArray(channel.length);
  
  // Apply horizontal blur
  applyGaussianPass(channel, tempChannel, width, height, kernel, kernelSize, true);
  
  // Apply vertical blur
  applyGaussianPass(tempChannel, channel, width, height, kernel, kernelSize, false);
};

// Create Gaussian kernel for blur operation
const createGaussianKernel = (size, sigma) => {
  const kernel = new Float32Array(size);
  const halfSize = Math.floor(size / 2);
  let sum = 0;
  
  // Calculate Gaussian values
  for (let i = 0; i < size; i++) {
    const x = i - halfSize;
    // Gaussian function: exp(-x² / (2σ²))
    kernel[i] = Math.exp(-(x * x) / (2 * sigma * sigma));
    sum += kernel[i];
  }
  
  // Normalize kernel so it sums to 1 (preserves brightness)
  for (let i = 0; i < size; i++) {
    kernel[i] /= sum;
  }
  
  return kernel;
};

// Apply Gaussian blur in one direction (horizontal or vertical)
const applyGaussianPass = (src, dst, width, height, kernel, kernelSize, horizontal) => {
  const halfKernel = Math.floor(kernelSize / 2);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      
      for (let k = -halfKernel; k <= halfKernel; k++) {
        let pixelPos;
        
        if (horizontal) {
          // For horizontal pass, vary x coordinate
          const xPos = Math.min(width - 1, Math.max(0, x + k));
          pixelPos = y * width + xPos;
        } else {
          // For vertical pass, vary y coordinate
          const yPos = Math.min(height - 1, Math.max(0, y + k));
          pixelPos = yPos * width + x;
        }
        
        sum += src[pixelPos] * kernel[k + halfKernel];
      }
      
      dst[y * width + x] = Math.round(sum);
    }
  }
};

// Apply levels adjustment for better contrast
const applyLevelsAdjustment = (data, blackPoint, whitePoint) => {
  const range = whitePoint - blackPoint;
  if (range === 0) return; // Avoid division by zero
  
  for (let i = 0; i < data.length; i += 4) {
    for (let j = 0; j < 3; j++) { // Apply to R, G, B channels
      const value = data[i + j];
      
      // Apply levels adjustment formula
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
};

// Convert to grayscale (optional, can be used if OCR works better with grayscale)
export const convertToGrayscale = (canvas, ctx) => {
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  
  for (let i = 0; i < data.length; i += 4) {
    // Weighted grayscale conversion (matches human perception)
    const gray = Math.round(data[i] * 0.299 + data[i+1] * 0.587 + data[i+2] * 0.114);
    data[i] = gray;     // Red
    data[i+1] = gray;   // Green
    data[i+2] = gray;   // Blue
    // Alpha channel remains unchanged
  }
  
  ctx.putImageData(imageData, 0, 0);
  return { canvas, ctx };
};

// Function to create multiple processing variants for testing
export const createCaptureVariants = (detection, videoRef, captureRef) => {
  // Create a standard capture with unsharp mask
  const standardCapture = captureCard(detection, videoRef, captureRef);
  
  // Create a copy for grayscale version
  const grayscaleCanvas = document.createElement('canvas');
  grayscaleCanvas.width = captureRef.current.width;
  grayscaleCanvas.height = captureRef.current.height;
  const grayscaleCtx = grayscaleCanvas.getContext('2d');
  grayscaleCtx.drawImage(captureRef.current, 0, 0);
  convertToGrayscale(grayscaleCanvas, grayscaleCtx);
  
  // Create a high-contrast version
  const contrastCanvas = document.createElement('canvas');
  contrastCanvas.width = captureRef.current.width;
  contrastCanvas.height = captureRef.current.height;
  const contrastCtx = contrastCanvas.getContext('2d');
  contrastCtx.drawImage(captureRef.current, 0, 0);
  
  const contrastData = contrastCtx.getImageData(0, 0, contrastCanvas.width, contrastCanvas.height);
  applyLevelsAdjustment(contrastData.data, 20, 230); // More aggressive contrast
  contrastCtx.putImageData(contrastData, 0, 0);
  
  return {
    standard: captureRef.current.toDataURL('image/jpeg', 0.95),
    grayscale: grayscaleCanvas.toDataURL('image/jpeg', 0.95),
    highContrast: contrastCanvas.toDataURL('image/jpeg', 0.95)
  };
};