'use strict';
/* NoteCanvas — visual editor for a note's vignette: symbols that drag, scale,
 * rotate and mirror, plus junction vectors you can draw and drag. Reference box
 * 230×162 (+y up, relative to the centre), matching the roadbook model. All
 * SVG (auto-scales). The toolbar lives OUTSIDE the canvas, in opts.toolbarEl.
 * Accepts icons dropped from the palette (drag & drop) as well as click-to-add. */
(function () {
window.NoteCanvas = class NoteCanvas {
    constructor(container, opts = {}) {
        this.REF_W = 230; this.REF_H = 162;
        this.el = container;
        this.onChange = opts.onChange || (() => {});
        this.resolveIcon = opts.resolveIcon || ((ic) => ic.name);
        this.toolbarEl = opts.toolbarEl;
        this.missingIcon = opts.missingIcon || '';   // drawn in place of a name that resolves to nothing (#521)
        this._onDrop = null;
        this.note = null; this.sel = null; // {type:'icon'|'junctions', i}
        this._build();
    }
    _build() {
        this.el.classList.add('vignette-box');
        this.el.innerHTML = '';
        this.svg = svg('svg', { viewBox: `0 0 ${this.REF_W} ${this.REF_H}`, class: 'vignette-svg' });
        this.el.appendChild(this.svg);
        const defs = svg('defs', {});
        // Arrow is a FIXED ~33px (markerUnits=userSpaceOnUse) so every road gets the SAME
        // arrowhead, well wider than the road it ends. The road ends deep inside it (refX 6.5 of
        // 10): the head reaches beyond the road's end and the line's round cap never shows beside
        // the narrow tip — refX 8 left a dot of road poking out there. The junction
        // end-tick stays proportional to its (thin) line.
        defs.innerHTML = `<marker id="vignette-box-arrow" viewBox="0 0 10 10" refX="6.5" refY="5" markerUnits="userSpaceOnUse" markerWidth="33" markerHeight="33" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="context-stroke"></path></marker>`
            + `<marker id="vignette-box-tick" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="2" markerHeight="2" orient="auto"><path d="M5 0 L5 10" stroke="context-stroke" stroke-width="2" fill="none"></path></marker>`;
        this.svg.appendChild(defs);
        this.toolbarEl.classList.add('vignette-toolbar');
        // deselect when tapping the background
        this.svg.addEventListener('pointerdown', (e) => { if (e.target === this.svg || e.target.classList.contains('vignette-box-bg')) this.select(null); });
        // accept icons dropped from the palette
        this.el.addEventListener('dragover', (e) => { if (this._onDrop && this.note) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
        this.el.addEventListener('drop', (e) => {
            if (!this._onDrop || !this.note) return;
            e.preventDefault();
            const name = e.dataTransfer.getData('text/plain'); if (!name) return;
            const [vx, vy] = this.evToV(e), m = this.toM(vx, vy);
            this._onDrop(name, [r1(m[0]), r1(m[1])]);
        });
    }
    /* ---- coords: model (+y up, centre origin) ↔ viewBox (y down) ---- */
    toV(px, py) { return [this.REF_W / 2 + px, this.REF_H / 2 - py]; }
    toM(vx, vy) { return [vx - this.REF_W / 2, this.REF_H / 2 - vy]; }
    evToV(e) { const p = this.svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; const l = p.matrixTransform(this.svg.getScreenCTM().inverse()); return [l.x, l.y]; }

    // ctx: RB.tulipContext(rb, i) — where the note sits (start · end) and the shape of the road around it
    setNote(note, ctx) {
        this.ctx = ctx || {};
        this.note = note;
        this.sel = null; this.render();
    }
    onDropIcon(cb) { this._onDrop = cb; }

    render() {
        [...this.svg.querySelectorAll('.vignette-box-dyn')].forEach((n) => n.remove());
        if (!this.note) { this.toolbarEl.innerHTML = ''; return; }
        this.svg.appendChild(svg('rect', { class: 'vignette-box-dyn vignette-box-bg', x: 0, y: 0, width: this.REF_W, height: this.REF_H, fill: 'transparent' }));
        // a shown imported tulip IS the vignette (an OpenRally one): drawn full-box and nothing
        // else, exactly as toSVG draws it — there is nothing on it to select or drag
        const imported = shownTulip(this.note);
        if (imported) {
            this.svg.appendChild(svg('image', { class: 'vignette-box-dyn', x: 0, y: 0, width: this.REF_W, height: this.REF_H, href: imported, preserveAspectRatio: 'xMidYMid meet' }));
            this.sel = null; this._toolbar();
            return;
        }
        // junctions, under the route
        const handles = [];
        this.note.junctions.forEach((b, i) => {
            const [px, py] = this.toV(b.from[0], b.from[1]);
            const [tx, ty] = this.toV(b.to[0], b.to[1]);
            // off the route → grey; the road type reads from its stroke (double · dashes)
            roadMarkup(b.road_type, `M${px} ${py} L${tx} ${ty}`, JUNCTION_INK, 'url(#vignette-box-tick)').forEach((attrs, k) => {
                const line = svg('path', Object.assign({ class: 'vignette-box-dyn' + (k ? '' : ' vignette-box-junctions'), 'data-i': i }, attrs, k ? { 'pointer-events': 'none' } : {}));
                if (!k) line.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.select({ type: 'junctions', i }); });
                this.svg.appendChild(line);
            });
            if (this.sel && this.sel.type === 'junctions' && this.sel.i === i) handles.push(() => {
                this._handle(px, py, (vx, vy) => { const m = this.toM(vx, vy); b.from = [r1(m[0]), r1(m[1])]; });
                // the end handle sits just BEYOND the end tick so your finger never covers it.
                const dx = tx - px, dy = ty - py, dl = Math.hypot(dx, dy) || 1;
                this._handle(tx + dx / dl * 11, ty + dy / dl * 11, (vx, vy) => {
                    const ax = vx - px, ay = vy - py, al = Math.hypot(ax, ay) || 1;
                    const m = this.toM(vx - ax / al * 11, vy - ay / al * 11); b.to = [r1(m[0]), r1(m[1])];
                });
            });
        });
        // the route over the branches — the road to follow reads first where they meet — but letting
        // every tap through to the branch underneath, and the selected branch's handles over both
        trunkRoads(this.note, this.ctx).forEach((r) => {
            roadMarkup(r.roadType, r.d, null, r.arrow ? 'url(#vignette-box-arrow)' : null).forEach((attrs) => {
                this.svg.appendChild(svg('path', Object.assign({ class: 'vignette-box-dyn', 'pointer-events': 'none' }, attrs)));
            });
        });
        handles.forEach((h) => h());

        const danger = dangerMarks(this.note);
        if (danger) { const marks = svg('text', { class: 'vignette-box-dyn vignette-danger', x: 8, y: 40 }); marks.textContent = danger; this.svg.appendChild(marks); }
        // symbols
        this.note.symbols.forEach((ic, i) => {
            const [cxi, cyi] = this.toV(ic.position[0], ic.position[1]);
            const s = ic.size || 32;
            const g = svg('g', { class: 'vignette-box-dyn vignette-box-icon', 'data-i': i, transform: `rotate(${ic.angle || 0} ${cxi} ${cyi})` });
            const im = svg('image', { x: cxi - s / 2, y: cyi - s / 2, width: s, height: s, href: this.resolveIcon(ic), preserveAspectRatio: 'xMidYMid meet' });
            // A name that resolves to nothing (a roadbook written elsewhere, a renamed file) draws
            // a marker where it sits, so the spot is visible and clickable — the note's data is
            // left exactly as its author wrote it (#521).
            im.addEventListener('error', () => im.setAttribute('href', (this.missingIcon || '')), { once: true });
            if (ic.mirrored) im.setAttribute('transform', `translate(${2 * cxi} 0) scale(-1 1)`);
            g.appendChild(im);
            g.addEventListener('pointerdown', (e) => this._startDrag(e, (vx, vy) => { const m = this.toM(vx, vy); ic.position = [r1(m[0]), r1(m[1])]; }, { type: 'icon', i }));
            this.svg.appendChild(g);
            if (this.sel && this.sel.type === 'icon' && this.sel.i === i) {
                this.svg.appendChild(svg('rect', { class: 'vignette-box-dyn', x: cxi - s / 2, y: cyi - s / 2, width: s, height: s, fill: 'none', stroke: '#ff7a1a', 'stroke-width': 1.2, 'stroke-dasharray': '3 2', transform: `rotate(${ic.angle || 0} ${cxi} ${cyi})`, 'pointer-events': 'none' }));
                // drag the corner to resize (rotation-invariant; the +/- buttons still work too)
                const rh = svg('rect', { class: 'vignette-box-dyn vignette-resize-handle', x: cxi + s / 2 - 5, y: cyi + s / 2 - 5, width: 10, height: 10, rx: 2, fill: '#5aa9ff', stroke: '#101313', 'stroke-width': 1.5 });
                rh.addEventListener('pointerdown', (e) => this._startDrag(e, (vx, vy) => { ic.size = clampIconSize(r1(Math.hypot(vx - cxi, vy - cyi) * Math.SQRT2)); }, null));
                this.svg.appendChild(rh);
            }
        });
        // validation point: a small open circle where the trunk segments meet (the note's exact
        // spot), drawn LAST so junction vectors and centre-placed icons never hide it (#142);
        // pointer-inert so it never steals a tap from the drag handles underneath.
        { const [vcx, vcy] = this.toV(0, 0); this.svg.appendChild(svg('circle', { class: 'vignette-box-dyn', cx: vcx, cy: vcy, r: 6, fill: '#fff', stroke: '#101313', 'stroke-width': 2.5, 'pointer-events': 'none' })); }
        this._toolbar();
    }
    _handle(vx, vy, onMove) {
        const h = svg('circle', { class: 'vignette-box-dyn vignette-drag-handle', cx: vx, cy: vy, r: 6, fill: '#ff7a1a', stroke: '#101313', 'stroke-width': 1.5 });
        h.addEventListener('pointerdown', (e) => this._startDrag(e, onMove, null));
        this.svg.appendChild(h);
    }
    _startDrag(e, onMove, selObj) {
        e.stopPropagation(); e.preventDefault();
        if (selObj) this.select(selObj);
        // The model updates on every pointermove (exact final position) but the full SVG
        // rebuild is coalesced to one render per animation frame — per-move rebuilds jank.
        let raf = 0;
        const move = (ev) => { const [vx, vy] = this.evToV(ev); onMove(vx, vy); if (!raf) raf = requestAnimationFrame(() => { raf = 0; this.render(); }); };
        const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); if (raf) { cancelAnimationFrame(raf); raf = 0; } this.render(); this.onChange(); };
        window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    }
    select(sel) { this.sel = sel; this.render(); }

    // Remove whatever is selected on the vignette — the trash button and the Del key share it.
    deleteSelected() {
        if (!this.sel || !this.note) return;
        const list = this.sel.type === 'icon' ? this.note.symbols : this.note.junctions;
        list.splice(this.sel.i, 1);
        this.sel = null;
        this._chg();
    }
    _toolbar() {
        const t = this.toolbarEl;
        if (!this.sel) { t.innerHTML = ''; return; }
        // Say what the bar acts on: these buttons resize, rotate and delete the SELECTED element,
        // not the note around it, and that was not obvious from icons alone (#521).
        const label = (text) => `<span class="vignette-toolbar-label">${RBesc(RBt(text))}</span>`;  // RBesc/RBt come from app.js + i18n.js, loaded before this file
        if (this.sel.type === 'icon') {
            const ic = this.note.symbols[this.sel.i];
            t.innerHTML = label('Icon tools') + btn('fa-magnifying-glass-minus', 'sz-') + btn('fa-magnifying-glass-plus', 'sz+')
                + btn('fa-rotate-left', 'rot-') + btn('fa-rotate-right', 'rot+')
                + btn('fa-left-right', 'flip', ic.mirrored) + btn('fa-trash-can', 'del', false, true);
            t.querySelector('[data-a="sz-"]').onclick = () => { ic.size = clampIconSize((ic.size || 32) - 4); this._chg(); };
            t.querySelector('[data-a="sz+"]').onclick = () => { ic.size = clampIconSize((ic.size || 32) + 4); this._chg(); };
            t.querySelector('[data-a="rot-"]').onclick = () => { ic.angle = (ic.angle || 0) - 15; this._chg(); };
            t.querySelector('[data-a="rot+"]').onclick = () => { ic.angle = (ic.angle || 0) + 15; this._chg(); };
            t.querySelector('[data-a="flip"]').onclick = () => { ic.mirrored = !ic.mirrored; this._chg(); };
            t.querySelector('[data-a="del"]').onclick = () => this.deleteSelected();
        } else {
            const b = this.note.junctions[this.sel.i], rtLabel = RBt('Road type');
            t.innerHTML = label('Junction tools') + `<select class="vignette-box-rt" title="${rtLabel}" aria-label="${rtLabel}">${RB.ROAD_TYPES.map((r) => `<option value="${r.id}" ${r.id === b.road_type ? 'selected' : ''}>${RBt(r.name)}</option>`).join('')}</select>`
                + btn('fa-trash-can', 'del', false, true);
            t.querySelector('.vignette-box-rt').onchange = (e) => { b.road_type = +e.target.value; this._chg(); };
            t.querySelector('[data-a="del"]').onclick = () => this.deleteSelected();
        }
    }
    _chg() { this.render(); this.onChange(); }

    /* ---- public API ---- */
    addIcon(ic) { this.note.symbols.push(ic); this.sel = { type: 'icon', i: this.note.symbols.length - 1 }; this._chg(); }
    addJunction() {
        this.note.junctions.push({ from: [0, 0], to: [45, 25], road_type: this.note.road_type });
        this.sel = { type: 'junctions', i: this.note.junctions.length - 1 }; this._chg();
    }
};
/* Static, read-only render of a note's vignette as an SVG string — used by the
 * Reader and the challenge page to show each note exactly as designed. */
