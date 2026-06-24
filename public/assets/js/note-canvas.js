'use strict';
/* NoteCanvas — visual editor for a note's vignette: icons that drag, scale,
 * rotate and flip, plus junction vectors you can draw and drag. Reference box
 * 230×162 (+y up, relative to the centre), matching the roadbook model. All
 * SVG (auto-scales). The toolbar lives OUTSIDE the canvas (opts.toolbarEl).
 * Accepts icons dropped from the palette (drag & drop) as well as click-to-add. */
(function () {
window.NoteCanvas = class NoteCanvas {
    constructor(container, opts = {}) {
        this.REF_W = 230; this.REF_H = 162;
        this.el = container;
        this.onChange = opts.onChange || (() => {});
        this.onSelect = opts.onSelect || (() => {}); // notified whenever the selected element changes
        this.resolveIcon = opts.resolveIcon || ((ic) => ic.name);
        this.toolbarEl = opts.toolbarEl || null;
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
        // Arrow is a FIXED ~33px (markerUnits=userSpaceOnUse) so every road type gets the SAME
        // arrowhead, big enough to protrude past even the width-14 motorway line. The junction
        // end-tick stays proportional to its (thin) line.
        defs.innerHTML = `<marker id="vignette-box-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerUnits="userSpaceOnUse" markerWidth="33" markerHeight="33" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="context-stroke"></path></marker>`
            + `<marker id="vignette-box-tick" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="2" markerHeight="2" orient="auto"><path d="M5 0 L5 10" stroke="context-stroke" stroke-width="2" fill="none"></path></marker>`;
        this.svg.appendChild(defs);
        if (!this.toolbarEl) { this.toolbarEl = document.createElement('div'); this.el.parentNode.insertBefore(this.toolbarEl, this.el.nextSibling); }
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

    setNote(note) {
        this.note = note;
        if (note) {
            note.icons = Array.isArray(note.icons) ? note.icons : [];
            note.junctions = Array.isArray(note.junctions) ? note.junctions : null;
        }
        this.sel = null; this.render(); this.onSelect(this.sel);
    }
    onDropIcon(cb) { this._onDrop = cb; }

    render() {
        [...this.svg.querySelectorAll('.vignette-box-dyn')].forEach((n) => n.remove());
        if (!this.note) { this.toolbarEl.innerHTML = ''; return; }
        this.svg.appendChild(svg('rect', { class: 'vignette-box-dyn vignette-box-bg', x: 0, y: 0, width: this.REF_W, height: this.REF_H, fill: 'transparent' }));
        trunkSegments(this.note).forEach((s) => {
            const attrs = { class: 'vignette-box-dyn', x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2, stroke: s.color, 'stroke-width': s.width, 'stroke-linecap': s.dashed ? 'butt' : 'round', 'stroke-dasharray': s.dashed ? DASH : '' };
            if (s.arrow) attrs['marker-end'] = 'url(#vignette-box-arrow)';
            this.svg.appendChild(svg('line', attrs));
            // motorway: a white centre line splits the thick stroke into a DOUBLE line
            if (s.double) this.svg.appendChild(svg('line', { class: 'vignette-box-dyn', x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2, stroke: '#fff', 'stroke-width': Math.max(3, s.width * 0.3), 'stroke-linecap': 'round' }));
        });
        // validation point: a small open circle where the two trunk segments meet (the note's spot)
        { const [vcx, vcy] = this.toV(0, 0); this.svg.appendChild(svg('circle', { class: 'vignette-box-dyn', cx: vcx, cy: vcy, r: 6, fill: '#fff', stroke: '#0e1116', 'stroke-width': 2.5 })); }
        // junctions
        (this.note.junctions || []).forEach((b, i) => {
            const [px, py] = this.toV(b.pivot[0], b.pivot[1]);
            const [tx, ty] = this.toV(b.tip[0], b.tip[1]);
            const st = roadStyle(b.road_type), w = b.width || st.width; // off-route → grey; road type shown by width/dash/double
            const ln = svg('line', { class: 'vignette-box-dyn vignette-box-junctions', 'data-i': i, x1: px, y1: py, x2: tx, y2: ty, stroke: '#9aa4b2', 'stroke-width': w, 'stroke-linecap': st.dashed ? 'butt' : 'round', 'marker-end': 'url(#vignette-box-tick)', 'stroke-dasharray': st.dashed ? DASH : '' });
            ln.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.select({ type: 'junctions', i }); });
            this.svg.appendChild(ln);
            // motorway: a white centre line splits the thick stroke into a DOUBLE line
            if (st.double) this.svg.appendChild(svg('line', { class: 'vignette-box-dyn', x1: px, y1: py, x2: tx, y2: ty, stroke: '#fff', 'stroke-width': Math.max(3, w * 0.3), 'stroke-linecap': 'round', 'pointer-events': 'none' }));
            if (this.sel && this.sel.type === 'junctions' && this.sel.i === i) {
                this._handle(px, py, (vx, vy) => { const m = this.toM(vx, vy); b.pivot = [r1(m[0]), r1(m[1])]; });
                // tip handle sits just BEYOND the end tick so your finger never covers it.
                const dx = tx - px, dy = ty - py, dl = Math.hypot(dx, dy) || 1;
                this._handle(tx + dx / dl * 11, ty + dy / dl * 11, (vx, vy) => {
                    const ax = vx - px, ay = vy - py, al = Math.hypot(ax, ay) || 1;
                    const m = this.toM(vx - ax / al * 11, vy - ay / al * 11); b.tip = [r1(m[0]), r1(m[1])];
                });
            }
        });
        const danger = dangerMarks(this.note);
        if (danger) { const marks = svg('text', { class: 'vignette-box-dyn vignette-danger', x: 8, y: 40 }); marks.textContent = danger; this.svg.appendChild(marks); }
        // icons
        (this.note.icons || []).forEach((ic, i) => {
            const [cxi, cyi] = this.toV(ic.pos ? ic.pos[0] : 0, ic.pos ? ic.pos[1] : 0);
            const s = ic.size || 32;
            const g = svg('g', { class: 'vignette-box-dyn vignette-box-icon', 'data-i': i, transform: `rotate(${ic.angle || 0} ${cxi} ${cyi})` });
            const im = svg('image', { x: cxi - s / 2, y: cyi - s / 2, width: s, height: s, href: this.resolveIcon(ic), preserveAspectRatio: 'xMidYMid meet' });
            if (ic.flip_x) im.setAttribute('transform', `translate(${2 * cxi} 0) scale(-1 1)`);
            g.appendChild(im);
            g.addEventListener('pointerdown', (e) => this._startDrag(e, (vx, vy) => { const m = this.toM(vx, vy); ic.pos = [r1(m[0]), r1(m[1])]; }, { type: 'icon', i }));
            this.svg.appendChild(g);
            if (this.sel && this.sel.type === 'icon' && this.sel.i === i) {
                this.svg.appendChild(svg('rect', { class: 'vignette-box-dyn', x: cxi - s / 2, y: cyi - s / 2, width: s, height: s, fill: 'none', stroke: '#e8b059', 'stroke-width': 1.2, 'stroke-dasharray': '3 2', transform: `rotate(${ic.angle || 0} ${cxi} ${cyi})`, 'pointer-events': 'none' }));
                // drag the corner to resize (rotation-invariant; the +/- buttons still work too)
                const rh = svg('rect', { class: 'vignette-box-dyn vignette-resize-handle', x: cxi + s / 2 - 5, y: cyi + s / 2 - 5, width: 10, height: 10, rx: 2, fill: '#5aa9ff', stroke: '#0e1116', 'stroke-width': 1.5 });
                rh.addEventListener('pointerdown', (e) => this._startDrag(e, (vx, vy) => { ic.size = clampIconSize(r1(Math.hypot(vx - cxi, vy - cyi) * Math.SQRT2)); }, null));
                this.svg.appendChild(rh);
            }
        });
        this._toolbar();
    }
    _handle(vx, vy, onMove) {
        const h = svg('circle', { class: 'vignette-box-dyn vignette-drag-handle', cx: vx, cy: vy, r: 6, fill: '#e8b059', stroke: '#0e1116', 'stroke-width': 1.5 });
        h.addEventListener('pointerdown', (e) => this._startDrag(e, onMove, null));
        this.svg.appendChild(h);
    }
    _startDrag(e, onMove, selObj) {
        e.stopPropagation(); e.preventDefault();
        if (selObj) this.select(selObj);
        const move = (ev) => { const [vx, vy] = this.evToV(ev); onMove(vx, vy); this.render(); };
        const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); this.onChange(); };
        window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    }
    select(sel) { this.sel = sel; this.render(); this.onSelect(this.sel); }

    _toolbar() {
        const t = this.toolbarEl;
        if (!this.sel) { t.innerHTML = ''; return; }
        if (this.sel.type === 'icon') {
            const ic = this.note.icons[this.sel.i];
            t.innerHTML = btn('fa-magnifying-glass-minus', 'sz-') + btn('fa-magnifying-glass-plus', 'sz+')
                + btn('fa-rotate-left', 'rot-') + btn('fa-rotate-right', 'rot+')
                + btn('fa-left-right', 'flip', ic.flip_x) + btn('fa-trash-can', 'del', false, true);
            t.querySelector('[data-a="sz-"]').onclick = () => { ic.size = clampIconSize((ic.size || 32) - 4); this._chg(); };
            t.querySelector('[data-a="sz+"]').onclick = () => { ic.size = clampIconSize((ic.size || 32) + 4); this._chg(); };
            t.querySelector('[data-a="rot-"]').onclick = () => { ic.angle = (ic.angle || 0) - 15; this._chg(); };
            t.querySelector('[data-a="rot+"]').onclick = () => { ic.angle = (ic.angle || 0) + 15; this._chg(); };
            t.querySelector('[data-a="flip"]').onclick = () => { ic.flip_x = !ic.flip_x; this._chg(); };
            t.querySelector('[data-a="del"]').onclick = () => { this.note.icons.splice(this.sel.i, 1); this.sel = null; this._chg(); };
        } else {
            const b = this.note.junctions[this.sel.i], rtLabel = RBt('Road type');
            t.innerHTML = `<select class="vignette-box-rt" title="${rtLabel}" aria-label="${rtLabel}">${RB.ROAD_TYPES.map((r, k) => `<option value="${k}" ${k === b.road_type ? 'selected' : ''}>${RBt(RT_LABELS[k])}</option>`).join('')}</select>`
                + btn('fa-minus', 'th-') + btn('fa-plus', 'th+') + btn('fa-trash-can', 'del', false, true);
            t.querySelector('.vignette-box-rt').onchange = (e) => { b.road_type = +e.target.value; b.width = roadStyle(b.road_type).width; this._chg(); };
            t.querySelector('[data-a="th-"]').onclick = () => { b.width = Math.max(1, (b.width || 3) - 1); this._chg(); };
            t.querySelector('[data-a="th+"]').onclick = () => { b.width = Math.min(10, (b.width || 3) + 1); this._chg(); };
            t.querySelector('[data-a="del"]').onclick = () => { this.note.junctions.splice(this.sel.i, 1); this.sel = null; this._chg(); };
        }
    }
    _chg() { this.render(); this.onChange(); this.onSelect(this.sel); }

    /* ---- public API ---- */
    addIcon(ic) { this.note.icons.push(ic); this.sel = { type: 'icon', i: this.note.icons.length - 1 }; this._chg(); }
    addJunction() {
        this.note.junctions = this.note.junctions || [];
        const roadType = this.note.road_type_out ?? 3;
        this.note.junctions.push({ pivot: [0, 0], tip: [45, 25], width: roadStyle(roadType).width, road_type: roadType });
        this.sel = { type: 'junctions', i: this.note.junctions.length - 1 }; this._chg();
    }
};
/* Static, read-only render of a note's vignette as an SVG string — used by the
 * Reader and the challenge page to show each note exactly as designed. */
