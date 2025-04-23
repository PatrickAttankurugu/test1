class GhanaCardDetector {
    constructor() {
        // DOM Elements
        this.videoElement = document.getElementById('webcam');
        this.canvas = document.getElementById('detection-canvas');
        this.capturedCanvas = document.getElementById('captured-card');
        this.statusElement = document.getElementById('status');
        this.modelStatusElement = document.getElementById('model-status');
        this.captureStatusElement = document.getElementById('capture-status');
        
        this.startBtn = document.getElementById('start-btn');
        this.captureBtn = document.getElementById('capture-btn');
        this.autoCaptureBtn = document.getElementById('auto-capture-btn');
        this.sendBtn = document.getElementById('send-btn');
        
        // Canvas context
        this.ctx = this.canvas.getContext('2d');
        this.capturedCtx = this.capturedCanvas.getContext('2d');
        
        // Initial setup
        this.capturedCanvas.width = 640;
        this.capturedCanvas.height = 400;
        this.capturedCtx.fillStyle = '#f0f0f0';
        this.capturedCtx.fillRect(0, 0, this.capturedCanvas.width, this.capturedCanvas.height);
        this.capturedCtx.font = '16px Arial';
        this.capturedCtx.fillStyle = '#6c757d';
        this.capturedCtx.textAlign = 'center';
        this.capturedCtx.fillText('No card captured yet', this.capturedCanvas.width / 2, this.capturedCanvas.height / 2);
        
        // Detection parameters
        this.modelPath = 'models/autocapture.tflite';
        this.model = null;
        this.modelLoaded = false;
        this.cameraActive = false;
        this.autoCapture = false;
        this.processing = false;
        this.cardCaptured = false;
        
        // Detection thresholds
        this.consecutiveDetections = 10;
        this.minConsecutiveDetections = 3;
        this.confidenceThreshold = 0.85;
        
        // Initialize event listeners
        this.initEventListeners();
        
        // Start initialization
        this.initialize();
    }
    
    initEventListeners() {
        this.startBtn?.addEventListener('click', () => this.toggleCamera());
        this.captureBtn?.addEventListener('click', () => this.manualCapture());
        this.autoCaptureBtn?.addEventListener('click', () => this.toggleAutoCapture());
        this.sendBtn?.addEventListener('click', () => this.sendToBackend());
    }
    
    async initialize() {
        try {
            this.setStatus('Loading TensorFlow.js...', 'status-loading');
            
            if (typeof tf === 'undefined') {
                throw new Error('TensorFlow.js not loaded. Please check your internet connection and refresh the page.');
            }
            
            this.setStatus('Loading Ghana Card detection model...', 'status-loading');
            this.setModelStatus('Initializing...');
            
            // Initialize TensorFlow.js
            await tf.ready();
            
            if (typeof tflite === 'undefined') {
                throw new Error('TensorFlow.js TFLite module not loaded');
            }
            
            // Load the TFLite model
            this.model = await tflite.loadTFLiteModel(this.modelPath);
            this.modelLoaded = true;
            
            this.setStatus('Model loaded successfully. Ready to start camera.', 'status-success');
            this.setModelStatus(`Model loaded: YOLOv8 TFLite (${this.modelPath})`);
            
            // Auto-start camera after model loads
            this.startCamera();
            
        } catch (error) {
            this.setStatus(`Error initializing detector: ${error.message}`, 'status-error');
            this.setModelStatus('Failed to load model');
        }
    }
    
    async toggleCamera() {
        if (this.cameraActive) {
            this.stopCamera();
        } else {
            await this.startCamera();
        }
    }
    
    async startCamera() {
        if (!this.modelLoaded) {
            this.setStatus('Model not loaded yet. Please wait...', 'status-warning');
            return;
        }
        
        try {
            this.setStatus('Requesting camera access...', 'status-loading');
            
            // Request camera with preferred settings
            const constraints = {
                video: {
                    facingMode: 'environment', // Use back camera on mobile
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }
            };
            
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.videoElement.srcObject = stream;
            
            // Wait for video to be ready
            await new Promise(resolve => {
                this.videoElement.onloadedmetadata = () => {
                    this.videoElement.play();
                    resolve();
                };
            });
            
            // Update canvas size to match video
            this.canvas.width = this.videoElement.videoWidth;
            this.canvas.height = this.videoElement.videoHeight;
            
            this.cameraActive = true;
            this.startBtn.textContent = 'Stop Camera';
            this.captureBtn.disabled = false;
            this.autoCaptureBtn.disabled = false;
            
            // Auto-enable auto-capture
            this.toggleAutoCapture();
            
            this.setStatus('Camera active. Position a Ghana Card in the frame.', 'status-active');
            
            // Start detection loop
            this.startDetectionLoop();
        } catch (error) {
            this.setStatus(`Camera access error: ${error.message}`, 'status-error');
        }
    }
    
    stopCamera() {
        // Stop all tracks from the stream
        if (this.videoElement.srcObject) {
            const tracks = this.videoElement.srcObject.getTracks();
            tracks.forEach(track => track.stop());
            this.videoElement.srcObject = null;
        }
        
        // Reset detection canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Update UI
        this.cameraActive = false;
        this.autoCapture = false;
        this.startBtn.textContent = 'Start Camera';
        this.captureBtn.disabled = true;
        this.autoCaptureBtn.disabled = true;
        this.autoCaptureBtn.textContent = 'Enable Auto-Capture';
        
        this.setStatus('Camera stopped.', 'status-warning');
    }
    
    toggleAutoCapture() {
        this.autoCapture = !this.autoCapture;
        this.autoCaptureBtn.textContent = this.autoCapture ? 'Disable Auto-Capture' : 'Enable Auto-Capture';
        
        if (this.autoCapture) {
            this.setStatus('Auto-capture enabled. Hold a Ghana Card steady in the frame.', 'status-active');
            this.consecutiveDetections = 0;
        } else {
            this.setStatus('Auto-capture disabled.', 'status-warning');
        }
    }
    
    startDetectionLoop() {
        if (!this.cameraActive) return;
        
        // Run detection if not currently processing
        if (!this.processing) {
            this.detectCard();
        }
        
        // Continue the loop
        requestAnimationFrame(() => this.startDetectionLoop());
    }
    
    async preprocessImage() {
        return tf.tidy(() => {
            // Convert video to tensor
            const videoFrame = tf.browser.fromPixels(this.videoElement);
            
            // Get dimensions
            const [videoHeight, videoWidth] = videoFrame.shape;
            
            // YOLOv8 needs 640x640 square input
            const inputSize = 640;
            
            // Calculate scale to maintain aspect ratio
            const scale = Math.min(inputSize / videoWidth, inputSize / videoHeight);
            const scaledWidth = Math.round(videoWidth * scale);
            const scaledHeight = Math.round(videoHeight * scale);
            
            // Resize while maintaining aspect ratio
            const resized = tf.image.resizeBilinear(videoFrame, [scaledHeight, scaledWidth]);
            
            // Create black padding
            const paddingHeight = inputSize - scaledHeight;
            const paddingWidth = inputSize - scaledWidth;
            const topPadding = Math.floor(paddingHeight / 2);
            const leftPadding = Math.floor(paddingWidth / 2);
            
            // Pad the image to get a square input of 640x640
            const padded = tf.pad(
                resized,
                [
                    [topPadding, paddingHeight - topPadding],
                    [leftPadding, paddingWidth - leftPadding],
                    [0, 0]
                ]
            );
            
            // Normalize values to [0, 1]
            const normalized = padded.div(tf.scalar(255));
            
            // Add batch dimension
            const batched = normalized.expandDims(0);
            
            // Store original dimensions for mapping back
            const imageDims = {
                inputSize,
                originalWidth: videoWidth,
                originalHeight: videoHeight,
                topPadding,
                leftPadding,
                scale
            };
            
            return { tensor: batched, imageDims };
        });
    }
    
    async detectCard() {
        if (!this.cameraActive || !this.modelLoaded || this.videoElement.readyState !== this.videoElement.HAVE_ENOUGH_DATA) {
            return;
        }
        
        this.processing = true;
        
        try {
            // Preprocess the video frame
            const { tensor, imageDims } = await this.preprocessImage();
            
            // Run inference
            const predictions = await this.model.predict(tensor);
            
            // Process results
            const detections = await this.processYoloOutput(predictions, imageDims);
            
            // Clear previous drawings
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            
            // Draw detections
            if (detections.length > 0) {
                this.drawDetections(detections);
                
                // Check for auto-capture
                if (this.autoCapture) {
                    this.checkForAutoCapture(detections);
                }
            } else {
                // Reset consecutive detections counter
                this.consecutiveDetections = 0;
            }
            
            // Clean up tensors
            tensor.dispose();
            if (Array.isArray(predictions)) {
                predictions.forEach(p => {
                    if (p && typeof p.dispose === 'function') {
                        p.dispose();
                    }
                });
            } else if (predictions && typeof predictions.dispose === 'function') {
                predictions.dispose();
            }
            
        } catch (error) {
            console.error('Detection error:', error);
        }
        
        this.processing = false;
    }
    
    async processYoloOutput(predictions, imageDims) {
        const detections = [];
        
        try {
            // Convert predictions to arrays for processing
            let outputArray;
            
            // Handle different output formats
            if (Array.isArray(predictions)) {
                // If model returns multiple outputs, use the first one
                outputArray = await predictions[0].array();
            } else {
                // If model returns a single output
                outputArray = await predictions.array();
            }
            
            // Determine YOLOv8 output format (usually [1, 8400, 6] or [1, 6, 8400])
            // Format 1: [batch, predictions, outputs] - each row is a detection with [x, y, w, h, conf, class]
            if (outputArray[0].length > outputArray[0][0].length) {
                // Number of detections
                const numDetections = outputArray[0].length;
                
                for (let i = 0; i < numDetections; i++) {
                    // YOLOv8 outputs normalized coordinates [0-1]
                    const x = outputArray[0][i][0]; // center x
                    const y = outputArray[0][i][1]; // center y
                    const w = outputArray[0][i][2]; // width
                    const h = outputArray[0][i][3]; // height
                    const conf = outputArray[0][i][4]; // confidence
                    
                    // Skip low confidence detections
                    if (conf > this.confidenceThreshold) {
                        // Convert normalized coordinates to pixels
                        // YOLOv8 outputs center coordinates, convert to top-left
                        const boxX = (x - w/2) * imageDims.inputSize;
                        const boxY = (y - h/2) * imageDims.inputSize;
                        const boxWidth = w * imageDims.inputSize;
                        const boxHeight = h * imageDims.inputSize;
                        
                        // Convert from padded image back to original video coordinates
                        const originalX = (boxX - imageDims.leftPadding) / imageDims.scale;
                        const originalY = (boxY - imageDims.topPadding) / imageDims.scale;
                        const originalWidth = boxWidth / imageDims.scale;
                        const originalHeight = boxHeight / imageDims.scale;
                        
                        // Calculate aspect ratio
                        const aspectRatio = originalWidth / originalHeight;
                        
                        // Add to detections
                        detections.push({
                            box: {
                                x: originalX,
                                y: originalY,
                                width: originalWidth,
                                height: originalHeight
                            },
                            confidence: conf,
                            aspectRatio: aspectRatio,
                            alignmentScore: this.calculateAlignmentScore(aspectRatio, originalWidth * originalHeight, {
                                originalWidth: imageDims.originalWidth,
                                originalHeight: imageDims.originalHeight
                            })
                        });
                    }
                }
            }
            // Format 2: [batch, outputs, predictions] - outputs are arranged by feature
            else {
                // Number of detections
                const numDetections = outputArray[0][0].length;
                
                for (let i = 0; i < numDetections; i++) {
                    // YOLOv8 outputs normalized coordinates [0-1]
                    const x = outputArray[0][0][i]; // center x
                    const y = outputArray[0][1][i]; // center y
                    const w = outputArray[0][2][i]; // width
                    const h = outputArray[0][3][i]; // height
                    const conf = outputArray[0][4][i]; // confidence
                    
                    // Skip low confidence detections
                    if (conf > this.confidenceThreshold) {
                        // Convert normalized coordinates to pixels
                        // YOLOv8 outputs center coordinates, convert to top-left
                        const boxX = (x - w/2) * imageDims.inputSize;
                        const boxY = (y - h/2) * imageDims.inputSize;
                        const boxWidth = w * imageDims.inputSize;
                        const boxHeight = h * imageDims.inputSize;
                        
                        // Convert from padded image back to original video coordinates
                        const originalX = (boxX - imageDims.leftPadding) / imageDims.scale;
                        const originalY = (boxY - imageDims.topPadding) / imageDims.scale;
                        const originalWidth = boxWidth / imageDims.scale;
                        const originalHeight = boxHeight / imageDims.scale;
                        
                        // Calculate aspect ratio
                        const aspectRatio = originalWidth / originalHeight;
                        
                        // Add to detections
                        detections.push({
                            box: {
                                x: originalX,
                                y: originalY,
                                width: originalWidth,
                                height: originalHeight
                            },
                            confidence: conf,
                            aspectRatio: aspectRatio,
                            alignmentScore: this.calculateAlignmentScore(aspectRatio, originalWidth * originalHeight, {
                                originalWidth: imageDims.originalWidth,
                                originalHeight: imageDims.originalHeight
                            })
                        });
                    }
                }
            }
        } catch (error) {
            console.error("Error processing YOLOv8 output:", error);
        }
        
        // Sort by confidence (highest first)
        return detections.sort((a, b) => b.confidence - a.confidence);
    }
    
    calculateAlignmentScore(aspectRatio, area, imageDims) {
        // Ideal aspect ratio for Ghana Card (85.6mm × 54mm)
        const idealAspectRatio = 1.585;
        const aspectRatioTolerance = 0.2;
        
        // Validate inputs to avoid NaN or infinite values
        if (!aspectRatio || !area || area <= 0 || aspectRatio <= 0) {
            return 0;
        }
        
        // Calculate aspect ratio score (how close to ideal)
        const aspectRatioError = Math.abs(aspectRatio - idealAspectRatio) / idealAspectRatio;
        const aspectRatioScore = Math.max(0, 1 - aspectRatioError / aspectRatioTolerance);
        
        // Calculate area score (card should take up a reasonable portion of the frame)
        const totalArea = imageDims.originalWidth * imageDims.originalHeight;
        const areaRatio = area / totalArea;
        
        let areaScore = 0;
        if (areaRatio > 0.03 && areaRatio < 0.9) {
            // Prefer cards that take up some reasonable portion of the frame
            if (areaRatio > 0.08 && areaRatio < 0.7) {
                areaScore = 1.0;
            } else {
                areaScore = 0.7;
            }
        }
        
        // Combined score (weighted 60% aspect ratio, 40% area)
        return aspectRatioScore * 0.6 + areaScore * 0.4;
    }
    
    drawDetections(detections) {
        if (!detections || detections.length === 0) {
            return;
        }
        
        // Only draw the best detection
        const detection = detections[0];
        const { box, confidence, alignmentScore } = detection;
        
        // Determine color based on alignment score
        let color;
        if (alignmentScore > 0.8) {
            color = 'lime'; // Excellent alignment
        } else if (alignmentScore > 0.5) {
            color = 'yellow'; // Good alignment
        } else {
            color = 'red'; // Poor alignment
        }
        
        // Draw bounding box
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = 4;
        this.ctx.strokeRect(box.x, box.y, box.width, box.height);
        
        // Draw label background
        const text = `Ghana Card: ${Math.round(confidence * 100)}% (Align: ${Math.round(alignmentScore * 100)}%)`;
        this.ctx.font = 'bold 16px Arial';
        const textWidth = this.ctx.measureText(text).width + 10;
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(
            box.x, 
            box.y > 35 ? box.y - 35 : box.y + box.height,
            textWidth,
            30
        );
        
        // Draw label text
        this.ctx.fillStyle = color;
        this.ctx.fillText(
            text,
            box.x + 5,
            box.y > 35 ? box.y - 15 : box.y + box.height + 20
        );
    }
    
    checkForAutoCapture(detections) {
        if (!detections || detections.length === 0) {
            this.consecutiveDetections = 0;
            return;
        }
        
        // Only consider the best detection
        const detection = detections[0];
        
        // Check criteria for auto-capture
        if (detection.confidence > this.confidenceThreshold && detection.alignmentScore > 0.5) {
            this.consecutiveDetections++;
            
            // Show progress in status
            this.setStatus(`Card detected - Holding steady: ${this.consecutiveDetections}/${this.minConsecutiveDetections}`, 'status-active');
            
            // When we have enough consecutive good detections, capture the card
            if (this.consecutiveDetections >= this.minConsecutiveDetections) {
                this.captureCard(detection);
                this.consecutiveDetections = 0;
            }
        } else {
            // Reset counter if detection is not good enough
            this.consecutiveDetections = Math.max(0, this.consecutiveDetections - 1);
            this.setStatus('Auto-capture active: Position card properly in the frame', 'status-active');
        }
    }
    
    manualCapture() {
        const { videoWidth, videoHeight } = this.videoElement;
        
        // Resize captured canvas to match video aspect ratio
        this.capturedCanvas.width = 640;
        this.capturedCanvas.height = Math.round(640 * (videoHeight / videoWidth));
        
        // Draw the current video frame
        this.capturedCtx.drawImage(this.videoElement, 0, 0, this.capturedCanvas.width, this.capturedCanvas.height);
        
        // Enable send button and update status
        this.sendBtn.disabled = false;
        this.cardCaptured = true;
        this.captureStatusElement.textContent = 'Card captured manually';
        this.setStatus('Card captured manually', 'status-success');
    }
    
    captureCard(detection) {
        const { box } = detection;
        
        // Calculate the aspect ratio based on standard Ghana Card dimensions
        const cardAspectRatio = 1.585; // 85.6mm / 54mm
        
        // Adjust the height of the cropped area to match the standard aspect ratio
        let adjustedHeight = box.width / cardAspectRatio;
        let adjustedY = box.y + (box.height - adjustedHeight) / 2;
        
        // Ensure adjusted values are valid
        if (adjustedHeight <= 0) adjustedHeight = box.height;
        if (adjustedY < 0) adjustedY = box.y;
        
        // Add a small margin (5%)
        const margin = 0.05;
        const marginX = box.width * margin;
        const marginY = adjustedHeight * margin;
        
        // Define crop area with margin
        const cropX = Math.max(0, box.x - marginX);
        const cropY = Math.max(0, adjustedY - marginY);
        const cropWidth = Math.min(box.width + 2 * marginX, this.videoElement.videoWidth - cropX);
        const cropHeight = Math.min(adjustedHeight + 2 * marginY, this.videoElement.videoHeight - cropY);
        
        // Ensure valid crop dimensions
        if (cropWidth <= 0 || cropHeight <= 0) {
            console.error("Invalid crop dimensions:", { cropX, cropY, cropWidth, cropHeight });
            return;
        }
        
        // Resize captured canvas to standard dimensions while maintaining aspect ratio
        this.capturedCanvas.width = 640;
        this.capturedCanvas.height = Math.round(640 / cardAspectRatio);
        
        try {
            // Draw the cropped card to the canvas
            this.capturedCtx.drawImage(
                this.videoElement,
                cropX, cropY, cropWidth, cropHeight,
                0, 0, this.capturedCanvas.width, this.capturedCanvas.height
            );
            
            // Enable send button and update status
            this.sendBtn.disabled = false;
            this.cardCaptured = true;
            this.captureStatusElement.textContent = 'Card auto-captured successfully';
            this.setStatus('Ghana Card auto-captured successfully!', 'status-success');
        } catch (error) {
            console.error("Error capturing card:", error);
            this.setStatus(`Error capturing card: ${error.message}`, 'status-error');
        }
    }
    
    sendToBackend() {
        if (!this.cardCaptured) {
            this.setStatus('No card captured yet', 'status-warning');
            return;
        }
        
        this.setStatus('Sending card to backend for verification...', 'status-loading');
        
        // Convert canvas to blob
        this.capturedCanvas.toBlob(blob => {
            // Create form data for the API request
            const formData = new FormData();
            formData.append('card_image', blob, 'ghana_card.jpg');
            
            // Replace with your actual backend API endpoint
            const apiUrl = 'https://backend-api.com/verify';
            
            // Send to backend
            fetch(apiUrl, {
                method: 'POST',
                body: formData
            })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! Status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                // Handle successful response
                this.setStatus(`Verification successful! Card is ${data.valid ? 'valid' : 'invalid'}`, 'status-success');
                this.captureStatusElement.textContent = `Verification result: ${data.valid ? 'Valid' : 'Invalid'} Ghana Card`;
            })
            .catch(error => {
                // Handle errors
                console.error('Error sending to backend:', error);
                this.setStatus(`Error sending to backend: ${error.message}`, 'status-error');
                this.captureStatusElement.textContent = 'Error during verification';
            });
        }, 'image/jpeg', 0.95);
    }
    
    setStatus(message, className = '') {
        if (!this.statusElement) return;
        
        this.statusElement.textContent = message;
        
        // Remove all status classes
        this.statusElement.classList.remove(
            'status-loading', 
            'status-success', 
            'status-error', 
            'status-warning',
            'status-active'
        );
        
        // Add the new class if provided
        if (className) {
            this.statusElement.classList.add(className);
        }
    }
    
    setModelStatus(message) {
        if (!this.modelStatusElement) return;
        this.modelStatusElement.textContent = message;
    }
}

// Initialize the detector when the page loads
document.addEventListener('DOMContentLoaded', () => {
    const detector = new GhanaCardDetector();
});