// ctx: RB.tulipContext(rb, i) — { isEnd, isFirst, shape }; without it the note draws as a middle one with straight roads
window.NoteCanvas.toSVG = function (note, resolveIcon, ctx) {
    const W = 230, H = 162, cx = W / 2, cy = H / 2;
    const toV = (px, py) => [cx + px, cy - py];
    resolveIcon = resolveIcon || ((ic) => ic.name);
    // A shown imported tulip IS the whole vignette (an opaque drawing — e.g. OpenRally): render it
    // full-box and nothing else (no generated trunk/junctions). The danger marks are skipped too,
    // since the imported drawing already bakes them in.
    const imported = shownTulip(note);
    if (imported) return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`
        + `<image x="0" y="0" width="${W}" height="${H}" href="${RBesc(imported)}" preserveAspectRatio="xMidYMid meet"/></svg>`;
    let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`
        + `<defs><marker id="vig-arr" viewBox="0 0 10 10" refX="6.5" refY="5" markerUnits="userSpaceOnUse" markerWidth="33" markerHeight="33" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="context-stroke"/></marker>`
        + `<marker id="vig-tick" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="2" markerHeight="2" orient="auto"><path d="M5 0 L5 10" stroke="context-stroke" stroke-width="2" fill="none"/></marker></defs>`;
    const path = (attrs) => '<path ' + Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ') + '/>';
    (note.junctions || []).forEach((b) => {
        const [px, py] = toV(b.from[0], b.from[1]), [tx, ty] = toV(b.to[0], b.to[1]);
        s += roadMarkup(b.road_type, `M${px} ${py} L${tx} ${ty}`, JUNCTION_INK, 'url(#vig-tick)').map(path).join('');
    });
    // the route over the branches: where they meet, the road to follow reads first
    trunkRoads(note, ctx).forEach((g) => {
        s += roadMarkup(g.roadType, g.d, null, g.arrow ? 'url(#vig-arr)' : null).map(path).join('');
    });
    (note.symbols || []).forEach((ic) => {
        const [cxi, cyi] = toV(ic.position[0], ic.position[1]), sz = ic.size || 32;
        const flip = ic.mirrored ? ` transform="translate(${2 * cxi} 0) scale(-1 1)"` : '';
        s += `<g transform="rotate(${ic.angle || 0} ${cxi} ${cyi})"><image x="${cxi - sz / 2}" y="${cyi - sz / 2}" width="${sz}" height="${sz}" href="${RBesc(resolveIcon(ic))}"${flip} preserveAspectRatio="xMidYMid meet"/></g>`;
    });
    // validation point: a small open circle where the trunk segments meet (the note's exact spot),
    // drawn LAST so junction vectors and centre-placed icons never hide it (#142)
    s += `<circle cx="${cx}" cy="${cy}" r="6" fill="#fff" stroke="#101313" stroke-width="2.5"/>`;
    // Danger marks carry their own presentation attributes so the SVG is fully
    // self-contained (renders identically standalone — PDF — and inside the DOM).
    const danger = dangerMarks(note);
    if (danger) s += `<text x="8" y="40" fill="#e01414" font-family="system-ui,-apple-system,sans-serif" font-weight="900" font-size="38" letter-spacing="2">${danger}</text>`;
    return s + '</svg>';
};

