// Helper function to detect mobile devices
function isMobileDevice() {
  const hasWindow = typeof window !== 'undefined';
  const hasNavigator = typeof navigator !== 'undefined';

  const hasTouchEvents = hasWindow && ('ontouchstart' in window || (hasNavigator && navigator.maxTouchPoints > 0));
  const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
  const isMobileUserAgent = hasNavigator && mobileRegex.test(navigator.userAgent);

  return hasTouchEvents || isMobileUserAgent;
}

// Get device pixel ratio for high-DPI displays
function getDevicePixelRatio() {
  return typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
}

// Get responsive drawing parameters based on device and canvas size
function getDrawingParams(canvasWidth, canvasHeight, isMobile = false) {
  const pixelRatio = getDevicePixelRatio();
  const baseSize = Math.min(canvasWidth, canvasHeight);
  
  if (isMobile) {
    return {
      // Bounding box styling - thicker for mobile
      lineWidth: Math.max(4, Math.round(baseSize * 0.012 * pixelRatio)),
      cornerRadius: Math.max(6, Math.round(baseSize * 0.015)),
      
      // Text styling - larger for mobile
      fontSize: Math.max(16, Math.round(baseSize * 0.04)),
      fontFamily: 'Arial, sans-serif',
      fontWeight: 'bold',
      
      // Spacing and padding
      textPadding: Math.max(12, Math.round(baseSize * 0.025)),
      labelOffset: Math.max(35, Math.round(baseSize * 0.08)),
      shadowBlur: 4,
      
      // Animation and interaction
      pulseAnimation: true,
      cornerMarkers: true
    };
  } else {
    return {
      // Desktop styling - more refined
      lineWidth: Math.max(3, Math.round(baseSize * 0.008 * pixelRatio)),
      cornerRadius: Math.max(4, Math.round(baseSize * 0.012)),
      
      // Text styling
      fontSize: Math.max(14, Math.round(baseSize * 0.03)),
      fontFamily: 'Arial, sans-serif',
      fontWeight: 'bold',
      
      // Spacing and padding
      textPadding: Math.max(8, Math.round(baseSize * 0.02)),
      labelOffset: Math.max(25, Math.round(baseSize * 0.05)),
      shadowBlur: 3,
      
      // Animation and interaction
      pulseAnimation: false,
      cornerMarkers: false
    };
  }
}

// Enhanced color scheme with better visibility
function getColorScheme(detectionState, alignmentScore = 0) {
  const schemes = {
    invalid: {
      primary: '#ff4444',      // Bright red
      secondary: '#ff6666',    // Lighter red
      background: 'rgba(255, 68, 68, 0.15)',
      text: '#ffffff',
      shadow: 'rgba(0, 0, 0, 0.8)'
    },
    tooFar: {
      primary: '#ff8800',      // Orange
      secondary: '#ffaa33',    // Lighter orange
      background: 'rgba(255, 136, 0, 0.15)',
      text: '#ffffff',
      shadow: 'rgba(0, 0, 0, 0.8)'
    },
    tooClose: {
      primary: '#ff8800',      // Orange
      secondary: '#ffaa33',    // Lighter orange
      background: 'rgba(255, 136, 0, 0.15)',
      text: '#ffffff',
      shadow: 'rgba(0, 0, 0, 0.8)'
    },
    detected: {
      primary: '#ffdd00',      // Yellow
      secondary: '#ffee44',    // Lighter yellow
      background: 'rgba(255, 221, 0, 0.15)',
      text: '#000000',
      shadow: 'rgba(255, 255, 255, 0.8)'
    },
    aligned: {
      primary: '#44dd44',      // Green
      secondary: '#66ee66',    // Lighter green
      background: 'rgba(68, 221, 68, 0.15)',
      text: '#ffffff',
      shadow: 'rgba(0, 0, 0, 0.8)'
    },
    perfect: {
      primary: '#00dd88',      // Bright green
      secondary: '#44ee99',    // Lighter bright green
      background: 'rgba(0, 221, 136, 0.15)',
      text: '#ffffff',
      shadow: 'rgba(0, 0, 0, 0.8)'
    }
  };

  // Determine state based on detection quality
  if (detectionState === 'invalid') return schemes.invalid;
  if (detectionState === 'tooFar') return schemes.tooFar;
  if (detectionState === 'tooClose') return schemes.tooClose;
  
  // Quality-based color selection
  if (alignmentScore > 0.8) return schemes.perfect;
  if (alignmentScore > 0.6) return schemes.aligned;
  if (alignmentScore > 0.3) return schemes.detected;
  
  return schemes.detected; // Default
}