window.NoteCanvas.toSVG = function (note, resolveIcon) {
    const W = 230, H = 162, cx = W / 2, cy = H / 2;
    const toV = (px, py) => [cx + px, cy - py];
    resolveIcon = resolveIcon || ((ic) => ic.name);
    // A `cover` icon IS the whole vignette (an opaque imported tulip — e.g. OpenRally):
    // render it full-box and nothing else (no generated trunk/junctions). The danger marks
    // are skipped too, since the imported drawing already bakes them in.
    const cover = (note.icons || []).find((ic) => ic.cover);
    if (cover) return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`
        + `<image x="0" y="0" width="${W}" height="${H}" href="${resolveIcon(cover)}" preserveAspectRatio="xMidYMid meet"/></svg>`;
    let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`
        + `<defs><marker id="vig-arr" viewBox="0 0 10 10" refX="8" refY="5" markerUnits="userSpaceOnUse" markerWidth="33" markerHeight="33" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="context-stroke"/></marker>`
        + `<marker id="vig-tick" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="2" markerHeight="2" orient="auto"><path d="M5 0 L5 10" stroke="context-stroke" stroke-width="2" fill="none"/></marker></defs>`;
    trunkSegments(note).forEach((g) => {
        s += `<line x1="${g.x1}" y1="${g.y1}" x2="${g.x2}" y2="${g.y2}" stroke="${g.color}" stroke-width="${g.width}" stroke-linecap="${g.dashed ? 'butt' : 'round'}"${g.arrow ? ' marker-end="url(#vig-arr)"' : ''}${g.dashed ? ' stroke-dasharray="' + DASH + '"' : ''}/>`;
        if (g.double) s += `<line x1="${g.x1}" y1="${g.y1}" x2="${g.x2}" y2="${g.y2}" stroke="#fff" stroke-width="${Math.max(3, g.width * 0.3)}" stroke-linecap="round"/>`; // motorway: white centre → double line
    });
    s += `<circle cx="${cx}" cy="${cy}" r="6" fill="#fff" stroke="#0e1116" stroke-width="2.5"/>`; // validation point (where the trunk segments meet)
    (note.junctions || []).forEach((b) => {
        const [px, py] = toV(b.pivot[0], b.pivot[1]), [tx, ty] = toV(b.tip[0], b.tip[1]);
        const st = roadStyle(b.road_type), w = b.width || st.width;
        s += `<line x1="${px}" y1="${py}" x2="${tx}" y2="${ty}" stroke="#9aa4b2" stroke-width="${w}" stroke-linecap="${st.dashed ? 'butt' : 'round'}" marker-end="url(#vig-tick)"${st.dashed ? ' stroke-dasharray="' + DASH + '"' : ''}/>`;
        if (st.double) s += `<line x1="${px}" y1="${py}" x2="${tx}" y2="${ty}" stroke="#fff" stroke-width="${Math.max(3, w * 0.3)}" stroke-linecap="round"/>`; // motorway double
    });
    (note.icons || []).forEach((ic) => {
        const [cxi, cyi] = toV(ic.pos ? ic.pos[0] : 0, ic.pos ? ic.pos[1] : 0), sz = ic.size || 32;
        const flip = ic.flip_x ? ` transform="translate(${2 * cxi} 0) scale(-1 1)"` : '';
        s += `<g transform="rotate(${ic.angle || 0} ${cxi} ${cyi})"><image x="${cxi - sz / 2}" y="${cyi - sz / 2}" width="${sz}" height="${sz}" href="${resolveIcon(ic)}"${flip} preserveAspectRatio="xMidYMid meet"/></g>`;
    });
    // Danger marks carry their own presentation attributes so the SVG is fully
    // self-contained (renders identically standalone — PDF — and inside the DOM).
    const danger = dangerMarks(note);
    if (danger) s += `<text x="8" y="40" fill="#e01414" font-family="system-ui,-apple-system,sans-serif" font-weight="900" font-size="38" letter-spacing="2">${danger}</text>`;
    return s + '</svg>';
};