// The imported tulip a note keeps (#943): an opaque image that is the whole vignette while it is
// shown; switched off, the editor's own tulip shows — the original always stays with the note, one
// toggle away. The image while it is shown, else null.
const shownTulip = (note) => (note.imported_tulip && note.imported_tulip.shown !== false ? note.imported_tulip.image : null);
/* FIA-style danger grading: the note's `danger` (1-3) renders as '!' / '!!' /
 * '!!!' in red INSIDE the diagram box (top-left), never in the text column. */
function dangerMarks(note) { const d = note.danger | 0; return d > 0 ? '!'.repeat(Math.min(d, 3)) : ''; }
/* The tulip trunk: the road you arrive FROM enters from the bottom edge to the box centre (styled
 * by road_type_in); the road you leave ON exits from the centre with an arrow (road_type).
 * Each takes the shape the author drew into the track around the note (RB.tulipShape, #945: more
 * than a handful of points there is a road drawn on purpose) — a smooth curve through them; else
 * it is straight: the entry vertical, the exit at the real turn, so the diagram always shows the
 * direction to follow. Junction
 * vectors branch from the centre, drawn under the route. Every road is RB.ROAD_WIDTH wide and draws
 * its FIA stroke (RB.ROAD_TYPES): tarmac a double line, a low-visible track long–short dashes, off
 * track short dashes; the route takes its type's colour, a branch the junction grey. */
