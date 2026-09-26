'use strict';
/* rb-pdf.js (window.RBPdf) — client-side A4 PDF export of a roadbook, generated
 * entirely on the device (no server). jsPDF is vendored and lazy-loaded on first
 * use. Text, the page frame, the row grid, the cover's route and the header QR are
 * crisp vectors; each note's tulip (an SVG from NoteCanvas.toSVG) is rasterised at
 * high DPI on white and placed as an image — the only faithful way to carry the SVG
 * traffic-sign icons and arrowhead markers across.
 *
 * Layout (the printer binds the top + left edges):
 *   Cover: title · description · the route in its box, over a backdrop — the roadbook's image as
 *   a faint wash (the default), the map it runs on, or nothing · distance / notes / date · author
 *   and organization — nothing else (#784 · #810).
 *   Content: A4 · the chosen margins (cm, the cover's too) · the same header on every page (QR to
 *   the digital copy · title · page) · 6 note rows. No footer, nothing after the last note (#810).
 *
 * open() is the generator dialog (#973): the cover's backdrop, the roadbook's image (added or
 * changed right there) and the page margins, with a live page preview; generate() builds it. */
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
        rb.notes.forEach((n) => n.symbols.forEach((ic) => used.add(ic.name)));
        for (const name of used) {
            if (!name) continue;
            const src = RB.symbolSrc({ name }, rb, basePath);
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
    // The page is A4; its margins are the reader's choice (the generator dialog, in cm), the same on
    // the cover and on every content page. MARGIN_MM is where they start and MARGIN_RANGE_MM what they may be.
    const PW = 210, PH = 297;
    const MARGIN_MM = { top: 15, right: 12, bottom: 12, left: 15 };
    const MARGIN_RANGE_MM = [5, 40];
    const clampMargin = (v, fallback) => (Number.isFinite(+v) ? Math.max(MARGIN_RANGE_MM[0], Math.min(MARGIN_RANGE_MM[1], +v)) : fallback);
    function geometry(margins) {
        const m = margins || {}, top = clampMargin(m.top, MARGIN_MM.top), right = clampMargin(m.right, MARGIN_MM.right);
        const bottom = clampMargin(m.bottom, MARGIN_MM.bottom), left = clampMargin(m.left, MARGIN_MM.left);
        return { top, right, bottom, left, width: PW - left - right, bottomY: PH - bottom };
    }
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
    // The cover (#784): the roadbook as a whole, calm and centred between the chosen margins. The
    // route is the roadbook's own line, drawn as a vector (equirectangular, lon scaled by cos(lat)
    // so the shape is not stretched); a roadbook that hides its map (map_allowed:false) keeps its
    // route to itself. Behind it, the backdrop (#810 · #973): the roadbook's image cover-fitted and
    // washed out under a paper-coloured veil so it only tints the page, or the map the route runs
    // on (RBCoverMap's own picture, route included), or nothing.
    function drawImageBox(doc, image, x, y, w, h, veil) {
        try {
            const p = doc.getImageProperties(image), scale = Math.max(w / p.width, h / p.height);
            const iw = p.width * scale, ih = p.height * scale;
            doc.saveGraphicsState();
            doc.roundedRect(x, y, w, h, 4, 4, null); doc.clip(); doc.discardPath();
            doc.addImage(image, p.fileType || 'PNG', x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
            if (veil) { doc.setGState(new doc.GState({ opacity: veil })); doc.setFillColor(246, 244, 239); doc.rect(x, y, w, h, 'F'); }
            doc.restoreGraphicsState();
            return true;
        } catch (e) { return false; } // unreadable image — the plain box stays
    }
    const COVER_BOX_H = 118;
    function drawRoute(doc, track, x, y, w, h, backdrop) {
        doc.setFillColor(246, 244, 239); doc.roundedRect(x, y, w, h, 4, 4, 'F');
        // the map is its own picture of the route: nothing more is drawn over it
        if (backdrop && backdrop.map && drawImageBox(doc, backdrop.map, x, y, w, h, 0)) return;
        if (backdrop && backdrop.image) drawImageBox(doc, backdrop.image, x, y, w, h, 0.86);
        let pts = track;
        if (pts.length > 1500) { const step = Math.ceil(pts.length / 1500); pts = track.filter((_, i) => i % step === 0 || i === track.length - 1); }
        const k = Math.cos((pts.reduce((sum, p) => sum + (+p.lat), 0) / pts.length) * Math.PI / 180) || 1;
        const X = pts.map((p) => (+p.lon) * k), Y = pts.map((p) => -(+p.lat));
        const minX = Math.min(...X), maxX = Math.max(...X), minY = Math.min(...Y), maxY = Math.max(...Y);
        const pad = 9, spanX = (maxX - minX) || 1e-9, spanY = (maxY - minY) || 1e-9;
        const scale = Math.min((w - 2 * pad) / spanX, (h - 2 * pad) / spanY);
        const offX = x + (w - spanX * scale) / 2, offY = y + (h - spanY * scale) / 2;
        const at = (i) => [offX + (X[i] - minX) * scale, offY + (Y[i] - minY) * scale];
        doc.setDrawColor(201, 128, 28); doc.setLineWidth(0.9); doc.setLineCap('round'); doc.setLineJoin('round');
        const segs = []; for (let i = 1; i < pts.length; i++) { const [ax, ay] = at(i - 1), [bx, by] = at(i); segs.push([bx - ax, by - ay]); }
        const [sx, sy] = at(0); doc.lines(segs, sx, sy, [1, 1], 'S', false);
        const [ex, ey] = at(pts.length - 1);
        doc.setFillColor(34, 160, 90); doc.circle(sx, sy, 1.6, 'F');   // start
        doc.setFillColor(20, 20, 20); doc.circle(ex, ey, 1.6, 'F');    // finish
    }
    function drawCover(doc, rb, backdrop, when, g) {
        const meta = rb.meta || {}, cx = g.left + g.width / 2;
        const title = meta.title || 'Roadbook';
        let y = g.top + 10;
        doc.setFont('helvetica', 'bold'); doc.setTextColor(20); doc.setFontSize(26);
        const titleLines = doc.splitTextToSize(title, g.width).slice(0, 2);
        doc.text(titleLines, cx, y + 8, { align: 'center' }); y += 8 + titleLines.length * 10;
        if (meta.description) {
            doc.setFont('helvetica', 'italic'); doc.setFontSize(11); doc.setTextColor(95);
            const lines = doc.splitTextToSize(String(meta.description), g.width - 20).slice(0, 3);
            doc.text(lines, cx, y + 2, { align: 'center' }); y += lines.length * 5 + 4;
        }
        const track = rb.track || [];
        // the figures stay clear of the bottom margin, the box between them and the text
        const statsY = g.bottomY - 49, boxH = Math.max(60, Math.min(COVER_BOX_H, statsY - 20 - Math.max(y + 6, g.top + 72)));
        if (meta.map_allowed !== false && track.length >= 2) {
            const boxTop = Math.max(y + 6, g.top + 72);
            drawRoute(doc, track, g.left, boxTop, g.width, boxH, backdrop);
            y = boxTop + boxH;
        }
        // the three figures, as columns: distance · notes · date
        const total = meta.total_distance || ((rb.notes || [])[rb.notes.length - 1] || {}).distance || 0;
        const stats = [[RBt('Distance'), km(total) + ' km'], [RBt('Notes'), String((rb.notes || []).length)], [RBt('Date'), meta.modified || fmtDate(when)]];
        const sy = Math.max(y + 16, statsY), colW = g.width / stats.length;
        stats.forEach(([label, value], i) => {
            const colX = g.left + colW * i + colW / 2;
            doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(120);
            doc.text(label.toUpperCase(), colX, sy, { align: 'center', charSpace: 0.6 });
            doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(20);
            doc.text(value, colX, sy + 9, { align: 'center' });
            if (i) { doc.setDrawColor(215); doc.setLineWidth(0.3); doc.line(g.left + colW * i, sy - 4, g.left + colW * i, sy + 11); }
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

    function buildDoc(jsPDF, rb, tulips, backdrop, link, margins) {
        const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
        const when = new Date(); // one instant for the whole document
        const notes = rb.notes, g = geometry(margins);
        const title = (rb.meta && rb.meta.title) || 'Roadbook';
        const CW = g.width;
        // an ordinary document says what it is: its title, who made it, what made it
        doc.setProperties({ title, subject: RBt('Roadbook'), author: [rb.meta && rb.meta.author, rb.meta && rb.meta.organization].filter(Boolean).join(' · ') || 'RDBK.app', creator: 'RDBK.app', keywords: 'roadbook' });

        // The header every content page shares (#810): the QR to the roadbook's digital copy
        // top-left (inside the bind margin's reach), the title, the page count. No rule under it —
        // the sheet's own border closes it.
        // The QR is ONE picture, placed on every page: a code drawn as thousands of tiny squares is
        // what some antivirus heuristics take for a QR-phishing document.
        const QR_SIZE = 16;
        const qr = link ? RBQr.dataURL(link, 256) : null;
        function header(pageNum) {
            if (qr) doc.addImage(qr, 'PNG', g.left, g.top - 3, QR_SIZE, QR_SIZE, 'rdbk-qr'); // one image object, reused by alias
            doc.setFont('helvetica', 'bold'); doc.setTextColor(20);
            centeredFit(doc, title, g.left + CW / 2, g.top + 6, 13, CW - 2 * (QR_SIZE + 6));
            doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(60);
            doc.text(`${RBt('Page')} ${pageNum} ${RBt('of')} ${totalPages}`, PW - g.right, g.top + 6, { align: 'right' });
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
            // the FIA distance cell (#1008): the total big and centred over the foot row — the
            // partial boxed in the bottom-left corner, the note number small and black bottom-right
            const footH = 6.5;
            doc.setTextColor(20); doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
            doc.text(km(n.distance), x + colDist / 2, y + (h - footH) / 2, { align: 'center', baseline: 'middle' });
            doc.setFontSize(10);
            const partial = km(n.partial_distance), partialW = doc.getTextWidth(partial) + 2 * pad;
            doc.setDrawColor(20); doc.setLineWidth(0.3);
            doc.line(x, y + h - footH, x + partialW, y + h - footH);
            doc.line(x + partialW, y + h - footH, x + partialW, y + h);
            doc.text(partial, x + pad, y + h - footH / 2, { baseline: 'middle' });
            doc.setFontSize(7);
            const num = String(n.num), numW = doc.getTextWidth(num) + 2, numH = 4;
            doc.setFillColor(20); doc.rect(x + colDist - numW, y + h - numH, numW, numH, 'F');
            doc.setTextColor(255); doc.text(num, x + colDist - numW / 2, y + h - numH / 2, { align: 'center', baseline: 'middle' });
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

        drawCover(doc, rb, backdrop, when, g);
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
            const top = g.top + HEADER_H, rowH = (g.bottomY - top) / ROWS;
            for (let i = pg.from; i < pg.to; i++) {
                const row = sheet[i], y = top + (i - pg.from) * rowH;
                if (row.block) drawBlock(row.block, g.left, y, rowH);
                else drawRow(row.note, row.tulip, row.close, g.left, y, rowH);
            }
        });
        return doc;
    }

    // Public: build the PDF on the device and hand it over. Mutates nothing. In the app it opens in
    // the system sheet (RBShareFile: the PDF preview, open in…, save to Files, send) — a download
    // inside the WebView goes nowhere you can see (#904); on the web it downloads.
    // opts: link (the absolute URL of the roadbook's public page, or its event's, for the header QR;
    // without one the header carries just the title and the page count) · margins ({top, right,
    // bottom, left} in mm) · backdrop ('image' | 'map' | 'none') · image (the picture behind the
    // cover's route; the roadbook's own by default).
    async function generate(rb, opts = {}) {
        if (!rb || !rb.notes || !rb.notes.length) throw new Error('Nothing to export.');
        await ensureJsPDF();
        if (opts.link) await ensureQr();
        const basePath = opts.iconBasePath || '../assets/icons/';
        const iconMap = await resolveIcons(rb, basePath);
        const resolver = (ic) => iconMap[ic.name] || RB.symbolSrc(ic, rb, basePath);
        const tulips = [];
        for (let i = 0; i < rb.notes.length; i++) tulips.push(await svgToPng(NoteCanvas.toSVG(rb.notes[i], resolver, RB.tulipContext(rb, i)), 3));
        const backdrop = await coverBackdrop(rb, opts);
        const doc = buildDoc(window.jspdf.jsPDF, rb, tulips, backdrop, opts.link || null, opts.margins);
        const title = (rb.meta && rb.meta.title) || 'Roadbook', name = RB.slug(title) + '.pdf';
        if (RBIsNativeApp()) await RBShareFile(doc.output('blob'), name, title);
        else doc.save(name);
    }
    // What goes behind the cover's route: { image } · { map } · null
    async function coverBackdrop(rb, opts) {
        const kind = opts.backdrop || 'image';
        if (kind === 'image') { const image = opts.image || (rb.meta && rb.meta.logo); return image ? { image } : null; }
        if (kind !== 'map') return null;
        const map = opts.map || await coverMap(rb);
        return map ? { map } : null; // no tile answered: the plain box
    }
    // The route over the map, as the cover shows it (a JPEG data URI), or null
    async function coverMap(rb) {
        if (!rb.track || rb.track.length < 2) return null;
        if (!window.RBCoverMap) await loadScript(ASSETS_DIR + 'cover-map.js');
        const canvas = await window.RBCoverMap.render(rb.track, { width: 1800, height: 1180, pad: 150 });
        return canvas ? canvas.toDataURL('image/jpeg', 0.86) : null;
    }

    /* ---------- the generator dialog (#973) ----------
       Before the PDF is made: what goes behind the cover (the roadbook's image — the default —, the
       map, or nothing), the image itself (added or changed right there) and the page margins in cm,
       with a live preview of the page. Two panes side by side on a tablet or a desktop, the whole
       screen on a phone (.modal-card.split). The choices are kept on this device for the next PDF.
       opts: link, iconBasePath — as generate() — and onImage(dataUrl): the roadbook's image changes
       there (the Editor passes it; without it the image cannot be changed here). The Map choice shows
       the cover's map, drawn once and handed to the PDF as it is. */
    const PREFS_KEY = 'rb_pdf_prefs';
    const readPrefs = () => { try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') || {}; } catch (e) { return {}; } };
    const savePrefs = (p) => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch (e) {} };
    const cm = (mm) => (mm / 10).toFixed(1);
    function open(rb, opts = {}) {
        const t = RBt, esc = RBesc, prefs = readPrefs();
        const mapOk = !(rb.meta && rb.meta.map_allowed === false) && (rb.track || []).length >= 2;
        let backdrop = ['image', 'map', 'none'].includes(prefs.backdrop) ? prefs.backdrop : 'image';
        if (backdrop === 'map' && !mapOk) backdrop = 'image';
        let image = (rb.meta && rb.meta.logo) || null;
        const margins = geometry(prefs.margins);
        const seg = (v, icon, label) => `<button class="segment" type="button" data-backdrop="${v}"${v === 'map' && !mapOk ? ' disabled' : ''}><i class="fa-solid ${icon}"></i> ${esc(t(label))}</button>`;
        const field = (k, label) => `<label class="prop-field"><span>${esc(t(label))}</span><span class="toolbar nowrap"><input class="field" type="number" data-margin="${k}" min="${MARGIN_RANGE_MM[0] / 10}" max="${MARGIN_RANGE_MM[1] / 10}" step="0.1" inputmode="decimal" value="${cm(margins[k])}"><span class="muted">cm</span></span></label>`;
        const d = RBModal(`<div class="panes">
            <section>
                <h3><i class="fa-solid fa-image icon-accent"></i> ${esc(t('Cover'))}</h3>
                <p class="muted small">${esc(t('What goes behind the route on the first page.'))}</p>
                <div class="segmented fill" role="group">${seg('image', 'fa-image', 'Image')}${seg('map', 'fa-map', 'Map')}${seg('none', 'fa-ban', 'None')}</div>
                <div class="pdf-image" data-image-pane>
                    <img class="pdf-image-thumb" alt="" hidden>
                    <p class="muted small" data-preview-note></p>
                    <button class="btn btn-ghost" type="button" data-pick-image hidden><i class="fa-solid fa-upload"></i> <span></span></button>
                    <input type="file" accept="image/*" hidden data-image-file>
                </div>
            </section>
            <section>
                <h3><i class="fa-solid fa-ruler-combined icon-accent"></i> ${esc(t('Page margins'))}</h3>
                <p class="muted small">${esc(t('The same on the cover and on every page.'))}</p>
                <div class="pdf-margins">
                    <div class="field-grid">${field('top', 'Top')}${field('bottom', 'Bottom')}${field('left', 'Left')}${field('right', 'Right')}</div>
                    <div class="pdf-page" aria-hidden="true"><div class="pdf-page-area"><span></span><span></span><span></span></div></div>
                </div>
            </section>
            </div>
            <div class="btnrow end spaced"><button class="btn btn-primary" type="button" data-go><i class="fa-solid fa-file-pdf"></i> ${esc(t('Generate PDF'))}</button></div>`, 'split');
        let map = null, mapState = 'idle'; // idle · drawing · done · failed
        const drawMap = () => {
            if (mapState !== 'idle') return;
            mapState = 'drawing';
            coverMap(rb).then((m) => { map = m; mapState = m ? 'done' : 'failed'; }).catch(() => { mapState = 'failed'; }).then(paint);
        };
        const paint = () => {
            d.el.querySelectorAll('[data-backdrop]').forEach((b) => b.classList.toggle('on', b.dataset.backdrop === backdrop));
            if (backdrop === 'map') drawMap();
            d.q('[data-image-pane]').hidden = backdrop === 'none';
            // the preview: the roadbook's image, or the cover's map
            const shown = backdrop === 'map' ? map : image, thumb = d.q('.pdf-image-thumb');
            thumb.hidden = !shown; if (shown) thumb.src = shown;
            const note = backdrop === 'map' ? { drawing: 'Drawing the map…', failed: 'The map could not be drawn: the cover will be plain.' }[mapState] : (image ? '' : 'No image yet.');
            d.q('[data-preview-note]').textContent = note ? t(note) : '';
            d.q('[data-preview-note]').hidden = !note;
            d.q('[data-pick-image]').hidden = backdrop !== 'image' || !opts.onImage;
            d.q('[data-pick-image] span').textContent = t(image ? 'Change image' : 'Add image');
            // the preview: the page, and the printed area inside the margins (percent of A4)
            const area = d.q('.pdf-page-area');
            area.style.setProperty('--m-top', (margins.top / PH * 100) + '%'); area.style.setProperty('--m-bottom', (margins.bottom / PH * 100) + '%');
            area.style.setProperty('--m-left', (margins.left / PW * 100) + '%'); area.style.setProperty('--m-right', (margins.right / PW * 100) + '%');
        };
        d.el.querySelectorAll('[data-backdrop]').forEach((b) => b.onclick = () => { backdrop = b.dataset.backdrop; paint(); });
        d.el.querySelectorAll('[data-margin]').forEach((inp) => inp.oninput = () => {
            const k = inp.dataset.margin, v = parseFloat(String(inp.value).replace(',', '.')) * 10;
            margins[k] = clampMargin(v, MARGIN_MM[k]); paint();
        });
        d.q('[data-pick-image]').onclick = () => d.q('[data-image-file]').click();
        d.q('[data-image-file]').onchange = async (e) => {
            const f = e.target.files[0]; e.target.value = '';
            if (!f) return;
            try {
                image = await RBImg.toDataURL(f, 256); // the roadbook's own image, at the Editor's size
                opts.onImage(image);
                paint();
            } catch (err) { RBToast('Could not read the image.'); }
        };
        d.q('[data-go]').onclick = async (e) => {
            const busy = RBBusy(e.currentTarget);
            const chosen = { top: margins.top, right: margins.right, bottom: margins.bottom, left: margins.left };
            savePrefs({ backdrop, margins: chosen });
            try { await generate(rb, { iconBasePath: opts.iconBasePath, link: opts.link, margins: chosen, backdrop, image, map }); busy.ok(); d.close(); }
            catch (err) { busy.reset(); RBToast(err.message || 'Could not export the PDF.'); }
        };
        paint();
    }

    // `paginate` is pure and unit-tested; the browser reaches it through the global, Node (the
    // test runner) imports the same object.
    const RBPdf = { open, generate, paginate, geometry };
    if (typeof window !== 'undefined') window.RBPdf = RBPdf;
    if (typeof module !== 'undefined' && module.exports) module.exports = RBPdf;
})();
