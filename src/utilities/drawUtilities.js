//smart-capture/src/app/utilities/drawUtilities.js
export const drawDetections = (detections, canvasRef, isInvalid = false) => {
  console.log("Drawing detections on canvas...");
  const ctx = canvasRef.current.getContext("2d");
  if (!detections || detections.length === 0) {
    console.log("No detections to draw");
    return;
  }

  const detection = detections[0];
  const { box, confidence, alignmentScore } = detection;
  console.log(
    `Drawing detection: confidence=${confidence}, alignment=${alignmentScore}`
  );

  // Determine color based on validity and alignment score with improved gradients
  let color;
  let strokeWidth = 4;
  
  if (isInvalid) {
    color = "rgba(220, 53, 69, 0.85)"; // Semi-transparent red
    console.log("Drawing as invalid card");
  } else if (alignmentScore > 0.8) {
    color = "rgba(40, 167, 69, 0.85)"; // Semi-transparent green
    strokeWidth = 5; // Thicker border for better alignment
    console.log("Drawing as excellent alignment");
  } else if (alignmentScore > 0.5) {
    color = "rgba(255, 193, 7, 0.85)"; // Semi-transparent yellow
    console.log("Drawing as good alignment");
  } else {
    color = "rgba(255, 136, 0, 0.85)"; // Semi-transparent orange
    console.log("Drawing as poor alignment");
  }

  // Draw bounding box with smoother corners
  ctx.strokeStyle = color;
  ctx.lineWidth = strokeWidth;
  
  // Draw rounded rectangle for better visual appearance
  const radius = 10; // Corner radius
  const x = box.x;
  const y = box.y;
  const width = box.width;
  const height = box.height;
  
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
  ctx.stroke();
  
  console.log(
    `Drawn bounding box at x=${box.x}, y=${box.y}, width=${box.width}, height=${box.height}`
  );

  // Draw label background with rounded corners
  const text = isInvalid
    ? "Invalid Card"
    : `Ghana Card: ${Math.round(confidence * 100)}% (Align: ${Math.round(
        alignmentScore * 100
      )}%)`;

  console.log(`Drawing label: ${text}`);

  ctx.font = "bold 16px Arial";
  const textWidth = ctx.measureText(text).width + 20; // More padding
  const textHeight = 30;
  const textX = box.x > 35 ? box.x - 35 : box.x;
  const textY = box.y > 35 ? box.y - 35 : box.y + box.height;
  
  // Draw background with rounded corners
  const labelRadius = 5; // Smaller radius for label
  
  ctx.fillStyle = "rgba(0, 0, 0, 0.75)"; // Slightly more opaque
  ctx.beginPath();
  ctx.moveTo(textX + labelRadius, textY);
  ctx.lineTo(textX + textWidth - labelRadius, textY);
  ctx.quadraticCurveTo(textX + textWidth, textY, textX + textWidth, textY + labelRadius);
  ctx.lineTo(textX + textWidth, textY + textHeight - labelRadius);
  ctx.quadraticCurveTo(textX + textWidth, textY + textHeight, textX + textWidth - labelRadius, textY + textHeight);
  ctx.lineTo(textX + labelRadius, textY + textHeight);
  ctx.quadraticCurveTo(textX, textY + textHeight, textX, textY + textHeight - labelRadius);
  ctx.lineTo(textX, textY + labelRadius);
  ctx.quadraticCurveTo(textX, textY, textX + labelRadius, textY);
  ctx.closePath();
  ctx.fill();

  // Draw label text with slight shadow for better readability
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = 3;
  ctx.shadowOffsetX = 1;
  ctx.shadowOffsetY = 1;
  ctx.fillStyle = color;
  ctx.fillText(
    text,
    textX + 10, // More padding
    textY + 20  // Centered vertically
  );
  
  // Reset shadow
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  
  // Add guidance indicators for better alignment
  if (!isInvalid && alignmentScore < 0.8) {
    drawAlignmentGuides(ctx, box, alignmentScore);
  }
};

// New function to draw alignment guides to help user position the card better
const drawAlignmentGuides = (ctx, box, alignmentScore) => {
  // Calculate how far from ideal alignment we are (0-1 where 1 is perfect)
  const alignmentNeeded = 1 - Math.min(1, alignmentScore / 0.8);
  
  // Draw alignment indicators only if meaningful improvement is needed
  if (alignmentNeeded > 0.2) {
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    
    // Canvas center
    const canvasWidth = ctx.canvas.width;
    const canvasHeight = ctx.canvas.height;
    const canvasCenterX = canvasWidth / 2;
    const canvasCenterY = canvasHeight / 2;
    
    // Calculate offsets
    const offsetX = canvasCenterX - centerX;
    const offsetY = canvasCenterY - centerY;
    
    // Only show guides if the offset is significant
    if (Math.abs(offsetX) > box.width * 0.1 || Math.abs(offsetY) > box.height * 0.1) {
      // Draw arrow pointing to ideal position
      const arrowLength = Math.min(50, Math.max(20, 
        Math.sqrt(offsetX * offsetX + offsetY * offsetY) * 0.3));
      
      const angleOffset = Math.atan2(offsetY, offsetX);
      
      // Draw arrow line
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(
        centerX + Math.cos(angleOffset) * arrowLength,
        centerY + Math.sin(angleOffset) * arrowLength
      );
      ctx.stroke();
      
      // Draw arrow head
      const headLength = arrowLength * 0.3;
      const angle1 = angleOffset - Math.PI / 6;
      const angle2 = angleOffset + Math.PI / 6;
      
      ctx.beginPath();
      ctx.moveTo(
        centerX + Math.cos(angleOffset) * arrowLength,
        centerY + Math.sin(angleOffset) * arrowLength
      );
      ctx.lineTo(
        centerX + Math.cos(angle1) * (arrowLength - headLength),
        centerY + Math.sin(angle1) * (arrowLength - headLength)
      );
      ctx.lineTo(
        centerX + Math.cos(angle2) * (arrowLength - headLength),
        centerY + Math.sin(angle2) * (arrowLength - headLength)
      );
      ctx.closePath();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.fill();
    }
  }
};