// Main drawing function with proper coordinate handling
export const drawDetections = (detections, canvasRef, isInvalid = false, isMobile = false, detectionState = null) => {
  console.log("[DrawUtils] Drawing detections on canvas...");
  
  if (!canvasRef?.current) {
    console.warn("[DrawUtils] Canvas reference not available");
    return;
  }

  const canvas = canvasRef.current;
  const ctx = canvas.getContext("2d");
  
  if (!ctx || canvas.width === 0 || canvas.height === 0) {
    console.warn("[DrawUtils] Canvas context not ready");
    return;
  }

  // Clear the canvas first
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!detections || detections.length === 0) {
    console.log("[DrawUtils] No detections to draw");
    return;
  }

  const detection = detections[0]; // Draw the best detection
  const { box, confidence, alignmentScore = 0, areaRatio = 0 } = detection;
  
  if (!box || box.width <= 0 || box.height <= 0) {
    console.warn("[DrawUtils] Invalid bounding box");
    return;
  }

  console.log(`[DrawUtils] Original box: x=${box.x.toFixed(1)}, y=${box.y.toFixed(1)}, w=${box.width.toFixed(1)}, h=${box.height.toFixed(1)}`);
  console.log(`[DrawUtils] Canvas dimensions: ${canvas.width}x${canvas.height}`);

  // Get responsive drawing parameters
  const params = getDrawingParams(canvas.width, canvas.height, isMobile);
  
  // Ensure bounding box coordinates are properly clamped to canvas bounds
  const clampedBox = {
    x: Math.max(0, Math.min(box.x, canvas.width)),
    y: Math.max(0, Math.min(box.y, canvas.height)),
    width: Math.max(0, Math.min(box.width, canvas.width - Math.max(0, box.x))),
    height: Math.max(0, Math.min(box.height, canvas.height - Math.max(0, box.y)))
  };
  
  // Additional validation to ensure the box makes sense
  if (clampedBox.width < 10 || clampedBox.height < 10) {
    console.warn("[DrawUtils] Clamped box too small, skipping draw");
    return;
  }
  
  console.log(`[DrawUtils] Clamped box: x=${clampedBox.x.toFixed(1)}, y=${clampedBox.y.toFixed(1)}, w=${clampedBox.width.toFixed(1)}, h=${clampedBox.height.toFixed(1)}`);
  
  // Determine detection state for appropriate coloring
  let currentState = detectionState;
  if (!currentState) {
    if (isInvalid) {
      // Determine specific invalid reason based on area ratio
      if (areaRatio < 0.15) {
        currentState = 'tooFar';
      } else if (areaRatio > 0.85) {
        currentState = 'tooClose';
      } else {
        currentState = 'invalid';
      }
    } else {
      currentState = 'detected';
    }
  }

  const colors = getColorScheme(currentState, alignmentScore);

  // Enable high-quality rendering
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Draw background overlay for better visibility (mobile)
  if (isMobile && params.pulseAnimation) {
    drawBackgroundOverlay(ctx, clampedBox, colors, canvas.width, canvas.height);
  }

  // Draw main bounding box with clamped coordinates
  drawBoundingBox(ctx, clampedBox, colors, params, isMobile);

  // Draw corner markers for mobile
  if (isMobile && params.cornerMarkers) {
    drawCornerMarkers(ctx, clampedBox, colors, params);
  }

  // Draw confidence and status label
  const labelText = generateLabelText(currentState, confidence, alignmentScore, areaRatio);
  drawLabel(ctx, clampedBox, labelText, colors, params, canvas.width, canvas.height);

  // Draw alignment indicator
  if (alignmentScore > 0) {
    drawAlignmentIndicator(ctx, clampedBox, alignmentScore, colors, params, isMobile);
  }

  console.log(`[DrawUtils] Drawing completed for ${isMobile ? 'mobile' : 'desktop'} device`);
};

// Draw the main bounding box with enhanced styling
function drawBoundingBox(ctx, box, colors, params, isMobile) {
  ctx.save();
  
  // Add shadow for better visibility
  ctx.shadowColor = colors.shadow;
  ctx.shadowBlur = params.shadowBlur;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;

  // Draw the main rectangle
  ctx.strokeStyle = colors.primary;
  ctx.lineWidth = params.lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Rounded rectangle for better appearance
  drawRoundedRect(ctx, box.x, box.y, box.width, box.height, params.cornerRadius);
  ctx.stroke();

  // Add inner highlight for better visibility
  if (isMobile) {
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = colors.secondary;
    ctx.lineWidth = Math.max(2, params.lineWidth - 2);
    const innerPadding = 3;
    drawRoundedRect(
      ctx, 
      box.x + innerPadding, 
      box.y + innerPadding, 
      box.width - (innerPadding * 2), 
      box.height - (innerPadding * 2), 
      Math.max(0, params.cornerRadius - 2)
    );
    ctx.stroke();
  }

  ctx.restore();
}