const JUNCTION_INK = '#9aa4b2';
// The SVG attributes of one road — a list, since a double line is its stroke plus a white centre.
// Dashed roads use butt caps: round caps would swallow the gaps at this width. One source for every
// render spot (the editor canvas and toSVG).
function roadMarkup(roadType, d, ink, marker) {
    const rt = RB.roadType(roadType), color = ink || rt.color;
    const main = { d, fill: 'none', stroke: color, 'stroke-width': RB.ROAD_WIDTH, 'stroke-linecap': rt.dash ? 'butt' : 'round', 'stroke-linejoin': 'round' };
    if (rt.dash) main['stroke-dasharray'] = rt.dash;
    if (marker) main['marker-end'] = marker;
    const out = [main];
    if (rt.double) out.push({ d, fill: 'none', stroke: '#fff', 'stroke-width': RB.DOUBLE_GAP, 'stroke-linecap': 'butt', 'stroke-linejoin': 'round' });
    return out;
}
// A smooth path through a polyline (Catmull-Rom as cubic Béziers): it passes through every point,
// so the curve is the track's shape, and it ends along its last segment — where the arrow points.
function smoothPath(pts) {
    const f = (n) => Math.round(n * 10) / 10;
    let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
    for (let k = 0; k < pts.length - 1; k++) {
        const p0 = pts[k - 1] || pts[k], p1 = pts[k], p2 = pts[k + 1], p3 = pts[k + 2] || p2;
        d += ` C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
    }
    return d;
}
function trunkRoads(note, ctx) {
    const c = ctx || {}, shape = c.shape || {};
    const cx = 115, cy = 81, L = 63; // centre of the 230×162 reference box; exit length
    const road = (roadType, d, arrow) => ({ d, roadType, arrow });
    // the classic exit's angle: where the road goes over its first metres (RB.tulipShape), else the
    // stored bearings
    const turn = shape.turn != null ? shape.turn : ((((note.bearing_out || 0) - (note.bearing_in || 0)) % 360) + 360) % 360;
    const θ = turn * Math.PI / 180; // 0 = straight up; clockwise like a compass
    const roads = [];
    // incoming (provenance): styled by road_type_in — which recomputeMetrics derives from the
    // PREVIOUS note's road_type. The roadbook's START draws no incoming road at all: nothing
    // comes before it, so a line from the bottom edge points from nowhere (#472).
    if (!c.isFirst) roads.push(road(note.road_type_in, shape.entry ? smoothPath(shape.entry) : `M${cx} 154 L${cx} ${cy}`, false));
    // The END note has no exit road and no arrow: past the finish there is nothing to follow, so
    // an arrow leaving the waypoint points at nothing — in a race that note is the finish arch
    // (#447). The incoming road stops at the centre, where the validation dot marks the spot.
    if (!c.isEnd) roads.push(road(note.road_type, shape.exit ? smoothPath(shape.exit) : `M${cx} ${cy} L${Math.round((cx + Math.sin(θ) * L) * 10) / 10} ${Math.round((cy - Math.cos(θ) * L) * 10) / 10}`, true));
    return roads;
}
function svg(tag, attrs) { const e = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; }
const BTN_LABELS = { 'sz-': 'Smaller', 'sz+': 'Bigger', 'rot-': 'Rotate left', 'rot+': 'Rotate right', flip: 'Flip', del: 'Delete' };
function btn(icon, action, active, danger) {
    const label = window.RBt ? RBt(BTN_LABELS[action] || action) : (BTN_LABELS[action] || action);
    return `<button type="button" data-a="${action}" class="${active ? 'on' : ''} ${danger ? 'danger' : ''}" aria-label="${label}" title="${label}"><i class="fa-solid ${icon}"></i></button>`;
}
function r1(n) { return Math.round(n); }
function clampIconSize(n) { return Math.max(10, Math.min(120, n)); }

/* The paper note rows of a roadbook — ONE renderer for the Reader and the public roadbook page
   (#635): the FIA distance column (#1008: the total big and centred, the partial boxed in the
   bottom-left corner, the FIA waypoint badge, the note number small in the bottom-right), the vignette, and the comments with the CAP (+ its FIA qualifier), the speed limit and
   the coordinates; the material a note carries (#542) is drawn around its row. Only note rows
   carry data-i, so a tap on a photo or text block is never taken for a note.
   opts: iconBase (the standard palette's path), rowClass(i) → extra classes (the Reader's run
   states), after(i) → markup after the note's block rows (the Reader's map slot). */
const CAP_TYPE_LABEL = { average: 'Average', calculated: 'Calculated', turning: 'Turning' }; // exit = the plain CAP, no qualifier
window.NoteCanvas.rowsHTML = function (rb, opts) {
    const o = opts || {}, notes = rb.notes, t = window.RBt, esc = window.RBesc;
    const km = (m) => ((m ?? 0) / 1000).toFixed(2);
    const symbolSrc = (ic) => RB.symbolSrc(ic, rb, o.iconBase || '../assets/icons/');
    // A block is no waypoint, so it has no distances to show (#934): its image spans the counter and
    // vignette columns (the whole row when there is no text), and a text alone spans the whole row.
    const blocks = (n, placement) => RB.noteBlocks(n, placement).filter((b) => b.image || b.text).map((b) => {
        const img = b.image ? `<div class="block-media${b.text ? '' : ' wide'}"><img class="block-img" src="${esc(b.image)}" alt=""></div>` : '';
        const text = b.text ? `<div class="${b.image ? 'col-text' : 'col-text-wide'}"><div class="text">${esc(b.text)}</div></div>` : '';
        return `<div class="nrow block block-${RB.blockType(b).id}">${img}${text}</div>`;
    }).join('');
    return notes.map((n, i) => {
        // the next note under 50 m away: a tight pair — a property of the roadbook, not of the run
        const tight = notes[i + 1] && (notes[i + 1].partial_distance ?? 1e9) < 50 ? ' tight' : '';
        const capQual = n.cap != null && CAP_TYPE_LABEL[n.cap_type] ? ' · ' + esc(t(CAP_TYPE_LABEL[n.cap_type])) : '';
        const cap = n.cap != null ? `<div class="note-cap">CAP ${Math.round(n.cap)}°${n.cap_distance != null ? ' · ' + km(n.cap_distance) + ' km' : ''}${capQual}</div>` : '';
        const speed = n.speed_limit_kmh != null ? `<div class="note-speed">${n.speed_limit_kmh === 0 ? `<span class="lim lifted">${esc(t('END'))}</span>` : `<span class="lim">${n.speed_limit_kmh}</span>`}</div>` : '';
        const extra = o.rowClass ? o.rowClass(i) : '';
        return `${blocks(n, 'before')}<div class="nrow${extra ? ' ' + extra : ''}" data-i="${i}">
                <div class="col-distance${tight}"><div class="total">${km(n.distance)}</div><div class="distance-foot"><span class="partial">${km(n.partial_distance)}</span>${RB.wpBadgeSVG(n.waypoint_type, 22)}<span class="num">${n.num}</span></div></div>
                <div class="col-vignette">${window.NoteCanvas.toSVG(n, symbolSrc, RB.tulipContext(rb, i))}</div>
                <div class="col-text"><div class="text">${esc(n.text || '')}</div>${cap}${speed}<div class="coords">${(+n.lat).toFixed(5)}, ${(+n.lon).toFixed(5)}</div></div>
            </div>${blocks(n, 'after')}${o.after ? o.after(i) : ''}`;
    }).join('');
};

// Node (the test runner) imports the same class; the browser keeps using window.NoteCanvas.
if (typeof module !== 'undefined' && module.exports) module.exports = window.NoteCanvas;
})();
