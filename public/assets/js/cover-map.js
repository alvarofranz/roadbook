'use strict';
/* RBCoverMap — a route drawn over OpenStreetMap raster tiles, composited on a <canvas>. No
 * MapLibre/WebGL: plain tiles, the route line, start/finish dots and, when asked, markers.
 *   · capture(track, opts) → a PNG Blob: the roadbook's fixed cover, generated at save time.
 *   · render(track, opts)  → the canvas itself, for images that draw more on top (the run card,
 *     run-card.js, #785). opts: width, height, pad (a number or {top, right, bottom, left}),
 *     markers [{lat, lon, color}], tiles (false draws the route on a plain dark ground).
 * Tiles are CORS-enabled (Access-Control-Allow-Origin: *), so the canvas stays exportable. */
(function () {
    const TILE = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'; // bare host: CSP-whitelisted (img-src)

    // Web-Mercator world fraction [0..1] of a coordinate (the tiles' projection).
    const project = (lat, lon) => { const s = Math.sin(lat * Math.PI / 180); return [(lon + 180) / 360, 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)]; };
    const loadImg = (url) => new Promise((res) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = () => res(null); im.src = url; });

    // Resolves the canvas, or null for a missing / degenerate (single-spot) track, or when tiles
    // were asked for and none loaded (a tile outage must not bake a black image).
    async function render(track, opts) {
        opts = opts || {};
        const W = opts.width || 1200, H = opts.height || 750;
        const p = typeof opts.pad === 'object' ? opts.pad : { top: opts.pad || 64, right: opts.pad || 64, bottom: opts.pad || 64, left: opts.pad || 64 };
        if (!Array.isArray(track) || track.length < 2) return null;
        const N = track.map((pt) => project(+pt.lat, +pt.lon));
        const xs = N.map((pt) => pt[0]), ys = N.map((pt) => pt[1]);
        const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
        const fx = maxX - minX, fy = maxY - minY;
        if (fx < 1e-9 && fy < 1e-9) return null; // degenerate: every point on the same spot
        const boxW = W - p.left - p.right, boxH = H - p.top - p.bottom;
        const worldFit = Math.min(boxW / (fx || 1e-9), boxH / (fy || 1e-9));
        // tiles come in whole zoom levels; the leftover fraction scales them up, so the route fills
        // its box instead of landing anywhere between half of it and all of it
        const zoom = Math.max(1, Math.min(16, Math.log2(worldFit / 256)));
        const z = Math.floor(zoom), n = Math.pow(2, z), tile = 256 * Math.pow(2, zoom - z), world = tile * n;
        // the route's centre sits at the centre of the padded box
        const tlx = (minX + maxX) / 2 * world - (p.left + boxW / 2), tly = (minY + maxY) / 2 * world - (p.top + boxH / 2);

        const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#10151c'; ctx.fillRect(0, 0, W, H);

        if (opts.tiles !== false) {
            const jobs = [];
            let painted = 0; // tiles that actually loaded — with none, the canvas would stay black
            for (let tx = Math.floor(tlx / tile); tx * tile < tlx + W; tx++) {
                for (let ty = Math.floor(tly / tile); ty * tile < tly + H; ty++) {
                    if (ty < 0 || ty >= n) continue;
                    const url = TILE.replace('{z}', z).replace('{x}', ((tx % n) + n) % n).replace('{y}', ty);
                    const dx = tx * tile - tlx, dy = ty * tile - tly;
                    jobs.push(loadImg(url).then((im) => { if (im) { painted++; ctx.drawImage(im, dx, dy, tile + 0.5, tile + 0.5); } }));
                }
            }
            await Promise.all(jobs);
            if (!painted) return null;
        }

        const at = (lat, lon) => { const q = project(+lat, +lon); return [q[0] * world - tlx, q[1] * world - tly]; };
        const pts = track.map((pt) => at(pt.lat, pt.lon));
        const stroke = (color, width) => {
            ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
            ctx.lineJoin = ctx.lineCap = 'round'; ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
        };
        stroke('rgba(13,18,26,0.55)', 11); // dark glow under the route for contrast on busy tiles
        stroke('#ff5a45', 6); // RDBK track red
        const dot = (pt, color, r) => { ctx.beginPath(); ctx.arc(pt[0], pt[1], r, 0, 2 * Math.PI); ctx.fillStyle = color; ctx.fill(); ctx.lineWidth = 3.5; ctx.strokeStyle = '#0d121a'; ctx.stroke(); };
        (opts.markers || []).forEach((m) => dot(at(m.lat, m.lon), m.color, 7));
        dot(pts[0], '#3ddc84', 9); dot(pts[pts.length - 1], '#ff5a45', 9); // start / finish

        if (opts.tiles !== false) {
            ctx.font = '600 16px system-ui, sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
            ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.strokeText('© OpenStreetMap', W - 10, 10);
            ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillText('© OpenStreetMap', W - 10, 10);
        }
        return canvas;
    }

    async function capture(track, opts) {
        const canvas = await render(track, opts);
        if (!canvas) return null;
        try { return await new Promise((res) => canvas.toBlob((b) => res(b), 'image/png')); }
        catch (e) { return null; } // a tainted canvas would throw — shouldn't happen with CORS tiles
    }

    window.RBCoverMap = { capture, render };
})();
