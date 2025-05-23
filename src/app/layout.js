export const metadata = {
  title: "Ghana Card Scanner",
  description: "Auto-capture Ghana Card using TensorFlow.js and TFLite",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Ghana Card Scanner"
  },
  formatDetection: {
    telephone: false
  },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "default",
    "msapplication-TileColor": "#245C94",
    "msapplication-tap-highlight": "no"
  }
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#245C94'
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        {/* Preconnect to CDN for faster loading */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://cdn.jsdelivr.net" />
        
        {/* Mobile optimization meta tags */}
        <meta name="format-detection" content="telephone=no" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Ghana Card Scanner" />
        <meta name="msapplication-TileColor" content="#245C94" />
        <meta name="msapplication-tap-highlight" content="no" />
        
        {/* React Scan for development only */}
        {process.env.NODE_ENV === 'development' && (
          <script
            crossOrigin="anonymous"
            src="//unpkg.com/react-scan/dist/auto.global.js"
          />
        )}
        
        {/* TensorFlow.js - Direct loading for reliability */}
        <script 
          src="https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.2.0/dist/tf.min.js" 
          crossOrigin="anonymous"
        ></script>
        <script 
          src="https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-tflite@0.0.1-alpha.9/dist/tf-tflite.min.js" 
          crossOrigin="anonymous"
        ></script>
        
        {/* TensorFlow initialization script */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // TensorFlow initialization after scripts load
              window.addEventListener('load', function() {
                if (typeof tf !== 'undefined' && typeof tflite !== 'undefined') {
                  console.log('[Layout] TensorFlow.js and TFLite loaded successfully');
                  
                  // Configure TensorFlow for optimal performance
                  tf.ready().then(() => {
                    console.log('[Layout] TensorFlow is ready');
                    
                    // Set backend based on device
                    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
                    
                    tf.setBackend('webgl').then(() => {
                      console.log('[Layout] WebGL backend set');
                    }).catch(() => {
                      console.log('[Layout] WebGL not available, using CPU backend');
                      tf.setBackend('cpu');
                    });
                    
                    // Dispatch ready event
                    window.dispatchEvent(new CustomEvent('tensorflow-ready', {
                      detail: { isMobile: isMobile }
                    }));
                  }).catch(error => {
                    console.error('[Layout] TensorFlow initialization failed:', error);
                    window.dispatchEvent(new CustomEvent('tensorflow-error', {
                      detail: { error: error }
                    }));
                  });
                } else {
                  console.error('[Layout] TensorFlow.js or TFLite failed to load');
                  window.dispatchEvent(new CustomEvent('tensorflow-error', {
                    detail: { error: 'Scripts failed to load' }
                  }));
                }
              });
            `
          }}
        />
        
        {/* Favicon */}
        <link rel="icon" href="/favicon.ico" />
        
        {/* Preload model for faster loading */}
        <link rel="preload" href="/model/autocapture.tflite" as="fetch" crossOrigin="anonymous" />
        
        {/* Critical CSS for faster initial render */}
        <style
          dangerouslySetInnerHTML={{
            __html: `
              /* Critical CSS for faster initial render */
              body {
                margin: 0;
                padding: 0;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
                background-color: #f8f9fa;
                color: #333;
                -webkit-font-smoothing: antialiased;
                -moz-osx-font-smoothing: grayscale;
                overflow-x: hidden;
              }
              
              /* Prevent flash of unstyled content */
              .min-h-screen {
                min-height: 100vh;
                display: flex;
                flex-direction: column;
              }
              
              /* Loading skeleton for better perceived performance */
              .loading-skeleton {
                background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
                background-size: 200% 100%;
                animation: loading-shimmer 1.5s infinite;
              }
              
              @keyframes loading-shimmer {
                0% { background-position: -200% 0; }
                100% { background-position: 200% 0; }
              }
              
              /* Prevent zoom on mobile inputs */
              input, select, textarea {
                font-size: 16px;
              }
              
              /* Touch action optimization */
              * {
                touch-action: manipulation;
              }
              
              /* Smooth scrolling */
              html {
                scroll-behavior: smooth;
              }
              
              /* Focus visible for keyboard navigation */
              :focus-visible {
                outline: 2px solid #245C94;
                outline-offset: 2px;
              }
            `
          }}
        />
      </head>
      <body>
        {children}
        
        {/* Error handling and performance monitoring */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // Global error handling
              window.addEventListener('error', function(event) {
                console.error('[Layout] Global error:', event.error);
                
                // Send error to parent window if in iframe
                if (window.parent && window.parent !== window) {
                  window.parent.postMessage({
                    type: 'GHANA_CARD_SCANNER_ERROR',
                    data: {
                      message: event.error?.message || 'Unknown error',
                      filename: event.filename,
                      lineno: event.lineno,
                      colno: event.colno
                    }
                  }, '*');
                }
              });
              
              // Unhandled promise rejection handling
              window.addEventListener('unhandledrejection', function(event) {
                console.error('[Layout] Unhandled promise rejection:', event.reason);
                
                if (window.parent && window.parent !== window) {
                  window.parent.postMessage({
                    type: 'GHANA_CARD_SCANNER_ERROR',
                    data: {
                      message: event.reason?.message || 'Promise rejection',
                      type: 'unhandledrejection'
                    }
                  }, '*');
                }
              });
              
              // Performance monitoring
              window.addEventListener('load', function() {
                console.log('[Layout] Page fully loaded');
                
                // Log memory usage if available
                if (performance.memory) {
                  console.log('[Layout] Memory usage:', {
                    used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024) + 'MB',
                    total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024) + 'MB',
                    limit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024) + 'MB'
                  });
                }
                
                // Network information for adaptive behavior
                if ('connection' in navigator) {
                  const connection = navigator.connection;
                  console.log('[Layout] Network:', {
                    effectiveType: connection.effectiveType,
                    downlink: connection.downlink,
                    saveData: connection.saveData
                  });
                  
                  // Dispatch network info event
                  window.dispatchEvent(new CustomEvent('network-info', {
                    detail: {
                      effectiveType: connection.effectiveType,
                      downlink: connection.downlink,
                      saveData: connection.saveData,
                      isSlowConnection: connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g'
                    }
                  }));
                }
              });
            `
          }}
        />
      </body>
    </html>
  );
}