// Draw corner markers for mobile interface
function drawCornerMarkers(ctx, box, colors, params) {
  ctx.save();
  
  const cornerSize = Math.min(box.width, box.height) * 0.12;
  const cornerLength = Math.max(20, cornerSize);
  const cornerOffset = params.lineWidth + 2;

  ctx.strokeStyle = colors.primary;
  ctx.lineWidth = params.lineWidth + 1;
  ctx.lineCap = 'round';

  // Top-left corner
  drawCornerMarker(ctx, box.x - cornerOffset, box.y - cornerOffset, cornerLength, 'top-left');
  
  // Top-right corner
  drawCornerMarker(ctx, box.x + box.width + cornerOffset, box.y - cornerOffset, cornerLength, 'top-right');
  
  // Bottom-left corner
  drawCornerMarker(ctx, box.x - cornerOffset, box.y + box.height + cornerOffset, cornerLength, 'bottom-left');
  
  // Bottom-right corner
  drawCornerMarker(ctx, box.x + box.width + cornerOffset, box.y + box.height + cornerOffset, cornerLength, 'bottom-right');

  ctx.restore();
}

// Draw individual corner marker
function drawCornerMarker(ctx, x, y, length, position) {
  ctx.beginPath();
  
  switch (position) {
    case 'top-left':
      ctx.moveTo(x + length, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + length);
      break;
    case 'top-right':
      ctx.moveTo(x - length, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + length);
      break;
    case 'bottom-left':
      ctx.moveTo(x, y - length);
      ctx.lineTo(x, y);
      ctx.lineTo(x + length, y);
      break;
    case 'bottom-right':
      ctx.moveTo(x - length, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y - length);
      break;
  }
  
  ctx.stroke();
}

// Draw background overlay for mobile visibility
function drawBackgroundOverlay(ctx, box, colors, canvasWidth, canvasHeight) {
  ctx.save();
  
  // Semi-transparent overlay on the entire canvas
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  
  // Clear the detection area (create a "window" effect)
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = 'rgba(0, 0, 0, 1)';
  const padding = 15;
  drawRoundedRect(ctx, box.x - padding, box.y - padding, box.width + (padding * 2), box.height + (padding * 2), 15);
  ctx.fill();
  
  ctx.restore();
}

// Generate appropriate label text based on detection state
function generateLabelText(state, confidence, alignmentScore, areaRatio) {
  const confidencePercent = Math.round((confidence || 0) * 100);
  const alignmentPercent = Math.round((alignmentScore || 0) * 100);
  
  switch (state) {
    case 'invalid':
      return "⚠️ Position Ghana Card properly";
    case 'tooFar':
      return "📏 Move closer to camera";
    case 'tooClose':
      return "📏 Move back slightly";
    case 'perfect':
      return `✅ Perfect! ${confidencePercent}% (${alignmentPercent}% aligned)`;
    case 'aligned':
      return `🎯 Ghana Card ${confidencePercent}% (Hold steady)`;
    case 'detected':
    default:
      return `📱 Ghana Card ${confidencePercent}% (Align: ${alignmentPercent}%)`;
  }
}

