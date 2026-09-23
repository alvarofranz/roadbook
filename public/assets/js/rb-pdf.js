'use strict';
/* rb-pdf.js (window.RBPdf) — client-side A4 PDF export of a roadbook, generated
 * entirely on the device (no server). jsPDF is vendored and lazy-loaded on first
 * use. Text, the page frame, the row grid, the cover's route and the header QR are
 * crisp vectors; each note's tulip (an SVG from NoteCanvas.toSVG) is rasterised at
 * high DPI on white and placed as an image — the only faithful way to carry the SVG
 * traffic-sign icons and arrowhead markers across.
 *
 * Layout (the printer binds the top + left edges):
 *   Cover: title · description · the route drawn as a line, over the roadbook's image as a faint
 *   backdrop · distance / notes / date · author and organization — nothing else (#784 · #810).
 *   Content: A4 · 20 mm top · 30 mm left · the same header on every page (QR to the digital
 *   copy · title · page) · 6 note rows. No footer, nothing after the last note (#810). */
(function () {
    // jsPDF lives next to this file; load it from our own directory, on demand.
    const SELF_SRC = (document.currentScript && document.currentScript.src) || '';
    const ASSETS_DIR = SELF_SRC.replace(/[^/]*$/, '');
    let jspdfPromise = null;
    function ensureJsPDF() {
        if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve();
        if (jspdfPromise) return jspdfPromise;
        jspdfPromise = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = ASSETS_DIR + 'jspdf.umd.min.js?v=3.0.1'; // bump when re-vendoring (cache-busts the pinned lib)
            s.onload = resolve;
            s.onerror = () => { jspdfPromise = null; reject(new Error('Could not load the PDF library.')); };
            document.head.appendChild(s);
        });
        return jspdfPromise;
    }

    // The QR (RBQr over the vendored qrcode.min.js), loaded on demand like jsPDF: the pages that
    // export a PDF do not otherwise carry it.
    const loadScript = (src) => new Promise((resolve, reject) => {
        const s = document.createElement('script'); s.src = src; s.onload = resolve;
        s.onerror = () => reject(new Error('Could not load the QR library.'));
        document.head.appendChild(s);
    });
    async function ensureQr() {
        if (!window.qrcode) await loadScript(ASSETS_DIR + 'qrcode.min.js');
        if (!window.RBQr) await loadScript(ASSETS_DIR + 'rb-qr.js');
    }

    /* ---------- assets: icons → data URIs, tulip SVG → PNG ---------- */
    const loadImage = (src) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
    // Every used icon resolved to a data: URI WITHOUT mutating the roadbook — an
    // SVG loaded as an <image> only renders inline data, never external URLs.
    async function resolveIcons(rb, basePath) {
        const map = {}, used = new Set();
        rb.notes.forEach((n) => (n.icons || []).forEach((ic) => used.add(ic.name)));
        for (const name of used) {
            if (!name) continue;
            const src = RB.iconSrc({ name }, rb, basePath);
            map[name] = /^data:/.test(src) ? src : (await RB.urlToDataURL(src) || src);
        }
        return map;
    }
    // Tulip SVG → white-background PNG data URI at `scale`× the 230×162 box (≈380 dpi at 3×).
    async function svgToPng(svgStr, scale) {
        const w = 230 * scale, h = 162 * scale;
        const sized = svgStr.replace('<svg ', `<svg width="${w}" height="${h}" `);
        const url = URL.createObjectURL(new Blob([sized], { type: 'image/svg+xml' }));
        try {
            const img = await loadImage(url);
            const c = document.createElement('canvas'); c.width = w; c.height = h;
            const ctx = c.getContext('2d');
            ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
            ctx.drawImage(img, 0, 0, w, h);
            return c.toDataURL('image/png');
        } finally { URL.revokeObjectURL(url); }
    }

    /* ---------- page geometry (mm) ---------- */
    const PW = 210, PH = 297, LEFT = 30, TOP = 20, RIGHT = 12, BOTTOM = 12;
    const CW = PW - LEFT - RIGHT;   // content width 168
    const CB = PH - BOTTOM;         // content bottom 285
    const HEADER_H = 18;            // the running header, identical on every content page
    const ROWS = 6;                 // sheet rows per content page
    const km = (m) => ((m || 0) / 1000).toFixed(2);

    // Draw centred text, shrinking the font size so a long title never runs past maxW (mm).
    function centeredFit(doc, text, cx, y, size, maxW) {
        let s = size;
        doc.setFontSize(s);
        while (s > 6 && doc.getTextWidth(text) > maxW) { s -= 0.5; doc.setFontSize(s); }
        doc.text(text, cx, y, { align: 'center' });
    }

    function fmtDate(d) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    // The cover (#784): the roadbook as a whole, calm and centred on a symmetric page — no
    // bind margin here, it is never punched. The route is the roadbook's own line, drawn as a
    // vector (equirectangular, lon scaled by cos(lat) so the shape is not stretched); a roadbook
    // that hides its map (map_access:false) keeps its route to itself.
    // The roadbook's image as the route box's backdrop (#810): cover-fitted, clipped to the
    // rounded box and washed out under a strong paper-coloured veil, so it only tints the page.
    function drawBackdrop(doc, image, x, y, w, h) {
        try {
            const p = doc.getImageProperties(image), scale = Math.max(w / p.width, h / p.height);
            const iw = p.width * scale, ih = p.height * scale;
            doc.saveGraphicsState();
            doc.roundedRect(x, y, w, h, 4, 4, null); doc.clip(); doc.discardPath();
            doc.addImage(image, p.fileType || 'PNG', x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
            doc.setGState(new doc.GState({ opacity: 0.86 }));
            doc.setFillColor(246, 244, 239); doc.rect(x, y, w, h, 'F');
            doc.restoreGraphicsState();
        } catch (e) { /* unreadable image — the plain box stays */ }
    }
    const COVER_MARGIN = 20, COVER_W = PW - 2 * COVER_MARGIN;
    function drawRoute(doc, track, x, y, w, h, backdrop) {
        let pts = track;
        if (pts.length > 1500) { const step = Math.ceil(pts.length / 1500); pts = track.filter((_, i) => i % step === 0 || i === track.length - 1); }
        const k = Math.cos((pts.reduce((sum, p) => sum + (+p.lat), 0) / pts.length) * Math.PI / 180) || 1;
        const X = pts.map((p) => (+p.lon) * k), Y = pts.map((p) => -(+p.lat));
        const minX = Math.min(...X), maxX = Math.max(...X), minY = Math.min(...Y), maxY = Math.max(...Y);
        const pad = 9, spanX = (maxX - minX) || 1e-9, spanY = (maxY - minY) || 1e-9;
        const scale = Math.min((w - 2 * pad) / spanX, (h - 2 * pad) / spanY);
        const offX = x + (w - spanX * scale) / 2, offY = y + (h - spanY * scale) / 2;
        const at = (i) => [offX + (X[i] - minX) * scale, offY + (Y[i] - minY) * scale];
        doc.setFillColor(246, 244, 239); doc.roundedRect(x, y, w, h, 4, 4, 'F');
        if (backdrop) drawBackdrop(doc, backdrop, x, y, w, h);
        doc.setDrawColor(201, 128, 28); doc.setLineWidth(0.9); doc.setLineCap('round'); doc.setLineJoin('round');
        const segs = []; for (let i = 1; i < pts.length; i++) { const [ax, ay] = at(i - 1), [bx, by] = at(i); segs.push([bx - ax, by - ay]); }
        const [sx, sy] = at(0); doc.lines(segs, sx, sy, [1, 1], 'S', false);
        const [ex, ey] = at(pts.length - 1);
        doc.setFillColor(34, 160, 90); doc.circle(sx, sy, 1.6, 'F');   // start
        doc.setFillColor(20, 20, 20); doc.circle(ex, ey, 1.6, 'F');    // finish
    }
    function drawCover(doc, rb, logo, when) {
        const meta = rb.meta || {}, cx = PW / 2;
        const title = meta.title || 'Roadbook';
        let y = 30;
        doc.setFont('helvetica', 'bold'); doc.setTextColor(20); doc.setFontSize(26);
        const titleLines = doc.splitTextToSize(title, COVER_W).slice(0, 2);
        doc.text(titleLines, cx, y + 8, { align: 'center' }); y += 8 + titleLines.length * 10;
        if (meta.description) {
            doc.setFont('helvetica', 'italic'); doc.setFontSize(11); doc.setTextColor(95);
            const lines = doc.splitTextToSize(String(meta.description), COVER_W - 20).slice(0, 3);
            doc.text(lines, cx, y + 2, { align: 'center' }); y += lines.length * 5 + 4;
        }
        const track = rb.track || [];
        if (meta.map_access !== false && track.length >= 2) {
            const boxTop = Math.max(y + 6, 92);
            drawRoute(doc, track, COVER_MARGIN, boxTop, COVER_W, 118, logo);
            y = boxTop + 118;
        }
        // the three figures, as columns: distance · notes · date
        const total = meta.total_distance || ((rb.notes || [])[rb.notes.length - 1] || {}).distance || 0;
        const stats = [[RBt('Distance'), km(total) + ' km'], [RBt('Notes'), String((rb.notes || []).length)], [RBt('Date'), meta.modified || fmtDate(when)]];
        const sy = Math.max(y + 16, 236), colW = COVER_W / stats.length;
        stats.forEach(([label, value], i) => {
            const colX = COVER_MARGIN + colW * i + colW / 2;
            doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(120);
            doc.text(label.toUpperCase(), colX, sy, { align: 'center', charSpace: 0.6 });
            doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(20);
            doc.text(value, colX, sy + 9, { align: 'center' });
            if (i) { doc.setDrawColor(215); doc.setLineWidth(0.3); doc.line(COVER_MARGIN + colW * i, sy - 4, COVER_MARGIN + colW * i, sy + 11); }
        });
        const credit = [meta.author, meta.organization].filter(Boolean).join(' · ');
        if (credit) { doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(95); doc.text(credit, cx, sy + 26, { align: 'center' }); }
    }

    /* ---------- pagination (pure, unit-tested) ---------- */
    // Which sheet rows go on which content page: ROWS at a time, every page alike.
    function paginate(count) {
        const pages = [];
        for (let from = 0; from < count; from += ROWS) pages.push({ from, to: Math.min(count, from + ROWS) });
        return pages;
    }

    function buildDoc(jsPDF, rb, tulips, logo, link) {
        const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
        const when = new Date(); // one instant for the whole document
        const notes = rb.notes;
        const title = (rb.meta && rb.meta.title) || 'Roadbook';

        // The header every content page shares (#810): the QR to the roadbook's digital copy
        // top-left (inside the bind margin's reach), the title, the page count. No rule under it —
        // the sheet's own border closes it.
        const QR_SIZE = 16;
        const qr = link ? RBQr.matrix(link) : null;
        function header(pageNum) {
            if (qr) {
                const cell = QR_SIZE / qr.modules, qy = TOP - 3;
                doc.setFillColor(20, 20, 20);
                for (let r = 0; r < qr.modules; r++) for (let c = 0; c < qr.modules; c++) if (qr.isDark(r, c)) doc.rect(LEFT + c * cell, qy + r * cell, cell + 0.02, cell + 0.02, 'F');
            }
            doc.setFont('helvetica', 'bold'); doc.setTextColor(20);
            centeredFit(doc, title, PW / 2, TOP + 6, 13, CW - 2 * (QR_SIZE + 6));
            doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(60);
            doc.text(`${RBt('Page')} ${pageNum} ${RBt('of')} ${totalPages}`, PW - RIGHT, TOP + 6, { align: 'right' });
        }

        // A piece of the material a note carries (#542): a picture fills the diagram column
        // beside its caption, a text block runs across the whole width.
        function drawBlock(b, x, y, h) {
            const colDist = 26, colVig = 46, colText = CW - colDist - colVig, pad = 2;
            doc.setDrawColor(20); doc.setLineWidth(0.3); doc.rect(x, y, CW, h);
            if (b.image) {
                doc.line(x + colDist, y, x + colDist, y + h);
                doc.line(x + colDist + colVig, y, x + colDist + colVig, y + h);
                const aw = colVig - 2 * pad, ah = h - 2 * pad, ar = 230 / 162;
                let iw = aw, ih = iw / ar; if (ih > ah) { ih = ah; iw = ih * ar; }
                try { doc.addImage(b.image, x + colDist + (colVig - iw) / 2, y + (h - ih) / 2, iw, ih); } catch (e) {} // an unreadable picture must not kill the export
                const tx = x + colDist + colVig, tcx = tx + colText / 2;
                doc.setTextColor(20); doc.setFont('helvetica', 'italic'); doc.setFontSize(10);
                const lines = doc.splitTextToSize(String(b.text || ''), colText - 2 * pad);
                const block = Math.min(lines.length, 4) * 4.4;
                doc.text(lines.slice(0, 4), tcx, y + (h - 9) / 2 - block / 2 + 4, { align: 'center', baseline: 'middle' });
                return;
            }
            doc.setTextColor(60); doc.setFont('helvetica', 'italic'); doc.setFontSize(11);
            const lines = doc.splitTextToSize(String(b.text || ''), CW - 2 * pad);
            const block = Math.min(lines.length, 5) * 4.8;
            doc.text(lines.slice(0, 5), x + CW / 2, y + h / 2 - block / 2 + 4, { align: 'center', baseline: 'middle' });
        }

        function drawRow(n, tulip, close, x, y, h) {
            const colDist = 26, colVig = 46, colText = CW - colDist - colVig, pad = 2;
            // close-to-next notes get the light-blue distance cell (mirrors the Reader)
            if (close) { doc.setFillColor(191, 227, 255); doc.rect(x, y, colDist, h, 'F'); }
            doc.setDrawColor(20); doc.setLineWidth(0.3);
            doc.rect(x, y, CW, h);
            doc.line(x + colDist, y, x + colDist, y + h);
            doc.line(x + colDist + colVig, y, x + colDist + colVig, y + h);
            // distance cell: big total · small partial · boxed number
            doc.setTextColor(20); doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
            doc.text(km(n.distance), x + pad, y + 8);
            doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
            doc.text(km(n.partial_distance), x + pad, y + h - pad);
            doc.setDrawColor(80); doc.setLineWidth(0.3); doc.rect(x + colDist - 11, y + h - 8, 9, 6);
            doc.setFont('helvetica', 'bold'); doc.text(String(n.num), x + colDist - 6.5, y + h - 3.6, { align: 'center' });
            // tulip, fitted and centred in its cell
            if (tulip) {
                const aw = colVig - 2 * pad, ah = h - 2 * pad, ar = 230 / 162;
                let iw = aw, ih = iw / ar; if (ih > ah) { ih = ah; iw = ih * ar; }
                doc.addImage(tulip, 'PNG', x + colDist + (colVig - iw) / 2, y + (h - ih) / 2, iw, ih);
            }
            // text cell: comment centred above a baseline of bearing + coordinates
            const tx = x + colDist + colVig, tcx = tx + colText / 2;
            doc.setTextColor(20); doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
            const lines = doc.splitTextToSize(String(n.text || ''), colText - 2 * pad);
            const block = Math.min(lines.length, 4) * 4.4;
            doc.text(lines.slice(0, 4), tcx, y + (h - 9) / 2 - block / 2 + 4, { align: 'center', baseline: 'middle' });
            doc.setDrawColor(150); doc.setLineWidth(0.2); doc.line(tx + pad, y + h - 8, x + CW - pad, y + h - 8);
            doc.setTextColor(90); doc.setFontSize(8);
            doc.text(`${Math.round(n.bearing_out || 0)}°`, tx + pad, y + h - 3);
            doc.text(`${(+n.lat).toFixed(6)}°  ${(+n.lon).toFixed(6)}°`, x + CW - pad, y + h - 3, { align: 'right' });
        }

        drawCover(doc, rb, logo, when);
        // The printed sequence: each note, with the material it carries on the side it sits on.
        const sheet = [];
        notes.forEach((n, i) => {
            RB.noteBlocks(n, 'before').forEach((b) => { if (b.image || b.text) sheet.push({ block: b }); });
            sheet.push({ note: n, tulip: tulips[i], close: notes[i + 1] && (notes[i + 1].partial_distance ?? 1e9) < 50 });
            RB.noteBlocks(n, 'after').forEach((b) => { if (b.image || b.text) sheet.push({ block: b }); });
        });
        const pages = paginate(sheet.length), totalPages = 1 + pages.length;
        pages.forEach((pg, p) => {
            doc.addPage();
            header(p + 2);
            const top = TOP + HEADER_H, rowH = (CB - top) / ROWS;
            for (let i = pg.from; i < pg.to; i++) {
                const row = sheet[i], y = top + (i - pg.from) * rowH;
                if (row.block) drawBlock(row.block, LEFT, y, rowH);
                else drawRow(row.note, row.tulip, row.close, LEFT, y, rowH);
            }
        });
        doc.save(RB.slug(title) + '.pdf');
    }

    // Public: build + download the PDF on the device. Mutates nothing.
    // opts.link: the absolute URL of the roadbook's public page (or its event's), for the header
    // QR; without one the header carries just the title and the page count.
    async function generate(rb, opts = {}) {
        if (!rb || !rb.notes || !rb.notes.length) throw new Error('Nothing to export.');
        await ensureJsPDF();
        if (opts.link) await ensureQr();
        const basePath = opts.iconBasePath || '../assets/icons/';
        const iconMap = await resolveIcons(rb, basePath);
        const resolver = (ic) => iconMap[ic.name] || RB.iconSrc(ic, rb, basePath);
        const tulips = [];
        for (let i = 0; i < rb.notes.length; i++) tulips.push(await svgToPng(NoteCanvas.toSVG(rb.notes[i], resolver, RB.isEndNote(rb.notes, i), RB.isFirstNote(rb.notes, i)), 3));
        buildDoc(window.jspdf.jsPDF, rb, tulips, (rb.meta && rb.meta.logo) || null, opts.link || null);
    }

    // `paginate` is pure and unit-tested; the browser reaches it through the global, Node (the
    // test runner) imports the same object.
    const RBPdf = { generate, paginate };
    if (typeof window !== 'undefined') window.RBPdf = RBPdf;
    if (typeof module !== 'undefined' && module.exports) module.exports = RBPdf;
})();
