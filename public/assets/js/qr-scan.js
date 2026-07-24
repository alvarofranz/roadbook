'use strict';
/* Cross-browser QR camera decoding (#352): the native BarcodeDetector API (used to scan
 * participant activation codes and result QRs) is unimplemented on WebKit — Safari and, since
 * it shares the engine, every iOS/iPadOS browser and the native app's WKWebView — so a scanner
 * built on it alone silently reports "unsupported" there and never even opens the camera. jsQR
 * is loaded lazily from a CDN (already CSP-whitelisted for transformers.js) only when that
 * fallback path is actually needed. */
(function () {
    let detector = null;
    if ('BarcodeDetector' in window) { try { detector = new BarcodeDetector({ formats: ['qr_code'] }); } catch (e) {} }

    let jsQRPromise = null;
    function loadJsQR() {
        if (window.jsQR) return Promise.resolve(window.jsQR);
        if (!jsQRPromise) jsQRPromise = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
            s.onload = () => resolve(window.jsQR);
            s.onerror = reject;
            document.head.appendChild(s);
        });
        return jsQRPromise;
    }

    let canvas = null, ctx = null;
    function decodeFrame(jsQR, video) {
        if (!video.videoWidth) return null;
        canvas = canvas || document.createElement('canvas');
        ctx = ctx || canvas.getContext('2d', { willReadFrequently: true });
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(img.data, img.width, img.height);
        return code ? code.data : null;
    }

    window.RBQrScan = {
        // Always true: either the native detector or the jsQR fallback covers every browser.
        supported: true,
        async detect(video) {
            if (detector) {
                try {
                    const codes = await detector.detect(video);
                    return codes.length ? codes[0].rawValue : null;
                } catch (e) { return null; }
            }
            const jsQR = await loadJsQR();
            return decodeFrame(jsQR, video);
        },
    };
})();
