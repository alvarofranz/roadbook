'use strict';
/* NoteCanvas — visual editor for a note's vignette: icons that drag, scale,
 * rotate and flip, plus junction vectors you can draw and drag. Reference box
 * 230×162 (+y up, relative to the centre), matching the roadbook model. All
 * SVG (auto-scales). The toolbar lives OUTSIDE the canvas (opts.toolbarEl).
 * Accepts icons dropped from the palette (drag & drop) as well as click-to-add. */
window.NoteCanvas = class NoteCanvas {
    constructor(container, opts = {}) {
        this.REF_W = 230; this.REF_H = 162;
        this.el = container;
        this.onChange = opts.onChange || (() => {});
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
        defs.innerHTML = `<marker id="vignette-box-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="context-stroke"></path></marker>`;
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
        if (note) { note.icons = note.icons || []; note.junctions = note.junctions || []; }
        this.sel = null; this.render();
    }
    onDropIcon(cb) { this._onDrop = cb; }

    render() {
        [...this.svg.querySelectorAll('.vignette-box-dyn')].forEach((n) => n.remove());
        if (!this.note) { this.toolbarEl.innerHTML = ''; return; }
        this.svg.appendChild(svg('rect', { class: 'vignette-box-dyn vignette-box-bg', x: 0, y: 0, width: this.REF_W, height: this.REF_H, fill: 'transparent' }));
        trunkSegments(this.note).forEach((s) => {
            const attrs = { class: 'vignette-box-dyn', x1: s.x, y1: s.y1, x2: s.x, y2: s.y2, stroke: s.color, 'stroke-width': s.width, 'stroke-linecap': 'round', 'stroke-dasharray': s.dashed ? '6 4' : '' };
            if (s.arrow) attrs['marker-end'] = 'url(#vignette-box-arrow)';
            this.svg.appendChild(svg('line', attrs));
        });
        // junctions
        (this.note.junctions || []).forEach((b, i) => {
            const [px, py] = this.toV(b.pivot[0], b.pivot[1]);
            const [tx, ty] = this.toV(b.tip[0], b.tip[1]);
            const rt = RB.ROAD_TYPES[b.road_type] || RB.ROAD_TYPES[3];
            const ln = svg('line', { class: 'vignette-box-dyn vignette-box-junctions', 'data-i': i, x1: px, y1: py, x2: tx, y2: ty, stroke: rt.color, 'stroke-width': b.width || 3, 'stroke-linecap': 'round', 'marker-end': 'url(#vignette-box-arrow)', 'stroke-dasharray': rt.dashed ? '6 4' : '' });
            ln.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.select({ type: 'junctions', i }); });
            this.svg.appendChild(ln);
            if (this.sel && this.sel.type === 'junctions' && this.sel.i === i) {
                this._handle(px, py, (vx, vy) => { const m = this.toM(vx, vy); b.pivot = [r1(m[0]), r1(m[1])]; });
                // tip handle sits just BEYOND the arrowhead so your finger never covers it.
                const dx = tx - px, dy = ty - py, dl = Math.hypot(dx, dy) || 1;
                this._handle(tx + dx / dl * 11, ty + dy / dl * 11, (vx, vy) => {
                    const ax = vx - px, ay = vy - py, al = Math.hypot(ax, ay) || 1;
                    const m = this.toM(vx - ax / al * 11, vy - ay / al * 11); b.tip = [r1(m[0]), r1(m[1])];
                });
            }
        });
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
    select(sel) { this.sel = sel; this.render(); }

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
            const b = this.note.junctions[this.sel.i];
            t.innerHTML = `<select class="vignette-box-rt" title="Road type">${RB.ROAD_TYPES.map((r, k) => `<option value="${k}" ${k === b.road_type ? 'selected' : ''}>${['Default', 'Motorway', 'Asphalt', 'Track', 'Off-piste'][k]}</option>`).join('')}</select>`
                + btn('fa-minus', 'th-') + btn('fa-plus', 'th+') + btn('fa-trash-can', 'del', false, true);
            t.querySelector('.vignette-box-rt').onchange = (e) => { b.road_type = +e.target.value; this._chg(); };
            t.querySelector('[data-a="th-"]').onclick = () => { b.width = Math.max(1, (b.width || 3) - 1); this._chg(); };
            t.querySelector('[data-a="th+"]').onclick = () => { b.width = Math.min(10, (b.width || 3) + 1); this._chg(); };
            t.querySelector('[data-a="del"]').onclick = () => { this.note.junctions.splice(this.sel.i, 1); this.sel = null; this._chg(); };
        }
    }
    _chg() { this.render(); this.onChange(); }

    /* ---- public API ---- */
    addIcon(ic) { this.note.icons.push(ic); this.sel = { type: 'icon', i: this.note.icons.length - 1 }; this._chg(); }
    addJunction() {
        this.note.junctions = this.note.junctions || [];
        const roadType = this.note.road_type_out ?? 3;
        this.note.junctions.push({ pivot: [0, 0], tip: [45, 25], width: (RB.ROAD_TYPES[roadType] || RB.ROAD_TYPES[3]).width, road_type: roadType });
        this.sel = { type: 'junctions', i: this.note.junctions.length - 1 }; this._chg();
    }
};
/* Static, read-only render of a note's vignette as an SVG string — used by the
 * Reader and the challenge page to show each note exactly as designed. */
