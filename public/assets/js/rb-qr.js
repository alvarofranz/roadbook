'use strict';
/* RBQr — every QR code in the product, drawn as pixels we control (#392).
 *
 * The vendor library (qrcode.min.js) computes the module matrix, but the only image it can
 * emit is a GIF data URI. A GIF handed to the OS under a .png name is exactly what broke
 * saving and sharing the Reader's result QR from the app: MediaStore and the share sheet
 * both check that the name, the declared type and the bytes agree. So the matrix is painted
 * onto a canvas here and PNG is the only image format that ever leaves this module.
 *
 * It is also the one place a QR is rendered: the signed run result and the event activation
 * code used to carry their own copy of the same drawing loop.
 *
 * The vendor global (`qrcode`) is read at call time, not at load, so this module can be
 * imported into the unit tests with a stub in place. */
(function () {
    // The white margin each side, in modules. Scanners need a quiet zone to find the
    // symbol at all; the spec asks for 4, and 2 is the practical floor on a phone screen.
    const QUIET_MODULES = 2;

    // Paint `payload` into `canvas` — a real one, or anything exposing width/height and a
    // 2D context. Module size is floored to whole pixels: a half-lit cell is a cell a
    // scanner may read either way, and this QR is a competition result.
    function draw(canvas, payload) {
        const qr = globalThis.qrcode(0, 'M');
        qr.addData(payload);
        qr.make();
        const modules = qr.getModuleCount();
        const width = canvas.width, height = canvas.height;
        const cell = Math.max(1, Math.floor(width / (modules + QUIET_MODULES * 2)));
        const offset = Math.floor((width - cell * modules) / 2); // centre the matrix in its quiet zone
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = '#000000';
        for (let row = 0; row < modules; row++) {
            for (let col = 0; col < modules; col++) {
                if (qr.isDark(row, col)) ctx.fillRect(offset + col * cell, offset + row * cell, cell, cell);
            }
        }
    }

    // The same QR as a PNG data: URI — what the Reader shows, downloads and shares. Big
    // enough (512 px) that the saved file survives being printed or re-photographed.
    function dataURL(payload, size) {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size || 512;
        draw(canvas, payload);
        return canvas.toDataURL('image/png');
    }

    const RBQr = { draw, dataURL, QUIET_MODULES };
    if (typeof window !== 'undefined') window.RBQr = RBQr;
    if (typeof module !== 'undefined' && module.exports) module.exports = RBQr;
})();
