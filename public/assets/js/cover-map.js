'use strict';
/* RBCoverMap — a roadbook's cover image: the route polyline drawn over CyclOSM raster tiles,
 * composited on a <canvas> and returned as a PNG Blob. No MapLibre/WebGL and no waypoint markers
 * (just the route over the map). Generated at save time and stored as the roadbook's fixed cover.
 * Tiles are CORS-enabled (Access-Control-Allow-Origin: *), so the canvas stays exportable. */
(function () {
    const TILE = 'https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png'; // same source as the app maps

    // Web-Mercator world fraction [0..1] of a coordinate (the tiles' projection).
    const project = (lat, lon) => { const s = Math.sin(lat * Math.PI / 180); return [(lon + 180) / 360, 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)]; };
    const loadImg = (url) => new Promise((res) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = () => res(null); im.src = url; });

    // Render the route of `track` (array of {lat,lon}) as a PNG Blob sized W×H, framed over CyclOSM
    // tiles. Resolves null for a missing / degenerate (single-spot) track or if export is blocked.
    async function capture(track, opts) {
        opts = opts || {};
        const W = opts.width || 1200, H = opts.height || 750, pad = opts.pad || 64;
        if (!Array.isArray(track) || track.length < 2) return null;
        const N = track.map((p) => project(+p.lat, +p.lon));
        const xs = N.map((p) => p[0]), ys = N.map((p) => p[1]);
        const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
        const fx = maxX - minX, fy = maxY - minY;
        if (fx < 1e-9 && fy < 1e-9) return null; // degenerate: every point on the same spot
        const worldFit = Math.min((W - 2 * pad) / (fx || 1e-9), (H - 2 * pad) / (fy || 1e-9));
        const z = Math.max(1, Math.min(16, Math.floor(Math.log2(worldFit / 256))));
        const world = 256 * Math.pow(2, z), n = Math.pow(2, z);
        const S = N.map((p) => [p[0] * world, p[1] * world]);
        const cx = (minX + maxX) / 2 * world, cy = (minY + maxY) / 2 * world;
        const tlx = cx - W / 2, tly = cy - H / 2; // canvas top-left in world pixels

        const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#10151c'; ctx.fillRect(0, 0, W, H);

        const jobs = [];
        for (let tx = Math.floor(tlx / 256); tx * 256 < tlx + W; tx++) {
            for (let ty = Math.floor(tly / 256); ty * 256 < tly + H; ty++) {
                if (ty < 0 || ty >= n) continue;
                const url = TILE.replace('{s}', 'abc'[Math.abs(tx + ty) % 3]).replace('{z}', z).replace('{x}', ((tx % n) + n) % n).replace('{y}', ty);
                const dx = tx * 256 - tlx, dy = ty * 256 - tly;
                jobs.push(loadImg(url).then((im) => { if (im) ctx.drawImage(im, dx, dy, 256, 256); }));
            }
        }
        await Promise.all(jobs);

        const pts = S.map((p) => [p[0] - tlx, p[1] - tly]);
        const stroke = (color, width) => {
            ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
            ctx.lineJoin = ctx.lineCap = 'round'; ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
        };
        stroke('rgba(13,18,26,0.55)', 11); // dark glow under the route for contrast on busy tiles
        stroke('#ff5a45', 6); // RDBK track red
        const dot = (p, color) => { ctx.beginPath(); ctx.arc(p[0], p[1], 9, 0, 2 * Math.PI); ctx.fillStyle = color; ctx.fill(); ctx.lineWidth = 3.5; ctx.strokeStyle = '#0d121a'; ctx.stroke(); };
        dot(pts[0], '#3ddc84'); dot(pts[pts.length - 1], '#ff5a45'); // start / finish

        ctx.font = '600 16px system-ui, sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.strokeText('© OpenStreetMap, CyclOSM', W - 10, H - 8);
        ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillText('© OpenStreetMap, CyclOSM', W - 10, H - 8);

        try { return await new Promise((res) => canvas.toBlob((b) => res(b), 'image/png')); }
        catch (e) { return null; } // a tainted canvas would throw — shouldn't happen with CORS tiles
    }

    window.RBCoverMap = { capture };
})();