window.NoteCanvas.toSVG = function (note, resolveIcon) {
    const W = 230, H = 162, cx = W / 2, cy = H / 2;
    const toV = (px, py) => [cx + px, cy - py];
    resolveIcon = resolveIcon || ((ic) => ic.name);
    let s = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">`
        + `<defs><marker id="vig-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="context-stroke"/></marker></defs>`;
    trunkSegments(note).forEach((g) => {
        s += `<line x1="${g.x}" y1="${g.y1}" x2="${g.x}" y2="${g.y2}" stroke="${g.color}" stroke-width="${g.width}" stroke-linecap="round"${g.arrow ? ' marker-end="url(#vig-arr)"' : ''}${g.dashed ? ' stroke-dasharray="6 4"' : ''}/>`;
    });
    (note.junctions || []).forEach((b) => {
        const [px, py] = toV(b.pivot[0], b.pivot[1]), [tx, ty] = toV(b.tip[0], b.tip[1]);
        const rt = RB.ROAD_TYPES[b.road_type] || RB.ROAD_TYPES[3];
        s += `<line x1="${px}" y1="${py}" x2="${tx}" y2="${ty}" stroke="${rt.color}" stroke-width="${b.width || 3}" stroke-linecap="round" marker-end="url(#vig-arr)"${rt.dashed ? ' stroke-dasharray="6 4"' : ''}/>`;
    });
    (note.icons || []).forEach((ic) => {
        const [cxi, cyi] = toV(ic.pos ? ic.pos[0] : 0, ic.pos ? ic.pos[1] : 0), sz = ic.size || 32;
        const flip = ic.flip_x ? ` transform="translate(${2 * cxi} 0) scale(-1 1)"` : '';
        s += `<g transform="rotate(${ic.angle || 0} ${cxi} ${cyi})"><image x="${cxi - sz / 2}" y="${cyi - sz / 2}" width="${sz}" height="${sz}" href="${resolveIcon(ic)}"${flip} preserveAspectRatio="xMidYMid meet"/></g>`;
    });
    return s + '</svg>';
};

/* 3-column note row content (total/partial+number · vignette · comments) — the
 * public challenge page's canonical layout. */
window.NoteCanvas.rowCols = function (n, iconSrc) {
    const esc = RBesc;
    const cap = n.cap != null ? `<div class="cap-indicator">CAP ${Math.round(n.cap)}°${n.cap_distance != null ? '<br>km ' + (n.cap_distance / 1000).toFixed(2) : ''}</div>` : '';
    const bearing = (n.cap == null && n.bearing_out != null && n.num > 1) ? `<div class="bearing">${Math.round(n.bearing_out)}°</div>` : '';
    return `<div class="col-left">
            <div class="dist-total">${((n.distance ?? 0) / 1000).toFixed(2)}</div>
            <div class="dist-partial">${((n.partial_distance ?? 0) / 1000).toFixed(2)}</div>
            <div class="note-num">${n.num}</div>${bearing}
        </div>
        <div class="col-center">${window.NoteCanvas.toSVG(n, iconSrc)}</div>
        <div class="col-right">
            <div class="text">${esc(n.text || '')}</div>${cap}
            <div class="coords">${(+n.lat).toFixed(5)}<br>${(+n.lon).toFixed(5)}</div>
        </div>`;
};

/* The tulip trunk: the road you arrive FROM always enters from the bottom edge
 * to the box centre (styled by road_type_in) and the road you leave ON exits
 * from the centre to the top arrow (styled by road_type_out). Junction vectors
 * branch from the centre. Stroke width is indicative of the road type. */
function trunkSegments(note) {
    const cx = 115, cy = 81; // centre of the 230×162 reference box
    const seg = (roadType, y1, y2, arrow) => {
        const rt = RB.ROAD_TYPES[roadType] || RB.ROAD_TYPES[0];
        return { x: cx, y1, y2, color: rt.color, width: rt.width, dashed: rt.dashed, arrow };
    };
    return [seg(note.road_type_in, 154, cy, false), seg(note.road_type_out, cy, 18, true)];
}
function svg(tag, attrs) { const e = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; }
function btn(icon, action, active, danger) { return `<button data-a="${action}" class="${active ? 'on' : ''} ${danger ? 'danger' : ''}"><i class="fa-solid ${icon}"></i></button>`; }
function r1(n) { return Math.round(n); }
function clampIconSize(n) { return Math.max(10, Math.min(120, n)); }
