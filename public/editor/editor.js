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
    // A field label followed by an inline ⓘ help tooltip (#89). `tipKey` is an i18n key.
    const labelHelp = (label, tipKey) => `${t(label)}<button type="button" class="help-tip" data-tip="${esc(t(tipKey))}" aria-label="${esc(t(tipKey))}"><i class="fa-solid fa-circle-info"></i></button>`;
    const RT = ['Default', 'Motorway', 'Asphalt', 'Track', 'Off-piste'];
    // base map style: satellite photo, or terrain (detailed off-road tracks + contours).
    // The style URLs live in ONE place — RBMap (shared with the Reader's layer toggle).
    const MAP_STYLES = { satellite: RBMap.STYLE_SATELLITE, terrain: RBMap.STYLE_TOPO };
    let mapStyle = localStorage.getItem('rb_map_style') === 'terrain' ? 'terrain' : 'satellite';
    const map = new RBMap('edMap', { zoom: 13, style: MAP_STYLES[mapStyle], geolocate: true, wpIconsToggle: true });
    // Right-click on the map → a context popup whose commands depend on what's under the cursor:
    // a note (waypoint), a plain track point, or empty ground — same look, context-specific items.
    // Every point command also has a one-key shortcut (#35), shown to the right of its label.
    let ctxPhotoPoint = null; // the map point a context-menu photo upload is geotagged at
    let pastePoint = null;    // the point a context-menu "Paste photo" armed; the next Ctrl+V drops the image here
    let ctxMenu = null;       // the open context popup + its key→action map
    let selVertex = -1;       // the tap-selected track vertex (Move-points tool); the target of the W/M/A/L/Del shortcuts
    function uploadPhotoHere(p) {
        if (!(currentRbId > 0)) return toast('Save to your profile first.');
        ctxPhotoPoint = p; $('ctxPhotoFile').click();
    }
    async function pastePhotoHere(p) {
        if (!(currentRbId > 0)) return toast('Save to your profile first.');
        try { // one-click: read the clipboard image and drop it on the point
            window.focus(); // clipboard.read() needs the document focused
            let blob = null;
            for (const it of await navigator.clipboard.read()) {
                const ty = it.types.find((x) => /^image\//.test(x));
                if (ty) { blob = await it.getType(ty); break; }
            }
            if (!blob) return toast('No image in the clipboard.');
            const ok = (await uploadPhoto(new File([blob], 'pasted.png', { type: blob.type }), p.lat, p.lon)).ok;
            await loadPhotos(); toast(ok ? 'Photos uploaded.' : 'Some photos failed.');
        } catch (err) { // clipboard blocked (permission/focus) → fall back to the working Ctrl+V flow
            pastePoint = p;
            toast('Press Ctrl+V to paste the photo here');
        }
    }
    function closeCtxMenu() { if (ctxMenu) { ctxMenu.popup.remove(); ctxMenu = null; } }
    // Build a context popup from a list of items: { id, icon, label, key?, cls?, href?, run?, coords? }.
    // pastePt arms Ctrl+V to drop a clipboard photo at that point while the menu is open.
    function openCtxMenu(lngLat, items, pastePt) {
        closeCtxMenu();
        const html = items.map((it) => {
            if (it.coords) return `<span class="map-ctx-coords">${it.coords}</span>`;
            const inner = `<i class="fa-solid ${it.icon}"></i> ${esc(t(it.label))}${it.key ? `<span class="map-ctx-key">${it.key}</span>` : ''}`;
            return it.href
                ? `<a class="map-ctx-link" href="${it.href}" target="_blank" rel="noopener">${inner}</a>`
                : `<button type="button" class="map-ctx-link ${it.cls || ''}" data-k="${it.id}">${inner}</button>`;
        }).join('');
        const popup = new maplibregl.Popup({ closeButton: true, closeOnClick: true, offset: 8, maxWidth: 'none' }).setLngLat(lngLat).setHTML(html).addTo(map.map); // size to content so the coords line never wraps
        const el = popup.getElement(), keys = {};
        items.forEach((it) => {
            if (!it.run) return;
            const b = el.querySelector(`[data-k="${it.id}"]`);
            if (b) b.onclick = () => { popup.remove(); it.run(); };
            if (it.key) keys[it.key.toLowerCase()] = it.run;
        });
        popup.on('close', () => { if (ctxMenu && ctxMenu.popup === popup) ctxMenu = null; });
        ctxMenu = { popup, keys, pastePoint: pastePt || null };
    }
    // The map context menu — right-click on desktop, long-press on touch (#83). Its command set
    // depends on what's under the point: a note, a plain track point, or empty ground.
    function openMapMenu(lngLat, point) {
        if (!map.ready || recWatch != null) return; // never edit mid-recording
        const here = { lat: lngLat.lat, lon: lngLat.lng };
        const lat = here.lat.toFixed(6), lon = here.lon.toFixed(6);
        const maps = { id: 'maps', icon: 'fa-map-location-dot', label: 'Open in Google Maps', href: `https://www.google.com/maps/search/?api=1&query=${lat},${lon}` };
        // Google Earth alongside Maps (#69): one window that recentres + 3D/Street View and historical
        // imagery — handy for spotting tracks hidden under foliage (leaf-off views).
        const earth = { id: 'earth', icon: 'fa-earth-americas', label: 'Open in Google Earth', href: `https://earth.google.com/web/search/${lat},${lon}` };
        const photo = (p) => [
            { id: 'photo', icon: 'fa-camera', label: 'Upload a photo here', run: () => uploadPhotoHere(p) },
            { id: 'paste', icon: 'fa-paste', label: 'Paste photo', key: 'Ctrl V', run: () => pastePhotoHere(p) },
        ];
        const card = { es: 'NSEO', it: 'NSEO' }[document.documentElement.lang] || 'NSEW'; // N·S·E·W, but West → O in it/es (Ovest/Oeste)
        const coords = { coords: `${t('Coords Lat/Lng:')} ${here.lat >= 0 ? card[0] : card[1]} ${Math.abs(here.lat).toFixed(6)} ${Math.abs(here.lon).toFixed(6)} ${here.lon >= 0 ? card[2] : card[3]}` };
        const wf = rb && map.map.queryRenderedFeatures(point, { layers: ['rb-wpts'] })[0];
        const vf = rb && !wf && map.map.queryRenderedFeatures(point, { layers: ['rb-verts'] })[0];
        if (wf) {                                   // a note (waypoint)
            const ni = parseInt(wf.properties.i, 10);
            openCtxMenu(lngLat, [
                { id: 'trk', icon: 'fa-link-slash', label: 'Transform waypoint into track point', key: 'T', run: () => transformNote(ni) },
                ...photo(rb.notes[ni]),
                { id: 'del', icon: 'fa-trash', label: 'Delete note', key: 'Del', cls: 'map-ctx-delpt', run: () => deleteNoteConfirm(ni) },
                maps, earth, coords], rb.notes[ni]);
        } else if (vf) {                            // a plain track point
            const ti = parseInt(vf.properties.i, 10);
            openCtxMenu(lngLat, [
                { id: 'note', icon: 'fa-map-pin', label: 'Add waypoint', key: 'W', run: () => vertexAction('note', ti) },
                { id: 'mid', icon: 'fa-arrows-left-right-to-line', label: 'Add intermediate point', key: 'A', run: () => vertexAction('mid', ti) },
                { id: 'line', icon: 'fa-plus', label: 'Add point on line', key: 'L', run: () => vertexAction('line', ti) },
                ...photo(rb.track[ti]),
                { id: 'del', icon: 'fa-trash', label: 'Delete point', key: 'Del', cls: 'map-ctx-delpt', run: () => vertexAction('del', ti) },
                maps, earth, coords], rb.track[ti]);
        } else {                                    // empty ground (route ops act on the nearest point)
            openCtxMenu(lngLat, [
                ...(rb ? [
                    { id: 'note', icon: 'fa-map-pin', label: 'Add note here', key: 'W', run: () => addNoteAtExact(here) },
                    { id: 'pt', icon: 'fa-circle-plus', label: 'Add point here', key: 'L', run: () => addPointAtExact(here) },
                    { id: 'del', icon: 'fa-circle-minus', label: 'Delete this point', key: 'Del', cls: 'map-ctx-delpt', run: () => deleteTrackPointNear(here) },
                ] : []),
                ...photo(here),
                maps, earth, coords], here);
        }
    }
    if (map.map) {
        map.map.on('contextmenu', (e) => { e.preventDefault(); openMapMenu(e.lngLat, e.point); });
        // No right-click on touch (iPad/phones): a ~500 ms long-press held still opens the same menu (#83).
        let lpTimer = null, lpAt = null;
        const lpCancel = () => { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } };
        map.map.on('touchstart', (e) => {
            lpCancel();
            if (e.points && e.points.length > 1) return; // pinch / multi-touch is not a long-press
            const ll = e.lngLat, pt = e.point; lpAt = pt;
            lpTimer = setTimeout(() => { lpTimer = null; openMapMenu(ll, pt); }, 500);
        });
        map.map.on('touchmove', (e) => { if (lpAt && e.point && (Math.abs(e.point.x - lpAt.x) > 10 || Math.abs(e.point.y - lpAt.y) > 10)) lpCancel(); });
        map.map.on('touchend', lpCancel);
        map.map.on('touchcancel', lpCancel);
    }
    // Live mouse position on the map → the add/delete shortcuts can act there directly, without
    // first opening the context menu (#35/#61).
    let hoverPt = null;
    if (map.map) {
        map.map.on('mousemove', (e) => { hoverPt = { lat: e.lngLat.lat, lon: e.lngLat.lng }; });
        map.map.on('mouseout', () => { hoverPt = null; });
    }
    // Editor shortcuts (#35): the context menu's commands accelerate while it's open; otherwise the
    // keys act on the current selection (a tap-selected track vertex, else the open note), and with
    // nothing selected W/L/Del add or delete at the mouse position.
    window.addEventListener('keydown', (e) => {
        if (!rb || recWatch != null || e.target.matches('input, textarea, select')) return;
        if (e.ctrlKey || e.metaKey || e.altKey) { // Ctrl/Cmd+V over a context menu → paste the photo at its point (the native paste event uploads it)
            if (ctxMenu && ctxMenu.pastePoint && (e.key === 'v' || e.key === 'V')) { pastePoint = ctxMenu.pastePoint; closeCtxMenu(); }
            return; // leave undo/redo and the browser's own paste alone
        }
        const k = (e.key === 'Delete' || e.key === 'Backspace') ? 'del' : e.key.toLowerCase();
        if (ctxMenu) { // menu open: its commands are the accelerators
            const run = ctxMenu.keys[k];
            if (!run) return;
            e.preventDefault(); closeCtxMenu(); run();
        } else if (selVertex >= 0) { // a track vertex is selected
            const act = { w: 'note', a: 'mid', l: 'line', del: 'del' }[k];
            if (!act) return;
            e.preventDefault();
            const i = selVertex; selVertex = -1; // the index goes stale once the route changes
            vertexAction(act, i);
        } else if (editorOpen && sel >= 0) { // a note is selected
            if (k === 't') { e.preventDefault(); transformNote(sel); }
            else if (k === 'del') { e.preventDefault(); deleteNoteConfirm(sel); }
        } else if (hoverPt) { // nothing selected → act at the mouse position (no menu needed)
            if (k === 'w') { e.preventDefault(); addNoteAtExact(hoverPt); }
            else if (k === 'l') { e.preventDefault(); addPointAtExact(hoverPt); }
            else if (k === 'del') { e.preventDefault(); deleteTrackPointNear(hoverPt); }
        }
    });
    let rb = null, sel = 0, std = null, dirty = false, exported = false, editorOpen = false, vertRaf = 0;
    // draft checkpoint: every edit schedules a debounced write of the whole working
    // state; cleared once the work is safe (saved to profile or exported)
    const DRAFT_KEY = 'rb_editor_draft';
    let draftTimer = null;
    const saveDraft = () => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ rb, currentRbId, isPublic, gaps })); } catch (e) {} };
    const clearDraft = () => { clearTimeout(draftTimer); try { localStorage.removeItem(DRAFT_KEY); } catch (e) {} };
    const markDirty = () => { dirty = true; exported = false; updateSaveBtn(); clearTimeout(draftTimer); draftTimer = setTimeout(saveDraft, 2000); histPush(); };
    // Floppy save button: clickable only when there's something to save (a new roadbook, or
    // pending edits) — disabled once it's saved to the profile with no further changes.
    function updateSaveBtn() {
        const dis = !!(currentRbId && !dirty);
        ['saveAccount', 'cfgSave'].forEach((id) => { const b = $(id); if (b) b.disabled = dis; });
        const dlt = $('deleteSection'); if (dlt) dlt.hidden = !(currentRbId > 0); // delete only exists once it's saved
    }
    const mkIcon = (name, pos) => ({ name, pos, angle: 0, size: 32, flip_x: false });
    // The declarative speed_limit drives the vignette symbol: keep exactly one S-icon matching the
    // value (S99_end for a lifted limit, 0), or none. 130 km has no palette icon, so none is added.
    const SPEED_ICON = { 0: 'S99_end.svg', 10: 'S01_10km.svg', 20: 'S02_20km.svg', 30: 'S03_30km.svg', 40: 'S04_40km.svg', 50: 'S05_50km.svg', 60: 'S06_60km.svg', 70: 'S07_70km.svg', 80: 'S08_80km.svg', 90: 'S09_90km.svg', 100: 'S10_100km.svg', 110: 'S11_110km.svg', 120: 'S12_120km.svg' };
    function syncSpeedIcon(n) {
        n.icons = (n.icons || []).filter((ic) => RB.speedLimitFromName((ic.name || '').split('/').pop()) == null); // drop any existing speed symbol
        const name = n.speed_limit == null ? null : SPEED_ICON[n.speed_limit];
        if (name) n.icons.push(mkIcon(name, [0, 0]));
    }
    // A speed limit defines a controlled zone (#94): a positive limit makes the note a zone start
    // (DZ), the end-of-limit a zone end (FZ). Clearing the limit drops a speed-derived zone tag,
    // but never touches a manually-chosen non-zone type.
    function syncSpeedZone(n) {
        if (n.speed_limit == null) { if (n.wp_type === 'dz' || n.wp_type === 'fz') delete n.wp_type; }
        else n.wp_type = n.speed_limit === 0 ? 'fz' : 'dz';
    }
    // bare note anchored at track index `idx` — recomputeMetrics fills in the rest
    const makeNote = (r, idx, roadType) => ({ num: 0, idx, distance: 0, partial_distance: 0, lat: r.track[idx].lat, lon: r.track[idx].lon, text: '', cap: null, cap_distance: null, bearing_in: 0, bearing_out: 0, road_type_in: roadType, road_type_out: roadType, junctions: null, icons: [] });
    const canvas = new NoteCanvas($('noteCanvas'), { toolbarEl: $('noteToolbar'), onChange: () => markDirty(), resolveIcon: (ic) => RB.iconSrc(ic, rb, '../assets/icons/') });
    canvas.onDropIcon((name, pos) => canvas.addIcon(mkIcon(name, pos)));
    $('addJunction').onclick = () => { if (!rb) return toast('Load a roadbook first.'); canvas.addJunction(); };

    map.onWaypoint((i) => { if (mapTool === 'pan' || mapTool === 'points') select(i); }); // Move/Pan: tap a note to open it (a drag moves it); other tools keep you on the map
    if (map.map) map.map.on('click', (e) => {
        if (!map.ready || recWatch != null) return; // never edit mid-recording
        const here = { lat: e.lngLat.lat, lon: e.lngLat.lng };
        if (photoPlacing) { placePhotoHere(here); return; } // setting the position of a photo with no EXIF GPS
        if (map.map.queryRenderedFeatures(e.point, { layers: ['rb-wpts'] }).length) return;
        if (mapTool === 'note') { if (rb) addWaypointNear(here); else toast('Load a roadbook first.'); }
        else if (mapTool === 'draw') drawPoint(here);
        else if (mapTool === 'insert') { if (rb) insertPointOnLine(here); else toast('Load a roadbook first.'); }
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
    // Waypoint drag (default Move): the blue note marker moves its underlying track vertex, so the
    // track line drags with it — a wpt is movable exactly like a trk (#61). Live, then commit on release.
    function onWptDrag(ni, lat, lon) {
        if (!rb || ni < 0 || ni >= rb.notes.length) return;
        const n = rb.notes[ni];
        rb.track[n.idx] = { lat: RB.round6(lat), lon: RB.round6(lon) };
        n.lat = rb.track[n.idx].lat; n.lon = rb.track[n.idx].lon; // keep the marker + line together while dragging
        if (vertRaf) return;
        vertRaf = requestAnimationFrame(() => { vertRaf = 0; refreshMap(true); });
    }
    function onWptCommit() {
        RB.recomputeMetrics(rb); RB.recomputeCaps(rb);
        refreshMap(true); renderNotes();
        if (editorOpen && sel >= 0) { renderEditor(); canvas.setNote(rb.notes[sel]); map.select(rb.notes[sel], true); }
        markDirty();
    }
    // Photo pins drag exactly like waypoints in Move mode (#41): move the pin live, then persist
    // the new position on release via ph_move. Photo position is server-side (not in the roadbook).
    function onPhotoDrag(photo, lat, lon) {
        const p = (notePhotos || []).find((x) => +x.id === +photo.id);
        if (!p) return;
        p.lat = RB.round6(lat); p.lon = RB.round6(lon);
        map.setPhotos(notePhotos); // repaint the pin at the pointer (keeps the existing tap handler)
    }
    async function onPhotoCommit(photo) {
        const p = (notePhotos || []).find((x) => +x.id === +photo.id) || photo;
        const r = await RBApi('ph_move', { id: +photo.id, lat: +p.lat, lon: +p.lon });
        await loadPhotos();
        toast(r.ok ? 'Photo moved.' : 'Could not move the photo.');
    }
    // Tap a track point (high zoom, move-points tool) → just highlight it; its command menu
    // (with shortcuts) opens on a right-click of the marker — see the map contextmenu handler.
    function onVertexSelect(i) {
        if (!rb || i < 0 || i >= rb.track.length) return;
        const tp = rb.track[i];
        selVertex = i; // the W/M/A/L/Del shortcuts now target this point
        map.setSelectedVertex(tp);
        // centre + rotate to the heading at this point, like selecting a note (arrival heading)
        const heading = i > 0 ? RB.geo.bearingDeg(rb.track[i - 1], tp)
            : (i < rb.track.length - 1 ? RB.geo.bearingDeg(tp, rb.track[i + 1]) : 0);
        if (map.map && map.ready) map.map.easeTo({ center: [tp.lon, tp.lat], zoom: Math.max(map.map.getZoom(), 14), bearing: heading, duration: 450 });
    }
    // Track-point context commands (from the menu, or its keyboard shortcut). #35
    function vertexAction(act, i) {
        if (!rb || i < 0 || i >= rb.track.length) return;
        const pt = rb.track[i];
        if (act === 'note') { promoteVertex(i); } // attach a note to THIS vertex — no new geometry (#61)
        else if (act === 'mid') { addMidpointAfter(i); }
        else if (act === 'line') { setMapTool('insert'); toast('Tap the route to add a point.'); }
        else if (act === 'del') { deleteTrackPointNear(pt); }
    }
    // A: insert a track point at the midpoint of the segment that follows point i.
    function addMidpointAfter(i) {
        if (i >= rb.track.length - 1) return toast('No point follows this one.');
        const a = rb.track[i], b = rb.track[i + 1];
        const mid = { lat: (a.lat + b.lat) / 2, lon: (a.lon + b.lon) / 2 };
        if (a.ele != null && b.ele != null) mid.ele = Math.round((a.ele + b.ele) / 2);
        rb.track.splice(i + 1, 0, mid);
        rb.notes.forEach((n) => { if (n.idx > i) n.idx += 1; });
        RB.recomputeMetrics(rb); RB.recomputeCaps(rb);
        routeChanged('Point added.');
        selVertex = i + 1; map.setSelectedVertex(rb.track[i + 1]); // keep the new point selected so repeated A chains (#61)
    }
    // T: drop the note but keep its track point (waypoint → plain track point), with a confirm.
    async function transformNote(ni) {
        if (!rb || ni < 0 || ni >= rb.notes.length) return;
        if (rb.notes.length <= 2) return toast('At least 2 notes must remain.');
        if (!(await RBConfirmDanger(t('Turn this waypoint into a plain track point? Its note will be removed.'), t('Transform')))) return;
        rb.notes.splice(ni, 1);
        RB.recomputeMetrics(rb); RB.recomputeCaps(rb);
        routeChanged('Waypoint turned into a track point.');
    }
    async function deleteNoteConfirm(ni) {
        if (!rb || ni < 0 || ni >= rb.notes.length) return;
        if (rb.notes.length <= 2) return toast('At least 2 notes must remain.');
        const n = rb.notes[ni], label = '#' + n.num + (n.text ? ' — ' + n.text : '');
        if (!(await RBConfirmDanger(t('Delete note') + ' ' + label + '?', t('Delete')))) return;
        delNote(ni);
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
    const MODE_TOOLS = ['toolPan', 'toolNote', 'toolDraw', 'toolInsert', 'toolCut']; // Move ('points') is the default — no button
    function setMapTool(tool) {
        mapTool = tool; cutFromIdx = -1; drawSeed = []; map.setPin(null); map.setSelectedVertex(null); selVertex = -1;
        if (photoMoveMarker) { photoMoveMarker.remove(); photoMoveMarker = null; } // cancel a photo move on tool switch / Escape
        MODE_TOOLS.forEach((id) => $(id).classList.toggle('on', $(id).dataset.tool === tool));
        map.setCursor(tool === 'pan' || tool === 'points' ? '' : 'crosshair'); // points shows a per-handle grab cursor
        if (tool === 'points' && rb) { map.setVertexEditor(rb.track, onVertexDrag, onVertexCommit, onVertexSelect); map.setWaypointEditor(onWptDrag, onWptCommit); map.setPhotoEditor(onPhotoDrag, onPhotoCommit); } // Move: drag trk · wpt · photo
        else if ((tool === 'insert' || tool === 'draw') && rb) { map.showVertices(rb.track); map.setWaypointEditor(null); map.setPhotoEditor(null); } // dots visible (read-only) so you see the points while inserting/drawing (#52)
        else { map.setVertexEditor(null); map.setWaypointEditor(null); map.setPhotoEditor(null); }
        $('mapMenuPanel').hidden = true; // picking any tool closes the "more tools" menu
    }
    MODE_TOOLS.forEach((id) => $(id).onclick = () => setMapTool($(id).dataset.tool));
    $('mapMenuToggle').onclick = () => { const p = $('mapMenuPanel'); p.hidden = !p.hidden; };
    // translated hover tooltips (refreshed on language switch)
    function applyToolTips() {
        const tips = {
            toolPan: 'Navigate', toolNote: 'Add note (tap the route)', toolDraw: 'Draw route (tap to extend)',
            toolInsert: 'Insert a point (tap the route where you want it)',
            toolCut: 'Cut (tap two points)', toolAddGpx: 'Add a GPX track',
            toolSimplify: 'Simplify (remove GPS noise)', toolAdjust: 'Adjust on the trail (live GPS)',
            undoBtn: 'Undo (Ctrl+Z)', redoBtn: 'Redo (Ctrl+Y)', mapMenuToggle: 'More tools',
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
    function toggleMapStyle() {
        mapStyle = mapStyle === 'satellite' ? 'terrain' : 'satellite';
        try { localStorage.setItem('rb_map_style', mapStyle); } catch (e) {}
        map.setBaseStyle(MAP_STYLES[mapStyle], () => {
            if (recWatch != null) { map.setLiveTrack(recTrack, recWpts, recPhotos); return; } // repaint a live recording
            if (rb) { refreshMap(true); map.select(rb.notes[sel], true); } // setStyle wiped the selection layer
            if (currentRbId > 0) loadPhotos();
        });
    }
    // Top-right map control (beside the zoom buttons): satellite/terrain toggle + live zoom level.
    if (map.map) map.map.addControl({
        onAdd(m) {
            const c = document.createElement('div');
            c.className = 'maplibregl-ctrl maplibregl-ctrl-group rb-mapctl';
            const b = document.createElement('button');
            b.type = 'button'; b.className = 'rb-mapctl-layers';
            b.title = t('Satellite / terrain map'); b.setAttribute('aria-label', b.title);
            b.innerHTML = '<i class="fa-solid fa-layer-group"></i>';
            b.onclick = toggleMapStyle;
            const z = document.createElement('div');
            z.className = 'rb-mapctl-zoom'; z.setAttribute('aria-hidden', 'true');
            this._upd = () => { z.textContent = 'z' + m.getZoom().toFixed(1); };
            m.on('zoom', this._upd); this._upd(); this._m = m;
            c.append(b, z);
            return c;
        },
        onRemove() { if (this._m && this._upd) this._m.off('zoom', this._upd); },
    }, 'top-right');
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMapTool('points'); }); // Escape → back to the default Move tool
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
        if (!rb || rb.track.length < 2) {     // seed the first segment of a brand-new or routeless roadbook
            drawSeed.push(pt); map.setPin(drawSeed[0]);
            if (drawSeed.length === 2) {
                const meta = rb && rb.meta;       // a loaded routeless roadbook keeps its identity, title and metadata
                if (!rb) resetIdentity();
                const drawn = RB.buildRoadbook({ name: (meta && meta.title) || t('Drawn route'), trkpts: drawSeed });
                if (meta) drawn.meta = { ...meta, ...drawn.meta };
                setRoadbook(drawn);
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
    // Add a track point exactly where you tap ON the route (the projection onto the nearest
    // segment), so it lands where you can see it — not at the segment's midpoint.
    function insertPointOnLine(p) {
        const hit = RB.nearestOnTrack(rb.track, p);
        if (!hit) return toast('Tap on the route to insert a point.');
        if (new Set(gapIdxs()).has(hit.i)) return toast('Cannot insert on an open cut.');
        rb.track.splice(hit.i + 1, 0, { lat: RB.round6(hit.lat), lon: RB.round6(hit.lon) });
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
        sel = 0; routeChanged(toastMsg); setMapTool('points'); // cut done → back to the default Move tool
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
    // Reverse lives in the roadbook settings (it flips the whole route) and asks first.
    $('cfgReverse').onclick = async () => {
        if (!rb) return toast('Load a roadbook first.');
        if (!(await RBConfirm(t('Reverse the whole route? Start and finish swap, and every vignette is recomputed.'), t('Reverse direction')))) return;
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
    $('drawRoute').onclick = () => { loadStarted = true; showEditing(); setMapTool('draw'); toast('Tap the map to draw your route.'); };

    /* ---------- loading ---------- */
    // The opening screen is interactive immediately, while startup() is still running its async
    // crash-recovery prompts. Once the user picks a source here, suppress those prompts so a
    // recovery confirm can't pop on top of (e.g.) the public-challenge picker (#68).
    let loadStarted = false;
    $('loadGpx').onclick = () => { loadStarted = true; $('gpxFile').click(); };
    $('loadJson').onclick = () => { loadStarted = true; $('jsonFile').click(); };
    $('pickChallenge').onclick = () => { loadStarted = true; RBChallenges.pick((r) => { resetIdentity(); setRoadbook(r); }); }; // forking a challenge starts a NEW roadbook
    $('gpxFile').onchange = async (e) => {
        const files = Array.from(e.target.files);
        const g = files.find((f) => /\.gpx$/i.test(f.name)); if (!g) return;
        const w = files.find((f) => /\.wpt$/i.test(f.name));
        try {
            const text = await g.text();
            if (/openrally/i.test(text)) { // OpenRally GPX (openrally: extensions) → dedicated importer
                const { rb: orRb, warnings } = RB.parseOpenRally(text);
                resetIdentity(); setRoadbook(orRb);
                if (warnings.includes('placeholderTrack')) toast('Distance-only OpenRally: a placeholder track was inserted — redraw it on the map.');
                else if (warnings.includes('builtTrackFromWaypoints')) toast('OpenRally track built from the waypoint coordinates.');
                return;
            }
            const p = RB.parseGPX(text);
            if (w && (!p.wpts || !p.wpts.length)) p.wpts = RB.parseWPT(await w.text());
            resetIdentity();
            // GPX with waypoints but no track (#56): build the route THROUGH the waypoints so it opens
            // as an editable roadbook — the user can then redraw/refine the track.
            let trkpts = p.trkpts, fromWpts = false;
            if ((!trkpts || trkpts.length < 2) && p.wpts && p.wpts.length >= 2) { trkpts = p.wpts.map((wp) => ({ lat: wp.lat, lon: wp.lon })); fromWpts = true; }
            setRoadbook(RB.buildRoadbook({ name: p.name || g.name.replace(/\.gpx$/i, ''), trkpts, wpts: p.wpts }));
            if (fromWpts) toast('No track in the GPX — built a route through the waypoints; redraw or refine it as needed.');
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
        ['toolNote', 'toolInsert', 'toolCut', 'toolAddGpx', 'toolSimplify', 'toolAdjust'].forEach((id) => $(id).disabled = false); // route ops need a route
        $('rbTitle').value = rb.meta.title || ''; $('rbDesc').value = rb.meta.description || '';
        $('rbAuthor').value = rb.meta.author || userName() || ''; $('rbOrg').value = rb.meta.organization || '';
        setLogoPreview(rb.meta.logo); $('rbModified').textContent = rb.meta.modified || '—';
        $('cfgMapAccess').checked = rb.meta.map_access !== false; // optional field; default ON, absent = allowed
        $('cfgProfile').value = rb.meta.profile === 'rally' ? 'rally' : 'basic'; // absent ⇒ basic
        $('cfgWpRadius').value = rb.meta.default_wp_radius != null ? rb.meta.default_wp_radius : ''; // absent ⇒ per-type defaults
        updatePhotos(); updateAudio(); updateSaveBtn();
        refreshMap(false); renderNotes(); renderIcons(); flagUnresolvedIcons();
        sel = 0;
        if (rb.notes.length) { canvas.setNote(rb.notes[0]); renderEditor(); } else canvas.setNote(null);
        histReset();
        const routeless = rb.track.length < 2;
        setMapTool(routeless ? 'draw' : 'points'); // a routeless roadbook opens ready to draw; a loaded one defaults to moving points
        showView('map'); // tap a note to open its editor inline below the row
        if (routeless) toast('Tap the map to draw your route.');
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
        map.select(rb.notes[sel], true);
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
        if (v === 'map' && map && map.map) { setTimeout(() => map.map.resize(), 60); }
    }
    $('backToMap').onclick = () => showView('map');
    $('openConfig').onclick = () => { if (!rb) return toast('Load a roadbook first.'); showView('config'); };
    $('cfgMapAccess').onchange = (e) => { if (rb) { rb.meta.map_access = e.target.checked; markDirty(); } };
    // Roadbook profile scopes the WP-type vocabulary. Basic is the default → stored absent
    // (clean files); only 'rally' is persisted. Switching to Basic clears any rally-only types.
    $('cfgProfile').onchange = (e) => {
        if (!rb) return;
        if (e.target.value === 'rally') rb.meta.profile = 'rally'; else delete rb.meta.profile;
        if (e.target.value !== 'rally') { // drop types no longer offered
            const core = new Set(RB.wpTypesForProfile('basic').map((w) => w.id));
            rb.notes.forEach((n) => { if (n.wp_type && !core.has(n.wp_type)) delete n.wp_type; }); // keep wp_radius (independent of type)
        }
        markDirty(); renderNotes(); if (editorOpen && rb.notes[sel]) renderEditor();
    };
    // Roadbook-wide default validation radius (metres); a typed note with no explicit wp_radius
    // prefills from this, else from the type's catalog default. Absent ⇒ per-type defaults.
    $('cfgWpRadius').onchange = (e) => {
        if (!rb) return;
        const v = parseInt(e.target.value, 10);
        if (isFinite(v) && v > 0) {
            rb.meta.default_wp_radius = v;
            rb.notes.forEach((n) => { if (n.wp_radius == null) n.wp_radius = v; }); // fill every note that has no radius yet
        } else delete rb.meta.default_wp_radius;
        markDirty(); renderNotes(); if (editorOpen && rb.notes[sel]) renderEditor();
    };
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
        if (!(await RBConfirmDanger('Discard this recording? It cannot be undone.', 'Discard'))) return;
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
        sel = 0; refreshMap(false); renderNotes(); renderEditor(); canvas.setNote(rb.notes[0]); updatePhotos(); updateAudio(); markDirty();
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
            currentRbId = r.id; dirty = false; clearDraft(); updatePhotos(); updateAudio(); updateSaveBtn();
            // pin the identity to the URL so a reload (or version auto-refresh) keeps editing the same roadbook
            try { history.replaceState(null, '', location.pathname + '?rb=' + currentRbId); } catch (e) {}
        }
        return r;
    }
    async function saveRoadbook() {
        if (!meUser) return RBNeedAuth('Sign in to save this roadbook to your profile.');
        if (!rb) return toast('Nothing to save.');
        if (!(await confirmOpenCuts())) return;
        const r = await doSave();
        toast(r.ok ? (isPublic && r.slug ? t('Saved · public at') + ' /challenge/' + r.slug : 'Saved to your profile.') : (r.error || 'Could not save.'));
    }
    $('saveAccount').onclick = saveRoadbook;
    $('cfgSave').onclick = saveRoadbook; // the same Save, available inside the settings view too
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
    // Delete the saved roadbook (the button only shows once it exists on the server). Names it
    // in the confirm, then sends the user back to their list — the editor content is gone.
    $('deleteRb').onclick = async () => {
        if (!(currentRbId > 0)) return;
        const title = (rb && rb.meta && rb.meta.title) || 'Untitled';
        if (!(await RBConfirmDanger(t('Delete roadbook') + ' “' + esc(title) + '”?', t('Delete')))) return;
        const r = await RBApi('rb_delete', { id: currentRbId });
        if (r.ok) { clearDraft(); location.href = '../myroadbooks/'; }
        else toast(r.error || 'Could not delete.');
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
    /* ---------- voice notes (recorded WP audio, played back here) ---------- */
    function updateAudio() {
        if (currentRbId > 0) { $('audioSection').hidden = false; loadAudio(); }
        else { $('audioSection').hidden = true; $('audioList').innerHTML = ''; }
    }
    // Each clip was recorded at a waypoint, so it's labelled with (and ordered by) the nearest note.
    const nearestNote = (a) => {
        if (a.lat == null || a.lon == null || !rb || !rb.notes.length) return null;
        let best = null, bestD = Infinity;
        rb.notes.forEach((n) => { const dM = RB.geo.haversineM(a, n); if (dM < bestD) { bestD = dM; best = n; } });
        return best;
    };
    async function loadAudio() {
        const r = await RBApi('audio_list', { roadbook: currentRbId });
        const g = $('audioList');
        if (!r.ok || !r.audio.length) { g.innerHTML = `<span class="muted small">${esc(t('No voice notes yet.'))}</span>`; return; }
        g.innerHTML = r.audio.map((a) => {
            const n = nearestNote(a), label = n ? '#' + n.num : '';
            return `<div class="audio-item"><span class="audio-note">${esc(label)}</span><audio controls preload="none" src="${esc(a.url)}"></audio><button type="button" data-dela="${a.id}" data-note="${esc(label)}" class="del-badge" aria-label="${esc(t('Remove'))}">×</button></div>`;
        }).join('');
        g.querySelectorAll('[data-dela]').forEach((s) => s.onclick = async (e) => {
            e.stopPropagation();
            const ref = s.dataset.note ? ' (' + s.dataset.note + ')' : '';
            if (await RBConfirm(t('Delete this voice note?') + ref, t('Delete'), true)) { await RBApi('audio_delete', { id: +s.dataset.dela }); loadAudio(); }
        });
    }
    /* ---------- photo upload: every photo needs coordinates ---------- */
    // Read GPS from the JPEG's EXIF; if absent, queue the file and let the user tap the
    // map to set its position (one tap per queued photo). No photo is stored without coords.
    let photoPlacing = false, photoQueue = [], photoMoveMarker = null;
    $('addPhotoBtn').onclick = () => { if (!(currentRbId > 0)) return toast('Save to your profile first.'); $('photoFile').click(); };
    $('photoFile').onchange = async (e) => { const files = [...e.target.files]; e.target.value = ''; addPhotos(files); };
    // paste an image from the clipboard (Ctrl/Cmd+V) → upload it like any photo (EXIF or place on map)
    document.addEventListener('paste', async (e) => {
        if (!rb) return;
        const files = [...(e.clipboardData?.items || [])].filter((it) => /^image\//.test(it.type)).map((it) => it.getAsFile()).filter(Boolean);
        if (!files.length) return; // plain text/other paste → leave it to the browser
        e.preventDefault();
        if (!(currentRbId > 0)) { pastePoint = null; return toast('Save to your profile first.'); }
        if (pastePoint) { // a context-menu "Paste photo" armed a point → geotag the image there
            const p = pastePoint; pastePoint = null;
            let failed = 0;
            for (const f of files) if (!(await uploadPhoto(f, p.lat, p.lon)).ok) failed++;
            await loadPhotos(); toast(failed ? 'Some photos failed.' : 'Photos uploaded.');
            return;
        }
        addPhotos(files);
    });
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
    // Move an existing photo by dragging its icon on the map (a draggable marker that follows the
    // pointer); the new position is saved on drop. Pass the photo (needs its current lat/lon + id).
    function startMovePhoto(photo) {
        closeLightbox();
        if (!photo || photo.lat == null || !map.map) return;
        if (photoMoveMarker) photoMoveMarker.remove();
        showView('map');
        const el = document.createElement('div');
        el.className = 'rb-photo-pin';
        el.textContent = 'IMG';
        const mk = new maplibregl.Marker({ element: el, draggable: true }).setLngLat([+photo.lon, +photo.lat]).addTo(map.map);
        photoMoveMarker = mk;
        toast(t('Drag the marker to move the photo, then drop it.'));
        mk.on('dragend', async () => {
            const l = mk.getLngLat(); mk.remove(); photoMoveMarker = null;
            const r = await RBApi('ph_move', { id: +photo.id, lat: l.lat, lon: l.lng });
            await loadPhotos();
            toast(r.ok ? 'Photo moved.' : 'Could not move the photo.');
        });
        map.map.easeTo({ center: [+photo.lon, +photo.lat], zoom: Math.max(map.map.getZoom(), 14), duration: 400 });
    }

    /* ---------- lightbox: browse all the roadbook's photos ---------- */
    let lbList = [], lbIdx = -1;
    // Open the viewer. `list` scopes which photos to browse (e.g. a note's nearby ones);
    // omit it to browse all the roadbook's photos.
    function openLightbox(id, list) {
        lbList = (list && list.length ? list : notePhotos).slice();
        if (!lbList.length) return;
        lbIdx = lbList.findIndex((p) => +p.id === +id); if (lbIdx < 0) lbIdx = 0;
        showView('map'); // the viewer overlays the map, so make sure the map view is shown
        $('lbImg').src = lbList[lbIdx].url; $('lightbox').hidden = false;
    }
    function lbStep(d) { if (!lbList.length) return; lbIdx = (lbIdx + d + lbList.length) % lbList.length; $('lbImg').src = lbList[lbIdx].url; }
    function closeLightbox() { $('lightbox').hidden = true; $('lbImg').removeAttribute('src'); }
    $('lbClose').onclick = closeLightbox;
    $('lbPrev').onclick = () => lbStep(-1);
    $('lbNext').onclick = () => lbStep(1);
    $('lbWaypoint').onclick = () => { const p = lbList[lbIdx]; if (p && p.lat != null && rb) { addWaypointNear({ lat: +p.lat, lon: +p.lon }); closeLightbox(); } };
    $('lbMove').onclick = () => { const p = lbList[lbIdx]; if (p) startMovePhoto(p); };
    $('lbDelete').onclick = async () => {
        const p = lbList[lbIdx]; if (!p) return;
        if (!(await RBConfirmDanger(t('Delete this photo?'), t('Delete')))) return;
        const keep = new Set(lbList.map((x) => +x.id)); keep.delete(+p.id); // stay within the current set (all, or a note's group)
        await RBApi('ph_delete', { id: +p.id });
        await loadPhotos();
        lbList = notePhotos.filter((x) => keep.has(+x.id));
        if (!lbList.length) return closeLightbox();
        lbIdx = Math.min(lbIdx, lbList.length - 1); $('lbImg').src = lbList[lbIdx].url;
    };
    document.addEventListener('keydown', (e) => {
        if ($('lightbox').hidden) return;
        const tag = e.target && e.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable)) return; // editing text: don't hijack arrows
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
                <span class="note-number">${n.num}${RB.wpBadgeSVG(n.wp_type, 22)}</span>
                <span class="note-km"><b>${((n.distance ?? 0) / 1000).toFixed(2)}</b> +${((n.partial_distance ?? 0) / 1000).toFixed(2)}${photosByNote[i] ? `<button type="button" class="note-photo" data-photo="${i}" aria-label="${esc(t('View photo'))}" title="${esc(t('View photo'))}">IMG</button>` : ''}</span>
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
            const dn = rb.notes[+b.dataset.del], dlabel = dn ? '#' + dn.num + (dn.text ? ' — ' + dn.text : '') : '';
            if (await RBConfirmDanger(t('Delete note') + ' ' + dlabel + '?', 'Delete')) delNote(+b.dataset.del);
        });
        $('noteList').querySelectorAll('[data-up]').forEach((b) => b.onclick = (e) => { e.stopPropagation(); select(+b.dataset.up - 1); });
        $('noteList').querySelectorAll('[data-down]').forEach((b) => b.onclick = (e) => { e.stopPropagation(); select(+b.dataset.down + 1); });
        // tap the 📷 under the km to view the note's photo(s)
        $('noteList').querySelectorAll('.note-photo').forEach((b) => b.onclick = (e) => {
            e.stopPropagation();
            const ph = photosByNote[+b.dataset.photo] || [];
            if (ph.length) openLightbox(ph[0].id, ph); // same viewer, scoped to this note's nearby photos
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
        if (map.map && map.ready && map.map.getBearing()) map.map.easeTo({ bearing: 0, duration: 300 }); // back to north-up
        parkEditor(); // park both pieces back so a list rebuild can't destroy them
        placeTulips(); // restore the static vignette in the row the canvas just left
        markSelectedRow();
    }
    function select(i) {
        if (!rb || i < 0 || i >= rb.notes.length) return;
        sel = i; editorOpen = true; selVertex = -1; // a note is now the active selection
        openEditZoneAt(i); renderEditor(); canvas.setNote(rb.notes[i]);
        renderIcons(); // refresh the picker so "Yours" shows only this note's cover tulip
        markSelectedRow(); placeTulips(); // refill the static vignette in the row the canvas left
        map.select(rb.notes[i], true); // highlight only — selecting a note deliberately does NOT
        // recentre / zoom / rotate the map, so editing (and deleting) never loses your place on it (#65).
        // bring the selection into view: the list row on desktop (side column), the just-opened
        // editor on the stacked mobile/tablet layout — so clicking a note on the map jumps the list
        // to its line.
        if (window.matchMedia('(min-width: 1024px)').matches) {
            const row = $('noteList').querySelector('.note-mini[data-i="' + i + '"]');
            if (row) row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else $('noteEditZone').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function renderEditor() {
        const n = rb.notes[sel];
        // Only the road you LEAVE on is authored: the road you arrive on is the
        // previous note's road_out (derived in recomputeMetrics/normalizeRoadTypes),
        // and the road simply continues until a note changes it.
        const opts = (cur) => RT.map((l, k) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${t(l)}</option>`).join('');
        const dangerOpts = ['—', '!', '!!', '!!!'].map((l, k) => `<option value="${k}" ${k === (n.danger || 0) ? 'selected' : ''}>${l}</option>`).join('');
        // The note's segment/CAP attributes all live in the icon-search row: Road (the road type
        // followed = road_type_out), Danger, the declarative Speed limit and the CAP-type qualifier.
        // The Red CAP toggle itself is in the note row.
        $('roadSlot').innerHTML = `<label class="prop-field"><span>${labelHelp('Road', 'help.road')}</span><select id="edRout" class="field">${opts(n.road_type_out)}</select></label>`;
        $('dangerSlot').innerHTML = `<label class="prop-field"><span>${labelHelp('Danger', 'help.danger')}</span><select id="edDanger" class="field">${dangerOpts}</select></label>`;
        $('edRout').onchange = (e) => {
            n.road_type_out = +e.target.value; RB.normalizeRoadTypes(rb); canvas.render(); markDirty();
            const row = $('noteList').querySelector('.note-mini[data-i="' + sel + '"]'); // refresh only this row's accent
            if (row) row.style.setProperty('--rt', (RB.ROAD_TYPES[n.road_type_out] || RB.ROAD_TYPES[3]).color);
        };
        $('edDanger').onchange = (e) => { const v = +e.target.value; if (v) n.danger = v; else delete n.danger; canvas.render(); markDirty(); };
        // Declarative speed limit: '' = none, a number = km/h in force, 0 = limit lifted.
        const speedOpts = `<option value="" ${n.speed_limit == null ? 'selected' : ''}>—</option>`
            + [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130].map((v) => `<option value="${v}" ${n.speed_limit === v ? 'selected' : ''}>${v}</option>`).join('')
            + `<option value="0" ${n.speed_limit === 0 ? 'selected' : ''}>${t('End of limit')}</option>`;
        $('speedSlot').innerHTML = `<label class="prop-field"><span>${labelHelp('Speed', 'help.speed')}</span><select id="edSpeed" class="field">${speedOpts}</select></label>`;
        $('edSpeed').onchange = (e) => {
            const v = e.target.value; if (v === '') delete n.speed_limit; else n.speed_limit = +v;
            syncSpeedIcon(n);  // the matching S-icon follows the limit (set/changed/lifted/cleared)
            syncSpeedZone(n);  // a speed limit also tags the note as a controlled zone (DZ / FZ)
            markDirty(); canvas.setNote(n); canvas.render(); renderEditor(); renderNotes();
        };
        // CAP type qualifies an existing CAP (FIA: exit/average/calculated/turning); exit is the
        // implicit default, stored absent. Disabled until the note carries a CAP.
        const capTypeOpts = [['', 'Exit'], ['average', 'Average'], ['calculated', 'Calculated'], ['turning', 'Turning']]
            .map(([v, l]) => `<option value="${v}" ${(n.cap_type || '') === v ? 'selected' : ''}>${t(l)}</option>`).join('');
        $('capTypeSlot').innerHTML = `<label class="prop-field"><span>${labelHelp('CAP type', 'help.capType')}</span><select id="edCapType" class="field"${n.cap == null ? ' disabled' : ''}>${capTypeOpts}</select></label>`;
        $('edCapType').onchange = (e) => { const v = e.target.value; if (v) n.cap_type = v; else delete n.cap_type; markDirty(); };
        // WP type (FIA characterization): a custom dropdown so each option shows its colour badge
        // (a <select> can't). Scoped by the roadbook profile (core always, rally adds the full set);
        // picking a radius-bearing type prefills its default validation radius.
        const cur = RB.wpType(n.wp_type);
        const curHtml = cur ? RB.wpBadgeSVG(cur.id, 20) + `<span>${esc(t(cur.name))}</span>` : `<span class="wp-dd-none">${esc(t('None'))}</span>`;
        const optRow = (id, inner) => `<button type="button" class="wp-dd-opt${id === (n.wp_type || '') ? ' on' : ''}" role="option" data-id="${id}">${inner}</button>`;
        const menuHtml = optRow('', `<span class="wp-dd-none">— ${esc(t('None'))}</span>`)
            + RB.wpTypesForProfile(rb.meta && rb.meta.profile).map((w) =>
                optRow(w.id, RB.wpBadgeSVG(w.id, 20) + `<span class="wp-dd-cap">${esc(w.cap)}</span><span class="wp-dd-nm">${esc(t(w.name))}</span>`)).join('');
        $('wpTypeSlot').innerHTML = `<div class="prop-field wp-dd"><span>${labelHelp('WP type', 'help.wpType')}</span>
            <div class="wp-dd-wrap">
                <button type="button" class="field wp-dd-btn" id="wpDDBtn" aria-haspopup="listbox" aria-expanded="false">${curHtml}<span class="wp-dd-chev">▾</span></button>
                <div class="wp-dd-menu" id="wpDDMenu" role="listbox" hidden>${menuHtml}</div>
            </div></div>`;
        const ddBtn = $('wpDDBtn'), ddMenu = $('wpDDMenu');
        const closeDD = () => { ddMenu.hidden = true; ddBtn.setAttribute('aria-expanded', 'false'); document.removeEventListener('click', onDocClick); };
        function onDocClick(e) { if (!ddMenu.contains(e.target) && !ddBtn.contains(e.target)) closeDD(); }
        ddBtn.onclick = (e) => {
            e.stopPropagation();
            if (ddMenu.hidden) { ddMenu.hidden = false; ddBtn.setAttribute('aria-expanded', 'true'); setTimeout(() => document.addEventListener('click', onDocClick)); }
            else closeDD();
        };
        ddMenu.querySelectorAll('.wp-dd-opt').forEach((b) => b.onclick = () => {
            closeDD();
            const v = b.dataset.id, w = RB.wpType(v);
            if (w) {
                n.wp_type = v;
                if (n.wp_radius == null) { // prefill: roadbook default first, then the type's catalog default
                    const def = (rb.meta && rb.meta.default_wp_radius != null) ? rb.meta.default_wp_radius : w.radius;
                    if (def != null) n.wp_radius = def;
                }
            } else { delete n.wp_type; } // radius is independent of type → keep any set wp_radius
            markDirty(); renderEditor(); renderNotes();
        });
        // Validation radius (metres) — available for EVERY waypoint, typed or not. Empty falls back
        // (at runtime) to the roadbook default, then the type's default; the placeholder shows that
        // effective fallback so the author sees what's in force.
        const typeDef = RB.wpType(n.wp_type) ? RB.wpType(n.wp_type).radius : null;
        const fallback = (rb.meta && rb.meta.default_wp_radius != null) ? rb.meta.default_wp_radius : (typeDef != null ? typeDef : null);
        const radPh = fallback != null ? String(fallback) : t('Default');
        $('wpRadiusSlot').innerHTML = `<label class="prop-field"><span>${labelHelp('Radius m', 'help.radius')}</span><input id="edWpRadius" class="field" inputmode="numeric" value="${n.wp_radius != null ? n.wp_radius : ''}" placeholder="${esc(radPh)}"></label>`;
        $('edWpRadius').onchange = (e) => { const v = parseInt(e.target.value, 10); if (isFinite(v) && v > 0) n.wp_radius = v; else delete n.wp_radius; markDirty(); };
    }
    // Toggle a note's Red CAP from its row (CAP heading/distance to the next note).
    function toggleCapAt(i) {
        const n = rb.notes[i], nx = rb.notes[i + 1];
        if (!nx) return; // the last note has no following note to head toward
        if (n.cap == null) { n.cap = Math.round(RB.geo.bearingDeg(n, nx)); n.cap_distance = Math.round(RB.geo.haversineM(n, nx)); }
        else { n.cap = null; n.cap_distance = null; delete n.cap_type; } // no CAP → its type qualifier is meaningless
        markDirty(); refreshRowMeta(i);
        if (i === sel) renderEditor(); // keep the CAP-type control's enabled state in sync
    }
    // The minimum-notes guard and the confirm prompt live in the row's click handler.
    // Deleting a waypoint removes the note AND its own track vertex (the route reconnects between
    // its neighbours) — a wpt occupies its point, so it disappears with the wpt (#65). To keep the
    // point as a plain track vertex instead, use "Transform". RB.deleteNote does the splice + idx
    // shift; here we just keep a pending cut anchored across the shift, then repaint.
    function delNote(i) {
        if (!rb || i < 0 || i >= rb.notes.length) return;
        const removed = RB.deleteNote(rb, i);
        if (removed >= 0 && cutFromIdx > removed) cutFromIdx -= 1;
        markDirty(); refreshMap(true); renderNotes(); select(Math.min(i, rb.notes.length - 1));
    }
    // Road type in force at a track index = the road_out of the nearest preceding
    // note. A note inserted here continues on that road by default (road_out =
    // road_in), so the surface only changes where the author explicitly sets it.
    function roadOutBefore(idx) {
        let rt = 3, best = -1;
        rb.notes.forEach((n) => { if (n.idx <= idx && n.idx > best) { best = n.idx; rt = n.road_type_out; } });
        return rt;
    }
    // Promote an existing track vertex to a waypoint (note) IN PLACE — no splitTrackAt, so a trk
    // and a wpt never share coordinates (#61). Opens the new note so it can be filled straight away.
    function promoteVertex(i) {
        if (i < 0 || i >= rb.track.length) return;
        if (rb.notes.some((n) => n.idx === i)) return toast('There is already a note here.');
        rb.notes.push(makeNote(rb, i, roadOutBefore(i)));
        RB.recomputeMetrics(rb); markDirty();
        refreshMap(true); renderNotes();
        select(rb.notes.findIndex((n) => n.idx === i)); // open the new note to fill it in
        toast('Waypoint added.');
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
    // Insert the EXACT clicked point into the track at the nearest segment (a small detour off the
    // route, rather than snapping onto it); returns its new track index. Used by the off-track menu.
    function insertPointAtExact(pt) {
        const hit = RB.nearestOnTrack(rb.track, pt);
        const at = hit ? hit.i + 1 : rb.track.length;
        rb.track.splice(at, 0, { lat: RB.round6(pt.lat), lon: RB.round6(pt.lon) });
        rb.notes.forEach((n) => { if (n.idx >= at) n.idx++; });
        if (cutFromIdx >= at) cutFromIdx++; // keep a pending cut anchored
        return at;
    }
    // "Add note here": the note lands at the exact clicked point.
    function addNoteAtExact(pt) {
        if (!rb) return;
        const at = insertPointAtExact(pt);
        const cur = editorOpen ? rb.notes[sel] : null;
        rb.notes.push(makeNote(rb, at, roadOutBefore(at)));
        RB.recomputeMetrics(rb);
        if (cur) sel = rb.notes.indexOf(cur);
        refreshMap(true); renderNotes(); markDirty();
        toast('Waypoint added.');
    }
    // "Add point here": just a track point at the exact clicked point, no note.
    function addPointAtExact(pt) {
        if (!rb) return;
        insertPointAtExact(pt);
        RB.recomputeMetrics(rb); RB.recomputeCaps(rb);
        routeChanged('Point added.');
    }
    // Delete the single track point nearest the given map point. If that point carries a note,
    // confirm first (deleting it removes the note too). Later notes' idx shift down by one.
    async function deleteTrackPointNear(pt) {
        if (!rb || !rb.track || rb.track.length < 2) return;
        const k = RB.nearestIdx(rb.track, pt);
        const isNote = rb.notes.some((n) => n.idx === k);
        if (isNote) {
            if (rb.notes.length <= 2) return toast('At least 2 notes must remain.');
            if (!(await RBConfirmDanger(t('This point is a note — delete the point and its note?'), t('Delete')))) return;
        }
        if (rb.track.length <= 2) return toast('At least 2 points must remain.');
        rb.track.splice(k, 1);
        rb.notes = rb.notes.filter((n) => n.idx !== k);
        rb.notes.forEach((n) => { if (n.idx > k) n.idx -= 1; });
        RB.recomputeMetrics(rb); RB.recomputeCaps(rb);
        routeChanged('Point deleted.');
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
        // `cover` icons are per-note opaque vignettes (e.g. imported OpenRally tulips), not
        // shared palette items — list only the current note's, never every note's.
        const coverAll = new Set();
        (rb?.notes || []).forEach((n) => (n.icons || []).forEach((ic) => { if (ic.cover && ic.name) coverAll.add(ic.name.toLowerCase()); }));
        const curCover = new Set(((editorOpen && rb?.notes[sel]?.icons) || []).filter((ic) => ic.cover).map((ic) => (ic.name || '').toLowerCase()));
        const yours = custom.filter((n) => { const low = n.toLowerCase(); return coverAll.has(low) ? curCover.has(low) : true; });
        let html = '';
        if (yours.length) html += `<div class="icon-category" data-cat="__yours">${t('Yours (in this roadbook)')}</div>` + yours.map((n) => iconBtn(n, lib[n], true, coverAll.has(n.toLowerCase()) ? t('Delete me to export the edited tulip') : null)).join('');
        html += Object.entries(std.categories || {}).map(([cat, files]) => {
            // #94: speed-limit signs are no longer placed by hand — the Speed dropdown sets the
            // limit (and renders the matching sign), so hide the S* signs from the palette.
            const shown = files.filter((f) => RB.speedLimitFromName(f) == null);
            return shown.length ? `<div class="icon-category" data-cat="${esc(cat)}">${t(cat)}</div>` + shown.map((f) => iconBtn(f, '../assets/icons/' + f, false)).join('') : '';
        }).join('');
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
        renderIconCats(yours.length > 0);
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
    const iconBtn = (name, src, rmv, title) =>
        `<button data-add="${name}" title="${esc(title || name)}">${rmv ? `<span data-del="${name}" class="del-badge" role="button" tabindex="0" aria-label="${esc(t('Remove'))}">×</span>` : ''}<img src="${src}" alt="" loading="lazy"></button>`;
    function addIcon(name) {
        if (!rb) return toast('Load a roadbook first.');
        canvas.addIcon(mkIcon(name, [0, 0]));
        toast('Icon added — drag it on the vignette');
    }
    function delCustomIcon(name) {
        const low = name.toLowerCase();
        // A `cover` tulip (imported OpenRally vignette) is meant to be deletable in place: drop it
        // from its note too, so the vignette reverts to the editable one and export emits that.
        const isCover = rb.notes.some((n) => (n.icons || []).some((ic) => ic.cover && (ic.name || '').toLowerCase() === low));
        if (isCover) {
            rb.notes.forEach((n) => { n.icons = (n.icons || []).filter((ic) => !(ic.cover && (ic.name || '').toLowerCase() === low)); });
            delete rb.icons[name];
            markDirty(); renderNotes(); if (editorOpen && rb.notes[sel]) { canvas.setNote(rb.notes[sel]); renderEditor(); }
            renderIcons();
            return;
        }
        if (rb.notes.some((n) => (n.icons || []).some((ic) => (ic.name || '').toLowerCase() === low))) return toast('In use; remove it from the notes first.');
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
        map.select(rb.notes[sel], true);
        if (toastMsg) toast(toastMsg);
    }

    // lengthen the route with another track; an end note rides the new finish
    function extension(r, trk) {
        const nt = r.track.concat(trk.slice(1).map((p) => ({ lat: p.lat, lon: p.lon })));
        const last = r.notes[r.notes.length - 1];
        r.track = nt; r.notes.forEach((n) => n.idx = RB.nearestIdx(nt, { lat: n.lat, lon: n.lon }));
        r.notes.push(makeNote(r, nt.length - 1, last ? last.road_type_out : 3));
    }

    /* ---------- export (single button → popup with every format) ----------
     * The export fns assume open cuts are already confirmed — the modal does that
     * ONCE before running, so a GPX multi-pick never re-prompts per file. */
    const stamp = () => { const d = new Date(), p = RB.pad2; return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()); };
    // Self-contained .rdbk: every used icon embedded as a data URI.
    async function exportRdbk() { stampMeta(); RB.recomputeMetrics(rb); RB.recomputeCaps(rb); await embedUsed(rb); download(rb, RB.slug(rb.meta?.title) + '_' + stamp() + '.rdbk'); exported = true; clearDraft(); }
    // A4 PDF, generated on the device (jsPDF, lazy-loaded) — see rb-pdf.js
    async function exportPdf() {
        stampMeta(); RB.recomputeMetrics(rb); RB.recomputeCaps(rb);
        toast('Generating PDF…');
        try { await RBPdf.generate(rb, { iconBasePath: '../assets/icons/' }); }
        catch (e) { toast(e.message || 'Could not generate the PDF.'); }
    }
    // One GPX per the chosen options (#34): track on/off · waypoints on/off · Garmin/OSMAnd
    // icons on the waypoints. The filename carries synthetic suffixes for the content.
    function exportCustomGpx(o) {
        const pts = o.track ? rb.track : [];
        const wpts = o.wpt ? rb.notes.map((n) => {
            const w = { lat: n.lat, lon: n.lon, name: (n.text || '').trim() || String(n.num).padStart(3, '0') }; // name = note text (examples), number as fallback
            if (o.grm || o.osm) {
                const a = n.appwpt || {};               // imported icon re-emitted verbatim where present…
                const c = RB.appWaypointSymbol(n);       // …else mapped from the RDBK icon (generic fallback), per field
                const sym = a.sym || c.sym, osmandIcon = a.osmandIcon || c.osmandIcon;
                if (o.grm && sym) w.sym = sym;
                if (o.osm && osmandIcon) {
                    w.osmandIcon = osmandIcon;
                    const color = n.appwpt ? a.color : c.color; // imported: source/sym colour (may be none); native: mapped colour
                    if (color) w.color = color;
                }
            }
            return w;
        }) : [];
        let sfx = o.wpt ? '_WPT' : '_trk'; // waypoints present → _WPT, else track-only → _trk
        if (o.grm) sfx += '_grm';
        if (o.osm) sfx += '_osm';
        const base = RB.slug(rb.meta?.title) + '_' + stamp() + sfx; // the GPX's internal <name> follows the same naming convention as the file
        RBDownload(new Blob([RB.gpxDocument(base, pts, wpts)], { type: 'application/gpx+xml' }), base + '.gpx');
    }
    // OpenRally GPX: track + one wpt/note with openrally: extensions; each vignette rendered
    // to an embedded SVG tulip. embedUsed first, so the tulip's icons resolve to data URIs
    // (portable, no external files). See RB.openRallyDocument + github.com/openrally/openrally.
    async function exportOpenRally() {
        stampMeta(); RB.recomputeMetrics(rb); RB.recomputeCaps(rb); await embedUsed(rb);
        const tulips = rb.notes.map((n) => tulipSVG(n));
        const base = RB.slug(rb.meta?.title) + '_' + stamp() + '_OR';
        RBDownload(new Blob([RB.openRallyDocument(rb, { tulips, name: base })], { type: 'application/gpx+xml' }), base + '.gpx');
    }
    // One Export button → a popup: .rdbk / PDF buttons, and GPX as a single button whose
    // typologies (track · track+WPT · OpenRally) are picked with checkboxes.
    function openExportModal() {
        if (!rb) return toast('Nothing to save.');
        const m = RBModal(`<h2>${esc(t('Export'))}</h2>
            <div class="btn-group col">
                <button class="btn btn-primary" data-x="rdbk"><i class="fa-solid fa-floppy-disk"></i> ${esc(t('.rdbk file'))}</button>
                <button class="btn btn-primary" data-x="pdf"><i class="fa-solid fa-file-pdf"></i> ${esc(t('PDF'))}</button>
            </div>
            <h3>${esc(t('GPX'))}</h3>
            <label class="checkbox-row"><input type="checkbox" data-g="track" checked> ${esc(t('Track line'))}</label>
            <label class="checkbox-row"><input type="checkbox" data-g="wpt" checked> ${esc(t('Waypoints (notes)'))}</label>
            <label class="checkbox-row gpx-sub"><input type="checkbox" data-g="grm"> ${esc(t('Garmin icons'))}</label>
            <label class="checkbox-row gpx-sub"><input type="checkbox" data-g="osm"> ${esc(t('OSMAnd icons'))}</label>
            <label class="checkbox-row"><input type="checkbox" data-g="openrally"> ${esc(t('OpenRally'))}</label>
            <div class="btnrow end"><button class="btn btn-primary" data-x="gpx"><i class="fa-solid fa-route"></i> ${esc(t('Export GPX'))}</button></div>`, 'narrow scroll');
        const cb = (g) => m.q(`[data-g="${g}"]`);
        const syncIcons = () => { const on = cb('wpt').checked; ['grm', 'osm'].forEach((g) => { cb(g).disabled = !on; }); }; // icons need waypoints; just enable/disable, keep the checked state
        cb('wpt').onchange = syncIcons; syncIcons();
        m.q('[data-x="rdbk"]').onclick = async () => { m.close(); if (await confirmOpenCuts()) await exportRdbk(); };
        m.q('[data-x="pdf"]').onclick = async () => { m.close(); if (await confirmOpenCuts()) await exportPdf(); };
        m.q('[data-x="gpx"]').onclick = async () => {
            const o = { track: cb('track').checked, wpt: cb('wpt').checked, grm: cb('grm').checked, osm: cb('osm').checked, or: cb('openrally').checked };
            if (!o.track && !o.wpt && !o.or) return toast('Pick at least one GPX type.');
            m.close();
            if (!(await confirmOpenCuts())) return;
            if (o.track || o.wpt) exportCustomGpx(o);
            if (o.or) await exportOpenRally();
        };
    }
    $('exportBtn').onclick = openExportModal;
    $('rawJsonBtn').onclick = openRawJson;
    // Raw editor (#28): the whole roadbook as pretty JSON — inspect/copy, validate and apply back.
    // The embedded icons (base64 blobs) show as placeholders and are preserved on save.
    function openRawJson() {
        if (!rb) return toast('Load a roadbook first.');
        RB.recomputeMetrics(rb); RB.recomputeCaps(rb);
        const display = Object.assign({}, rb, { icons: Object.fromEntries(Object.keys(rb.icons || {}).map((k) => [k, 'data:…(embedded)'])) });
        const jsonText = () => JSON.stringify(display, null, 2);
        // indent compact XML one tag per line, for a readable GPX preview
        const prettyXml = (xml) => {
            let pad = 0; const out = [];
            xml.replace(/>\s*</g, '>\n<').split('\n').forEach((raw) => {
                const line = raw.trim(); if (!line) return;
                if (/^<\//.test(line)) pad--;
                out.push('  '.repeat(Math.max(0, pad)) + line);
                if (/^<[^!?/]/.test(line) && !/\/>$/.test(line) && !/<\/.+>$/.test(line)) pad++;
            });
            return out.join('\n');
        };
        const gpxText = () => {
            const wpts = rb.notes.map((n) => ({ lat: n.lat, lon: n.lon, name: (n.text || '').trim() || String(n.num).padStart(3, '0') }));
            return prettyXml(RB.gpxDocument(RB.slug(rb.meta?.title), rb.track, wpts));
        };
        const m = RBModal(`<h2>${esc(t('Raw JSON'))}</h2>
            <div class="ed-row"><input type="search" id="rawSearch" class="field grow" placeholder="${esc(t('Find in text (Enter)…'))}" spellcheck="false" autocomplete="off"></div>
            <textarea id="rawJson" class="raw-edit" spellcheck="false" readonly></textarea>
            <p id="rawMsg" class="small"></p>
            <div class="btnrow end">
                <button class="btn btn-ghost" data-x="gpx">${esc(t('View GPX'))}</button>
                <button class="btn btn-primary" data-x="copy"><i class="fa-solid fa-copy"></i> ${esc(t('Copy'))}</button>
            </div>`, 'wide');
        const ta = m.q('#rawJson'), msg = m.q('#rawMsg'), gpxBtn = m.q('[data-x="gpx"]');
        let gpxMode = false;
        ta.value = jsonText();
        const setMsg = (txt, ok) => { msg.textContent = txt; msg.className = 'small ' + (ok ? 'ok-msg' : 'err-msg'); };
        // Enter in the search box → jump to the next occurrence (wraps), scrolling it into view.
        m.q('#rawSearch').onkeydown = (e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            const q = e.target.value; if (!q) return;
            const hay = ta.value.toLowerCase(), needle = q.toLowerCase();
            let idx = hay.indexOf(needle, ta.selectionEnd || 0);
            if (idx < 0) idx = hay.indexOf(needle, 0); // wrap to the top
            if (idx < 0) { setMsg(t('Not found.'), false); return; }
            const full = ta.value;
            ta.value = full.slice(0, idx); ta.scrollTop = ta.scrollHeight; ta.value = full; // force the match into view
            ta.setSelectionRange(idx, idx + q.length);
            msg.textContent = '';
        };
        gpxBtn.onclick = () => {
            gpxMode = !gpxMode;
            gpxBtn.textContent = t(gpxMode ? 'View JSON' : 'View GPX');
            ta.value = gpxMode ? gpxText() : jsonText();
            ta.scrollTop = 0; msg.textContent = '';
        };
        m.q('[data-x="copy"]').onclick = async () => {
            try { await navigator.clipboard.writeText(ta.value); } catch (e) { ta.select(); document.execCommand('copy'); }
            setMsg(t('Copied.'), true);
        };
    }
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
                const tripName = sessionStorage.getItem('rb_trip_name') || t('Recorded trip'); // name chosen in the Recorder (#54)
                ['rb_trip_track', 'rb_trip_wpts', 'rb_trip_draft', 'rb_trip_name'].forEach((k) => sessionStorage.removeItem(k));
                if (pts && pts.length >= 2) {
                    setRoadbook(RB.buildRoadbook({ name: tripName, trkpts: pts, wpts }));
                    if (tripDraft) { await account; if (meUser) { currentRbId = tripDraft; setVis(0); loadPhotos(); } } // adopt the draft that holds the photos
                    markDirty();
                }
            } catch (e) { toast('Could not load the recorded trip.'); }
            if (rb) return;
        }
        // Explicit open target: a public-challenge fork or a saved ?rb=id. The session-recovery
        // prompts below must not shadow it — offer recovery only when there is no explicit target,
        // or when the draft belongs to the very roadbook being opened (?rb=id), i.e. a crash mid-edit.
        const ch = RBChallenges.publicFromUrl();
        const id = +(new URLSearchParams(location.search).get('rb') || 0);
        const explicitTarget = !!ch || id > 0;

        let draft; try { draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch (e) {}
        const draftFits = draft && draft.rb && draft.rb.notes && (!explicitTarget || (id > 0 && draft.currentRbId === id));
        if (draftFits && !loadStarted) {
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
        if (!explicitTarget && !loadStarted && await checkRecovery()) return;
        // Fork a public challenge → load as a brand-new roadbook (saving creates a new one).
        if (ch) { try { const j = await RBChallenges.loadPublic(ch); currentRbId = 0; setVis(0); setRoadbook(j.roadbook); } catch (e) { toast('Could not load challenge.'); } return; }
        await account;
        if (id && meUser) {
            const r = await RBApi('rb_get', { id });
            if (r.ok && r.roadbook) {
                // A roadbook saved with no route yet would open on an empty map: warn, and on
                // Continue load it straight into draw mode (Cancel falls through to the list).
                const hasRoute = (r.roadbook.track || []).length >= 2;
                if (hasRoute || await RBConfirm('This roadbook has no route yet. Draw it on the map?', 'Continue')) {
                    currentRbId = id; setVis(r.is_public ? 1 : 0); setRoadbook(r.roadbook);
                }
            }
        }
        if (!rb && meUser) {
            const n = await RBRoadbookList($('myRbList')); $('myRbSection').hidden = !n; // landing → list the user's saved roadbooks
            // Empty start (e.g. "Draw on the map"): centre on the user's saved default location.
            if (meUser.default_lat != null && meUser.default_lon != null) map.map.jumpTo({ center: [meUser.default_lon, meUser.default_lat], zoom: 12 });
        }
        // Opened from My roadbooks "Export" (?export=1): pop the same Export popup straight away.
        if (rb && new URLSearchParams(location.search).get('export') === '1') {
            try { history.replaceState(null, '', location.pathname + '?rb=' + currentRbId); } catch (e) {} // drop the flag so a refresh won't re-open it
            openExportModal();
        }
    })();
})();