/* FIA-style danger grading: the note's `danger` (1-3) renders as '!' / '!!' /
 * '!!!' in red INSIDE the diagram box (top-left), never in the text column. */
function dangerMarks(note) { const d = note.danger | 0; return d > 0 ? '!'.repeat(Math.min(d, 3)) : ''; }
/* The tulip trunk: the road you arrive FROM always enters straight from the
 * bottom edge to the box centre (styled by road_type_in). The road you leave ON
 * exits from the centre with an arrow, auto-oriented to the real turn — its
 * angle is (bearing_out − bearing_in), i.e. the heading change across the three
 * track points (previous · note · next), so the diagram already shows the
 * direction to follow (straight up = carry on, right = turn right, …). Styled by
 * road_type_out. Junction vectors branch from the centre. Widths step up clearly
 * so the road type reads from thickness alone: off-piste = thin dashed, track =
 * medium, asphalt = thick, motorway = thickest DOUBLE line. Colours stay the RB
 * System palette (RB.ROAD_TYPES.color), only the thickness/dash/double encode type. */
// tulip road rendering per type (independent of the map's ROAD_TYPES line widths)
const ROAD_STYLE = {
    0: { width: 6, dashed: false, double: false },  // default: medium line
    1: { width: 14, dashed: false, double: true },  // motorway: thickest DOUBLE line
    2: { width: 11, dashed: false, double: false }, // asphalt: thick single line
    3: { width: 8, dashed: false, double: false },  // track: medium-thick single line
    4: { width: 5, dashed: true, double: false },   // off-piste: thin dashed line
};
const roadStyle = (rt) => ROAD_STYLE[rt] || ROAD_STYLE[3];
// off-piste dash: red dash 12 / white gap 9. Dashed lines use butt caps — round caps would
// swallow the gap at these widths. One source for all render spots.
const DASH = '12 9';
function trunkSegments(note) {
    const cx = 115, cy = 81, L = 63; // centre of the 230×162 reference box; exit length
    const seg = (roadType, x1, y1, x2, y2, arrow, onRoute) => {
        const st = roadStyle(roadType);
        // ONLY the route to follow is coloured by its road type (default 0 = grey); off-route stays grey
        return { x1, y1, x2, y2, color: onRoute ? (RB.ROAD_TYPES[roadType] || RB.ROAD_TYPES[0]).color : '#9aa4b2', width: st.width, dashed: st.dashed, double: st.double, arrow };
    };
    const turn = ((((note.bearing_out || 0) - (note.bearing_in || 0)) % 360) + 360) % 360;
    const θ = turn * Math.PI / 180; // 0 = straight up; clockwise like a compass
    return [
        // incoming (provenance): styled by road_type_in — which normalizeRoadTypes
        // derives from the PREVIOUS note's road_type_out — and coloured by road type
        // like the rest of the route, except on the first note (no real provenance → grey).
        seg(note.road_type_in, cx, 154, cx, cy, false, note.num > 1),
        seg(note.road_type_out, cx, cy, cx + Math.sin(θ) * L, cy - Math.cos(θ) * L, true, true),
    ];
}
function svg(tag, attrs) { const e = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; }
const RT_LABELS = ['Default', 'Motorway', 'Asphalt', 'Track', 'Off-piste']; // road-type names, by RB.ROAD_TYPES index
const BTN_LABELS = { 'sz-': 'Smaller', 'sz+': 'Bigger', 'rot-': 'Rotate left', 'rot+': 'Rotate right', flip: 'Flip', del: 'Delete', 'th-': 'Thinner', 'th+': 'Thicker' };
function btn(icon, action, active, danger) {
    const label = window.RBt ? RBt(BTN_LABELS[action] || action) : (BTN_LABELS[action] || action);
    return `<button type="button" data-a="${action}" class="${active ? 'on' : ''} ${danger ? 'danger' : ''}" aria-label="${label}" title="${label}"><i class="fa-solid ${icon}"></i></button>`;
}
function r1(n) { return Math.round(n); }
function clampIconSize(n) { return Math.max(10, Math.min(120, n)); }
})();