// Draw text label with enhanced styling
function drawLabel(ctx, box, text, colors, params, canvasWidth, canvasHeight) {
  if (!text) return;

  ctx.save();
  
  // Set font properties
  ctx.font = `${params.fontWeight} ${params.fontSize}px ${params.fontFamily}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  // Measure text for background sizing
  const textMetrics = ctx.measureText(text);
  const textWidth = textMetrics.width;
  const textHeight = params.fontSize;
  
  // Calculate label position (avoid going off-screen)
  let labelX = box.x;
  let labelY = box.y - params.labelOffset;
  
  // Adjust position if label would go off-screen
  if (labelY - textHeight/2 - params.textPadding < 0) {
    labelY = box.y + box.height + params.labelOffset;
  }
  
  if (labelX + textWidth + params.textPadding * 2 > canvasWidth) {
    labelX = canvasWidth - textWidth - params.textPadding * 2;
  }
  
  if (labelX < 0) {
    labelX = params.textPadding;
  }

  // Draw label background
  const bgX = labelX - params.textPadding;
  const bgY = labelY - textHeight/2 - params.textPadding;
  const bgWidth = textWidth + params.textPadding * 2;
  const bgHeight = textHeight + params.textPadding * 2;

  // Background with shadow
  ctx.shadowColor = colors.shadow;
  ctx.shadowBlur = params.shadowBlur;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 1;
  
  ctx.fillStyle = colors.background;
  drawRoundedRect(ctx, bgX, bgY, bgWidth, bgHeight, params.cornerRadius);
  ctx.fill();

  // Background border
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = colors.primary;
  ctx.lineWidth = 2;
  drawRoundedRect(ctx, bgX, bgY, bgWidth, bgHeight, params.cornerRadius);
  ctx.stroke();

  // Draw text
  ctx.fillStyle = colors.text;
  ctx.shadowColor = colors.text === '#ffffff' ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.5)';
  ctx.shadowBlur = 1;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 1;
  ctx.fillText(text, labelX, labelY);
  
  ctx.restore();
}

// Draw alignment quality indicator
function drawAlignmentIndicator(ctx, box, alignmentScore, colors, params, isMobile) {
  if (!isMobile || alignmentScore < 0.1) return;

  ctx.save();
  
  const indicatorSize = Math.min(box.width, box.height) * 0.15;
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;
  
  // Background circle
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.beginPath();
  ctx.arc(centerX, centerY, indicatorSize, 0, 2 * Math.PI);
  ctx.fill();
  
  // Progress arc
  ctx.strokeStyle = colors.primary;
  ctx.lineWidth = Math.max(4, indicatorSize * 0.25);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(centerX, centerY, indicatorSize * 0.75, -Math.PI / 2, (-Math.PI / 2) + (2 * Math.PI * alignmentScore));
  ctx.stroke();
  
  // Center dot
  if (alignmentScore > 0.8) {
    ctx.fillStyle = colors.primary;
    ctx.beginPath();
    ctx.arc(centerX, centerY, indicatorSize * 0.3, 0, 2 * Math.PI);
    ctx.fill();
  }
  
  ctx.restore();
}

// Utility function to draw rounded rectangles
function drawRoundedRect(ctx, x, y, width, height, radius) {
  if (radius <= 0 || width < radius * 2 || height < radius * 2) {
    ctx.rect(x, y, width, height);
    return;
  }

  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

// Draw detection statistics for debugging (optional)
export const drawDebugInfo = (detections, canvasRef, showDebug = false) => {
  if (!showDebug || !canvasRef?.current || !detections?.length) return;

  const canvas = canvasRef.current;
  const ctx = canvas.getContext("2d");
  
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
  ctx.fillRect(10, 10, 250, 120);
  
  ctx.fillStyle = 'white';
  ctx.font = '12px monospace';
  ctx.fillText(`Detections: ${detections.length}`, 20, 30);
  ctx.fillText(`Confidence: ${(detections[0].confidence * 100).toFixed(1)}%`, 20, 50);
  ctx.fillText(`Aspect: ${detections[0].aspectRatio?.toFixed(2)}`, 20, 70);
  ctx.fillText(`Area: ${(detections[0].areaRatio * 100).toFixed(1)}%`, 20, 90);
  ctx.fillText(`Canvas: ${canvas.width}x${canvas.height}`, 20, 110);
  
  ctx.restore();
};

// Animation utilities for smooth transitions
export const animateDetection = (canvasRef, detection, duration = 500) => {
  if (!canvasRef?.current || !detection) return;

  const canvas = canvasRef.current;
  const startTime = performance.now();
  
  const animate = (currentTime) => {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // Easing function for smooth animation
    const eased = 1 - Math.pow(1 - progress, 3);
    
    // Scale effect for feedback
    const scale = 1 + (Math.sin(progress * Math.PI * 4) * 0.05 * (1 - progress));
    
    if (progress < 1) {
      requestAnimationFrame(animate);
    }
  };
  
  requestAnimationFrame(animate);
};

// Utility to clear all drawings
export const clearCanvas = (canvasRef) => {
  if (!canvasRef?.current) return;
  
  const canvas = canvasRef.current;
  const ctx = canvas.getContext("2d");
  
  if (ctx && canvas.width > 0 && canvas.height > 0) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
};

// Performance monitoring for drawing operations
export const measureDrawingPerformance = (fn, label = 'Drawing') => {
  return function(...args) {
    const start = performance.now();
    const result = fn.apply(this, args);
    const end = performance.now();
    
    if (end - start > 16) { // Log if drawing takes longer than one frame (60fps)
      console.warn(`[DrawUtils] ${label} took ${(end - start).toFixed(2)}ms (may affect performance)`);
    }
    
    return result;
  };
};