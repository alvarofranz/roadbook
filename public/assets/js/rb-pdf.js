'use strict';
/* rb-pdf.js (window.RBPdf) — client-side A4 PDF export of a roadbook, generated
 * entirely on the device (no server). jsPDF is vendored and lazy-loaded on first
 * use. Text, the page frame and the row grid are drawn as crisp vectors; each
 * note's tulip (an SVG from NoteCanvas.toSVG) is rasterised at high DPI on white
 * and placed as an image — the only faithful way to carry the SVG traffic-sign
 * icons and arrowhead markers across.
 *
 * Layout (the printer binds the top + left edges):
 *   A4 · 20 mm top · 30 mm left · header(totals · logo · title · page) · note rows.
 *   First page: 4 rows under a tall header. Following pages: 6 rows under a slim one. */
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
    const H1 = 50, H2 = 12;         // header heights: first page / running
    const ROWS_FIRST = 4, ROWS_REST = 6;
    const km = (m) => ((m || 0) / 1000).toFixed(2);

    // Place a logo (data URI) fitted into maxW×maxH, anchored by its centre-x / top-y.
    function placeLogo(doc, logo, cx, top, maxW, maxH) {
        try {
            const p = doc.getImageProperties(logo);
            let h = maxH, w = h * (p.width / p.height);
            if (w > maxW) { w = maxW; h = w * (p.height / p.width); }
            doc.addImage(logo, p.fileType || 'PNG', cx - w / 2, top, w, h);
        } catch (e) { /* unreadable logo — skip it */ }
    }

    function fmtDate(d) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    function drawCover(doc, rb, logo) {
        const title = (rb.meta && rb.meta.title) || 'Roadbook';
        const author = (rb.meta && rb.meta.author) || '';
        const now = new Date();
        const cx = PW / 2;
        // vertical centre of the page — everything stacks around it
        let y = PH / 2 - 60;
        // logo
        if (logo) {
            try {
                const p = doc.getImageProperties(logo);
                let h = 40, w = h * (p.width / p.height);
                if (w > 100) { w = 100; h = w * (p.height / p.width); }
                doc.addImage(logo, p.fileType || 'PNG', cx - w / 2, y, w, h);
                y += h + 14;
            } catch (e) { /* skip */ }
        }
        // title
        doc.setFont('helvetica', 'bold'); doc.setFontSize(26); doc.setTextColor(20);
        doc.text(title, cx, y, { align: 'center' }); y += 14;
        // author
        if (author) {
            doc.setFont('helvetica', 'normal'); doc.setFontSize(14); doc.setTextColor(60);
            doc.text(author, cx, y, { align: 'center' }); y += 12;
        }
        y = PH / 2 + 30;
        // date
        doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(100);
        doc.text(fmtDate(now), cx, y, { align: 'center' }); y += 8;
        // footer line
        doc.setFontSize(9); doc.setTextColor(130);
        doc.text('Roadbook produced with RDBK.app', cx, y, { align: 'center' });
    }

    function buildDoc(jsPDF, rb, tulips, logo) {
        const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
        const notes = rb.notes, N = notes.length;
        const total = (rb.meta && rb.meta.total_distance) || (notes[N - 1] && notes[N - 1].distance) || 0;
        const title = (rb.meta && rb.meta.title) || 'Roadbook';
        // cover page + content pages
        const contentPages = N <= ROWS_FIRST ? 1 : 1 + Math.ceil((N - ROWS_FIRST) / ROWS_REST);
        const totalPages = 1 + contentPages;

        function firstHeader(pageNum) {
            doc.setTextColor(60); doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
            doc.text(`${RBt('Page')} ${pageNum} ${RBt('of')} ${totalPages}`, PW - RIGHT, TOP + 2, { align: 'right' });
            doc.setTextColor(20);
            doc.setFontSize(9); doc.text(RBt('Total km') + ':', LEFT, TOP + 4);
            doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.text(km(total), LEFT, TOP + 13);
            doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text(RBt('Notes') + ':', LEFT, TOP + 22);
            doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.text(String(N), LEFT, TOP + 31);
            doc.setDrawColor(180); doc.setLineWidth(0.3); doc.line(LEFT + 34, TOP + 1, LEFT + 34, TOP + 33);
            if (logo) placeLogo(doc, logo, (LEFT + 34 + PW - RIGHT) / 2, TOP, 60, 24);
            doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(20);
            doc.text(title, PW / 2, TOP + 43, { align: 'center' });
            doc.setDrawColor(40); doc.setLineWidth(0.4); doc.line(LEFT, TOP + H1 - 2, PW - RIGHT, TOP + H1 - 2);
        }
        function runHeader(pageNum) {
            if (logo) placeLogo(doc, logo, LEFT + 10, TOP - 2, 20, 10); // cx keeps a max-width logo inside the 30 mm bind margin
            doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(20);
            doc.text(title, PW / 2, TOP + 4, { align: 'center' });
            doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(60);
            doc.text(`${RBt('Page')} ${pageNum} ${RBt('of')} ${totalPages}`, PW - RIGHT, TOP + 4, { align: 'right' });
            doc.setDrawColor(120); doc.setLineWidth(0.3); doc.line(LEFT, TOP + H2 - 2, PW - RIGHT, TOP + H2 - 2);
        }
        function drawFooter(pageNum) {
            const fy = PH - BOTTOM + 2;
            doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(140);
            doc.text(fmtDate(new Date()), LEFT, fy);
            doc.text(RB.slug(title) + '.pdf', PW - RIGHT, fy, { align: 'right' });
        }

        function drawRow(n, tulip, close, x, y, h) {
            const comment = n.note_kind === 'comment';
            const colDist = 26, colVig = 46, colText = CW - colDist - colVig, pad = 2;
            if (comment) {
                doc.setDrawColor(20); doc.setLineWidth(0.3); doc.rect(x, y, CW, h);
                if (n.image && tulip) {
                    // Comment note with embedded image: show image in the vignette column
                    doc.line(x + colDist, y, x + colDist, y + h);
                    doc.line(x + colDist + colVig, y, x + colDist + colVig, y + h);
                    const aw = colVig - 2 * pad, ah = h - 2 * pad, ar = 230 / 162;
                    let iw = aw, ih = iw / ar; if (ih > ah) { ih = ah; iw = ih * ar; }
                    doc.addImage(tulip, 'PNG', x + colDist + (colVig - iw) / 2, y + (h - ih) / 2, iw, ih);
                    const tx = x + colDist + colVig, tcx = tx + colText / 2;
                    doc.setTextColor(20); doc.setFont('helvetica', 'italic'); doc.setFontSize(10);
                    const lines = doc.splitTextToSize(String(n.text || ''), colText - 2 * pad);
                    const block = Math.min(lines.length, 4) * 4.4;
                    doc.text(lines.slice(0, 4), tcx, y + (h - 9) / 2 - block / 2 + 4, { align: 'center', baseline: 'middle' });
                } else {
                    // Comment note without image: text spans full row width
                    doc.setTextColor(60); doc.setFont('helvetica', 'italic'); doc.setFontSize(10);
                    const lines = doc.splitTextToSize(String(n.text || ''), CW - 2 * pad);
                    const block = Math.min(lines.length, 4) * 4.4;
                    doc.text(lines.slice(0, 4), x + CW / 2, y + (h - 9) / 2 - block / 2 + 4, { align: 'center', baseline: 'middle' });
                }
                return;
            }
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

        drawCover(doc, rb, logo);
        let i = 0, page = 0;
        while (i < N) {
            doc.addPage();
            const first = page === 0;
            first ? firstHeader(page + 1) : runHeader(page + 1);
            const rows = first ? ROWS_FIRST : ROWS_REST;
            const top = TOP + (first ? H1 : H2), rowH = (CB - top) / rows;
            for (let r = 0; r < rows && i < N; r++, i++) {
                const close = notes[i + 1] && (notes[i + 1].partial_distance ?? 1e9) < 50;
                drawRow(notes[i], tulips[i], close, LEFT, top + r * rowH, rowH);
            }
            drawFooter(page + 1);
            page++;
        }
        doc.save(RB.slug(title) + '.pdf');
    }

    // Public: build + download the PDF on the device. Mutates nothing.
    async function generate(rb, opts = {}) {
        if (!rb || !rb.notes || !rb.notes.length) throw new Error('Nothing to export.');
        await ensureJsPDF();
        const basePath = opts.iconBasePath || '../assets/icons/';
        const iconMap = await resolveIcons(rb, basePath);
        const resolver = (ic) => iconMap[ic.name] || RB.iconSrc(ic, rb, basePath);
        const tulips = [];
        for (const n of rb.notes) tulips.push(await svgToPng(NoteCanvas.toSVG(n, resolver), 3));
        buildDoc(window.jspdf.jsPDF, rb, tulips, (rb.meta && rb.meta.logo) || null);
    }

    window.RBPdf = { generate };
})();
