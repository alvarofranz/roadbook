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
    const t = RBt, esc = RBesc; // shared helpers (app.js / i18n.js)
    const RT = ['Default', 'Motorway', 'Asphalt', 'Track', 'Off-piste'];
    const map = new RBMap('edMap', { zoom: 13 });
    let rb = null, sel = 0, std = null, dirty = false, exported = false;
    // draft checkpoint: every edit schedules a debounced write of the whole working
    // state; cleared once the work is safe (saved to profile or exported)
    const DRAFT_KEY = 'rb_editor_draft';
    let draftTimer = null;
    const saveDraft = () => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ rb, currentRbId, isPublic, gaps })); } catch (e) {} };
    const clearDraft = () => { clearTimeout(draftTimer); try { localStorage.removeItem(DRAFT_KEY); } catch (e) {} };
    const markDirty = () => { dirty = true; exported = false; updateSaveBtn(); clearTimeout(draftTimer); draftTimer = setTimeout(saveDraft, 2000); histPush(); };
    function updateSaveBtn() {
        const b = $('saveAccount'); if (!b) return;
        if (!meUser) { b.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Save'; b.classList.add('btn-primary'); return; }
        if (currentRbId && !dirty) { b.innerHTML = '<i class="fa-solid fa-circle-check"></i> Saved'; b.classList.remove('btn-primary'); }
        else { b.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Save'; b.classList.add('btn-primary'); }
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
        if (map.map.queryRenderedFeatures(e.point, { layers: ['rb-wpts'] }).length) return;
        const here = { lat: e.lngLat.lat, lon: e.lngLat.lng };
        if (mapTool === 'note') { if (rb) addWaypointNear(here); else toast('Load a roadbook first.'); }
        else if (mapTool === 'draw') drawPoint(here);
        else if (mapTool === 'cut') cutPoint(here);
    });

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
    // mode tools (pan · add note · draw · cut) are exclusive toggles; the rest are one-shot
    let mapTool = 'pan', cutFromIdx = -1, drawSeed = [];
    const MODE_TOOLS = ['toolPan', 'toolNote', 'toolDraw', 'toolCut'];
    function setMapTool(tool) {
        mapTool = tool; cutFromIdx = -1; drawSeed = []; map.setPin(null);
        MODE_TOOLS.forEach((id) => $(id).classList.toggle('on', $(id).dataset.tool === tool));
        map.setCursor(tool === 'pan' ? '' : 'crosshair');
    }
    MODE_TOOLS.forEach((id) => $(id).onclick = () => setMapTool($(id).dataset.tool));
    // translated hover tooltips (refreshed on language switch)
    function applyToolTips() {
        const maxed = $('mapEditor').classList.contains('max');
        const tips = {
            toolPan: 'Navigate', toolNote: 'Add note (tap the route)', toolDraw: 'Draw route (tap to extend)',
            toolCut: 'Cut (tap two points)', toolAddGpx: 'Add a GPX track', toolReverse: 'Reverse direction',
            toolSimplify: 'Simplify (remove GPS noise)', toolAdjust: 'Adjust on the trail (live GPS)',
            undoBtn: 'Undo (Ctrl+Z)', redoBtn: 'Redo (Ctrl+Y)', toolMax: maxed ? 'Exit full screen' : 'Maximize',
        };
        Object.entries(tips).forEach(([id, key]) => $(id).setAttribute('data-tip', t(key)));
    }
    applyToolTips();
    window.addEventListener('rb-lang', applyToolTips);
    // maximize the GPX editor (map + tool bar); Esc restores
    function setMax(on) {
        $('mapEditor').classList.toggle('max', on);
        $('toolMax').innerHTML = on ? '<i class="fa-solid fa-compress"></i>' : '<i class="fa-solid fa-expand"></i>';
        applyToolTips();
        if (map.map) setTimeout(() => map.map.resize(), 60);
    }
    $('toolMax').onclick = () => setMax(!$('mapEditor').classList.contains('max'));
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') { setMax(false); setMapTool('pan'); } });
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
    // Cut mode: tap two points — at the ends it trims; in the middle it removes
    // the span and leaves an OPEN cut (dashed connector) to fill by drawing.
    function cutPoint(p) {
        if (!rb) return toast('Load a roadbook first.');
        const idx = RB.nearestIdx(rb.track, p);
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
        if (!rb.notes.some((n) => n.idx === 0)) rb.notes.push(makeNote(rb, 0, rb.notes[0] ? rb.notes[0].road_type_in : 3));
        if (!rb.notes.some((n) => n.idx === last)) rb.notes.push(makeNote(rb, last, 3));
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
            d.close(); routeChanged('Removed ' + (before - rb.track.length) + ' points.');
        };
    };
    $('toolAdjust').onclick = () => { if (!rb) return toast('Load a roadbook first.'); setMax(false); setMapTool('pan'); startRecording('adjust'); };
    $('drawRoute').onclick = () => { setMapTool('draw'); toast('Tap the map to draw your route.'); };

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
    function setRoadbook(r) {
        rb = r; rb.icons = rb.icons || {}; rb.meta = rb.meta || {};
        dirty = false; gaps = [];
        $('loadFrom').hidden = true; $('recBar').hidden = true; $('rbPanel').hidden = false;
        $('rbTitle').value = rb.meta.title || ''; $('rbDesc').value = rb.meta.description || '';
        $('rbAuthor').value = rb.meta.author || userName() || ''; $('rbOrg').value = rb.meta.organization || '';
        setLogoPreview(rb.meta.logo); $('rbModified').textContent = rb.meta.modified || '—';
        updatePhotos(); updateSaveBtn();
        refreshMap(false); renderNotes(); renderIcons();
        sel = 0; canvas.setNote(rb.notes[0]); renderEditor();
        histReset(); setMapTool('pan');
        showView('map'); // start on the map + notes; tap a note to edit it
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
        setLogoPreview(rb.meta.logo);
        refreshMap(true); renderNotes(); renderIcons(); renderEditor(); canvas.setNote(rb.notes[sel]);
        $('prevNote').disabled = sel <= 0; $('nextNote').disabled = sel >= rb.notes.length - 1;
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
        $('viewNote').hidden = v !== 'note';
        if (v === 'map' && map && map.map) setTimeout(() => map.map.resize(), 60);
    }
    $('backToMap').onclick = () => showView('map');
    $('prevNote').onclick = () => select(sel - 1);
    $('nextNote').onclick = () => select(sel + 1);
    $('delNote').onclick = delNote;
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
    $('recordRoute').onclick = () => startRecording('new');
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
        if (draftId) { apiPost({ action: 'rb_delete', id: draftId }); draftId = 0; }
        recPaused = false; recTrack = []; recWpts = []; recPhotos = []; clearRec();
        if (map) map.setLiveTrack([], [], []);
        $('recDiscard').hidden = true; $('recBar').hidden = true; $('loadFrom').hidden = false;
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
        $('loadFrom').hidden = true; $('rbPanel').hidden = true; $('recBar').hidden = false; $('recDiscard').hidden = true;
        $('recPhoto').hidden = !meUser;
        if (mode === 'adjust') { showView('map'); if (map) { refreshMap(false); map.setOverlay([]); } draftId = currentRbId; $('recPhoto').hidden = !draftId; toast('Walk onto the trail (≤10 m) to start adjusting.'); }
        else { if (map) map.setLiveTrack([], [], []); if (meUser) { const r = await apiPost({ action: 'rb_draft' }); if (r.ok) draftId = r.id; } }
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
            if (map) map.setLiveTrack(recTrack, recWpts, recPhotos);
            if (recTrack.length % 5 === 0) saveRec(); // auto-save for crash recovery
        }
        updateRecStats(c.accuracy);
    }
    function updateRecStats(acc) {
        let m = 0; for (let i = 1; i < recTrack.length; i++) m += RB.geo.haversineM(recTrack[i - 1], recTrack[i]);
        const head = recPaused ? 'Paused ·' : (recMode === 'adjust' ? (adjP1 < 0 ? 'Adjust: get on the trail…' : (adjP2 >= 0 ? 'Adjust · will rejoin' : 'Adjust · recording')) : 'Recording…');
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
        if (recTrack.length < 2) { clearRec(); $('loadFrom').hidden = false; return toast('Route too short to save.'); }
        try {
            setRoadbook(RB.buildRoadbook({ name: 'Recorded route', trkpts: smoothTrack(recTrack), wpts: recWpts }));
            if (draftId) { currentRbId = draftId; setVis(0); await doSave(); } // persist the draft (photos already attached)
            markDirty(); clearRec(); toast('Route recorded · edit and save.');
        } catch (e) { $('loadFrom').hidden = false; toast('Error: ' + e.message); }
    };
    async function finishAdjust() {
        $('rbPanel').hidden = false; showView('map');
        if (adjP1 < 0 || recTrack.length < 2) { if (map) refreshMap(false); return toast('Adjust cancelled — you never got on the trail.'); }
        const rejoin = adjP2 >= 0;
        const ok = await RBConfirm(rejoin ? `Replace the trail between points ${adjP1} and ${adjP2} with your ${recTrack.length}-point variant?` : `Replace everything after point ${adjP1} with your new ${recTrack.length}-point ending?`, 'Apply');
        if (!ok) { if (map) refreshMap(false); return; }
        spliceByIndex(rb, smoothTrack(recTrack), adjP1, rejoin ? adjP2 : null);
        // merge any waypoints dropped during the adjust session (snap to the new track)
        recWpts.forEach((w) => {
            const idx = RB.nearestIdx(rb.track, w);
            if (!rb.notes.some((n) => n.idx === idx)) { const note = makeNote(rb, idx, 3); note.text = w.text || ''; rb.notes.push(note); }
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
        const yes = await RBConfirm(`Recover your unsaved recording (${s.track.length} points)?`, 'Recover');
        clearRec();
        if (!yes) return false;
        try { setRoadbook(RB.buildRoadbook({ name: 'Recovered route', trkpts: smoothTrack(s.track), wpts: s.wpts || [] })); markDirty(); return true; }
        catch (e) { return false; }
    }

    /* ---------- account: save to profile · public/private · load by ?rb ---------- */
    let meUser = null, currentRbId = 0, isPublic = 0;
    const apiPost = (body) => fetch('../api/index.php', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json()).catch(() => ({ ok: false, error: 'Network error.' }));
    $('visPrivate').onclick = () => { setVis(0); markDirty(); };
    $('visPublic').onclick = () => { setVis(1); markDirty(); };
    function setVis(v) { isPublic = v; $('visPrivate').classList.toggle('on', !v); $('visPublic').classList.toggle('on', !!v); }
    // fresh content (imported GPX / .rdbk) is a NEW roadbook, even mid-edit of a saved one
    function resetIdentity() { currentRbId = 0; setVis(0); try { history.replaceState(null, '', location.pathname); } catch (e) {} }
    async function doSave() {
        stampMeta(); RB.recomputeMetrics(rb); RB.recomputeCaps(rb); await embedUsed(rb);
        const r = await apiPost({ action: 'rb_save', id: currentRbId, is_public: isPublic, roadbook: rb });
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
        toast(r.ok ? (isPublic && r.slug ? 'Saved · public at /challenge/' + r.slug : 'Saved to your profile.') : (r.error || 'Could not save.'));
    };

    /* ---------- photo gallery (saved roadbook) ---------- */
    function updatePhotos() {
        if (currentRbId > 0) { $('photosSection').hidden = false; loadPhotos(); }
        else { $('photosSection').hidden = true; $('photoGrid').innerHTML = ''; }
    }
    async function loadPhotos() {
        const r = await apiPost({ action: 'ph_list', roadbook: currentRbId });
        const g = $('photoGrid');
        if (!r.ok || !r.photos.length) { g.innerHTML = '<span class="muted small">No photos yet.</span>'; if (map) map.setPhotos([]); return; }
        g.innerHTML = r.photos.map((p) => `<div class="photo-thumb"><img src="${p.url}" alt=""><span data-delp="${p.id}" class="del-badge">×</span></div>`).join('');
        g.querySelectorAll('[data-delp]').forEach((s) => s.onclick = async () => { await apiPost({ action: 'ph_delete', id: +s.dataset.delp }); loadPhotos(); });
        // pins on the map; tap a 📷 pin to promote it to a waypoint
        if (map) map.setPhotos(r.photos, (ph) => {
            if (ph.lat == null) return;
            RBConfirm('Create a waypoint at this photo?', 'Create').then((yes) => { if (yes && rb) addWaypointNear({ lat: ph.lat, lon: ph.lon }); });
        });
    }
    $('addPhotoBtn').onclick = () => { if (!currentRbId) return toast('Save to your profile first.'); $('photoFile').click(); };
    $('photoFile').onchange = async (e) => {
        let failed = 0;
        for (const f of e.target.files) {
            const r = await RBUpload({ type: 'photo', roadbook: String(currentRbId) }, f);
            if (!r.ok) failed++;
        }
        e.target.value = ''; loadPhotos(); toast(failed ? 'Some photos failed.' : 'Photos uploaded.');
    };

    /* ---------- notes + selection ---------- */
    function renderNotes() {
        $('noteList').innerHTML = rb.notes.map((n, i) => `<div class="note-mini ${i === sel ? 'sel' : ''}" data-i="${i}">
                <span class="note-number">${n.num}</span>
                <span class="label">${n.text ? esc(n.text) : '<span class="muted">(no text)</span>'}</span>
                <span class="muted small">${((n.distance ?? 0) / 1000).toFixed(1)}km</span>
            </div>`).join('');
        // road-type accent colour is data-driven → set the CSS variable per row
        $('noteList').querySelectorAll('.note-mini').forEach((el, i) => el.style.setProperty('--rt', (RB.ROAD_TYPES[rb.notes[i].road_type_out] || RB.ROAD_TYPES[3]).color));
        $('noteList').querySelectorAll('.note-mini').forEach((c) => c.onclick = () => select(+c.dataset.i));
        const nc = $('noteCount'); if (nc) nc.textContent = rb.notes.length ? '· ' + rb.notes.length : '';
    }
    function select(i) {
        if (!rb || i < 0 || i >= rb.notes.length) return;
        sel = i; renderNotes(); map.select(rb.notes[i]); renderEditor();
        canvas.setNote(rb.notes[i]); showView('note'); showNoteTab('vig');
        $('prevNote').disabled = sel <= 0; $('nextNote').disabled = sel >= rb.notes.length - 1;
    }

    /* ---------- viewNote tabs: Vignette ↔ Map (drag to reposition) ---------- */
    let noteMap = null;
    $('tabBtnVig').onclick = () => showNoteTab('vig');
    $('tabBtnMap').onclick = () => showNoteTab('map');
    function showNoteTab(which) {
        const onMap = which === 'map';
        $('tabVignette').hidden = onMap; $('tabMap').hidden = !onMap;
        $('tabBtnVig').classList.toggle('on', !onMap); $('tabBtnMap').classList.toggle('on', onMap);
        if (onMap) openNoteMap();
    }
    function openNoteMap() {
        if (!rb) return;
        if (!noteMap) {
            noteMap = new RBMap('noteMap', { zoom: 14 });
            // tapping another note on the map switches the one being edited, staying on the map
            noteMap.onWaypoint((i) => { sel = i; renderEditor(); canvas.setNote(rb.notes[i]); placeEditMarker(); });
        }
        noteMap.showRoadbook(rb, true, gapIdxs());
        placeEditMarker();
        setTimeout(() => { if (noteMap.map) noteMap.map.resize(); }, 60);
    }
    function placeEditMarker() {
        if (!noteMap || !rb.notes[sel]) return;
        noteMap.setEditMarker(rb.notes[sel], (lat, lon) => {
            const note = rb.notes[sel];
            note.idx = RB.nearestIdx(rb.track, { lat, lon });
            RB.recomputeMetrics(rb); RB.recomputeCaps(rb); markDirty();
            sel = rb.notes.indexOf(note);
            noteMap.showRoadbook(rb, true, gapIdxs()); placeEditMarker();
            renderNotes(); renderEditor(); canvas.setNote(rb.notes[sel]);
        });
    }
    function renderEditor() {
        const n = rb.notes[sel];
        const opts = (cur) => RT.map((l, k) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${t(l)}</option>`).join('');
        const dangerOpts = ['—', '!', '!!', '!!!'].map((l, k) => `<option value="${k}" ${k === (n.danger || 0) ? 'selected' : ''}>${l}</option>`).join('');
        $('editor').innerHTML = `
            <div class="meta-card">
                <div class="meta-head"><b>${t('Note')} ${n.num}</b><span class="muted small">${((n.distance ?? 0) / 1000).toFixed(2)} km · trip +${((n.partial_distance ?? 0) / 1000).toFixed(2)}</span></div>
                <div class="meta-grid">
                    <label class="meta-field full"><span>${t('Text')}</span><input type="text" id="edText" class="field" value="${esc(n.text || '')}" placeholder="${t('Description')}"></label>
                    <label class="meta-field"><span>${t('Road in')}</span><select id="edRin" class="field">${opts(n.road_type_in)}</select></label>
                    <label class="meta-field"><span>${t('Road out')}</span><select id="edRout" class="field">${opts(n.road_type_out)}</select></label>
                    <label class="meta-field"><span>${t('Danger')}</span><select id="edDanger" class="field">${dangerOpts}</select></label>
                    <div class="meta-field"><span>${t('Red CAP')}</span>
                        <label class="checkbox-row"><input type="checkbox" id="edCap" ${n.cap != null ? 'checked' : ''}> <span class="muted small">${n.cap != null ? Math.round(n.cap) + '° · ' + ((n.cap_distance || 0) / 1000).toFixed(2) + ' km' : 'off'}</span></label>
                    </div>
                </div>
            </div>`;
        $('edText').oninput = (e) => { n.text = e.target.value; renderNotes(); markDirty(); };
        $('edRin').onchange = (e) => { n.road_type_in = +e.target.value; canvas.render(); renderNotes(); markDirty(); };
        $('edRout').onchange = (e) => { n.road_type_out = +e.target.value; canvas.render(); renderNotes(); markDirty(); };
        $('edDanger').onchange = (e) => { const v = +e.target.value; if (v) n.danger = v; else delete n.danger; canvas.render(); markDirty(); };
        $('edCap').onchange = (e) => { toggleCap(e.target.checked); markDirty(); };
    }
    function toggleCap(on) {
        const n = rb.notes[sel], nx = rb.notes[sel + 1];
        if (on && nx) { n.cap = Math.round(RB.geo.bearingDeg(n, nx)); n.cap_distance = Math.round(RB.geo.haversineM(n, nx)); }
        else { n.cap = null; n.cap_distance = null; }
        renderEditor();
    }
    function delNote() {
        if (rb.notes.length <= 2) return toast('At least 2 notes must remain.');
        rb.notes.splice(sel, 1); RB.recomputeMetrics(rb); RB.recomputeCaps(rb); markDirty();
        refreshMap(true); select(Math.min(sel, rb.notes.length - 1));
    }
    function addWaypointNear(pt) {
        const idx = RB.nearestIdx(rb.track, pt);
        if (rb.notes.some((n) => n.idx === idx)) return toast('There is already a note here.');
        rb.notes.push(makeNote(rb, idx, 3));
        RB.recomputeMetrics(rb); refreshMap(true); renderNotes(); markDirty();
        toast('Waypoint added.');
    }

    /* ---------- icons (standard palette + yours, embedded in the roadbook) ---------- */
    async function loadStd() { if (std) return std; try { std = await (await fetch('../assets/icons/index.json')).json(); } catch (e) { std = { categories: {} }; } return std; }
    async function renderIcons() {
        await loadStd();
        const lib = rb ? rb.icons || {} : {};
        const stdNames = new Set(Object.values(std.categories || {}).flat().map((x) => x.toLowerCase()));
        const custom = Object.keys(lib).filter((n) => !stdNames.has(n.toLowerCase()));
        let html = '';
        if (custom.length) html += `<div class="icon-category">${t('Yours (in this roadbook)')}</div>` + custom.map((n) => iconBtn(n, lib[n], true)).join('');
        html += Object.entries(std.categories || {}).map(([cat, files]) => `<div class="icon-category">${t(cat)}</div>` + files.map((f) => iconBtn(f, '../assets/icons/' + f, false)).join('')).join('');
        $('iconGrid').innerHTML = html || '<span class="muted small">No icons.</span>';
        $('iconGrid').querySelectorAll('button[data-add]').forEach((b) => {
            b.onclick = () => addIcon(b.dataset.add);
            b.draggable = true;
            b.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', b.dataset.add);
                e.dataTransfer.effectAllowed = 'copy';
                const img = b.querySelector('img'); if (img) e.dataTransfer.setDragImage(img, 18, 18);
            });
        });
        $('iconGrid').querySelectorAll('span[data-del]').forEach((s) => s.onclick = (ev) => { ev.stopPropagation(); delCustomIcon(s.dataset.del); });
        filterIcons();
    }
    // live palette filter: match icon names, hide emptied categories
    $('iconSearch').oninput = filterIcons;
    function filterIcons() {
        const q = $('iconSearch').value.trim().toLowerCase();
        let category = null, categoryHasHits = false;
        [...$('iconGrid').children].forEach((el) => {
            if (el.classList.contains('icon-category')) {
                if (category) category.hidden = !categoryHasHits;
                category = el; categoryHasHits = false;
                return;
            }
            const hit = !q || (el.dataset.add || '').toLowerCase().includes(q);
            el.hidden = !hit;
            if (hit) categoryHasHits = true;
        });
        if (category) category.hidden = !categoryHasHits;
    }
    const iconBtn = (name, src, rmv) =>
        `<button data-add="${name}" title="${name}">${rmv ? `<span data-del="${name}" class="del-badge">×</span>` : ''}<img src="${src}" alt="" loading="lazy"></button>`;
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
        if (toastMsg) toast(toastMsg);
    }

    /* ---------- vignette clipboard: copy / cut / paste between notes ---------- */
    // The clipboard carries the drawing (icons + junctions) plus the data URIs of
    // any custom symbols, so a paste stays self-contained even across roadbooks.
    let vigClip = null;
    const deepClone = (v) => JSON.parse(JSON.stringify(v));
    function copyVignette(cut) {
        if (!rb) return;
        const n = rb.notes[sel], lib = {};
        (n.icons || []).forEach((ic) => {
            const base = (ic.name || '').split('/').pop();
            const k = Object.keys(rb.icons).find((x) => x.toLowerCase() === base.toLowerCase());
            if (k) lib[k] = rb.icons[k];
        });
        vigClip = deepClone({ icons: n.icons || [], junctions: n.junctions || null, lib });
        if (cut) { n.icons = []; n.junctions = null; canvas.setNote(n); markDirty(); }
        $('pasteVig').disabled = false;
        toast(cut ? 'Vignette cut.' : 'Vignette copied.');
    }
    $('copyVig').onclick = () => copyVignette(false);
    $('cutVig').onclick = () => copyVignette(true);
    $('pasteVig').onclick = () => {
        if (!vigClip || !rb) return;
        const n = rb.notes[sel];
        n.icons = deepClone(vigClip.icons);
        n.junctions = vigClip.junctions ? deepClone(vigClip.junctions) : null;
        Object.assign(rb.icons, deepClone(vigClip.lib));
        canvas.setNote(n); renderIcons(); markDirty();
        toast('Vignette pasted.');
    };

    // lengthen the route with another track; an end note rides the new finish
    function extension(r, trk) {
        const nt = r.track.concat(trk.slice(1).map((p) => ({ lat: p.lat, lon: p.lon })));
        const last = r.notes[r.notes.length - 1];
        r.track = nt; r.notes.forEach((n) => n.idx = RB.nearestIdx(nt, { lat: n.lat, lon: n.lon }));
        r.notes.push(makeNote(r, nt.length - 1, last ? last.road_type_out : 3));
    }

    /* ---------- export (self-contained .rdbk) ---------- */
    const slugify = (s) => (String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'roadbook');
    const stamp = () => { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()); };
    $('exportRdbk').onclick = async () => { if (!rb) return toast('Nothing to save.'); if (!(await confirmOpenCuts())) return; stampMeta(); RB.recomputeMetrics(rb); RB.recomputeCaps(rb); await embedUsed(rb); download(rb, slugify(rb.meta?.title) + '_' + stamp() + '.rdbk'); exported = true; clearDraft(); };
    // round-trip back to GPX: the track + every note as a named waypoint
    $('exportGpx').onclick = async () => {
        if (!rb) return toast('Nothing to save.');
        if (!(await confirmOpenCuts())) return;
        const wpts = rb.notes.map((n) => ({ lat: n.lat, lon: n.lon, name: n.text || 'wpt' + n.num }));
        RBDownload(new Blob([RB.gpxDocument(rb.meta?.title, rb.track, wpts)], { type: 'application/gpx+xml' }), slugify(rb.meta?.title) + '_' + stamp() + '.gpx');
    };
    // embed EVERY used icon (self-contained .rdbk) and prune the unused ones
    async function embedUsed(r) {
        r.icons = r.icons || {};
        const used = new Set();
        r.notes.forEach((n) => (n.icons || []).forEach((ic) => used.add((ic.name || '').split('/').pop())));
        for (const base of used) {
            if (!base) continue;
            if (Object.keys(r.icons).some((k) => k.toLowerCase() === base.toLowerCase())) continue;
            const u = await urlToDataURL('../assets/icons/' + base); if (u) r.icons[base] = u;
        }
        Object.keys(r.icons).forEach((k) => { if (![...used].some((b) => b.toLowerCase() === k.toLowerCase())) delete r.icons[k]; });
    }
    async function urlToDataURL(url) { try { const res = await fetch(url); if (!res.ok) return null; const b = await res.blob(); return await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); }); } catch (e) { return null; } }
    function download(obj, name) { RBDownload(new Blob([JSON.stringify(obj)], { type: 'application/x-roadbook' }), name); }

    /* ---------- utils ---------- */
    let toastT = null;
    function toast(m) { const el = $('toast'); el.textContent = RBt(m); el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => el.hidden = true, 2500); }

    /* ---------- startup: trip handoff → draft → recording → challenge/?rb ---------- */
    renderIcons();
    (async function startup() {
        const account = apiPost({ action: 'config' }).then((cfg) => {
            meUser = cfg.user || null;
            updateSaveBtn();
            if (rb && !rb.meta.author && !$('rbAuthor').value) $('rbAuthor').value = userName(); // default author once we know the user
        });
        // ?trip=1 → a track recorded in the Tripmaster, handed over via sessionStorage
        if (new URLSearchParams(location.search).get('trip')) {
            try { const pts = JSON.parse(sessionStorage.getItem('rb_trip_track') || 'null'); sessionStorage.removeItem('rb_trip_track'); if (pts && pts.length >= 2) { setRoadbook(RB.buildRoadbook({ name: 'Recorded trip', trkpts: pts, wpts: [] })); markDirty(); } } catch (e) { toast('Could not load the recorded trip.'); }
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
        if (id && meUser) { const r = await apiPost({ action: 'rb_get', id }); if (r.ok && r.roadbook) { currentRbId = id; setVis(r.is_public ? 1 : 0); setRoadbook(r.roadbook); } }
    })();
})();
