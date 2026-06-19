'use strict';
/* Roadbook Editor — the creation/editing hub. Imports GPX (→ roadbook), loads
 * an .rdbk file or a Challenge, records or draws a route, edits notes (text,
 * road type, danger, CAP, icons). The GPX itself is edited ON the map via the
 * tool bar (add note · draw · cut · add GPX · reverse · simplify · adjust on
 * the trail), with undo/redo; whatever the source pieces, the route is always
 * kept as ONE continuous track. Exports a SELF-CONTAINED roadbook (icons
 * embedded → a single portable .rdbk file) or a plain GPX. Unsaved work is
 * checkpointed to localStorage and offered for recovery on the next visit. */
(function () {
    const $ = (id) => document.getElementById(id);
    const t = RBt, esc = RBesc, toast = RBToast; // shared helpers (app.js / i18n.js)
    const RT = ['Default', 'Motorway', 'Asphalt', 'Track', 'Off-piste'];
    // base map style: satellite photo, or terrain (detailed off-road tracks + contours).
    // The style URLs live in ONE place — RBMap (shared with the Reader's layer toggle).
    const MAP_STYLES = { satellite: RBMap.STYLE_SATELLITE, terrain: RBMap.STYLE_TOPO };
    let mapStyle = localStorage.getItem('rb_map_style') === 'terrain' ? 'terrain' : 'satellite';
    const map = new RBMap('edMap', { zoom: 13, style: MAP_STYLES[mapStyle] });
    // Right-click anywhere on the map → a popup: a Google Maps link + "upload a photo here".
    let ctxPhotoPoint = null; // the map point a context-menu photo upload is geotagged at
    if (map.map) map.map.on('contextmenu', (e) => {
        e.preventDefault();
        const here = { lat: e.lngLat.lat, lon: e.lngLat.lng };
        const lat = here.lat.toFixed(6), lon = here.lon.toFixed(6);
        const url = `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
        const popup = new maplibregl.Popup({ closeButton: true, closeOnClick: true, offset: 8 })
            .setLngLat(e.lngLat)
            .setHTML(`<a class="map-ctx-link" href="${url}" target="_blank" rel="noopener"><i class="fa-solid fa-map-location-dot"></i> ${esc(t('Open in Google Maps'))}</a>`
                + `<button type="button" class="map-ctx-link map-ctx-photo"><i class="fa-solid fa-camera"></i> ${esc(t('Upload a photo here'))}</button>`
                + `<span class="map-ctx-coords">${lat}, ${lon}</span>`)
            .addTo(map.map);
        const btn = popup.getElement().querySelector('.map-ctx-photo');
        if (btn) btn.onclick = () => {
            if (!(currentRbId > 0)) return toast('Save to your profile first.');
            ctxPhotoPoint = here; popup.remove(); $('ctxPhotoFile').click();
        };
    });
    let rb = null, sel = 0, std = null, dirty = false, exported = false, editorOpen = false, vertRaf = 0;
    // draft checkpoint: every edit schedules a debounced write of the whole working
    // state; cleared once the work is safe (saved to profile or exported)
    const DRAFT_KEY = 'rb_editor_draft';
    let draftTimer = null;
    const saveDraft = () => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ rb, currentRbId, isPublic, gaps })); } catch (e) {} };
    const clearDraft = () => { clearTimeout(draftTimer); try { localStorage.removeItem(DRAFT_KEY); } catch (e) {} };
    const markDirty = () => { dirty = true; exported = false; updateSaveBtn(); clearTimeout(draftTimer); draftTimer = setTimeout(saveDraft, 2000); histPush(); };
    function updateSaveBtn() {
        const b = $('saveAccount'); if (!b) return;
        if (!meUser) { b.innerHTML = `<i class="fa-solid fa-right-to-bracket"></i> ${esc(t('Save'))}`; b.classList.add('btn-primary'); return; }
        if (currentRbId && !dirty) { b.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${esc(t('Saved'))}`; b.classList.remove('btn-primary'); }
        else { b.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> ${esc(t('Save'))}`; b.classList.add('btn-primary'); }
    }
    const mkIcon = (name, pos) => ({ name, pos, angle: 0, size: 32, flip_x: false });
    // bare note anchored at track index `idx` — recomputeMetrics fills in the rest
    const makeNote = (r, idx, roadType) => ({ num: 0, idx, distance: 0, partial_distance: 0, lat: r.track[idx].lat, lon: r.track[idx].lon, text: '', cap: null, cap_distance: null, bearing_in: 0, bearing_out: 0, road_type_in: roadType, road_type_out: roadType, junctions: null, icons: [] });
    const canvas = new NoteCanvas($('noteCanvas'), { toolbarEl: $('noteToolbar'), onChange: () => markDirty(), resolveIcon: (ic) => RB.iconSrc(ic, rb, '../assets/icons/') });
    canvas.onDropIcon((name, pos) => canvas.addIcon(mkIcon(name, pos)));
    $('addJunction').onclick = () => { if (!rb) return toast('Load a roadbook first.'); canvas.addJunction(); };

    map.onWaypoint((i) => { if (mapTool === 'pan') select(i); }); // other tools keep you on the map
    if (map.map) map.map.on('click', (e) => {
        if (!map.ready || recWatch != null) return; // never edit mid-recording
        const here = { lat: e.lngLat.lat, lon: e.lngLat.lng };
        if (photoPlacing) { placePhotoHere(here); return; } // setting the position of a photo with no EXIF GPS
        if (map.map.queryRenderedFeatures(e.point, { layers: ['rb-wpts'] }).length) return;
        if (mapTool === 'note') { if (rb) addWaypointNear(here); else toast('Load a roadbook first.'); }
        else if (mapTool === 'draw') drawPoint(here);
        else if (mapTool === 'insert') { if (rb) insertMidpoint(here); else toast('Load a roadbook first.'); }
        else if (mapTool === 'cut') cutPoint(here);
    });

    /* ---------- move points: drag any track vertex to reshape the route ---------- */
    // Live drag updates the dragged point (rAF-coalesced repaint of the line +
    // handles); the metrics/notes recompute once, on release.
    function onVertexDrag(i, lat, lon) {
        if (!rb || i < 0 || i >= rb.track.length) return;
        rb.track[i] = { lat: RB.round6(lat), lon: RB.round6(lon) };
        if (vertRaf) return;
        vertRaf = requestAnimationFrame(() => { vertRaf = 0; refreshMap(true); map.refreshVertices(rb.track); });
    }
    function onVertexCommit() {
        RB.recomputeMetrics(rb); RB.recomputeCaps(rb);
        refreshMap(true); map.refreshVertices(rb.track); renderNotes();
        if (editorOpen) { renderEditor(); canvas.setNote(rb.notes[sel]); map.select(rb.notes[sel], true); }
        markDirty();
    }

    /* ---------- map tool bar: the GPX is edited right on the map ---------- */
    // Open cuts: a cut in the middle leaves a real hole — stored as the pair of
    // edge POINTS (so it survives index shifts of any route op) and resolved to
    // adjacent track indexes on demand; dead gaps prune themselves. The hole is
    // filled by drawing, or it closes as a straight line on export/save.
    let gaps = [];
    const samePoint = (p, q) => Math.abs(p.lat - q.lat) < 1e-9 && Math.abs(p.lon - q.lon) < 1e-9;
    function resolveGaps() {
        const resolved = [];
        if (!rb) { gaps = []; return resolved; }
        gaps = gaps.filter((g) => {
            for (let i = 0; i < rb.track.length - 1; i++) {
                const straight = samePoint(rb.track[i], g.a) && samePoint(rb.track[i + 1], g.b);
                const flipped = samePoint(rb.track[i], g.b) && samePoint(rb.track[i + 1], g.a);
                if (straight || flipped) {
                    if (flipped) { const a = g.a; g.a = g.b; g.b = a; } // re-normalise after a reverse
                    resolved.push({ i, g });
                    return true;
                }
            }
            return false;
        });
        return resolved;
    }
    const gapIdxs = () => resolveGaps().map((x) => x.i);
    const refreshMap = (noFit) => map.showRoadbook(rb, noFit, gapIdxs());
    async function confirmOpenCuts() {
        if (!resolveGaps().length) return true;
        return RBConfirm(t('The route has open cuts — they will close as straight lines. Continue?'), t('Continue'));
    }
    // mode tools (pan · add note · draw · move points · cut) are exclusive toggles; the rest are one-shot
    let mapTool = 'pan', cutFromIdx = -1, drawSeed = [];
    const MODE_TOOLS = ['toolPan', 'toolNote', 'toolDraw', 'toolPoints', 'toolInsert', 'toolCut'];
    function setMapTool(tool) {
        mapTool = tool; cutFromIdx = -1; drawSeed = []; map.setPin(null);
        MODE_TOOLS.forEach((id) => $(id).classList.toggle('on', $(id).dataset.tool === tool));
        map.setCursor(tool === 'pan' || tool === 'points' ? '' : 'crosshair'); // points shows a per-handle grab cursor
        if (tool === 'points' && rb) map.setVertexEditor(rb.track, onVertexDrag, onVertexCommit);
        else map.setVertexEditor(null);
        placeMainEditMarker(); // the reposition marker rides the Pan tool only
    }
    MODE_TOOLS.forEach((id) => $(id).onclick = () => setMapTool($(id).dataset.tool));
    // translated hover tooltips (refreshed on language switch)
    function applyToolTips() {
        const tips = {
            toolPan: 'Navigate', toolNote: 'Add note (tap the route)', toolDraw: 'Draw route (tap to extend)',
            toolPoints: 'Move points (drag any track point)', toolInsert: 'Insert a point (tap a segment — adds its midpoint)',
            toolCut: 'Cut (tap two points)', toolAddGpx: 'Add a GPX track', toolReverse: 'Reverse direction',
            toolSimplify: 'Simplify (remove GPS noise)', toolAdjust: 'Adjust on the trail (live GPS)',
            undoBtn: 'Undo (Ctrl+Z)', redoBtn: 'Redo (Ctrl+Y)',
            toolLayers: 'Satellite / terrain map',
        };
        // the same translated string drives the hover tooltip AND the screen-reader name
        Object.entries(tips).forEach(([id, key]) => { const v = t(key); $(id).setAttribute('data-tip', v); $(id).setAttribute('aria-label', v); });
    }
    applyToolTips();
    // re-render translated UI (tooltips + dynamic note list/editor/save button) on language change
    window.addEventListener('rb-lang', () => {
        applyToolTips();
        if (rb) { renderNotes(); renderIcons(); updateSaveBtn(); if (editorOpen) { renderEditor(); canvas.render(); } }
    });
    $('toolLayers').onclick = () => {
        mapStyle = mapStyle === 'satellite' ? 'terrain' : 'satellite';
        try { localStorage.setItem('rb_map_style', mapStyle); } catch (e) {}
        map.setBaseStyle(MAP_STYLES[mapStyle], () => {
            if (recWatch != null) { map.setLiveTrack(recTrack, recWpts, recPhotos); return; } // repaint a live recording
            if (rb) { refreshMap(true); map.select(rb.notes[sel], true); placeMainEditMarker(); } // setStyle wiped the selection layer
            if (currentRbId > 0) loadPhotos();
        });
    };
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMapTool('pan'); });
    // Draw mode: every tap extends the route from the nearest OPEN end — the
    // finish, the start, or either edge of an open cut (tapping on the opposite
    // edge closes the cut). With nothing loaded, the first two taps create a
    // fresh roadbook (start/end notes ride the growing track).
    const nearOnScreen = (q, p) => {
        if (!map.map) return RB.geo.haversineM(q, p) < 20;
        const A = map.map.project([q.lon, q.lat]), B = map.map.project([p.lon, p.lat]);
        return Math.hypot(A.x - B.x, A.y - B.y) < 16;
    };
    function drawPoint(p) {
        const pt = { lat: RB.round6(p.lat), lon: RB.round6(p.lon) };
        if (!rb) {
            drawSeed.push(pt); map.setPin(drawSeed[0]);
            if (drawSeed.length === 2) {
                const seed = drawSeed;
                resetIdentity(); setRoadbook(RB.buildRoadbook({ name: t('Drawn route'), trkpts: seed }));
                markDirty(); setMapTool('draw'); // stay in draw mode to keep sketching
            }
            return;
        }
        const D = RB.geo.haversineM, last = rb.track.length - 1;
        const candidates = [
            { d: D(rb.track[last], pt), apply: () => { // extend the finish; its note rides the tip
                rb.track.push(pt);
                const endNote = rb.notes[rb.notes.length - 1];
                if (endNote && endNote.idx === last) endNote.idx = rb.track.length - 1;
            } },
            { d: D(rb.track[0], pt), apply: () => { // extend the start; its note rides the tip
                rb.track.unshift(pt);
                rb.notes.forEach((n) => { n.idx++; });
                const startNote = rb.notes[0];
                if (startNote && startNote.idx === 1) startNote.idx = 0;
            } },
        ];
        resolveGaps().forEach(({ i, g }) => {
            const intoGap = (fromA) => () => {
                const opposite = fromA ? rb.track[i + 1] : rb.track[i];
                if (nearOnScreen(opposite, pt)) { gaps.splice(gaps.indexOf(g), 1); toast('Cut closed.'); return; }
                rb.track.splice(i + 1, 0, pt);
                if (fromA) g.a = pt; else g.b = pt;
                rb.notes.forEach((n) => { if (n.idx > i) n.idx++; });
            };
            candidates.push({ d: D(rb.track[i], pt), apply: intoGap(true) });
            candidates.push({ d: D(rb.track[i + 1], pt), apply: intoGap(false) });
        });
        candidates.sort((x, y) => x.d - y.d)[0].apply();
        RB.recomputeMetrics(rb); RB.recomputeCaps(rb);
        refreshMap(true); renderNotes(); markDirty();
    }
    // Track index exactly at the tapped position: when the tap lands between two
    // points, the nearest segment is split there with a new point — you cut and
    // place notes ANYWHERE on the route, not just on existing vertices. The
    // dashed connector of an open cut is never split (it is not a real segment).
    function splitTrackAt(p) {
        const hit = RB.nearestOnTrack(rb.track, p);
        if (!hit) return RB.nearestIdx(rb.track, p);
        if (new Set(gapIdxs()).has(hit.i)) return hit.t < 0.5 ? hit.i : hit.i + 1;
        if (hit.t < 0.001) return hit.i;
        if (hit.t > 0.999) return hit.i + 1;
        rb.track.splice(hit.i + 1, 0, { lat: hit.lat, lon: hit.lon });
        rb.notes.forEach((n) => { if (n.idx > hit.i) n.idx++; });
        if (cutFromIdx > hit.i) cutFromIdx++; // keep a pending first cut anchored
        return hit.i + 1;
    }
    // Insert-point tool: tap a segment and a new vertex is born at its MIDPOINT,
    // ready to drag with "move points". The dashed connector of an open cut is skipped.
    function insertMidpoint(p) {
        const hit = RB.nearestOnTrack(rb.track, p);
        if (!hit) return toast('Tap on the route to insert a point.');
        if (new Set(gapIdxs()).has(hit.i)) return toast('Cannot insert on an open cut.');
        const a = rb.track[hit.i], b = rb.track[hit.i + 1];
        rb.track.splice(hit.i + 1, 0, { lat: RB.round6((a.lat + b.lat) / 2), lon: RB.round6((a.lon + b.lon) / 2) });
        rb.notes.forEach((n) => { if (n.idx > hit.i) n.idx++; });
        RB.recomputeMetrics(rb); RB.recomputeCaps(rb);
        refreshMap(true); renderNotes(); markDirty();
        toast('Point inserted.');
    }
    // Cut mode: tap two points — at the ends it trims; in the middle it removes
    // the span and leaves an OPEN cut (dashed connector) to fill by drawing.
    function cutPoint(p) {
        if (!rb) return toast('Load a roadbook first.');
        const idx = splitTrackAt(p);
        if (cutFromIdx < 0) { cutFromIdx = idx; map.setPin(rb.track[idx]); toast('Now tap the other end of the cut.'); return; }
        const a = Math.min(cutFromIdx, idx), b = Math.max(cutFromIdx, idx);
        cutFromIdx = -1; map.setPin(null);
        if (b - a < 1) return toast('Nothing to cut.');
        if (a === 0 && b === rb.track.length - 1) return toast('Nothing would remain.');
        let toastMsg = 'Cut applied · metrics recomputed.';
        if (a === 0) { // trim the head
            rb.track = rb.track.slice(b);
            rb.notes = rb.notes.filter((n) => n.idx >= b);
            rb.notes.forEach((n) => { n.idx -= b; });
        } else if (b === rb.track.length - 1) { // trim the tail
            rb.track = rb.track.slice(0, a + 1);
            rb.notes = rb.notes.filter((n) => n.idx <= a);
        } else { // interior span → a real hole
            rb.track.splice(a + 1, b - a - 1);
            rb.notes = rb.notes.filter((n) => n.idx <= a || n.idx >= b);
            rb.notes.forEach((n) => { if (n.idx >= b) n.idx -= b - a - 1; });
            gaps.push({ a: rb.track[a], b: rb.track[a + 1] });
            toastMsg = 'Cut open — draw to fill it, or it closes straight on export.';
        }
        const last = rb.track.length - 1;
        if (!rb.notes.some((n) => n.idx === 0)) rb.notes.push(makeNote(rb, 0, roadOutBefore(0)));
        if (!rb.notes.some((n) => n.idx === last)) rb.notes.push(makeNote(rb, last, roadOutBefore(last)));
        RB.recomputeMetrics(rb); RB.recomputeCaps(rb);
        sel = 0; routeChanged(toastMsg);
    }
    // Add GPX: if both ends of the piece touch the route it offers a detour
    // (replace the matching segment); otherwise it joins the piece to the nearest
    // end, auto-orienting it. Either way the route stays ONE track.
    $('toolAddGpx').onclick = () => { if (!rb) return toast('Load a roadbook first.'); $('addGpxFile').click(); };
    $('addGpxFile').onchange = async (e) => {
        const f = e.target.files[0]; e.target.value = '';
        if (!f || !rb) return;
        try { await addGpxTrack(RB.parseGPX(await f.text()).trkpts); } catch (err) { toast('Error: ' + err.message); }
    };
    async function addGpxTrack(trkpts) {
        if (!trkpts || trkpts.length < 2) return toast('The GPX track has too few points.');
        const D = RB.geo.haversineM, NEAR_M = 200;
        const pieceStart = trkpts[0], pieceEnd = trkpts[trkpts.length - 1];
        const iS = RB.nearestIdx(rb.track, pieceStart), iE = RB.nearestIdx(rb.track, pieceEnd);
        if (D(rb.track[iS], pieceStart) < NEAR_M && D(rb.track[iE], pieceEnd) < NEAR_M && Math.abs(iE - iS) > 2) {
            let piece = trkpts, i1 = iS, i2 = iE;
            if (i1 > i2) { piece = trkpts.slice().reverse(); i1 = iE; i2 = iS; }
            if (!(await RBConfirm(t('Both ends of the loaded track touch the route — replace the segment between them?'), t('Replace')))) return;
            spliceByIndex(rb, piece, i1, i2);
            sel = 0; routeChanged('Spliced · metrics recomputed.');
            return;
        }
        const joinAtStart = Math.min(D(rb.track[0], pieceStart), D(rb.track[0], pieceEnd))
            < Math.min(D(rb.track[rb.track.length - 1], pieceStart), D(rb.track[rb.track.length - 1], pieceEnd));
        if (joinAtStart) RB.reverseRoadbook(rb); // join at the start = extend the reversed route
        const anchor = rb.track[rb.track.length - 1];
        extension(rb, D(anchor, pieceStart) <= D(anchor, pieceEnd) ? trkpts : trkpts.slice().reverse());
        RB.recomputeMetrics(rb); RB.recomputeCaps(rb);
        if (joinAtStart) RB.reverseRoadbook(rb);
        sel = 0; routeChanged('Track joined to the route.');
    }
    $('toolReverse').onclick = () => {
        if (!rb) return toast('Load a roadbook first.');
        RB.reverseRoadbook(rb); sel = 0;
        routeChanged('Route reversed — review the vignettes.');
    };
    $('toolSimplify').onclick = () => {
        if (!rb) return toast('Load a roadbook first.');
        const d = RBModal(`<h3>${t('Simplify')}</h3>
            <label class="muted small">${t('Tolerance (metres) — higher removes more points')}</label>
            <input id="simpTol" class="modal-in" type="number" min="0.5" max="50" step="0.5" value="2" inputmode="decimal">
            <p class="muted small">${rb.track.length} ${t('points')}</p>
            <div class="btnrow end spaced"><button class="btn btn-ghost" id="simpX">${t('Cancel')}</button><button class="btn btn-primary" id="simpGo">${t('Apply')}</button></div>`, 'narrow');
        d.q('#simpX').onclick = d.close;
        d.q('#simpGo').onclick = () => {
            const tolerance = Math.max(0.5, Math.min(50, parseFloat(d.q('#simpTol').value) || 2));
            const before = rb.track.length;
            RB.simplifyRoadbook(rb, tolerance);
            d.close(); routeChanged(t('Removed') + ' ' + (before - rb.track.length) + ' ' + t('points') + '.');
        };
    };
    $('toolAdjust').onclick = () => { if (!rb) return toast('Load a roadbook first.'); setMapTool('pan'); startRecording('adjust'); };
    $('drawRoute').onclick = () => { showEditing(); setMapTool('draw'); toast('Tap the map to draw your route.'); };

    /* ---------- loading ---------- */
    $('loadGpx').onclick = () => $('gpxFile').click();
    $('loadJson').onclick = () => $('jsonFile').click();
    $('pickChallenge').onclick = () => RBChallenges.pick((r) => { resetIdentity(); setRoadbook(r); }); // forking a challenge starts a NEW roadbook
    $('gpxFile').onchange = async (e) => {
        const files = Array.from(e.target.files);
        const g = files.find((f) => /\.gpx$/i.test(f.name)); if (!g) return;
        const w = files.find((f) => /\.wpt$/i.test(f.name));
        try {
            const p = RB.parseGPX(await g.text());
            if (w && (!p.wpts || !p.wpts.length)) p.wpts = RB.parseWPT(await w.text());
            resetIdentity();
            setRoadbook(RB.buildRoadbook({ name: p.name || g.name.replace(/\.gpx$/i, ''), trkpts: p.trkpts, wpts: p.wpts }));
        } catch (err) { toast('Error: ' + err.message); }
    };
    $('jsonFile').onchange = async (e) => {
        const f = e.target.files[0]; if (!f) return;
        try { const j = JSON.parse(await f.text()); if (!j.track || !j.notes) throw new Error('Not a roadbook'); resetIdentity(); setRoadbook(j); }
        catch (err) { toast('Error: ' + err.message); }
    };
    // Toggle between the opening screen (ways to start a new roadbook) and the
    // editing surface (the map + tool bar). The map is built up front but stays
    // hidden until there's a roadbook to edit, so the editor never opens on a
    // blank map.
    function showEditing() { $('landing').hidden = true; $('mapEditor').hidden = false; if (map.map) map.map.resize(); }
    function showLanding() { $('landing').hidden = false; $('mapEditor').hidden = true; $('rbPanel').hidden = true; $('recBar').hidden = true; }
    function setRoadbook(r) {
        rb = RB.importRoadbook(r); // canonical schema + structural defaults (also opens pre-standard Italian files)
        // Pre-load all embedded icons as data URIs so they render in the editor
        rb.notes.forEach((n) => {
            (n.icons || []).forEach((ic) => {
                if (ic.name && !rb.icons[ic.name]) {
                    const src = RB.iconSrc(ic, rb, '../assets/icons/');
                    if (!/^data:/.test(src)) {
                        try {
                            const xhr = new XMLHttpRequest();
                            xhr.open('GET', src, false);
                            xhr.overrideMimeType('text/plain; charset=x-user-defined');
                            xhr.send();
                            if (xhr.status === 200) {
                                const binary = String.fromCharCode.apply(null, Array.from(xhr.responseText).map(c => c.charCodeAt(0)));
                                rb.icons[ic.name] = 'data:' + (src.endsWith('.svg') ? 'image/svg+xml' : 'image/png') + ';base64,' + btoa(binary);
                            }
                        } catch (e) {}
                    }
                }
            });
        });

        dirty = false; gaps = [];
        showEditing();
        $('recBar').hidden = true; $('rbPanel').hidden = false;
        closeEditor(); // park the inline editor; tap a note to open it
        ['toolNote', 'toolPoints', 'toolInsert', 'toolCut', 'toolAddGpx', 'toolReverse', 'toolSimplify', 'toolAdjust'].forEach((id) => $(id).disabled = false); // route ops need a route
        $('rbTitle').value = rb.meta.title || ''; $('rbDesc').value = rb.meta.description || '';
        $('rbAuthor').value = rb.meta.author || userName() || ''; $('rbOrg').value = rb.meta.organization || '';
        setLogoPreview(rb.meta.logo); $('rbModified').textContent = rb.meta.modified || '—';
        $('cfgMapAccess').checked = rb.meta.map_access !== false; // optional field; default ON, absent = allowed
        updatePhotos(); updateSaveBtn();
        refreshMap(false); renderNotes(); renderIcons(); flagUnresolvedIcons();
        sel = 0; canvas.setNote(rb.notes[0]); renderEditor();
        histReset(); setMapTool('pan');
        showView('map'); // tap a note to open its editor inline below the row
    }

    /* ---------- undo / redo: debounced snapshots of the working roadbook ---------- */
    const HIST_MAX = 30;
    let histPast = [], histFuture = [], histTimer = null;
    const histSnap = () => JSON.stringify({ rb, sel, gaps });
    function histReset() { clearTimeout(histTimer); histPast = [histSnap()]; histFuture = []; updateHistBtns(); }
    function histPushNow() {
        const snap = histSnap();
        if (snap === histPast[histPast.length - 1]) return;
        histPast.push(snap); if (histPast.length > HIST_MAX) histPast.shift();
        histFuture = []; updateHistBtns();
    }
    function histPush() { clearTimeout(histTimer); histTimer = setTimeout(histPushNow, 400); }
    function histApply(snap) {
        const st = JSON.parse(snap);
        rb = st.rb; sel = Math.max(0, Math.min(st.sel, rb.notes.length - 1)); gaps = st.gaps;
        dirty = true; exported = false; updateSaveBtn();
        clearTimeout(draftTimer); draftTimer = setTimeout(saveDraft, 2000);
        $('rbTitle').value = rb.meta.title || ''; $('rbDesc').value = rb.meta.description || '';
        $('rbAuthor').value = rb.meta.author || ''; $('rbOrg').value = rb.meta.organization || '';
        setLogoPreview(rb.meta.logo); $('cfgMapAccess').checked = rb.meta.map_access !== false;
        refreshMap(true); renderNotes(); renderIcons(); renderEditor(); canvas.setNote(rb.notes[sel]);
        map.select(rb.notes[sel], true); placeMainEditMarker();
        updateHistBtns();
    }
    function undo() { clearTimeout(histTimer); histPushNow(); if (histPast.length < 2) return; histFuture.push(histPast.pop()); histApply(histPast[histPast.length - 1]); }
    function redo() { if (!histFuture.length) return; const snap = histFuture.pop(); histPast.push(snap); histApply(snap); }
    function updateHistBtns() { $('undoBtn').disabled = histPast.length < 2; $('redoBtn').disabled = !histFuture.length; }
    $('undoBtn').onclick = undo;
    $('redoBtn').onclick = redo;
    window.addEventListener('keydown', (e) => {
        // leave native text-field undo alone; never undo mid-recording
        if (!(e.ctrlKey || e.metaKey) || !rb || recWatch != null || e.target.matches('input, textarea, select')) return;
        const key = e.key.toLowerCase();
        if (key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
        else if (key === 'y' || (key === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
    });
    $('rbTitle').oninput = (e) => { if (rb) { rb.meta.title = e.target.value; markDirty(); } };
    $('rbDesc').oninput = (e) => { if (rb) { rb.meta.description = e.target.value; markDirty(); } };
    $('rbAuthor').oninput = (e) => { if (rb) { rb.meta.author = e.target.value; markDirty(); } };
    $('rbOrg').oninput = (e) => { if (rb) { rb.meta.organization = e.target.value; markDirty(); } };
    $('rbLogoBtn').onclick = () => $('rbLogoFile').click();
    $('rbLogoClr').onclick = () => { if (rb) { delete rb.meta.logo; setLogoPreview(null); markDirty(); } };
    $('rbLogoFile').onchange = async (e) => {
        const f = e.target.files[0]; e.target.value = '';
        if (!f || !rb) return;
        try { rb.meta.logo = await RBImg.toDataURL(f, 256); setLogoPreview(rb.meta.logo); markDirty(); }
        catch (err) { toast('Could not read the image.'); }
    };
    // event logo: embedded as a base64 data URI in meta.logo (self-contained, like the icons)
    function userName() { if (!meUser) return ''; return (((meUser.first_name || '') + ' ' + (meUser.last_name || '')).trim()) || meUser.username || ''; }
    function setLogoPreview(src) { const i = $('rbLogoPrev'); if (src) { i.src = src; i.hidden = false; $('rbLogoClr').hidden = false; } else { i.removeAttribute('src'); i.hidden = true; $('rbLogoClr').hidden = true; } }
    function stampMeta() { if (!rb) return; rb.meta = rb.meta || {}; if (!rb.meta.author) rb.meta.author = userName(); rb.meta.modified = new Date().toISOString().slice(0, 10); $('rbModified').textContent = rb.meta.modified; if (rb.meta.author) $('rbAuthor').value = rb.meta.author; }
    function showView(v) {
        $('viewMap').hidden = v !== 'map';
        $('viewConfig').hidden = v !== 'config';
        if (v === 'map' && map && map.map) { setTimeout(() => map.map.resize(), 60); placeMainEditMarker(); }
    }
    $('backToMap').onclick = () => showView('map');
    $('openConfig').onclick = () => { if (!rb) return toast('Load a roadbook first.'); showView('config'); };
    $('cfgMapAccess').onchange = (e) => { if (rb) { rb.meta.map_access = e.target.checked; markDirty(); } };
    window.addEventListener('beforeunload', (e) => { if (rb && dirty && !exported) { saveDraft(); e.preventDefault(); e.returnValue = ''; } });

    /* ---------- record / adjust route (live GPS) ---------- */
    let recTrack = [], recWpts = [], recPhotos = [], recWatch = null, recLast = null, recHere = null, recWake = null, recPaused = false;
    let recMode = 'new', draftId = 0, adjP1 = -1, adjP2 = -1; // adjust: entry/exit index on the base track
    const REC_KEY = 'rb_recording';
    const saveRec = () => { try { if (recMode === 'new') localStorage.setItem(REC_KEY, JSON.stringify({ track: recTrack, wpts: recWpts })); } catch (e) {} };
    const clearRec = () => { try { localStorage.removeItem(REC_KEY); } catch (e) {} };
    // Light 3-point moving average — trims micro-zigzag from weak-signal fixes.
    function smoothTrack(pts) {
        if (pts.length < 5) return pts;
        const out = pts.map((p) => ({ ...p }));
        for (let i = 1; i < pts.length - 1; i++) {
            out[i].lat = pts[i - 1].lat * 0.25 + pts[i].lat * 0.5 + pts[i + 1].lat * 0.25;
            out[i].lon = pts[i - 1].lon * 0.25 + pts[i].lon * 0.5 + pts[i + 1].lon * 0.25;
        }
        return out;
    }
    // Recording a NEW route now lives in the dedicated Recorder tool. The recording
    // bar below is reused by "Adjust on the trail" (live re-record of a segment).
    $('recPause').onclick = () => {
        recPaused = !recPaused;
        $('recPause').innerHTML = recPaused ? '<i class="fa-solid fa-play"></i>' : '<i class="fa-solid fa-pause"></i>';
        recLast = recPaused ? recLast : null; // restart the distance gate cleanly on resume
        $('recDiscard').hidden = !(recPaused && recMode === 'new'); // discard only while paused on a new recording
        updateRecStats();
    };
    $('recDiscard').onclick = async () => {
        if (recMode !== 'new') return; // never delete an existing roadbook from an adjust session
        if (!(await RBConfirm('Discard this recording? It cannot be undone.', 'Discard'))) return;
        if (recWatch != null) { navigator.geolocation.clearWatch(recWatch); recWatch = null; }
        if (recWake) { try { recWake.release(); } catch (e) {} recWake = null; }
        if (draftId) { RBApi('rb_delete', { id: draftId }); draftId = 0; }
        recPaused = false; recTrack = []; recWpts = []; recPhotos = []; clearRec();
        await RBGpxRecorder.finish(); // discard releases the live file + checkpoint too
        if (map) map.setLiveTrack([], [], []);
        $('recDiscard').hidden = true; showLanding();
        toast('Recording discarded.');
    };
    document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'hidden') { if (rb && dirty) saveDraft(); return; } // flush the draft before a possible OS kill
        if (recWatch != null && 'wakeLock' in navigator && (!recWake || recWake.released)) {
            try { recWake = await navigator.wakeLock.request('screen'); } catch (e) {}
        }
    });
    async function startRecording(mode) {
        if (!navigator.geolocation) return toast('No geolocation on this device.');
        recMode = mode; recTrack = []; recWpts = []; recPhotos = []; recLast = null; recHere = null; recPaused = false;
        adjP1 = -1; adjP2 = -1; draftId = 0;
        $('recPause').innerHTML = '<i class="fa-solid fa-pause"></i>';
        showEditing(); $('rbPanel').hidden = true; $('recBar').hidden = false; $('recDiscard').hidden = true;
        $('recPhoto').hidden = true; // shown only once a draft id exists (so the camera never errors)
        if (mode === 'adjust') { showView('map'); if (map) { refreshMap(false); map.setOverlay([]); } draftId = currentRbId; $('recPhoto').hidden = !draftId; toast('Walk onto the trail (≤10 m) to start adjusting.'); }
        else { if (map) map.setLiveTrack([], [], []); if (meUser) { const r = await RBApi('rb_draft'); if (r.ok) draftId = r.id; } $('recPhoto').hidden = !draftId; }
        updateRecStats();
        try { if ('wakeLock' in navigator) recWake = await navigator.wakeLock.request('screen'); } catch (e) {}
        recWatch = navigator.geolocation.watchPosition(onRecFix, (e) => toast('GPS: ' + e.message), { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
    }
    function nearestTrackIdx(p) {
        let best = -1, bd = Infinity;
        rb.track.forEach((t, i) => { const d = RB.geo.haversineM(p, t); if (d < bd) { bd = d; best = i; } });
        return { idx: best, dist: bd };
    }
    function onRecFix(pos) {
        const c = pos.coords, here = { lat: c.latitude, lon: c.longitude, ele: (c.altitude != null && isFinite(c.altitude)) ? c.altitude : null };
        if (map) map.setPosition(here.lat, here.lon, true);
        if (c.accuracy != null && c.accuracy > 35) { updateRecStats(c.accuracy); return; } // drop junk fixes
        recHere = here;
        if (recPaused) { updateRecStats(c.accuracy); return; }
        const step = Math.max(2.5, (c.accuracy || 10) * 0.35); // dense detail with a good fix, no jitter with a weak one
        if (recMode === 'adjust') {
            const n = nearestTrackIdx(here);
            if (adjP1 < 0) { if (n.dist <= 10) { adjP1 = n.idx; toast('On the trail — recording your variant.'); } updateRecStats(c.accuracy); return; }
            if (!recLast || RB.geo.haversineM(recLast, here) >= step) { recTrack.push(here); recLast = here; if (map) map.setOverlay(recTrack); }
            if (recTrack.length > 3 && n.dist <= 10 && n.idx > adjP1 + 2) adjP2 = n.idx; // rejoin further along
            updateRecStats(c.accuracy);
            return;
        }
        if (!recLast || RB.geo.haversineM(recLast, here) >= step) {
            recTrack.push(here); recLast = here;
            RBGpxRecorder.add(here, Date.now()); // mirrors the route to the live GPX file
            if (map) map.setLiveTrack(recTrack, recWpts, recPhotos);
            if (recTrack.length % 5 === 0) saveRec(); // auto-save for crash recovery
        }
        updateRecStats(c.accuracy);
    }
    function updateRecStats(acc) {
        let m = 0; for (let i = 1; i < recTrack.length; i++) m += RB.geo.haversineM(recTrack[i - 1], recTrack[i]);
        const head = recPaused ? t('Paused ·') : (recMode === 'adjust' ? (adjP1 < 0 ? t('Adjust: get on the trail…') : (adjP2 >= 0 ? t('Adjust · will rejoin') : t('Adjust · recording'))) : t('Recording…'));
        $('recStats').textContent = `${head} ${recTrack.length} pts · ${(m / 1000).toFixed(2)} km · ${recWpts.length} wpt · ${recPhotos.length} 📷${acc != null ? ' · ±' + Math.round(acc) + ' m' : ''}`;
    }
    // drop a waypoint (shared by the button and "convert photo → waypoint")
    function dropWaypoint(lat, lon, text) {
        const note = { lat, lon, name: 'wpt' + (recWpts.length + 1), num: recWpts.length + 1, text: text || '' };
        recWpts.push(note);
        if (map && recMode === 'new') map.setLiveTrack(recTrack, recWpts, recPhotos);
        saveRec(); updateRecStats();
        return note;
    }
    // Waypoint: drops instantly, then a no-pressure quick-text modal that auto-dismisses
    // after 5 s ("Edit later (5)…") — unless you start typing, then it waits for you.
    $('recWaypoint').onclick = () => {
        if (!recHere) return toast('Waiting for a GPS fix…');
        const note = dropWaypoint(recHere.lat, recHere.lon, '');
        const d = RBModal(`<h3>Waypoint ${note.num}</h3>
            <input id="wfText" class="modal-in" placeholder="${t('Quick note (optional)…')}" autocomplete="off">
            <div class="btnrow end"><button class="btn btn-primary" id="wfBtn">${t('Edit later')} (5)</button></div>`, 'narrow', () => finish());
        const inp = d.q('#wfText'), btn = d.q('#wfBtn');
        setTimeout(() => inp.focus(), 50);
        let n = 5, typed = false;
        const timer = setInterval(() => { if (typed) return; if (--n <= 0) finish(); else btn.textContent = `${t('Edit later')} (${n})`; }, 1000);
        function finish() { clearInterval(timer); note.text = inp.value.trim(); d.close(); updateRecStats(); }
        inp.addEventListener('input', () => { if (inp.value && !typed) { typed = true; btn.textContent = t('Save note'); } });
        inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') finish(); });
        btn.onclick = finish;
    };
    // photo: camera → upload → shows the photo with OK / Convert into waypoint
    $('recPhoto').onclick = () => {
        if (!meUser) return RBNeedAuth('Sign in to attach photos.');
        if (!draftId) return toast('Save to your profile first.');
        $('recPhotoFile').click();
    };
    $('recPhotoFile').onchange = async (e) => {
        const f = e.target.files[0]; e.target.value = ''; if (!f || !draftId) return;
        const fields = { type: 'photo', roadbook: String(draftId) };
        if (recHere) { fields.lat = recHere.lat; fields.lon = recHere.lon; }
        toast('Uploading photo…');
        const r = await RBUpload(fields, f);
        if (!r.ok) return toast(r.error || 'Photo failed.');
        recPhotos.push({ id: r.id, url: r.url, lat: r.lat, lon: r.lon }); if (map) map.setPhotos(recPhotos);
        const lat = r.lat != null ? r.lat : (recHere && recHere.lat), lon = r.lon != null ? r.lon : (recHere && recHere.lon);
        const d = RBModal(`<img src="${r.url}" alt="" class="photo-preview">
            <div class="btnrow center">
                <button class="btn btn-ghost" id="ptOk">OK</button>
                <button class="btn btn-primary" id="ptWpt"><i class="fa-solid fa-location-dot"></i> ${t('Convert into waypoint')}</button>
            </div>`, 'slim center');
        d.q('#ptOk').onclick = d.close;
        d.q('#ptWpt').onclick = () => { if (lat != null) { dropWaypoint(lat, lon, ''); toast('Waypoint dropped'); } d.close(); };
    };
    $('recStop').onclick = async () => {
        if (recWatch != null) { navigator.geolocation.clearWatch(recWatch); recWatch = null; }
        if (recWake) { try { recWake.release(); } catch (e) {} recWake = null; }
        recPaused = false; $('recBar').hidden = true;
        if (map) map.setOverlay([]);
        if (recMode === 'adjust') return finishAdjust();
        const gpx = await RBGpxRecorder.finish(); // final flush; its name titles the roadbook
        if (recTrack.length < 2) { clearRec(); showLanding(); return toast('Route too short to save.'); }
        try {
            setRoadbook(RB.buildRoadbook({ name: gpx.name || 'Recorded route', trkpts: smoothTrack(recTrack), wpts: recWpts }));
            if (draftId) { currentRbId = draftId; setVis(0); await doSave(); } // persist the draft (photos already attached)
            markDirty(); clearRec(); toast('Route recorded · edit and save.');
        } catch (e) { showLanding(); toast('Error: ' + e.message); }
    };
    async function finishAdjust() {
        $('rbPanel').hidden = false; showView('map');
        if (adjP1 < 0 || recTrack.length < 2) { if (map) refreshMap(false); return toast('Adjust cancelled — you never got on the trail.'); }
        const rejoin = adjP2 >= 0;
        const msg = (rejoin
            ? t('Replace the trail between points {a} and {b} with your {n}-point variant?').replace('{a}', adjP1).replace('{b}', adjP2)
            : t('Replace everything after point {a} with your new {n}-point ending?').replace('{a}', adjP1)
        ).replace('{n}', recTrack.length);
        const ok = await RBConfirm(msg, 'Apply');
        if (!ok) { if (map) refreshMap(false); return; }
        spliceByIndex(rb, smoothTrack(recTrack), adjP1, rejoin ? adjP2 : null);
        // merge any waypoints dropped during the adjust session (snap to the new track)
        recWpts.forEach((w) => {
            const idx = RB.nearestIdx(rb.track, w);
            if (!rb.notes.some((n) => n.idx === idx)) { const note = makeNote(rb, idx, roadOutBefore(idx)); note.text = w.text || ''; rb.notes.push(note); }
        });
        RB.recomputeMetrics(rb); RB.recomputeCaps(rb);
        sel = 0; refreshMap(false); renderNotes(); renderEditor(); canvas.setNote(rb.notes[0]); updatePhotos(); markDirty();
        toast('Trail adjusted · metrics recomputed.');
    }
    function spliceByIndex(r, newTrk, i1, i2) {
        const nt = r.track.slice(0, i1 + 1).concat(newTrk.map((p) => ({ lat: RB.round6(p.lat), lon: RB.round6(p.lon) }))).concat(i2 != null ? r.track.slice(i2) : []);
        const last = r.notes[r.notes.length - 1];
        r.notes = r.notes.filter((n) => n.idx <= i1 || (i2 != null && n.idx >= i2));
        r.track = nt;
        // tail replace (no rejoin): keep an end note at the new finish
        if (i2 == null) r.notes.push(makeNote(r, nt.length - 1, last ? last.road_type_out : 3));
        r.notes.forEach((n) => { n.idx = RB.nearestIdx(nt, { lat: n.lat, lon: n.lon }); });
        RB.recomputeMetrics(r); RB.recomputeCaps(r);
    }
    // Recover an interrupted recording (crash/closed tab); true if a route was restored.
    async function checkRecovery() {
        let s; try { s = JSON.parse(localStorage.getItem(REC_KEY) || 'null'); } catch (e) {}
        if (!s || !s.track || s.track.length < 2) return false;
        const yes = await RBConfirm(t('Recover your unsaved recording?') + ' (' + s.track.length + ' ' + t('points') + ')', 'Recover');
        clearRec();
        if (!yes) return false;
        try { setRoadbook(RB.buildRoadbook({ name: 'Recovered route', trkpts: smoothTrack(s.track), wpts: s.wpts || [] })); markDirty(); return true; }
        catch (e) { return false; }
    }

    /* ---------- account: save to profile · public/private · load by ?rb ---------- */
    let meUser = null, currentRbId = 0, isPublic = 0;
    let notePhotos = []; // the saved roadbook's geotagged photos (for the per-note 📷 indicator)
    $('visPrivate').onclick = () => { setVis(0); markDirty(); };
    $('visPublic').onclick = () => { setVis(1); markDirty(); };
    function setVis(v) { isPublic = v; $('visPrivate').classList.toggle('on', !v); $('visPublic').classList.toggle('on', !!v); $('visPrivate').setAttribute('aria-pressed', String(!v)); $('visPublic').setAttribute('aria-pressed', String(!!v)); }
    // fresh content (imported GPX / .rdbk) is a NEW roadbook, even mid-edit of a saved one
    function resetIdentity() { currentRbId = 0; setVis(0); try { history.replaceState(null, '', location.pathname); } catch (e) {} }
    async function doSave() {
        stampMeta(); RB.recomputeMetrics(rb); RB.recomputeCaps(rb); await embedUsed(rb);
        const r = await RBApi('rb_save', { id: currentRbId, is_public: isPublic, roadbook: rb });
        if (r.ok) {
            currentRbId = r.id; dirty = false; clearDraft(); updatePhotos(); updateSaveBtn();
            // pin the identity to the URL so a reload (or version auto-refresh) keeps editing the same roadbook
            try { history.replaceState(null, '', location.pathname + '?rb=' + currentRbId); } catch (e) {}
        }
        return r;
    }
    $('saveAccount').onclick = async () => {
        if (!meUser) return RBNeedAuth('Sign in to save this roadbook to your profile.');
        if (!rb) return toast('Nothing to save.');
        if (!(await confirmOpenCuts())) return;
        const r = await doSave();
        toast(r.ok ? (isPublic && r.slug ? t('Saved · public at') + ' /challenge/' + r.slug : 'Saved to your profile.') : (r.error || 'Could not save.'));
    };
    // "Save as": store the current content as a NEW roadbook (the original is left
    // untouched). The copy starts private and gets a "… (copy)" title; the editor
    // then keeps editing the copy. Photos stay with the original (they live server-side).
    $('saveAsAccount').onclick = async () => {
        if (!meUser) return RBNeedAuth('Sign in to save this roadbook to your profile.');
        if (!rb) return toast('Nothing to save.');
        if (!(await confirmOpenCuts())) return;
        rb.meta.title = ((rb.meta.title || 'Untitled') + ' (copy)').slice(0, 200);
        $('rbTitle').value = rb.meta.title;
        currentRbId = 0; setVis(0); // new identity, private
        const r = await doSave();
        toast(r.ok ? 'Saved as a new roadbook.' : (r.error || 'Could not save.'));
    };

    /* ---------- photo gallery (saved roadbook) ---------- */
    function updatePhotos() {
        if (currentRbId > 0) { $('photosSection').hidden = false; loadPhotos(); }
        else { $('photosSection').hidden = true; $('photoGrid').innerHTML = ''; }
    }
    async function loadPhotos() {
        const r = await RBApi('ph_list', { roadbook: currentRbId });
        const g = $('photoGrid');
        if (!r.ok || !r.photos.length) { notePhotos = []; g.innerHTML = `<span class="muted small">${esc(t('No photos yet.'))}</span>`; if (map) map.setPhotos([]); if (rb) renderNotes(); return; }
        notePhotos = r.photos;
        g.innerHTML = r.photos.map((p) => `<div class="photo-thumb"><img src="${esc(p.url)}" alt="" data-lb="${p.id}"><button type="button" data-delp="${p.id}" class="del-badge" aria-label="${esc(t('Remove'))}">×</button></div>`).join('');
        g.querySelectorAll('[data-delp]').forEach((s) => s.onclick = async (e) => { e.stopPropagation(); await RBApi('ph_delete', { id: +s.dataset.delp }); loadPhotos(); });
        g.querySelectorAll('[data-lb]').forEach((im) => im.onclick = () => openLightbox(+im.dataset.lb));
        // every photo is a pin on the map; tapping a pin (or a thumbnail) opens the lightbox
        if (map) map.setPhotos(r.photos, (ph) => { if (!photoPlacing && ph && ph.id != null) openLightbox(+ph.id); });
        if (rb) renderNotes(); // refresh the per-note 📷 indicators
    }
    /* ---------- photo upload: every photo needs coordinates ---------- */
    // Read GPS from the JPEG's EXIF; if absent, queue the file and let the user tap the
    // map to set its position (one tap per queued photo). No photo is stored without coords.
    let photoPlacing = false, photoQueue = [];
    $('addPhotoBtn').onclick = () => { if (!(currentRbId > 0)) return toast('Save to your profile first.'); $('photoFile').click(); };
    $('photoFile').onchange = async (e) => { const files = [...e.target.files]; e.target.value = ''; addPhotos(files); };
    const uploadPhoto = (file, lat, lon) => RBUpload({ type: 'photo', roadbook: String(currentRbId), lat: String(lat), lon: String(lon) }, file);
    // map context-menu upload: photos geotagged at the right-clicked point
    $('ctxPhotoFile').onchange = async (e) => {
        const files = [...e.target.files]; e.target.value = '';
        const p = ctxPhotoPoint; if (!p || !(currentRbId > 0)) return;
        let failed = 0;
        for (const f of files) { if (!(await uploadPhoto(f, p.lat, p.lon)).ok) failed++; }
        await loadPhotos(); toast(failed ? 'Some photos failed.' : 'Photos uploaded.');
    };
    async function addPhotos(files) {
        if (!(currentRbId > 0)) return toast('Save to your profile first.');
        let failed = 0;
        for (const f of files) {
            const g = await RBImg.gps(f);
            if (g) { if (!(await uploadPhoto(f, g.lat, g.lon)).ok) failed++; }
            else photoQueue.push(f);
        }
        await loadPhotos();
        if (failed) toast('Some photos failed.');
        if (photoQueue.length) promptPlacePhoto(); else if (!failed) toast('Photos uploaded.');
    }
    function promptPlacePhoto() {
        photoPlacing = true; showView('map'); setMapTool('pan');
        document.body.classList.add('placing-photo');
        toast(t('Tap the map to place the photo') + (photoQueue.length > 1 ? ' (' + photoQueue.length + ')' : ''));
    }
    async function placePhotoHere(here) {
        const r = await uploadPhoto(photoQueue.shift(), here.lat, here.lon);
        await loadPhotos();
        if (photoQueue.length) toast(t('Tap the map to place the photo') + ' (' + photoQueue.length + ')');
        else { photoPlacing = false; document.body.classList.remove('placing-photo'); toast(r.ok ? 'Photos uploaded.' : 'Some photos failed.'); }
    }

    /* ---------- lightbox: browse all the roadbook's photos ---------- */
    let lbList = [], lbIdx = -1;
    function openLightbox(id) {
        lbList = notePhotos.slice();
        lbIdx = lbList.findIndex((p) => +p.id === +id);
        if (lbIdx < 0) return;
        $('lbImg').src = lbList[lbIdx].url; $('lightbox').hidden = false;
    }
    function lbStep(d) { if (!lbList.length) return; lbIdx = (lbIdx + d + lbList.length) % lbList.length; $('lbImg').src = lbList[lbIdx].url; }
    function closeLightbox() { $('lightbox').hidden = true; $('lbImg').removeAttribute('src'); }
    $('lbClose').onclick = closeLightbox;
    $('lbPrev').onclick = () => lbStep(-1);
    $('lbNext').onclick = () => lbStep(1);
    $('lbWaypoint').onclick = () => { const p = lbList[lbIdx]; if (p && p.lat != null && rb) { addWaypointNear({ lat: +p.lat, lon: +p.lon }); closeLightbox(); } };
    document.addEventListener('keydown', (e) => {
        if ($('lightbox').hidden) return;
        if (e.key === 'Escape') closeLightbox(); else if (e.key === 'ArrowLeft') lbStep(-1); else if (e.key === 'ArrowRight') lbStep(1);
    });

    /* ---------- notes + selection ----------
     * The list is a column of rows; tapping a row expands the editor INLINE right
     * below it (the single #noteEditZone element is physically moved into that
     * row's slot — like the Reader's per-note map). Each note's text is edited in
     * the row itself, so a full list rebuild only happens on structural changes. */
    function renderNotes() {
        parkEditor(); // park the editor + tulip before wiping the list (innerHTML would destroy moved elements)
        // geotagged photos belong to their nearest note (within 80 m) → a 📷 under the km
        const photosByNote = {};
        notePhotos.forEach((p) => {
            if (p.lat == null) return;
            const pt = { lat: +p.lat, lon: +p.lon };
            let best = -1, bd = Infinity;
            rb.notes.forEach((n, k) => { const d = RB.geo.haversineM(n, pt); if (d < bd) { bd = d; best = k; } });
            if (best >= 0 && bd <= 80) (photosByNote[best] = photosByNote[best] || []).push(p);
        });
        $('noteList').innerHTML = rb.notes.map((n, i) => `<div class="note-mini${editorOpen && i === sel ? ' sel' : ''}" data-i="${i}">
                <span class="note-number">${n.num}</span>
                <span class="note-km"><b>${((n.distance ?? 0) / 1000).toFixed(2)}</b> +${((n.partial_distance ?? 0) / 1000).toFixed(2)}${photosByNote[i] ? `<button type="button" class="note-photo" data-photo="${i}" aria-label="${esc(t('View photo'))}" title="${esc(t('View photo'))}">📷</button>` : ''}</span>
                <span class="note-tulip" id="tulipSlot${i}"></span>
                <div class="note-textcell">
                    <textarea class="note-title field" data-i="${i}" placeholder="${esc(t('(no text)'))}" autocomplete="off">${esc(n.text || '')}</textarea>
                    <div class="note-meta" data-meta="${i}">${noteMetaHTML(n, i)}</div>
                </div>
                <div class="note-actions">
                    <button type="button" class="note-nav" data-up="${i}" aria-label="${esc(t('Move to the row above'))}" title="${esc(t('Move to the row above'))}"${i === 0 ? ' disabled' : ''}>↑</button>
                    <button type="button" class="note-del icon-danger" data-del="${i}" aria-label="${esc(t('Delete'))}" title="${esc(t('Delete'))}">X</button>
                    <button type="button" class="note-nav" data-down="${i}" aria-label="${esc(t('Move to the row below'))}" title="${esc(t('Move to the row below'))}"${i === rb.notes.length - 1 ? ' disabled' : ''}>↓</button>
                </div>
            </div><div class="note-edit-slot" id="editSlot${i}"></div>`).join('');
        // road-type accent colour is data-driven → set the CSS variable per row
        const rows = $('noteList').querySelectorAll('.note-mini');
        rows.forEach((el, i) => el.style.setProperty('--rt', (RB.ROAD_TYPES[rb.notes[i].road_type_out] || RB.ROAD_TYPES[3]).color));
        rows.forEach((el) => el.onclick = (e) => {
            const capBtn = e.target.closest('[data-cap]');
            if (capBtn) { e.stopPropagation(); toggleCapAt(+capBtn.dataset.cap); return; }
            if (!e.target.closest('.note-title') && !e.target.closest('.note-del') && !e.target.closest('.note-nav')) toggleNote(+el.dataset.i);
        });
        $('noteList').querySelectorAll('.note-del').forEach((b) => b.onclick = async (e) => {
            e.stopPropagation();
            if (rb.notes.length <= 2) return toast('At least 2 notes must remain.');
            if (await RBConfirm('Delete this note?', 'Delete')) delNote(+b.dataset.del);
        });
        $('noteList').querySelectorAll('[data-up]').forEach((b) => b.onclick = (e) => { e.stopPropagation(); select(+b.dataset.up - 1); });
        $('noteList').querySelectorAll('[data-down]').forEach((b) => b.onclick = (e) => { e.stopPropagation(); select(+b.dataset.down + 1); });
        // tap the 📷 under the km to view the note's photo(s)
        $('noteList').querySelectorAll('.note-photo').forEach((b) => b.onclick = (e) => {
            e.stopPropagation();
            const ph = photosByNote[+b.dataset.photo] || [];
            if (ph.length) RBModal(ph.map((p) => `<img src="${esc(p.url)}" alt="" class="photo-preview">`).join(''), 'slim center');
        });
        // the title is edited in place — update the model only (no rebuild, so focus is kept)
        $('noteList').querySelectorAll('.note-title').forEach((inp) => {
            inp.onfocus = () => { if (!(editorOpen && sel === +inp.dataset.i)) select(+inp.dataset.i); };
            inp.oninput = () => { rb.notes[+inp.dataset.i].text = inp.value; markDirty(); };
        });
        const nc = $('noteCount');
        if (nc) {
            const totalM = (rb.meta && rb.meta.total_distance) || (rb.notes.length ? rb.notes[rb.notes.length - 1].distance : 0) || 0;
            nc.textContent = rb.notes.length ? `· ${rb.notes.length} · KM: ${(totalM / 1000).toFixed(1)}` : '';
        }
        if (editorOpen && sel >= 0 && sel < rb.notes.length) openEditZoneAt(sel); // re-attach inline after a rebuild
        placeTulips();
    }
    // Below each note's text: the Red CAP on/off toggle on the left, coordinates on the right.
    const noteMetaHTML = (n, i) => {
        const cap = i >= rb.notes.length - 1 ? '' // the last note has no CAP (no following note)
            : `<button type="button" class="note-cap${n.cap != null ? ' on' : ''}" data-cap="${i}" title="${esc(t('Red CAP'))}" aria-label="${esc(t('Red CAP'))}">${n.cap != null ? 'CAP ' + Math.round(n.cap) + '°' : 'CAP DISABLED'}</button>`;
        return cap + `<span class="note-coords">${(+n.lat).toFixed(5)}, ${(+n.lon).toFixed(5)}</span>`;
    };
    function refreshRowMeta(i) { const m = $('noteList').querySelector('[data-meta="' + i + '"]'); if (m) m.innerHTML = noteMetaHTML(rb.notes[i], i); }
    // Every row shows its vignette (static SVG); the open row instead holds the live canvas.
    const tulipSVG = (n) => NoteCanvas.toSVG(n, (ic) => RB.iconSrc(ic, rb, '../assets/icons/'));
    function placeTulips() {
        $('noteList').querySelectorAll('.note-tulip').forEach((slot) => {
            const i = +slot.id.slice(9); // 'tulipSlot'.length
            if (editorOpen && i === sel) return; // the open row keeps the interactive canvas
            slot.innerHTML = tulipSVG(rb.notes[i]);
        });
    }
    // The editor lives in two movable pieces: the tulip canvas goes INTO the selected
    // row (between distance and text), and the rest (toolbar, props, icons) expands in
    // the slot below it. Both are parked back in rbPanel before any list rebuild.
    function parkEditor() { $('rbPanel').appendChild($('noteEditZone')); $('rbPanel').appendChild($('canvasWrap')); $('canvasWrap').hidden = true; }
    function openEditZoneAt(i) {
        const slot = $('editSlot' + i), tulip = $('tulipSlot' + i);
        if (slot && $('noteEditZone').parentNode !== slot) slot.appendChild($('noteEditZone'));
        if (tulip && $('canvasWrap').parentNode !== tulip) { tulip.innerHTML = ''; tulip.appendChild($('canvasWrap')); } // drop the static preview, host the live canvas
        $('canvasWrap').hidden = false;
        $('noteEditZone').hidden = false;
    }
    function markSelectedRow() { $('noteList').querySelectorAll('.note-mini').forEach((el) => el.classList.toggle('sel', editorOpen && +el.dataset.i === sel)); }
    function toggleNote(i) { if (editorOpen && sel === i) closeEditor(); else select(i); }
    function closeEditor() {
        editorOpen = false; $('noteEditZone').hidden = true;
        parkEditor(); // park both pieces back so a list rebuild can't destroy them
        placeTulips(); // restore the static vignette in the row the canvas just left
        markSelectedRow(); placeMainEditMarker(); // drops the draggable note marker
    }
    function select(i) {
        if (!rb || i < 0 || i >= rb.notes.length) return;
        sel = i; editorOpen = true;
        openEditZoneAt(i); renderEditor(); canvas.setNote(rb.notes[i]);
        markSelectedRow(); placeTulips(); // refill the static vignette in the row the canvas left
        map.select(rb.notes[i], true); placeMainEditMarker();
        // clicking a note centres (and zooms in to) the map on that note
        if (map.map && map.ready) map.map.easeTo({ center: [+rb.notes[i].lon, +rb.notes[i].lat], zoom: Math.max(map.map.getZoom(), 14), duration: 450 });
        // stacked layout (mobile/tablet): bring the just-opened editor into view
        if (!window.matchMedia('(min-width: 1024px)').matches) $('noteEditZone').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    /* ---------- reposition the selected note ON the main map (drag its red marker) ----------
     * The map sits right beside the note editor, so a note is repositioned on the
     * very map it describes — no separate mini-map. The marker shows only while a
     * note is open and the Pan tool is active (it must not fight draw/cut/note). */
    function placeMainEditMarker() {
        if (!rb || !map.map) return;
        const note = rb.notes[sel];
        const editable = !$('viewMap').hidden && !$('noteEditZone').hidden && mapTool === 'pan' && note;
        if (!editable) return map.setEditMarker(null);
        map.setEditMarker(note, (lat, lon) => {
            note.idx = RB.nearestIdx(rb.track, { lat, lon });
            RB.recomputeMetrics(rb); RB.recomputeCaps(rb); markDirty();
            sel = rb.notes.indexOf(note);
            refreshMap(true); renderNotes(); renderEditor(); canvas.setNote(rb.notes[sel]);
            map.select(rb.notes[sel], true); placeMainEditMarker();
        }, true);
    }
    function renderEditor() {
        const n = rb.notes[sel];
        // Only the road you LEAVE on is authored: the road you arrive on is the
        // previous note's road_out (derived in recomputeMetrics/normalizeRoadTypes),
        // and the road simply continues until a note changes it.
        const opts = (cur) => RT.map((l, k) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${t(l)}</option>`).join('');
        const dangerOpts = ['—', '!', '!!', '!!!'].map((l, k) => `<option value="${k}" ${k === (n.danger || 0) ? 'selected' : ''}>${l}</option>`).join('');
        // Road (the road type of the segment to follow = road_type_out) and Danger both sit in
        // the icon-search row (Road between the search and Danger); Red CAP toggle is in the note row.
        $('roadSlot').innerHTML = `<label class="prop-field"><span>${t('Road')}</span><select id="edRout" class="field">${opts(n.road_type_out)}</select></label>`;
        $('dangerSlot').innerHTML = `<label class="prop-field"><span>${t('Danger')}</span><select id="edDanger" class="field">${dangerOpts}</select></label>`;
        $('edRout').onchange = (e) => {
            n.road_type_out = +e.target.value; RB.normalizeRoadTypes(rb); canvas.render(); markDirty();
            const row = $('noteList').querySelector('.note-mini[data-i="' + sel + '"]'); // refresh only this row's accent
            if (row) row.style.setProperty('--rt', (RB.ROAD_TYPES[n.road_type_out] || RB.ROAD_TYPES[3]).color);
        };
        $('edDanger').onchange = (e) => { const v = +e.target.value; if (v) n.danger = v; else delete n.danger; canvas.render(); markDirty(); };
    }
    // Toggle a note's Red CAP from its row (CAP heading/distance to the next note).
    function toggleCapAt(i) {
        const n = rb.notes[i], nx = rb.notes[i + 1];
        if (!nx) return; // the last note has no following note to head toward
        if (n.cap == null) { n.cap = Math.round(RB.geo.bearingDeg(n, nx)); n.cap_distance = Math.round(RB.geo.haversineM(n, nx)); }
        else { n.cap = null; n.cap_distance = null; }
        markDirty(); refreshRowMeta(i);
    }
    // The minimum-notes guard and the confirm prompt live in the row's click handler.
    function delNote(i) {
        rb.notes.splice(i, 1); RB.recomputeMetrics(rb); RB.recomputeCaps(rb); markDirty();
        refreshMap(true); renderNotes(); select(Math.min(i, rb.notes.length - 1));
    }
    // Road type in force at a track index = the road_out of the nearest preceding
    // note. A note inserted here continues on that road by default (road_out =
    // road_in), so the surface only changes where the author explicitly sets it.
    function roadOutBefore(idx) {
        let rt = 3, best = -1;
        rb.notes.forEach((n) => { if (n.idx <= idx && n.idx > best) { best = n.idx; rt = n.road_type_out; } });
        return rt;
    }
    function addWaypointNear(pt) {
        const idx = splitTrackAt(pt);
        if (rb.notes.some((n) => n.idx === idx)) return toast('There is already a note here.');
        const cur = editorOpen ? rb.notes[sel] : null; // keep editing the same note across the re-sort
        rb.notes.push(makeNote(rb, idx, roadOutBefore(idx)));
        RB.recomputeMetrics(rb);
        if (cur) sel = rb.notes.indexOf(cur);
        refreshMap(true); renderNotes(); markDirty();
        toast('Waypoint added.');
    }

    /* ---------- icons (standard palette + yours, embedded in the roadbook) ---------- */
    let iconCat = ''; // active category filter: '' = all · '__yours' = custom · else a palette category key
    async function loadStd() { if (std) return std; try { std = await (await fetch('../assets/icons/index.json')).json(); } catch (e) { std = { categories: {} }; } return std; }
    // Icons whose symbol file doesn't exist (e.g. Roadbook Suite pictograms with no
    // standard equivalent): show a fallback marker and flag it in the note text so the
    // author adds the real symbol. Existence is probed on disk (HEAD) — index.json is
    // only the picker and omits some real files, so it can't decide this. Idempotent:
    // the original name is gone once swapped, and the flag is appended only if absent.
    const MISSING_ICON_FALLBACK = 'W28_general_danger.svg';
    async function flagUnresolvedIcons() {
        if (!rb) return;
        await loadStd();
        const palette = new Set(Object.values(std.categories || {}).flat().map((x) => x.toLowerCase()));
        const lib = rb.icons || {};
        const known = (name) => /^data:/.test(name) || palette.has(name.toLowerCase()) || Object.keys(lib).some((k) => k.toLowerCase() === name.toLowerCase());
        // probe only the uncertain names (deduped): not embedded and not already in the picker
        const candidates = new Set();
        rb.notes.forEach((n) => (n.icons || []).forEach((ic) => { const nm = ic.name || ''; if (nm && nm !== MISSING_ICON_FALLBACK && !known(nm)) candidates.add(nm); }));
        const missing = new Set();
        await Promise.all([...candidates].map(async (nm) => {
            try { const r = await fetch('../assets/icons/' + nm, { method: 'HEAD' }); if (!r.ok) missing.add(nm); } catch (e) { missing.add(nm); }
        }));
        if (!missing.size) return;
        rb.notes.forEach((n) => (n.icons || []).forEach((ic) => {
            if (!missing.has(ic.name)) return;
            const orig = ic.name;
            ic.name = MISSING_ICON_FALLBACK;
            const flag = t('Note: add icon') + ' ' + orig;
            if (!(n.text || '').includes(flag)) n.text = n.text ? n.text + '\n' + flag : flag;
        }));
        markDirty(); renderNotes(); if (rb.notes[sel]) { canvas.setNote(rb.notes[sel]); renderEditor(); }
    }
    async function renderIcons() {
        await loadStd();
        const lib = rb ? rb.icons || {} : {};
        const stdNames = new Set(Object.values(std.categories || {}).flat().map((x) => x.toLowerCase()));
        const custom = Object.keys(lib).filter((n) => !stdNames.has(n.toLowerCase()));
        let html = '';
        if (custom.length) html += `<div class="icon-category" data-cat="__yours">${t('Yours (in this roadbook)')}</div>` + custom.map((n) => iconBtn(n, lib[n], true)).join('');
        html += Object.entries(std.categories || {}).map(([cat, files]) => `<div class="icon-category" data-cat="${esc(cat)}">${t(cat)}</div>` + files.map((f) => iconBtn(f, '../assets/icons/' + f, false)).join('')).join('');
        $('iconGrid').innerHTML = html || `<span class="muted small">${esc(t('No icons.'))}</span>`;
        $('iconGrid').querySelectorAll('button[data-add]').forEach((b) => {
            b.onclick = () => addIcon(b.dataset.add);
            b.draggable = true;
            b.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', b.dataset.add);
                e.dataTransfer.effectAllowed = 'copy';
                const img = b.querySelector('img'); if (img) e.dataTransfer.setDragImage(img, 18, 18);
            });
        });
        $('iconGrid').querySelectorAll('span[data-del]').forEach((s) => {
            const del = (ev) => { ev.stopPropagation(); ev.preventDefault(); delCustomIcon(s.dataset.del); };
            s.onclick = del;
            s.onkeydown = (ev) => { if (ev.key === 'Enter' || ev.key === ' ') del(ev); };
        });
        renderIconCats(custom.length > 0);
        filterIcons();
    }
    // Category chips: jump straight to a group instead of scrolling the palette.
    function renderIconCats(hasCustom) {
        const cats = Object.keys(std.categories || {});
        if ((iconCat === '__yours' && !hasCustom) || (iconCat && iconCat !== '__yours' && !cats.includes(iconCat))) iconCat = '';
        const chip = (key, label) => `<button type="button" class="icon-cat-chip${iconCat === key ? ' on' : ''}" data-cat="${esc(key)}">${esc(label)}</button>`;
        $('iconCats').innerHTML = (hasCustom ? chip('__yours', t('Yours')) : '') + cats.map((c) => chip(c, t(c))).join('');
        // no "All" chip: clicking the active category again clears the filter (shows all)
        $('iconCats').querySelectorAll('[data-cat]').forEach((b) => b.onclick = () => { iconCat = iconCat === b.dataset.cat ? '' : b.dataset.cat; renderIconCats(hasCustom); filterIcons(); });
    }
    // live palette filter: active category chip AND the search box; hide emptied categories
    $('iconSearch').oninput = filterIcons;
    function filterIcons() {
        const q = $('iconSearch').value.trim().toLowerCase();
        let header = null, curCat = '', headerHits = false;
        [...$('iconGrid').children].forEach((el) => {
            if (el.classList.contains('icon-category')) {
                if (header) header.hidden = !headerHits;
                header = el; curCat = el.dataset.cat || ''; headerHits = false;
                return;
            }
            const hit = (!iconCat || curCat === iconCat) && (!q || (el.dataset.add || '').toLowerCase().includes(q));
            el.hidden = !hit;
            if (hit) headerHits = true;
        });
        if (header) header.hidden = !headerHits;
    }
    const iconBtn = (name, src, rmv) =>
        `<button data-add="${name}" title="${name}">${rmv ? `<span data-del="${name}" class="del-badge" role="button" tabindex="0" aria-label="${esc(t('Remove'))}">×</span>` : ''}<img src="${src}" alt="" loading="lazy"></button>`;
    function addIcon(name) {
        if (!rb) return toast('Load a roadbook first.');
        canvas.addIcon(mkIcon(name, [0, 0]));
        toast('Icon added — drag it on the vignette');
    }
    function delCustomIcon(name) {
        if (rb.notes.some((n) => (n.icons || []).some((ic) => (ic.name || '').toLowerCase() === name.toLowerCase()))) return toast('In use; remove it from the notes first.');
        delete rb.icons[name]; renderIcons();
    }
    $('addIconBtn').onclick = () => $('iconFile').click();
    $('iconFile').onchange = async (e) => {
        if (!rb) return toast('Load a roadbook first.');
        for (const f of e.target.files) rb.icons[safeName(f.name)] = await fileToDataURL(f);
        renderIcons(); toast('Icon(s) uploaded — tap them to place.'); e.target.value = '';
    };
    const safeName = (n) => n.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileToDataURL = (f) => new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f); });

    // refresh everything after a whole-route operation
    function routeChanged(toastMsg) {
        sel = Math.min(sel, rb.notes.length - 1);
        refreshMap(true); renderNotes(); renderEditor(); canvas.setNote(rb.notes[sel]); markDirty();
        map.select(rb.notes[sel], true); placeMainEditMarker();
        if (toastMsg) toast(toastMsg);
    }

    // lengthen the route with another track; an end note rides the new finish
    function extension(r, trk) {
        const nt = r.track.concat(trk.slice(1).map((p) => ({ lat: p.lat, lon: p.lon })));
        const last = r.notes[r.notes.length - 1];
        r.track = nt; r.notes.forEach((n) => n.idx = RB.nearestIdx(nt, { lat: n.lat, lon: n.lon }));
        r.notes.push(makeNote(r, nt.length - 1, last ? last.road_type_out : 3));
    }

    /* ---------- export (self-contained .rdbk) ---------- */
    const stamp = () => { const d = new Date(), p = RB.pad2; return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()); };
    $('exportRdbk').onclick = async () => { if (!rb) return toast('Nothing to save.'); if (!(await confirmOpenCuts())) return; stampMeta(); RB.recomputeMetrics(rb); RB.recomputeCaps(rb); await embedUsed(rb); download(rb, RB.slug(rb.meta?.title) + '_' + stamp() + '.rdbk'); exported = true; clearDraft(); };
    // A4 PDF, generated on the device (jsPDF, lazy-loaded) — see rb-pdf.js
    $('exportPdf').onclick = async () => {
        if (!rb) return toast('Nothing to save.');
        if (!(await confirmOpenCuts())) return;
        stampMeta(); RB.recomputeMetrics(rb); RB.recomputeCaps(rb);
        toast('Generating PDF…');
        try { await RBPdf.generate(rb, { iconBasePath: '../assets/icons/' }); }
        catch (e) { toast(e.message || 'Could not generate the PDF.'); }
    };
    // round-trip back to GPX: the track + every note as a named waypoint
    $('exportGpx').onclick = async () => {
        if (!rb) return toast('Nothing to save.');
        if (!(await confirmOpenCuts())) return;
        const wpts = rb.notes.map((n) => ({ lat: n.lat, lon: n.lon, name: n.text || 'wpt' + n.num }));
        RBDownload(new Blob([RB.gpxDocument(rb.meta?.title, rb.track, wpts)], { type: 'application/gpx+xml' }), RB.slug(rb.meta?.title) + '_' + stamp() + '.gpx');
    };
    // embed EVERY used icon (self-contained .rdbk) and prune the unused ones
    async function embedUsed(r) {
        r.icons = r.icons || {};
        const used = new Set();
        r.notes.forEach((n) => (n.icons || []).forEach((ic) => used.add((ic.name || '').split('/').pop())));
        for (const base of used) {
            if (!base) continue;
            if (Object.keys(r.icons).some((k) => k.toLowerCase() === base.toLowerCase())) continue;
            const u = await RB.urlToDataURL('../assets/icons/' + base); if (u) r.icons[base] = u;
        }
        Object.keys(r.icons).forEach((k) => { if (![...used].some((b) => b.toLowerCase() === k.toLowerCase())) delete r.icons[k]; });
    }
    function download(obj, name) { RBDownload(new Blob([JSON.stringify(obj)], { type: 'application/x-roadbook' }), name); }


    /* ---------- startup: trip handoff → draft → recording → challenge/?rb ---------- */
    renderIcons();
    (async function startup() {
        const account = RBApi('config').then((cfg) => {
            meUser = cfg.user || null;
            updateSaveBtn();
            if (rb && !rb.meta.author && !$('rbAuthor').value) $('rbAuthor').value = userName(); // default author once we know the user
        });
        // ?trip=1 → a track recorded in the Recorder/Tripmaster, handed over via
        // sessionStorage (the Recorder also carries its waypoints and, when signed
        // in, the draft roadbook that already holds the geotagged photos).
        if (new URLSearchParams(location.search).get('trip')) {
            try {
                const pts = JSON.parse(sessionStorage.getItem('rb_trip_track') || 'null');
                const wpts = JSON.parse(sessionStorage.getItem('rb_trip_wpts') || '[]') || [];
                const tripDraft = +(sessionStorage.getItem('rb_trip_draft') || 0);
                ['rb_trip_track', 'rb_trip_wpts', 'rb_trip_draft'].forEach((k) => sessionStorage.removeItem(k));
                if (pts && pts.length >= 2) {
                    setRoadbook(RB.buildRoadbook({ name: 'Recorded trip', trkpts: pts, wpts }));
                    if (tripDraft) { await account; if (meUser) { currentRbId = tripDraft; setVis(0); loadPhotos(); } } // adopt the draft that holds the photos
                    markDirty();
                }
            } catch (e) { toast('Could not load the recorded trip.'); }
            if (rb) return;
        }
        let draft; try { draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch (e) {}
        if (draft && draft.rb && draft.rb.notes) {
            // Declining keeps the draft — it is overwritten by the next checkpoint and
            // cleared on save/export, so a mis-tap can't destroy unsaved work.
            if (await RBConfirm(t('Recover the unsaved draft?') + '<br><b>' + esc((draft.rb.meta && draft.rb.meta.title) || 'Roadbook') + '</b> · ' + draft.rb.notes.length + ' ' + t('notes'), t('Recover'))) {
                currentRbId = draft.currentRbId || 0; setVis(draft.isPublic ? 1 : 0);
                setRoadbook(draft.rb);
                if (Array.isArray(draft.gaps) && draft.gaps.length) { gaps = draft.gaps; refreshMap(true); }
                markDirty();
                return;
            }
        }
        if (await checkRecovery()) return;
        // Fork a public challenge → load as a brand-new roadbook (saving creates a new one).
        const ch = RBChallenges.publicFromUrl();
        if (ch) { try { const j = await RBChallenges.loadPublic(ch); currentRbId = 0; setVis(0); setRoadbook(j.roadbook); } catch (e) { toast('Could not load challenge.'); } return; }
        await account;
        const id = +(new URLSearchParams(location.search).get('rb') || 0);
        if (id && meUser) { const r = await RBApi('rb_get', { id }); if (r.ok && r.roadbook) { currentRbId = id; setVis(r.is_public ? 1 : 0); setRoadbook(r.roadbook); } }
    })();
})();
