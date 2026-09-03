import { describe, it, expect, beforeAll } from 'vitest';
import qrcode from '../public/assets/js/qrcode.min.js';
import RBQr from '../public/assets/js/rb-qr.js';

/* The QR renderer (#392). The Reader's result QR stopped being the vendor library's GIF and
   became a canvas we paint ourselves, so that the file we save and share is a real PNG. The
   risk in that swap is silent and expensive — a QR that no longer carries the run — so what
   is pinned here is that the pixels still ARE the library's matrix: same modules, whole
   cells, and a quiet zone around them, which is what a scanner needs to find the symbol. */

// A canvas that records what was painted instead of painting it.
function recordingCanvas(size) {
    const rects = [];
    const ctx = { fillStyle: '', fillRect(x, y, w, h) { rects.push({ x, y, w, h, fill: this.fillStyle }); } };
    return { width: size, height: size, getContext: () => ctx, rects };
}

const PAYLOAD = '12302092618343919025504450000000001260240001663reader-09c655d990'; // a signed result META

beforeAll(() => { globalThis.qrcode = qrcode; }); // the module reads the vendor global at call time

describe('RBQr.draw', () => {
    it('paints a white ground, then one black square per dark module', () => {
        const canvas = recordingCanvas(512);
        RBQr.draw(canvas, PAYLOAD);

        const [ground, ...cells] = canvas.rects;
        expect(ground).toEqual({ x: 0, y: 0, w: 512, h: 512, fill: '#ffffff' });
        expect(cells.every((r) => r.fill === '#000000')).toBe(true);

        const qr = qrcode(0, 'M'); qr.addData(PAYLOAD); qr.make();
        const modules = qr.getModuleCount();
        let dark = 0;
        for (let row = 0; row < modules; row++) for (let col = 0; col < modules; col++) if (qr.isDark(row, col)) dark++;
        expect(cells.length).toBe(dark);
    });

    it('each square sits exactly on its module of the grid', () => {
        const canvas = recordingCanvas(512);
        RBQr.draw(canvas, PAYLOAD);
        const cells = canvas.rects.slice(1);

        const qr = qrcode(0, 'M'); qr.addData(PAYLOAD); qr.make();
        const modules = qr.getModuleCount();
        const cell = cells[0].w;
        const offset = Math.min(...cells.map((r) => r.x), ...cells.map((r) => r.y));

        for (const r of cells) {
            expect(r.w).toBe(cell);           // whole, identical cells: no half-lit module
            expect(r.h).toBe(cell);
            const col = (r.x - offset) / cell, row = (r.y - offset) / cell;
            expect(Number.isInteger(col) && Number.isInteger(row)).toBe(true);
            expect(qr.isDark(row, col)).toBe(true);
        }
        expect(cell).toBe(Math.floor(512 / (modules + RBQr.QUIET_MODULES * 2)));
    });

    it('leaves a quiet zone all around, inside the canvas', () => {
        const canvas = recordingCanvas(512);
        RBQr.draw(canvas, PAYLOAD);
        const cells = canvas.rects.slice(1);
        const cell = cells[0].w;
        const left = Math.min(...cells.map((r) => r.x)), top = Math.min(...cells.map((r) => r.y));
        const right = Math.max(...cells.map((r) => r.x + r.w)), bottom = Math.max(...cells.map((r) => r.y + r.h));

        expect(left).toBeGreaterThanOrEqual(cell * RBQr.QUIET_MODULES);
        expect(top).toBeGreaterThanOrEqual(cell * RBQr.QUIET_MODULES);
        expect(512 - right).toBeGreaterThanOrEqual(cell * RBQr.QUIET_MODULES);
        expect(512 - bottom).toBeGreaterThanOrEqual(cell * RBQr.QUIET_MODULES);
    });

    it('scales to whatever canvas it is given (the event pages use small ones)', () => {
        for (const size of [140, 180, 512]) {
            const canvas = recordingCanvas(size);
            RBQr.draw(canvas, 'AFCD8402'); // an event activation code
            const cells = canvas.rects.slice(1);
            expect(cells.length).toBeGreaterThan(0);
            expect(Math.max(...cells.map((r) => r.x + r.w))).toBeLessThanOrEqual(size);
            expect(Math.max(...cells.map((r) => r.y + r.h))).toBeLessThanOrEqual(size);
        }
    });
});
