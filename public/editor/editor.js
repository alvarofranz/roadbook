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
    const RT = RB.ROAD_TYPES.map((r) => r.name); // the road-type names live on the catalog (#561)
    // The editor map IS the work surface (draw the route, drag notes, tap to add) — it needs
    // one-finger pan / free wheel-zoom, so it opts out of the shared cooperative-gestures default.
    // Its base-map toggle (satellite · topo · OSM, beside the zoom buttons) is RBMap's own, with the
    // compact labels a 34 px button fits, and it remembers the author's choice.
    const map = new RBMap('edMap', { zoom: 13, geolocate: true, wpIcons: true, compass: false, terrain: false, cooperativeGestures: false, layerToggle: { short: true, remember: 'rb_map_style' } }); // flat: the track is edited from straight above
    // Right-click on the map → a context popup whose commands depend on what's under the cursor:
    // a note (waypoint), a plain track point, or empty ground — same look, context-specific items.
    // Every point command also has a one-key shortcut (#35), shown to the right of its label.
    let ctxPhotoPoint = null; // the map point a context-menu photo upload is geotagged at
    let pastePoint = null;    // the point a context-menu "Paste photo" armed; the next Ctrl+V drops the image here
    let ctxMenu = null;       // the open context popup + its key→action map
    let selVertex = -1;       // the tap-selected track vertex (Move mode); the target of the N/I/P/Del shortcuts
    function uploadPhotoHere(p) {
        if (readOnly()) return toast('Read-only while someone else is editing.');
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
    function closeCtxMenu() { if (ctxMenu) { ctxMenu.release(); ctxMenu.el.remove(); ctxMenu = null; } }
    // The map context menu (#693): a themed card anchored at the pointer and kept inside the map.
    // `head` is { title, point } — what was hit and where (the coordinates copy with one click);
    // `groups` are lists of commands { id, icon, label, key?, danger?, href?, run? }, drawn with a
    // separator between them. pastePt arms Ctrl+V to drop a clipboard photo at that point.
    function openCtxMenu(lngLat, head, groups, pastePt) {
        closeCtxMenu();
        const card = { es: 'NSEO', it: 'NSEO' }[document.documentElement.lang] || 'NSEW'; // N·S·E·W, but West → O in it/es (Ovest/Oeste)
        const p = head.point;
        const coordsText = `${p.lat >= 0 ? card[0] : card[1]} ${Math.abs(p.lat).toFixed(6)} · ${p.lon >= 0 ? card[2] : card[3]} ${Math.abs(p.lon).toFixed(6)}`;
        const item = (it) => {
            const inner = `<i class="fa-solid ${it.icon}"></i><span>${esc(t(it.label))}</span>`
                + (it.href ? '<i class="fa-solid fa-arrow-up-right-from-square map-ctx-out"></i>' : '')
                + (it.key ? `<kbd class="key-chip">${it.key}</kbd>` : '');
            return it.href
                ? `<a class="map-ctx-item" role="menuitem" href="${it.href}" target="_blank" rel="noopener">${inner}</a>`
                : `<button type="button" class="map-ctx-item${it.danger ? ' danger' : ''}" role="menuitem" data-k="${it.id}">${inner}</button>`;
        };
        const el = document.createElement('div');
        el.className = 'map-ctx'; el.setAttribute('role', 'menu');
        el.innerHTML = `<div class="map-ctx-head"><div class="grow"><b>${esc(t(head.title))}</b><span class="map-ctx-coords">${coordsText}</span></div>`
            + `<button type="button" class="map-ctx-copy" aria-label="${esc(t('Copy coordinates'))}" title="${esc(t('Copy coordinates'))}"><i class="fa-regular fa-copy"></i></button></div>`
            + groups.filter((g) => g.length).map((g) => g.map(item).join('')).join('<div class="map-ctx-sep" role="separator"></div>');
        const box = map.map.getContainer();
        box.appendChild(el);
        // at the pointer, flipped left/up when it would leave the map
        const at = map.map.project(lngLat), w = el.offsetWidth, h = el.offsetHeight;
        el.style.setProperty('--ctx-x', Math.max(8, Math.min(at.x + w + 8 > box.clientWidth ? at.x - w : at.x, box.clientWidth - w - 8)) + 'px');
        el.style.setProperty('--ctx-y', Math.max(8, Math.min(at.y + h + 8 > box.clientHeight ? at.y - h : at.y, box.clientHeight - h - 8)) + 'px');
        const keys = {};
        groups.flat().forEach((it) => {
            if (!it.run) return;
            el.querySelector(`[data-k="${it.id}"]`).onclick = () => { closeCtxMenu(); it.run(); };
            if (it.key) keys[it.key.toLowerCase()] = it.run;
        });
        el.querySelectorAll('a.map-ctx-item').forEach((a) => { a.onclick = () => closeCtxMenu(); });
        el.querySelector('.map-ctx-copy').onclick = () => { RBCopy(p.lat.toFixed(6) + ', ' + p.lon.toFixed(6), 'Coordinates copied.'); closeCtxMenu(); };
        // arrow keys walk the commands; any press outside, a map move or a resize closes it
        const items = [...el.querySelectorAll('.map-ctx-item')];
        el.addEventListener('keydown', (e) => {
            if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
            e.preventDefault();
            const i = items.indexOf(document.activeElement);
            items[(i + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length].focus();
        });
        const outside = (e) => { if (!el.contains(e.target)) closeCtxMenu(); };
        setTimeout(() => document.addEventListener('pointerdown', outside, true), 0); // not the press that opened it
        map.map.on('movestart', closeCtxMenu); window.addEventListener('resize', closeCtxMenu);
        const release = () => { document.removeEventListener('pointerdown', outside, true); map.map.off('movestart', closeCtxMenu); window.removeEventListener('resize', closeCtxMenu); };
        ctxMenu = { el, keys, release, pastePoint: pastePt || null };
        requestAnimationFrame(() => { if (ctxMenu && ctxMenu.el === el && items[0]) items[0].focus({ preventScroll: true }); }); // after the map has handled the press
    }
    // Google Earth alongside Maps (#69): one window that recentres + 3D/Street View and historical
    // imagery — handy for spotting tracks hidden under foliage (leaf-off views).
    const outsideLinks = (lat, lon) => [
        { id: 'maps', icon: 'fa-map-location-dot', label: 'Open in Google Maps', href: `https://www.google.com/maps/search/?api=1&query=${lat},${lon}` },
        { id: 'earth', icon: 'fa-earth-americas', label: 'Open in Google Earth', href: `https://earth.google.com/web/search/${lat},${lon}` },
    ];
    // The map context menu — right-click on desktop, long-press on touch (#83). Its command set
    // depends on what's under the point: a note, a plain track point, or empty ground.
    function openMapMenu(lngLat, point) {
        if (!map.ready || recWatch != null) return; // never edit mid-recording
        const here = { lat: lngLat.lat, lon: lngLat.lng };
        const lat = here.lat.toFixed(6), lon = here.lon.toFixed(6);
        if (readOnly()) return openCtxMenu(lngLat, { title: 'This spot', point: here }, [outsideLinks(lat, lon)], null); // read-only: look, never edit
        const outside = outsideLinks(lat, lon);
        const photo = (p) => [
            { id: 'photo', icon: 'fa-camera', label: 'Upload a photo here', run: () => uploadPhotoHere(p) },
            { id: 'paste', icon: 'fa-paste', label: 'Paste photo', key: 'Ctrl V', run: () => pastePhotoHere(p) },
        ];
        const wf = rb && map.map.queryRenderedFeatures(point, { layers: ['rb-wpts'] })[0];
        const vf = rb && !wf && map.map.queryRenderedFeatures(point, { layers: ['rb-verts'] })[0];
        if (wf) {                                   // a note (waypoint)
            const ni = parseInt(wf.properties.i, 10), n = rb.notes[ni];
            openCtxMenu(lngLat, { title: t('Note') + ' ' + n.num, point: n }, [[
                { id: 'trk', icon: 'fa-link-slash', label: 'Turn this note into a track point', key: 'T', run: () => transformNote(ni) },
                { id: 'del', icon: 'fa-trash-can', label: 'Delete note', key: 'Del', danger: true, run: () => deleteNoteConfirm(ni) },
            ], photo(n), outside], n);
        } else if (vf) {                            // a plain track point
            const ti = parseInt(vf.properties.i, 10), tp = rb.track[ti];
            openCtxMenu(lngLat, { title: 'Track point', point: tp }, [[
                { id: 'note', icon: 'fa-location-dot', label: 'Turn this point into a note', key: 'N', run: () => vertexAction('note', ti) },
                { id: 'mid', icon: 'fa-arrows-left-right-to-line', label: 'Add intermediate point', key: 'I', run: () => vertexAction('mid', ti) },
                { id: 'line', icon: 'fa-circle-plus', label: 'Add track point here', key: 'P', run: () => vertexAction('line', ti) },
                { id: 'del', icon: 'fa-trash-can', label: 'Delete point', key: 'Del', danger: true, run: () => vertexAction('del', ti) },
            ], photo(tp), outside], tp);
        } else {                                    // empty ground (route ops act on the nearest point)
            openCtxMenu(lngLat, { title: 'This spot', point: here }, [rb ? [
                { id: 'note', icon: 'fa-location-dot', label: 'Add note here', key: 'N', run: () => addNoteAtExact(here) },
                { id: 'pt', icon: 'fa-circle-plus', label: 'Add track point here', key: 'P', run: () => addPointAtExact(here) },
                { id: 'del', icon: 'fa-trash-can', label: 'Delete the nearest point', key: 'Del', danger: true, run: () => deleteTrackPointNear(here) },
            ] : [], photo(here), outside], here);
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
    // Live mouse position on the map: "Add track point here" from a selected vertex lands at the
    // pointer rather than at a midpoint (#35/#61).
    let hoverPt = null;
    if (map.map) {
        map.map.on('mousemove', (e) => { hoverPt = { lat: e.lngLat.lat, lon: e.lngLat.lng }; });
        map.map.on('mouseout', () => { hoverPt = null; });
    }
    // Editor shortcuts (#35 · #458 · #692). One letter per thing, the same everywhere:
    //  · an open context menu takes its own keys first (Esc closes it);
    //  · a tap-selected track vertex takes N (make it a note) · I (intermediate point) · P (add a
    //    point at the pointer) · Del;
    //  · something selected inside the vignette takes Del; an open note takes T · Del;
    //  · otherwise the letters are the modes: M Move · N add Notes · P add Points · D Draw · C Cut.
    const MODE_KEYS = { m: 'points', n: 'note', p: 'point', d: 'draw', c: 'cut' };
    window.addEventListener('keydown', (e) => {
        if (recWatch != null || readOnly() || e.target.matches('input, textarea, select')) return;
        if (e.ctrlKey || e.metaKey || e.altKey) { // Ctrl/Cmd+V over a context menu → paste the photo at its point (the native paste event uploads it)
            if (ctxMenu && ctxMenu.pastePoint && (e.key === 'v' || e.key === 'V')) { pastePoint = ctxMenu.pastePoint; closeCtxMenu(); }
            return; // leave undo/redo and the browser's own paste alone
        }
        const k = (e.key === 'Delete' || e.key === 'Backspace') ? 'del' : e.key.toLowerCase();
        if (k === 'escape') { if (ctxMenu) { e.preventDefault(); closeCtxMenu(); } return; }
        if (ctxMenu) { // menu open: its commands are the accelerators
            const run = ctxMenu.keys[k];
            if (!run) return;
            e.preventDefault(); closeCtxMenu(); run();
        } else if (rb && selVertex >= 0 && ['n', 'i', 'p', 'del'].includes(k)) { // a track vertex is selected
            e.preventDefault();
            const i = selVertex; selVertex = -1; // the index goes stale once the route changes
            vertexAction({ n: 'note', i: 'mid', p: 'line', del: 'del' }[k], i);
        } else if (rb && editorOpen && canvas.sel && k === 'del') { // something is selected INSIDE the
            // vignette: Del removes THAT — an icon or a junction vector — not the note holding it
            // (#521). Deleting the note from under a selected icon is never what the key meant.
            e.preventDefault(); canvas.deleteSelected();
        } else if (rb && editorOpen && sel >= 0 && (k === 't' || k === 'del')) { // a note is open: T transforms it, Del deletes it
            e.preventDefault();
            if (k === 't') transformNote(sel); else deleteNoteConfirm(sel);
        } else if (MODE_KEYS[k] && modeAvailable(MODE_KEYS[k])) {
            e.preventDefault(); setMapTool(MODE_KEYS[k]);
        }
    });
    let rbLock = { mine: true }; // soft edit lock (#154): while someone else holds it, this Editor is read-only
    const readOnly = () => !rbLock.mine;
    // The gate of every tool that changes the roadbook: something loaded, and the lock is ours.
    function editable() {
        if (!rb) { toast('Load a roadbook first.'); return false; }
        if (readOnly()) { toast('Read-only while someone else is editing.'); return false; }
        return true;
    }
    let rb = null, sel = 0, std = null, dirty = false, exported = false, editorOpen = false, vertRaf = 0;
    // draft checkpoint: every edit schedules a debounced write of the whole working
    // state; cleared once the work is safe (saved to profile or exported)
    const DRAFT_KEY = 'rb_editor_draft';
    let draftTimer = null;
    // the whole working state, including the server-side settings a save writes back (#106 · #713 · #784)
    const saveDraft = () => { try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ rb, currentRbId, status, reusable, vehicles, publicSlug, gaps, rbIsOwner, rbOwner, at: Date.now() })); } catch (e) {} };
    const clearDraft = () => { clearTimeout(draftTimer); try { localStorage.removeItem(DRAFT_KEY); } catch (e) {} };
    // A declined recovery is marked, not deleted (#436): the work stays recoverable until the next
    // checkpoint replaces it, but the offer is not repeated. `saveDraft` writes a fresh object, so
    // any later edit naturally clears the flag along with the stale draft.
    const declineDraft = () => RBCheckpoint.decline(DRAFT_KEY);
    // Nothing becomes dirty while someone else holds the lock (#698): there is nothing to save,
    // and nothing for Close to offer to save.
    const markDirty = () => { if (readOnly()) return; dirty = true; exported = false; updateSaveBtn(); clearTimeout(draftTimer); draftTimer = setTimeout(saveDraft, 2000); histPush(); };
    // Floppy save button: clickable only when there's something to save (a new roadbook, or
    // pending edits) — disabled once it's saved to the profile with no further changes.
    function updateSaveBtn() {
        const dis = !!(currentRbId && !dirty) || !rbLock.mine; // never save over someone else's lock (#154)
        ['saveAccount', 'cfgSave', 'cfgSaveBottom'].forEach((id) => { const b = $(id); if (b) b.disabled = dis; });
        const dlt = $('deleteSection'); if (dlt) dlt.hidden = !(currentRbId > 0 && rbIsOwner); // delete only exists once it's saved, and only for the owner
    }
    const mkIcon = (name, pos) => ({ name, pos, angle: 0, size: 64, flip_x: false }); // a new icon lands at a size you can see, then resize as needed
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
    const canvas = new NoteCanvas($('noteCanvas'), { toolbarEl: $('noteToolbar'), onChange: () => markDirty(), missingIcon: '../assets/icons/W28_general_danger.svg', resolveIcon: (ic) => RB.iconSrc(ic, rb, '../assets/icons/') });
    // Show note i on the canvas. One place asks whether it is the roadbook's end note, so the
    // tulip there drops its exit arrow exactly like the list rows, the Reader and the PDF (#447).
    const showOnCanvas = (i) => { canvas.setNote(rb.notes[i], RB.tulipContext(rb, i)); syncTulipToggle(rb.notes[i]); };
    /* The imported tulip (#943): an OpenRally note keeps its original image for good, and one toggle
       beside the vignette switches between it and the editor's own tulip — which is what an icon
       or a junction is added to, so adding one while the original shows switches to the editor's
       first. Nothing is ever deleted: the original is always one tap away. */
    function syncTulipToggle(n) {
        const original = n && NoteCanvas.originalTulip(n);
        $('toggleTulip').hidden = !original;
        if (original) { $('toggleTulip').classList.toggle('on', !original.hidden); $('toggleTulip').setAttribute('aria-pressed', String(!original.hidden)); }
    }
    $('toggleTulip').onclick = () => {
        const n = rb && rb.notes[sel], original = n && NoteCanvas.originalTulip(n);
        if (!original || !editable()) return;
        if (original.hidden) delete original.hidden; else original.hidden = true;
        showOnCanvas(sel); markDirty();
    };
    // the editor's own tulip, for whatever is added to the vignette
    function ownTulip() {
        const n = rb && rb.notes[sel], original = n && NoteCanvas.originalTulip(n);
        if (original && !original.hidden) { original.hidden = true; showOnCanvas(sel); }
    }
    canvas.onDropIcon((name, pos) => { if (editable()) { ownTulip(); canvas.addIcon(mkIcon(name, pos)); } });
    // A tap on the open note's vignette means working on its icons (#856): open that tab
    $('noteCanvas').addEventListener('click', () => { if (editorOpen && blockTab !== 'icon') { blockTab = 'icon'; renderEditor(); } });
    $('addJunction').onclick = () => { if (editable()) { ownTulip(); canvas.addJunction(); } };

    map.onWaypoint((i) => { if (mapTool === 'pan' || mapTool === 'points') select(i); }); // Move/Pan: tap a note to open it (a drag moves it); other tools keep you on the map
    if (map.map) map.map.on('click', (e) => {
        if (!map.ready || recWatch != null) return; // never edit mid-recording
        const here = { lat: e.lngLat.lat, lon: e.lngLat.lng };
        if (photoPlacing) { placePhotoHere(here); return; } // setting the position of a photo with no EXIF GPS
        if (map.map.queryRenderedFeatures(e.point, { layers: ['rb-wpts', 'rb-photos', 'rb-verts'] }).length) return;
        if (mapTool === 'pan' || mapTool === 'points') ringInfo(here);
        else if (mapTool === 'point') addPointAtExact(here);
        else if (mapTool === 'draw') extendRoute(here);
        else if (mapTool === 'cut') cutPoint(here);
        else if (mapTool === 'note') addNoteAtExact(here); // stays in note mode, so notes can be dropped in a row
    });

    /* ---------- move points: drag any track vertex to reshape the route ---------- */
    // Live drag updates the dragged point (rAF-coalesced repaint of the line +
    // handles); the metrics/notes recompute once, on release.
    function onVertexDrag(i, lat, lon) {
        if (!rb || i < 0 || i >= rb.track.length) return;
        Object.assign(rb.track[i], { lat: RB.round6(lat), lon: RB.round6(lon) }); // only the position moves: ele and t stay
        if (vertRaf) return;
        vertRaf = requestAnimationFrame(() => { vertRaf = 0; refreshMap(true); map.refreshVertices(rb.track); });
    }
    function onVertexCommit() {
        RB.recomputeMetrics(rb); RB.recomputeCaps(rb);
        refreshMap(true); map.refreshVertices(rb.track); renderNotes();
        if (editorOpen) { renderEditor(); showOnCanvas(sel); markOnMap(rb.notes[sel]); }
        markDirty();
    }
    // Waypoint drag (default Move): the blue note marker moves its underlying track vertex, so the
    // track line drags with it — a wpt is movable exactly like a trk (#61). Live, then commit on release.
    function onWptDrag(ni, lat, lon) {
        if (!rb || ni < 0 || ni >= rb.notes.length) return;
        const n = rb.notes[ni];
        Object.assign(rb.track[n.idx], { lat: RB.round6(lat), lon: RB.round6(lon) }); // only the position moves: ele and t stay
        n.lat = rb.track[n.idx].lat; n.lon = rb.track[n.idx].lon; // keep the marker + line together while dragging
        if (vertRaf) return;
        vertRaf = requestAnimationFrame(() => { vertRaf = 0; refreshMap(true); });
    }
    function onWptCommit() {
        RB.recomputeMetrics(rb); RB.recomputeCaps(rb);
        refreshMap(true); renderNotes();
        if (editorOpen && sel >= 0) { renderEditor(); showOnCanvas(sel); markOnMap(rb.notes[sel]); }
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
        selVertex = i; // the N/I/P/Del shortcuts now target this point
        map.setSelectedVertex(tp);
        // centre + rotate to the heading at this point, like selecting a note (arrival heading)
        const heading = RB.deriveBearings(rb.track, i).bIn;
        if (map.map && map.ready) map.map.easeTo({ center: [tp.lon, tp.lat], zoom: Math.max(map.map.getZoom(), 14), bearing: heading, duration: 450 });
    }
    // Track-point context commands (from the menu, or its keyboard shortcut). #35
    function vertexAction(act, i) {
        if (!rb || i < 0 || i >= rb.track.length) return;
        const pt = rb.track[i];
        if (act === 'note') { promoteVertex(i); } // attach a note to THIS vertex — no new geometry (#61)
        else if (act === 'mid') { addMidpointAfter(i); }
        // "Add point on line": add a track point straight away at the pointer (like W adds a note),
        // instead of switching to a mode and waiting for a tap. Falls back to a midpoint after the vertex.
        else if (act === 'line') { if (hoverPt) addPointAtExact(hoverPt); else addMidpointAfter(i); }
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
        if (!(await RBConfirmDanger(t('Turn this note into a plain track point? Its text and symbols will be removed.') + ' ' + noteLabel(rb.notes[ni])))) return;
        rb.notes.splice(ni, 1);
        RB.recomputeMetrics(rb); RB.recomputeCaps(rb);
        routeChanged('Waypoint turned into a track point.');
    }
    // A note's confirm label, e.g. "#3 — Sharp left". The text comes from the loaded
    // .rdbk (user/untrusted) and the confirm message is rendered as HTML, so escape it.
    const noteLabel = (n) => '#' + n.num + (n.text ? ' — ' + esc(n.text) : '');
    async function deleteNoteConfirm(ni) {
        if (!rb || ni < 0 || ni >= rb.notes.length) return;
        // The 2-note minimum applies to the notes only; the material around them (#542) never counts.
        if (rb.notes.length <= 2) return toast('At least 2 notes must remain.');
        const label = noteLabel(rb.notes[ni]);
        if (!(await RBConfirmDanger(t('Delete note') + ' ' + label + '?'))) return;
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
    // Centre the map on the signed-in user's saved default location — used when there's no route to
    // fit (an empty start, or opening a saved roadbook that has no points yet), so drawing starts there.
    const centerOnDefault = () => { if (map.map && meUser && meUser.default_lat != null && meUser.default_lon != null) map.map.jumpTo({ center: [meUser.default_lon, meUser.default_lat], zoom: 12 }); };
    async function confirmOpenCuts() {
        if (!resolveGaps().length) return true;
        return RBConfirm(t('The route has open cuts — they will close as straight lines. Continue?'));
    }
    /* Pre-save consistency check (#339). RB.consistencyReport finds what is probably a mistake but
     * that the editor can't decide on its own — a speed-controlled zone that never ends, or a limit
     * lifted where none is in force. A clean roadbook saves with no
     * interruption; otherwise the findings are listed and the author chooses to fix or save anyway,
     * so the check informs and never blocks. Numbers come from the core, wording from here. */
    const CONSISTENCY_TEXT = {
        speed_zone_unclosed: (f) => t('A speed-controlled zone is never lifted — it starts at note') + ' ' + f.notes[0],
        speed_zone_unopened: (f) => t('A speed limit is lifted where no zone is open') + ': ' + noteList(f.notes),
    };
    // "3, 7, 12 … (+4)" — enough to find them without a wall of numbers, and nothing to translate.
    function noteList(nums) {
        const shown = nums.slice(0, 8).join(', ');
        return nums.length > 8 ? shown + ' … (+' + (nums.length - 8) + ')' : shown;
    }
    async function confirmConsistency() {
        const findings = RB.consistencyReport(rb);
        if (!findings.length) return true;
        return new Promise((resolve) => {
            const rows = findings.map((f) => `<li>${esc(CONSISTENCY_TEXT[f.code](f))}</li>`).join('');
            const d = RBModal(`<h3><i class="fa-solid fa-triangle-exclamation icon-accent"></i> ${t('Consistency check')}</h3>
                <p class="muted">${t('Have a look before saving — none of this stops the roadbook from working:')}</p>
                <ul class="modal-list">${rows}</ul>
                <div class="btnrow center wrap">
                    <button class="btn btn-ghost" id="ckFix">${t('Let me fix it')}</button>
                    <button class="btn btn-primary" id="ckSave"><i class="fa-solid fa-floppy-disk"></i> ${t('Save anyway')}</button>
                </div>`, 'slim', () => resolve(false));
            d.q('#ckSave').onclick = () => { resolve(true); d.close(); };
            d.q('#ckFix').onclick = () => { resolve(false); d.close(); };
        });
    }
    // The map modes are exclusive; the ☰ panel's other tools are one-shot. 'pan' is the neutral
    // state while nothing is loaded, a photo is being placed or the route is re-recorded.
    let mapTool = 'pan', cutFromIdx = -1, drawSeed = [];
    // Every mode's button: the rail (bottom-left) and Cut's row in the ☰ panel (#692).
    const MODE_BUTTONS = ['modeMove', 'modeNote', 'modePoint', 'modeDraw', 'modeCut', 'toolCut'];
    // Move, Add notes, Add points and Cut act on an existing route; Draw also starts one.
    const modeAvailable = (tool) => !readOnly() && (tool === 'draw' || !!(rb && rb.track.length >= 2));
    function paintModes() {
        MODE_BUTTONS.forEach((id) => {
            const b = $(id), tool = b.dataset.tool;
            b.classList.toggle('on', tool === mapTool);
            b.disabled = !modeAvailable(tool);
        });
        $('modeCut').hidden = mapTool !== 'cut'; // Cut joins the rail only while it is the active mode
    }
    // the mode's name shows beside the rail for 3 s when the mode changes, then the lit button alone says it
    let modeNameTimer = null;
    function flashModeName() {
        const rail = document.querySelector('.mode-rail');
        rail.classList.add('show-name'); clearTimeout(modeNameTimer);
        modeNameTimer = setTimeout(() => rail.classList.remove('show-name'), 3000);
    }
    function setMapTool(tool) {
        if (readOnly()) tool = 'pan'; // read-only: the map only pans — no mode may arm a drag or an edit (#698)
        if (tool !== mapTool) flashModeName();
        mapTool = tool; cutFromIdx = -1; drawSeed = []; map.setPin(null); map.setSelectedVertex(null); selVertex = -1;
        if (photoMoveMarker) { photoMoveMarker.remove(); photoMoveMarker = null; } // cancel a photo move on tool switch / Escape
        map.setCursor(tool === 'pan' || tool === 'points' ? '' : 'crosshair'); // Move shows a per-handle grab cursor
        if (tool === 'points' && rb) { map.setVertexEditor(rb.track, onVertexDrag, onVertexCommit, onVertexSelect); map.setWaypointEditor(onWptDrag, onWptCommit); map.setPhotoEditor(onPhotoDrag, onPhotoCommit); } // Move: drag trk · wpt · photo
        else if ((tool === 'point' || tool === 'draw') && rb) { map.showVertices(rb.track); map.setWaypointEditor(null); map.setPhotoEditor(null); } // dots visible (read-only) while adding to the route (#52)
        else { map.setVertexEditor(null); map.setWaypointEditor(null); map.setPhotoEditor(null); }
        $('mapMenuPanel').hidden = true; // picking any tool closes the ☰ panel
        paintModes();
    }
    // a rail button toggles: tapping the active mode again goes back to Move
    MODE_BUTTONS.forEach((id) => $(id).onclick = () => setMapTool($(id).dataset.tool === mapTool && id !== 'toolCut' ? 'points' : $(id).dataset.tool));
    paintModes();
    $('mapMenuToggle').onclick = () => { const p = $('mapMenuPanel'); p.hidden = !p.hidden; };
    // Shortcut sheet (#458): every key grouped by context, including the two lines written
    // nowhere else — right-click on desktop, long-press on touch, opens the context menu.
    function shortcutSheet() {
        const row = (label, key) => `<div class="shortcut-row"><span>${esc(t(label))}</span><kbd class="key-chip">${key}</kbd></div>`;
        const sec = (h, rows) => `<section><h3>${esc(t(h))}</h3>` + rows.map(([l, k]) => row(l, k)).join('') + '</section>';
        const m = RBModal(`<h2><i class="fa-solid fa-keyboard icon-accent"></i> ${esc(t('Keyboard shortcuts'))}</h2><div class="shortcut-grid">`
            + sec('Modes', [['Move', 'M'], ['Add notes', 'N'], ['Add points', 'P'], ['Draw', 'D'], ['Cut', 'C'], ['Back to Move', 'Esc']])
            + sec('Track point', [['Turn this point into a note', 'N'], ['Add intermediate point', 'I'], ['Add track point here', 'P'], ['Delete point', 'Del']])
            + sec('Note', [['Turn this note into a track point', 'T'], ['Delete note', 'Del']])
            + sec('Anywhere', [['Undo', 'Ctrl+Z'], ['Redo', 'Ctrl+Y']]) + '</div>'
            + `<p class="muted small">${esc(t('Right-click opens the menu — long-press on touch.'))}</p>`
            + `<div class="btnrow end"><button class="btn btn-ghost modal-close">${esc(t('Close'))}</button></div>`, 'wide');
        m.q('.modal-close').onclick = m.close;
    }
    $('toolShortcuts').onclick = () => { $('mapMenuPanel').hidden = true; shortcutSheet(); };
    // translated hover tooltips (refreshed on language switch)
    function applyToolTips() {
        const tips = {
            modeMove: 'Move: drag points, notes and photos — M', modeNote: 'Add notes: tap the route — N',
            modePoint: 'Add points: tap the route to insert one — P',
            modeDraw: 'Draw: tap to add new points from the nearest end — D', modeCut: 'Cut (tap two points) — C', toolCut: 'Cut (tap two points) — C',
            toolAddGpx: 'Add a GPX track',
            toolSimplify: 'Simplify (remove GPS noise)', toolAdjust: 'Adjust on the trail (live GPS)',
            undoBtn: 'Undo (Ctrl+Z)', redoBtn: 'Redo (Ctrl+Y)', mapMenuToggle: 'More tools', toolShortcuts: 'Keyboard shortcuts',
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
    // Escape → back to the default Move tool; never mid-adjust — the drag editors must not
    // touch a track that is being live re-recorded (#220) — never read-only, and never while a
    // dialog or the photo viewer is open: there Escape belongs to them. Heard in the capture
    // phase, before the viewer's own Escape closes it.
    window.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape' || recWatch != null || readOnly()) return;
        if (document.querySelector('.modal') || !$('lightbox').hidden) return;
        setMapTool('points');
    }, true);
    // Draw (#712): every tap adds a new point, joining the nearest OPEN end — the finish, the
    // start, or either edge of an open cut (tapping on the opposite edge closes the cut). With
    // nothing loaded, the first two taps create a fresh roadbook (start/end notes ride the
    // growing track). A drag still pans the map, as in every mode.
    const nearOnScreen = (q, p, px = 16) => {
        if (!map.map) return RB.geo.haversineM(q, p) < px * 1.25;
        const A = map.map.project([q.lon, q.lat]), B = map.map.project([p.lon, p.lat]);
        return Math.hypot(A.x - B.x, A.y - B.y) < px;
    };
    // A brand-new route from its first two Draw taps. A loaded routeless roadbook keeps its
    // identity, title and metadata; Draw stays armed.
    function startRoute(trkpts, mode) {
        const meta = rb && rb.meta;
        if (!rb) resetIdentity();
        const drawn = RB.buildRoadbook({ name: (meta && meta.title) || t('Drawn route'), trkpts });
        if (meta) drawn.meta = { ...meta, ...drawn.meta };
        setRoadbook(drawn);
        markDirty(); setMapTool(mode);
    }
    function extendRoute(p) {
        const pt = { lat: RB.round6(p.lat), lon: RB.round6(p.lon) };
        if (!rb || rb.track.length < 2) {     // seed the first segment of a brand-new or routeless roadbook
            drawSeed.push(pt); map.setPin(drawSeed[0]);
            if (drawSeed.length === 2) startRoute(drawSeed, 'draw');
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
    // Cut mode: tap two points — at the ends it trims; in the middle it removes
    // the span and leaves an OPEN cut (dashed connector) to fill by drawing.
    // The notes inside the span go with it, so the cut asks first, naming them.
    async function cutPoint(p) {
        if (!rb) return toast('Load a roadbook first.');
        const idx = splitTrackAt(p);
        if (cutFromIdx < 0) { cutFromIdx = idx; map.setPin(rb.track[idx]); toast('Now tap the other end of the cut.'); return; }
        const a = Math.min(cutFromIdx, idx), b = Math.max(cutFromIdx, idx);
        cutFromIdx = -1; map.setPin(null);
        if (b - a < 1) return toast('Nothing to cut.');
        if (a === 0 && b === rb.track.length - 1) return toast('Nothing would remain.');
        const inside = (n) => (a === 0 ? n.idx < b : b === rb.track.length - 1 ? n.idx > a : n.idx > a && n.idx < b);
        const losing = rb.notes.filter(inside);
        if (losing.length && !(await RBConfirmDanger(t('Cut the route? These notes are inside the cut and will be deleted:') + ' ' + losing.map(noteLabel).join(', ')))) return;
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
        if (!rb.notes.some((n) => n.idx === 0)) rb.notes.push(RB.bareNote(rb, 0, roadOutBefore(0)));
        if (!rb.notes.some((n) => n.idx === last)) rb.notes.push(RB.bareNote(rb, last, roadOutBefore(last)));
        RB.recomputeMetrics(rb); RB.recomputeCaps(rb);
        sel = 0; routeChanged(toastMsg); setMapTool('points'); // cut done → back to the default Move tool
    }
    // Add GPX: if both ends of the piece touch the route it offers a detour
    // (replace the matching segment); otherwise it joins the piece to the nearest
    // end, auto-orienting it. Either way the route stays ONE track.
    $('toolAddGpx').onclick = () => { if (editable()) $('addGpxFile').click(); };
    $('addGpxFile').onchange = async (e) => {
        const f = e.target.files[0]; e.target.value = '';
        if (!f || !editable()) return;
        try {
            const p = RB.parseGPX(await f.text());
            // A GPX with a real track → smart-join it. A GPX with little/no track but waypoints
            // (e.g. a POI/waypoint-only file) → merge those onto the current route instead (#131).
            if (p.trkpts && p.trkpts.length >= 2) await addGpxTrack(p.trkpts);
            else if (p.wpts && p.wpts.length) addWaypointsFromGpx(p.wpts);
            else toast('The GPX has no usable track or waypoints.');
        } catch (err) { toast('Could not read this GPX file.'); }
    };
    // Merge a waypoint-only GPX onto the current route (#131). When both the waypoint and the
    // route carry timestamps (same recording), place it at the track point nearest IN TIME — the
    // reliable anchor on a self-crossing route (#158). Otherwise fall back to a geometry snap:
    // a waypoint within SNAP_M of the line is inserted at its projection; farther ones are skipped.
    function addWaypointsFromGpx(wpts) {
        const SNAP_M = 10;
        const routeTimed = rb.track.some((p) => p.t != null);
        let added = 0, skipped = 0;
        wpts.forEach((wp) => {
            let at;
            if (wp.t != null && routeTimed) {
                at = RB.nearestIdxByTime(rb.track, wp.t); // anchor by time ONTO an existing track point (no splice)
                if (rb.notes.some((n) => n.idx === at)) { skipped++; return; } // a note already sits there
            } else {
                const hit = RB.nearestOnTrack(rb.track, wp);
                if (!hit || hit.dist > SNAP_M) { skipped++; return; }
                at = hit.i + 1;
                rb.track.splice(at, 0, { lat: hit.lat, lon: hit.lon }); // the snapped point ON the line
                rb.notes.forEach((n) => { if (n.idx >= at) n.idx++; });
                if (cutFromIdx >= at) cutFromIdx++;
            }
            const note = RB.bareNote(rb, at, roadOutBefore(at));
            note.text = (wp.name || '').trim();
            if (wp.icon) note.icons = [{ name: wp.icon, pos: [0, 0], angle: 0, size: 40, flip_x: false }];
            if (wp.danger) note.danger = wp.danger;
            if (wp.appwpt) note.appwpt = wp.appwpt; // unmapped Garmin/OSMAnd icon, kept verbatim
            rb.notes.push(note);
            added++;
        });
        if (!added) return toast(skipped ? 'No waypoints within 10 m of the route.' : 'The GPX has no usable track or waypoints.');
        RB.recomputeMetrics(rb); RB.recomputeCaps(rb);
        sel = 0;
        routeChanged(t('Notes added from the GPX') + ': ' + added + (skipped ? ' (' + skipped + ' ' + t('skipped, too far') + ')' : '') + '.');
    }
    async function addGpxTrack(trkpts) {
        if (!trkpts || trkpts.length < 2) return toast('The GPX track has too few points.');
        const D = RB.geo.haversineM, NEAR_M = 200;
        const pieceStart = trkpts[0], pieceEnd = trkpts[trkpts.length - 1];
        const iS = RB.nearestIdx(rb.track, pieceStart), iE = RB.nearestIdx(rb.track, pieceEnd);
        if (D(rb.track[iS], pieceStart) < NEAR_M && D(rb.track[iE], pieceEnd) < NEAR_M && Math.abs(iE - iS) > 2) {
            let piece = trkpts, i1 = iS, i2 = iE;
            if (i1 > i2) { piece = trkpts.slice().reverse(); i1 = iE; i2 = iS; }
            if (!(await RBConfirm(t('Both ends of the loaded track touch the route — replace the segment between them?')))) return;
            spliceByIndex(rb, piece, i1, i2);
            sel = 0; routeChanged('Spliced · metrics recomputed.');
            return;
        }
        // Prefer chronology when both the route and the piece carry timestamps and don't overlap
        // in time (#158): continue the piece from whichever physical END of the route is nearest
        // to it in time. Reading the times AT the two array ends keeps this correct even after a
        // Reverse (array order needn't match time order). Otherwise fall back to nearest-end geometry.
        const startT = rb.track[0].t, endT = rb.track[rb.track.length - 1].t, pT0 = pieceStart.t, pT1 = pieceEnd.t;
        let joinAtStart, byTime = null;
        if (startT != null && endT != null && pT0 != null && pT1 != null) {
            const pMin = Math.min(pT0, pT1), pMax = Math.max(pT0, pT1), rMin = Math.min(startT, endT), rMax = Math.max(startT, endT);
            if (pMin >= rMax || pMax <= rMin) { // the piece doesn't overlap the route in time
                const pMid = (pT0 + pT1) / 2;
                joinAtStart = Math.abs(pMid - startT) < Math.abs(pMid - endT); // the end nearest in time
                const anchorT = joinAtStart ? startT : endT;
                byTime = Math.abs(pT0 - anchorT) <= Math.abs(pT1 - anchorT) ? trkpts : trkpts.slice().reverse(); // the piece end nearest that anchor connects first
            }
        }
        if (joinAtStart === undefined) { // no usable times → join at the geometrically nearest end
            joinAtStart = Math.min(D(rb.track[0], pieceStart), D(rb.track[0], pieceEnd))
                < Math.min(D(rb.track[rb.track.length - 1], pieceStart), D(rb.track[rb.track.length - 1], pieceEnd));
        }
        const anchor = joinAtStart ? rb.track[0] : rb.track[rb.track.length - 1];
        // time decided the orientation; otherwise orient the piece so its nearest end meets the anchor
        RB.joinTrack(rb, byTime || (D(anchor, pieceStart) <= D(anchor, pieceEnd) ? trkpts : trkpts.slice().reverse()), joinAtStart);
        sel = 0; routeChanged('Track joined to the route.');
    }
    // Reverse lives in the roadbook settings (it flips the whole route) and asks first.
    $('cfgReverse').onclick = async () => {
        if (!editable()) return;
        if (!(await RBConfirm(t('Reverse the whole route? Start and finish swap, and every vignette is recomputed.')))) return;
        RB.reverseRoadbook(rb); sel = 0;
        routeChanged('Route reversed — review the vignettes.');
    };
    $('toolSimplify').onclick = () => {
        if (!editable()) return;
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
    $('toolAdjust').onclick = () => { if (!editable()) return; setMapTool('pan'); startRecording(); };
    $('drawRoute').onclick = () => { loadStarted = true; showEditing(); setMapTool('draw'); toast('Tap the map to draw your route.'); };

    /* ---------- loading ---------- */
    // The opening screen is interactive immediately, while startup() is still running its async
    // crash-recovery prompts. Once the user picks a source here, suppress those prompts so a
    // recovery confirm can't pop on top of (e.g.) the public-challenge picker (#68).
    let loadStarted = false;
    $('loadGpx').onclick = () => { loadStarted = true; $('gpxFile').click(); };
    $('loadJson').onclick = () => { loadStarted = true; $('jsonFile').click(); };
    // Copy a public roadbook: only the ones their owner lets others copy (#106), as a new roadbook
    // for the same vehicles.
    $('pickChallenge').onclick = () => {
        loadStarted = true;
        RBChallenges.pick((j) => {
            if (!j.reusable) return toast('This public roadbook cannot be copied.');
            resetIdentity(); vehicles = j.vehicles; paintVehicles(); setRoadbook(j.roadbook);
        }, { reusable: true });
    };
    $('gpxFile').onchange = async (e) => {
        const files = Array.from(e.target.files); e.target.value = ''; // picking the same file again must fire again (#659)
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
        } catch (err) { toast('Could not read this GPX file.'); }
    };
    $('jsonFile').onchange = async (e) => {
        const f = e.target.files[0]; e.target.value = ''; if (!f) return;
        try {
            const b = await RBZip.readBundle(f); const j = b.roadbook;
            if (!j.track || !j.notes) throw new Error('Not a roadbook');
            resetIdentity(); pendingMedia = b.media; setRoadbook(j);
            if (pendingMedia.length) { // the bundle carries photos/audio → they only appear once re-uploaded on save (#162)
                const d = RBModal(`<h3><i class="fa-solid fa-images icon-accent"></i> ${esc(t('Photos & audio'))}</h3>
                    <p class="muted">${esc(t('This roadbook includes photos or voice notes. They stay hidden until you save it to your profile.'))}</p>
                    <div class="btnrow end"><button class="btn btn-ghost modal-close">${esc(t('Close'))}</button></div>`, 'narrow');
                d.q('.modal-close').onclick = d.close;
            }
        }
        catch (err) { toast('This file is not a roadbook.'); }
    };
    // Toggle between the opening screen (ways to start a new roadbook) and the
    // editing surface (the map + tool bar). The map is built up front but stays
    // hidden until there's a roadbook to edit, so the editor never opens on a
    // blank map.
    function showEditing() { $('landing').hidden = true; $('mapEditor').hidden = false; if (map.map) map.map.resize(); }
    // `restoredGaps`: the open cuts of a recovered draft, in place before the history starts, so
    // the first undo snapshot already holds them.
    // The Editor's guided tour (#906): the map modes and the tools around them, once
    const EDITOR_TOUR = [
        { target: '#modeMove', title: 'Move · M', text: 'Drag any track point, note or photo.' },
        { target: '#modeNote', title: 'Add notes · N', text: 'Tap the route to place a note.' },
        { target: '#modePoint', title: 'Add points · P', text: 'Tap to add a point to the track.' },
        { target: '#modeDraw', title: 'Draw · D', text: 'Each tap extends the route from its nearest end.' },
        { target: '#mapMenuToggle', title: 'More tools', text: 'Cut, add a GPX, simplify, adjust on the trail.' },
        { target: '#undoBtn', title: 'Undo', text: 'Every change can be undone (Ctrl+Z).' },
        { target: '#noteList', title: 'Your notes', text: 'Tap one to design its vignette: road, icons, CAP, text.' },
        { target: '#openConfig', title: 'Settings', text: 'Title, description, author, logo and photos.' },
        { target: '#saveAccount', title: 'Save', text: 'Keep it on your profile, public or private.' },
        { target: '#exportBtn', title: 'Export', text: 'A .rdbk, a GPX or a PDF.' },
    ];
    function setRoadbook(r, restoredGaps) {
        rb = RB.importRoadbook(r); // canonical schema + structural defaults (also opens pre-standard Italian files)
        // Pre-load AND refresh the used standard-palette icons as data URIs (#174): the palette
        // is canonical, so updated sign art replaces a stale copy embedded in an older roadbook;
        // a custom icon isn't on disk (its fetch fails) and its embedded copy stays. Async and
        // non-blocking: the UI renders right away and repaints once the icons are in.
        const iconJobs = new Map(); // base name → fetch promise (dedupes icons used by several notes)
        rb.notes.forEach((n) => {
            (n.icons || []).forEach((ic) => {
                const base = (ic.name || '').split('/').pop();
                if (base && !/^data:/.test(ic.name) && !iconJobs.has(base)) {
                    iconJobs.set(base, RB.urlToDataURL('../assets/icons/' + base).then((d) => { if (d) rb.icons[base] = d; }));
                }
            });
        });
        const loadedRb = rb;
        if (iconJobs.size) Promise.all(iconJobs.values()).then(() => {
            if (rb !== loadedRb) return; // a different roadbook was opened meanwhile
            renderNotes(); reportUnresolvedIcons(); canvas.render();
        });

        dirty = false; gaps = restoredGaps || [];
        showEditing();
        $('recBar').hidden = true; $('rbPanel').hidden = false;
        closeEditor(); // park the inline editor; tap a note to open it
        // route ops need a roadbook and the lock (setLock ran first when the lock is someone else's);
        // the modes paint their own state
        ['toolAddGpx', 'toolSimplify', 'toolAdjust'].forEach((id) => $(id).disabled = readOnly());
        $('toolShortcuts').disabled = false;
        fillSettings();
        updatePhotos(); updateAudio(); updateSaveBtn();
        refreshMap(false); renderNotes(); renderIcons(); reportUnresolvedIcons();
        sel = 0;
        if (rb.notes.length) { showOnCanvas(0); renderEditor(); } else canvas.setNote(null);
        histReset();
        const routeless = rb.track.length < 2;
        setMapTool(routeless ? 'draw' : 'points'); // a routeless roadbook opens ready to draw; a loaded one defaults to Move
        showView('map'); // tap a note to open its editor inline below the row
        setTimeout(() => RBTour('editor', EDITOR_TOUR), 700); // the first roadbook opened (#906)
        if (routeless) { centerOnDefault(); toast('Tap the map to draw your route.'); } // no route to fit → start at the user's default location
    }

    // The settings fields, filled from rb — on load and after every undo/redo.
    function fillSettings() {
        $('rbTitle').value = rb.meta.title || ''; $('rbDesc').value = rb.meta.description || '';
        $('rbAuthor').value = rb.meta.author || userName() || ''; $('rbOrg').value = rb.meta.organization || '';
        setLogoPreview(rb.meta.logo); $('rbModified').textContent = rb.meta.modified || '—';
        $('cfgMapAccess').checked = rb.meta.map_access !== false; // optional field; default ON, absent = allowed
        $('cfgReusable').checked = reusable; // #106: server-side flag, not part of the .rdbk
        $('cfgProfile').value = rb.meta.profile === 'rally' ? 'rally' : 'basic'; // absent ⇒ basic
        $('cfgWpRadius').value = rb.meta.default_wp_radius != null ? rb.meta.default_wp_radius : ''; // absent ⇒ per-type defaults
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
        // a half-done cut, a selected vertex or a draw seed point at the track just replaced
        cutFromIdx = -1; drawSeed = []; selVertex = -1; map.setPin(null); map.setSelectedVertex(null);
        dirty = true; exported = false; updateSaveBtn();
        clearTimeout(draftTimer); draftTimer = setTimeout(saveDraft, 2000);
        fillSettings();
        refreshMap(true); renderNotes(); renderIcons();
        if (rb.notes.length) { renderEditor(); showOnCanvas(sel); } else { closeEditor(); canvas.setNote(null); } // a routeless snapshot has no note to show
        markOnMap(rb.notes[sel] || null);
        updateHistBtns();
    }
    function undo() { clearTimeout(histTimer); histPushNow(); if (histPast.length < 2) return; histFuture.push(histPast.pop()); histApply(histPast[histPast.length - 1]); }
    function redo() { if (!histFuture.length) return; const snap = histFuture.pop(); histPast.push(snap); histApply(snap); }
    function updateHistBtns() { $('undoBtn').disabled = readOnly() || histPast.length < 2; $('redoBtn').disabled = readOnly() || !histFuture.length; }
    $('undoBtn').onclick = undo;
    $('redoBtn').onclick = redo;
    window.addEventListener('keydown', (e) => {
        // leave native text-field undo alone; never undo mid-recording
        if (!(e.ctrlKey || e.metaKey) || !rb || recWatch != null || readOnly() || e.target.matches('input, textarea, select')) return;
        const key = e.key.toLowerCase();
        if (key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
        else if (key === 'y' || (key === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
    });
    $('rbTitle').oninput = (e) => { if (rb) { rb.meta.title = e.target.value; markDirty(); } };
    $('rbDesc').oninput = (e) => { if (rb) { rb.meta.description = e.target.value; markDirty(); } };
    $('rbAuthor').oninput = (e) => { if (rb) { rb.meta.author = e.target.value; markDirty(); } };
    $('rbOrg').oninput = (e) => { if (rb) { rb.meta.organization = e.target.value; markDirty(); } };
    $('rbLogoBtn').onclick = () => $('rbLogoFile').click();
    $('rbLogoPrev').onclick = () => $('rbLogoFile').click(); // the shown logo doubles as the "change logo" button
    $('rbLogoClr').onclick = async () => {
        if (!rb || !rb.meta.logo) return;
        if (!(await RBConfirmDanger(`<img class="confirm-thumb" src="${esc(rb.meta.logo)}" alt="">` + esc(t('Remove the logo?'))))) return;
        delete rb.meta.logo; setLogoPreview(null); markDirty();
    };
    $('rbLogoFile').onchange = async (e) => {
        const f = e.target.files[0]; e.target.value = '';
        if (!f || !rb) return;
        try { rb.meta.logo = await RBImg.toDataURL(f, 256); setLogoPreview(rb.meta.logo); markDirty(); }
        catch (err) { toast('Could not read the image.'); }
    };
    // event logo: embedded as a base64 data URI in meta.logo (self-contained, like the icons)
    function userName() { if (!meUser) return ''; return (((meUser.first_name || '') + ' ' + (meUser.last_name || '')).trim()) || meUser.username || ''; }
    // With a logo, the shown logo replaces the upload button (click it to change); without, the upload button shows.
    function setLogoPreview(src) { const i = $('rbLogoPrev'); if (src) { i.src = src; i.hidden = false; $('rbLogoBtn').hidden = true; $('rbLogoClr').hidden = false; } else { i.removeAttribute('src'); i.hidden = true; $('rbLogoBtn').hidden = false; $('rbLogoClr').hidden = true; } }
    function stampMeta() { if (!rb) return; rb.meta = rb.meta || {}; if (!rb.meta.author) rb.meta.author = userName(); rb.meta.modified = new Date().toISOString().slice(0, 10); $('rbModified').textContent = rb.meta.modified; if (rb.meta.author) $('rbAuthor').value = rb.meta.author; }
    function showView(v) {
        $('viewMap').hidden = v !== 'map';
        $('viewConfig').hidden = v !== 'config';
        if (v === 'map' && map && map.map) { setTimeout(() => map.map.resize(), 60); }
    }
    ['backToMap', 'backToMapBottom'].forEach((id) => { $(id).onclick = () => { showView('map'); window.scrollTo(0, 0); }; });
    $('openConfig').onclick = () => { if (!rb) return toast('Load a roadbook first.'); showView('config'); };
    $('cfgMapAccess').onchange = (e) => { if (rb) { rb.meta.map_access = e.target.checked; markDirty(); } };
    $('cfgReusable').onchange = (e) => { reusable = e.target.checked; markDirty(); }; // #106: only meaningful when the roadbook is Public
    // Roadbook profile scopes the WP-type vocabulary. Basic is the default → stored absent
    // (clean files); only 'rally' is persisted. Switching to Basic clears the rally-only types —
    // so it asks first, naming the notes that lose theirs (#697); No puts the select back.
    $('cfgProfile').onchange = async (e) => {
        if (!rb) return;
        if (e.target.value !== 'rally') {
            const core = new Set(RB.wpTypesForProfile('basic').map((w) => w.id));
            const losing = rb.notes.filter((n) => n.wp_type && !core.has(n.wp_type));
            if (losing.length && !(await RBConfirmDanger(t('Switch to Basic? These notes lose their rally waypoint type:') + ' ' + losing.map(noteLabel).join(', ')))) { e.target.value = 'rally'; return; }
            losing.forEach((n) => { delete n.wp_type; }); // keep wp_radius (independent of type)
            delete rb.meta.profile;
        } else rb.meta.profile = 'rally';
        markDirty(); renderNotes(); if (editorOpen && rb.notes[sel]) renderEditor();
    };
    // Roadbook-wide default detection radius (metres): what a note with no wp_radius of its own
    // validates at. A note that HAS one keeps it — so changing the default alone would leave those
    // notes where they were, silently. Hence the offer: apply the new value to every note, or to
    // none. Nothing in between, and nothing without asking — rewriting the radius of notes the
    // author tuned by hand is a data change, so it takes a Yes (#532).
    $('cfgWpRadius').placeholder = RB.CONST.REACH_DEFAULT_M; // left empty, a waypoint of no type validates at the system default
    $('cfgWpRadius').onchange = async (e) => {
        if (!rb) return;
        const v = parseInt(e.target.value, 10);
        if (!(isFinite(v) && v > 0)) { // cleared: the notes fall back to their type's default
            delete rb.meta.default_wp_radius;
            markDirty(); renderNotes(); if (editorOpen && rb.notes[sel]) renderEditor();
            return;
        }
        rb.meta.default_wp_radius = v;
        markDirty(); renderNotes(); if (editorOpen && rb.notes[sel]) renderEditor();
        // asked only when some note would actually change (#701)
        const differing = rb.notes.filter((n) => n.wp_radius != null && n.wp_radius !== v).length;
        if (differing && await RBConfirm(t('Set every note’s radius to {v} m? {n} notes have their own.').replace('{v}', v).replace('{n}', differing))) {
            rb.notes.forEach((n) => { n.wp_radius = v; });
            markDirty(); renderNotes(); if (editorOpen && rb.notes[sel]) renderEditor();
            toast('Every note now validates at this radius.');
        }
    };
    window.addEventListener('beforeunload', (e) => { if (rb && dirty && !exported) { saveDraft(); e.preventDefault(); e.returnValue = ''; } });

    /* ---------- record / adjust route (live GPS) ---------- */
    let recTrack = [], recWpts = [], recPhotos = [], recWatch = null, recLast = null, recHere = null, recWake = null, recPaused = false;
    let lastFixT = 0, mediaSeq = 0;
    let draftId = 0, adjP1 = -1, adjP2 = -1; // adjust: entry/exit index on the base track
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
    // Recording a NEW route lives in the dedicated Recorder tool; this recording bar serves
    // only "Adjust on the trail" (live re-record of a segment of the loaded roadbook).
    $('recPause').onclick = () => {
        recPaused = !recPaused;
        $('recPause').innerHTML = recPaused ? `<i class="fa-solid fa-play"></i> ${esc(t('Resume'))}` : `<i class="fa-solid fa-pause"></i> ${esc(t('Pause'))}`;
        recLast = recPaused ? recLast : null; // restart the distance gate cleanly on resume
        updateRecStats();
    };
    document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'hidden') { if (rb && dirty && !exported) saveDraft(); return; } // flush the draft before a possible OS kill
        if (recWatch != null && 'wakeLock' in navigator && (!recWake || recWake.released)) {
            try { recWake = await navigator.wakeLock.request('screen'); } catch (e) {}
        }
    });
    async function startRecording() {
        if (!navigator.geolocation) return toast('No geolocation on this device.');
        recTrack = []; recWpts = []; recPhotos = []; recLast = null; recHere = null; recPaused = false;
        adjP1 = -1; adjP2 = -1;
        $('recPause').innerHTML = `<i class="fa-solid fa-pause"></i> ${esc(t('Pause'))}`;
        showEditing(); $('rbPanel').hidden = true; $('recBar').hidden = false;
        showView('map'); if (map) { refreshMap(false); map.setOverlay([]); }
        draftId = currentRbId; $('recPhoto').hidden = !draftId; // photos attach to the roadbook being adjusted (saved ones only)
        toast('Walk onto the trail (≤10 m) to start adjusting.');
        updateRecStats();
        try { if ('wakeLock' in navigator) recWake = await navigator.wakeLock.request('screen'); } catch (e) {}
        recWatch = navigator.geolocation.watchPosition(onRecFix, () => toast('GPS unavailable — check the location permission.'), { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
    }
    // nearest track vertex + its distance (RB.nearestIdx does the search; one extra haversine for the gate)
    function nearestTrackIdx(p) {
        const idx = RB.nearestIdx(rb.track, p);
        return { idx, dist: idx >= 0 ? RB.geo.haversineM(p, rb.track[idx]) : Infinity };
    }
    function onRecFix(pos) {
        const c = pos.coords, here = { lat: c.latitude, lon: c.longitude, ele: (c.altitude != null && isFinite(c.altitude)) ? c.altitude : null };
        if (map) map.setPosition(here.lat, here.lon, true);
        if (RB.recJunkFix(c.accuracy)) { updateRecStats(c.accuracy); return; }
        recHere = here;
        lastFixT = pos.timestamp || Date.now();
        if (recPaused) { updateRecStats(c.accuracy); return; }
        const step = RB.recStepM(c.accuracy); // accuracy-scaled sampling (shared with the Recorder)
        const n = nearestTrackIdx(here);
        if (adjP1 < 0) { if (n.dist <= 10) { adjP1 = n.idx; toast('On the trail — recording your variant.'); } updateRecStats(c.accuracy); return; }
        if (!recLast || RB.geo.haversineM(recLast, here) >= step) { recTrack.push(here); recLast = here; if (map) map.setOverlay(recTrack); }
        if (recTrack.length > 3 && n.dist <= 10 && n.idx > adjP1 + 2) adjP2 = n.idx; // rejoin further along
        updateRecStats(c.accuracy);
    }
    function updateRecStats(acc) {
        const m = recTrack.length ? RB.cumulativeM(recTrack)[recTrack.length - 1] : 0;
        const head = recPaused ? t('Paused ·') : (adjP1 < 0 ? t('Adjust: get on the trail…') : (adjP2 >= 0 ? t('Adjust · will rejoin') : t('Adjust · recording')));
        $('recStats').textContent = `${head} ${recTrack.length} ${t('points')} · ${RBKm(m)} · ${recWpts.length} ${t('notes')} · ${recPhotos.length} ${t('photos')}${acc != null ? ' · ±' + Math.round(acc) + ' m' : ''}`;
    }
    // Drop a waypoint (the button, and every photo): instantly, with the success bell and check —
    // nothing to type on the trail, its words come later (#768, like the Recorder)
    function dropWaypoint(lat, lon) {
        recWpts.push({ lat, lon, name: 'wpt' + (recWpts.length + 1), num: recWpts.length + 1, text: '', t: lastFixT || null });
        updateRecStats();
        RBSuccess.flash();
    }
    $('recWaypoint').onclick = () => {
        if (!recHere) return toast('Waiting for a GPS fix…');
        dropWaypoint(recHere.lat, recHere.lon);
    };
    // photo: camera → upload, and the note is dropped with it — the same capture as the Recorder (#649)
    $('recPhoto').onclick = () => {
        if (!draftId) return toast('Save to your profile first.');
        $('recPhotoFile').click();
    };
    $('recPhotoFile').onchange = (e) => {
        const f = e.target.files[0]; e.target.value = ''; if (!f || !draftId) return;
        const lat = recHere ? recHere.lat : null, lon = recHere ? recHere.lon : null;
        const fields = { type: 'photo', roadbook: String(draftId) };
        if (lat != null) { fields.lat = lat; fields.lon = lon; }
        const token = 'p' + Date.now() + '_' + (++mediaSeq);
        const localUrl = URL.createObjectURL(f);
        recPhotos.push({ token, url: localUrl, lat, lon, local: true, pending: true }); if (map) map.setPhotos(recPhotos);
        updateRecStats();
        RBMediaQueue.add('photo', f, fields, 'photo.jpg', token).catch(() => { // the device refused to keep it (private mode, full storage)
            recPhotos = recPhotos.filter((p) => p.token !== token); if (map) map.setPhotos(recPhotos);
            updateRecStats(); toast('Could not save.');
        });
        if (lat != null) dropWaypoint(lat, lon);
    };
    $('recStop').onclick = async () => {
        if (!(await RBConfirm(t('Finish the recording?')))) return; // the same question as the Recorder (#655)
        if (recWatch != null) { navigator.geolocation.clearWatch(recWatch); recWatch = null; }
        if (recWake) { try { recWake.release(); } catch (e) {} recWake = null; }
        recPaused = false; $('recBar').hidden = true;
        if (map) map.setOverlay([]);
        finishAdjust();
    };
    async function finishAdjust() {
        $('rbPanel').hidden = false; showView('map');
        if (adjP1 < 0 || recTrack.length < 2) { if (map) refreshMap(false); return toast('Adjust cancelled — you never got on the trail.'); }
        const rejoin = adjP2 >= 0;
        const msg = (rejoin
            ? t('Replace the trail between points {a} and {b} with your {n}-point variant?').replace('{a}', adjP1).replace('{b}', adjP2)
            : t('Replace everything after point {a} with your new {n}-point ending?').replace('{a}', adjP1)
        ).replace('{n}', recTrack.length);
        const ok = await RBConfirm(msg);
        if (!ok) { if (map) refreshMap(false); return; }
        spliceByIndex(rb, smoothTrack(recTrack), adjP1, rejoin ? adjP2 : null);
        // merge any waypoints dropped during the adjust session (snap to the new track)
        recWpts.forEach((w) => {
            const idx = RB.nearestIdx(rb.track, w);
            if (!rb.notes.some((n) => n.idx === idx)) { const note = RB.bareNote(rb, idx, roadOutBefore(idx)); note.text = w.text || ''; rb.notes.push(note); }
        });
        RB.recomputeMetrics(rb); RB.recomputeCaps(rb);
        sel = 0; refreshMap(false); renderNotes(); renderEditor(); showOnCanvas(0); updatePhotos(); updateAudio(); markDirty();
        toast('Trail adjusted · metrics recomputed.');
    }
    // Replace the track after i1 (up to i2, or to the end) with `newTrk`; its points keep their
    // elevation and time, like every other join (#158).
    function spliceByIndex(r, newTrk, i1, i2) {
        const piece = newTrk.map((p) => {
            const q = { lat: RB.round6(p.lat), lon: RB.round6(p.lon) };
            if (p.ele != null && isFinite(p.ele)) q.ele = p.ele;
            if (p.t != null) q.t = p.t;
            return q;
        });
        const nt = r.track.slice(0, i1 + 1).concat(piece).concat(i2 != null ? r.track.slice(i2) : []);
        const last = r.notes[r.notes.length - 1];
        r.notes = r.notes.filter((n) => n.idx <= i1 || (i2 != null && n.idx >= i2));
        r.track = nt;
        // tail replace (no rejoin): keep an end note at the new finish
        if (i2 == null) r.notes.push(RB.bareNote(r, nt.length - 1, last ? last.road_type_out : 3));
        r.notes.forEach((n) => { n.idx = RB.nearestIdx(nt, { lat: n.lat, lon: n.lon }); });
        RB.recomputeMetrics(r); RB.recomputeCaps(r);
    }
    /* ---------- account: save to profile · draft/ready/public · load by ?rb ---------- */
    let meUser = null, currentRbId = 0, status = 'draft', reusable = false; // reusable (#106): server-side flag, may others copy this public roadbook
    let publicSlug = null; // the roadbook's /challenge/<slug>, once it has one — the PDF's header QR points there (#784)
    let vehicles = ['car']; // #713: which vehicles the route suits — server-side, set by the owner, never empty
    document.querySelector('#vehField .segmented').innerHTML = RBVehicleSegmentsHTML();
    function paintVehicles() {
        document.querySelectorAll('[data-vehicle]').forEach((b) => {
            const on = vehicles.includes(b.dataset.vehicle);
            b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
    }
    document.querySelectorAll('[data-vehicle]').forEach((b) => b.onclick = () => {
        const v = b.dataset.vehicle;
        if (vehicles.includes(v) && vehicles.length === 1) return toast('A roadbook suits at least one vehicle.');
        vehicles = vehicles.includes(v) ? vehicles.filter((x) => x !== v) : RB.VEHICLES.filter((x) => x === v || vehicles.includes(x)); // always in the catalog's order
        paintVehicles(); markDirty();
    });
    paintVehicles();
    let rbIsOwner = true, rbOwner = ''; // co-editing an event roadbook (#123): visibility + delete stay with the owner
    let notePhotos = []; // the saved roadbook's geotagged photos (for the per-note IMG pill)
    let noteAudio = []; // the saved roadbook's voice notes (shown on their nearest note row)
    let pendingMedia = []; // media bundled in an imported .rdbk v2, uploaded to the gallery on the first save (#162)
    $('visDraft').onclick = () => { setStatus('draft'); markDirty(); };
    $('visReady').onclick = () => { setStatus('ready'); markDirty(); };
    $('visPublic').onclick = () => { setStatus('public'); markDirty(); };
    // Reflect the chosen publication status on the three segments (draft → ready → public).
    function setStatus(s) {
        status = RB.roadbookStatus(s);
        [['visDraft', 'draft'], ['visReady', 'ready'], ['visPublic', 'public']].forEach(([id, v]) => {
            const on = status === v;
            $(id).classList.toggle('on', on);
            $(id).setAttribute('aria-pressed', String(on));
        });
    }
    /* ---------- soft edit lock (#154): one editor at a time on a co-edited roadbook ---------- */
    // The banner + disabled saves when someone else holds the lock; a heartbeat keeps ours
    // fresh while the page is open, and leaving releases it (stale ones expire server-side).
    function setLock(lock) {
        rbLock = lock && lock.mine === false ? lock : { mine: true };
        $('lockBanner').hidden = rbLock.mine;
        if (!rbLock.mine) $('lockBannerText').textContent = '@' + rbLock.by + ' ' + t('is editing this roadbook — read-only.');
        // read-only for real (#698): the edit surfaces go inert (CSS), the map drops to pan with no
        // modes, and the copy / settings / undo controls that would write are off. Export, Close
        // and Force unlock stay.
        document.body.classList.toggle('rb-readonly', readOnly());
        ['openConfig', 'toolAddGpx', 'toolSimplify', 'toolAdjust'].forEach((id) => { $(id).disabled = readOnly(); });
        document.querySelectorAll('#noteList textarea, #rbTitle').forEach((field) => { field.readOnly = readOnly(); });
        if (readOnly()) setMapTool('pan'); else paintModes();
        updateSaveBtn(); updateHistBtns();
    }
    $('lockForce').onclick = async () => {
        if (!(await RBConfirmDanger(t('Force unlock? The other editor may lose unsaved changes.')))) return;
        const x = await RBApi('rb_lock_force', { id: currentRbId });
        if (x.ok) location.reload(); // reload picks up their last saved state — and the lock is now ours
        else toast(x.error || 'Could not unlock.');
    };
    setInterval(() => { if (currentRbId > 0 && rbLock.mine && rb) RBApi('rb_lock_refresh', { id: currentRbId }); }, 240000);
    window.addEventListener('pagehide', () => {
        // through the shared API host + auth, so the app releases its lock too (#651)
        if (currentRbId > 0 && rbLock.mine) RBApiKeepalive('rb_lock_release', { id: currentRbId });
    });

    // The visibility segments and the delete section only exist for the OWNER: a co-editor's
    // save keeps the owner's publication status, so showing dead controls would lie.
    function setOwnership(isOwner, owner) {
        rbIsOwner = isOwner; rbOwner = owner || '';
        $('visField').hidden = !isOwner;
        $('vehField').hidden = !isOwner; // the vehicles are the owner's to set, like the visibility
        $('visCoedit').hidden = isOwner;
        if (!isOwner) $('visCoeditNote').textContent = '@' + rbOwner + ' — ' + t('Only the owner can change the visibility.');
        updateSaveBtn();
    }
    // fresh content (imported GPX / .rdbk) is a NEW roadbook, even mid-edit of a saved one
    function resetIdentity() { currentRbId = 0; publicSlug = null; setStatus('draft'); reusable = false; vehicles = ['car']; paintVehicles(); pendingMedia = []; setOwnership(true, ''); setLock({ mine: true }); try { history.replaceState(null, '', location.pathname); } catch (e) {} }
    // Media bundled in an imported .rdbk v2 (#162): once the roadbook has a server id, upload each
    // photo/audio into its gallery with the geotag from the bundle's manifest, then clear the queue.
    async function flushImportedMedia() {
        const items = pendingMedia; pendingMedia = [];
        for (const it of items) {
            const fields = { roadbook: String(currentRbId) };
            if (it.lat != null) fields.lat = it.lat;
            if (it.lon != null) fields.lon = it.lon;
            try {
                if (it.type === 'audio') await RBUploadAudio({ type: 'audio', ...fields }, it.blob, it.name);
                else await RBUpload({ type: 'photo', ...fields }, it.blob, it.name);
            } catch (e) { /* skip a media file that won't upload — never fail the save */ }
        }
    }
    async function doSave() {
        stampMeta(); RB.recomputeMetrics(rb); RB.recomputeCaps(rb); await embedUsed(rb);
        const r = await RBApi('rb_save', { id: currentRbId, status, reusable, vehicles, roadbook: RB.roadbookForExport(rb) });
        if (r.ok) {
            currentRbId = r.id; if (r.slug) publicSlug = r.slug; dirty = false; clearDraft();
            if (pendingMedia.length) await flushImportedMedia(); // upload media bundled in an imported .rdbk (#162)
            RBMediaQueue.flush(); // photos/voice notes queued by the Recorder now have a roadbook to join (#648)
            updatePhotos(); updateAudio(); updateSaveBtn();
            // pin the identity to the URL so a reload (or version auto-refresh) keeps editing the same roadbook
            try { history.replaceState(null, '', location.pathname + '?rb=' + currentRbId); } catch (e) {}
        }
        return r;
    }
    // Every gate a save passes: signed in, something to save, the route's open cuts acknowledged,
    // and the consistency findings seen (#339).
    async function readyToSave() {
        if (!meUser) { RBNeedAuth('Sign in to save this roadbook to your profile.'); return false; }
        if (!rb) { toast('Nothing to save.'); return false; }
        return (await confirmOpenCuts()) && (await confirmConsistency());
    }
    // `btn` is the Save that was pressed (there are two, and the settings view has its own): it
    // spins while the roadbook goes up and then turns green with a tick, so the answer to "did it
    // save?" is on the button, not only in a toast that has already faded (#459).
    async function saveRoadbook(btn) {
        if (!(await readyToSave())) return;
        const busy = RBBusy(btn, { onEnd: updateSaveBtn });
        const r = await doSave();
        if (r.ok) busy.ok(); else busy.reset();
        toast(r.ok ? (status === 'public' && r.slug ? t('Saved · public at') + ' /challenge/' + r.slug : 'Saved to your profile.') : (r.error || 'Could not save.'));
        if (r.ok && currentRbId > 0) updateCover(); // refresh the stored route-map cover (best-effort)
    }
    // Generate the roadbook's cover map (route over map tiles) and store it under its reserved
    // filename. Best-effort and non-blocking: a missing cover just falls back to the route shape.
    async function updateCover() {
        if (!window.RBCoverMap) return;
        try {
            const blob = await RBCoverMap.capture(rb.track);
            if (!blob) { // no track, or no map tile loaded (offline/CORS): keep the previous cover
                if (rb.track && rb.track.length >= 2) toast('Saved — the cover image could not be updated (map tiles unavailable).');
                return;
            }
            const up = await RBUpload({ type: 'cover', roadbook: String(currentRbId) }, new File([blob], 'cover.png', { type: 'image/png' }));
            if (!up || !up.ok) toast('Saved — the cover image could not be updated.');
        } catch (e) { /* a cover is non-essential — never let it break a save */ }
    }
    $('saveAccount').onclick = () => saveRoadbook('saveAccount');
    $('cfgSave').onclick = () => saveRoadbook('cfgSave'); // the same Save, available inside the settings view too —
    $('cfgSaveBottom').onclick = () => saveRoadbook('cfgSaveBottom'); // at its top and at its foot (#752)
    // Leave the editor: unsaved changes get a save prompt first, then return to the editor
    // landing (the roadbook list), not the home page.
    async function leaveEditor() {
        if (rb && dirty) {
            const choice = await new Promise((resolve) => {
                const d = RBModal(`<h3>${t('Unsaved changes')}</h3>
                    <p class="muted">“${esc(rb.meta.title || t('Roadbook'))}” — ${t('Save your changes before closing?')}</p>
                    <div class="btnrow center wrap">
                        <button class="btn btn-ghost" id="ccCancel">${t('Keep editing')}</button>
                        <button class="btn btn-danger" id="ccDiscard"><i class="fa-solid fa-trash-can"></i> ${t('Discard changes')}</button>
                        <button class="btn btn-primary" id="ccSave"><i class="fa-solid fa-floppy-disk"></i> ${t('Save & close')}</button>
                    </div>`, 'slim center', () => resolve('cancel'));
                d.q('#ccSave').onclick = () => { resolve('save'); d.close(); };
                d.q('#ccDiscard').onclick = () => { resolve('discard'); d.close(); };
                d.q('#ccCancel').onclick = () => { resolve('cancel'); d.close(); };
            });
            if (choice === 'cancel') return;
            if (choice === 'save') { await saveRoadbook(); if (dirty) return; } // save needs sign-in / could fail → stay open
        }
        // Read-only under someone else's lock nothing here wrote the checkpoint — it may be a
        // recovered draft waiting for the lock, so it stays on this device. What was discarded is no
        // longer unsaved work: `dirty` goes first, or leaving the page (beforeunload, the page going
        // hidden) would write the discarded edits straight back as a draft (#943).
        dirty = false;
        if (!readOnly()) clearDraft();
        location.href = location.pathname.replace(/[^/]*$/, ''); // close → the editor landing (roadbook list), stripping any ?rb / /<slug>
    }
    $('closeEditor').onclick = leaveEditor;
    // Delete the saved roadbook (the button only shows once it exists on the server). Names it
    // in the confirm, then sends the user back to their list — the editor content is gone.
    $('deleteRb').onclick = async () => {
        if (!(currentRbId > 0)) return;
        const title = (rb && rb.meta && rb.meta.title) || 'Untitled';
        if (!(await RBConfirmTrash(title))) return;
        const r = await RBApi('rb_delete', { id: currentRbId });
        if (r.ok) { clearDraft(); location.href = '../myroadbooks/'; }
        else toast(r.error || 'Could not delete.');
    };

    /* ---------- photo gallery (saved roadbook) ---------- */
    function updatePhotos() {
        if (currentRbId > 0) { $('photosSection').hidden = false; loadPhotos(); }
        else { $('photosSection').hidden = true; $('photoGrid').innerHTML = ''; }
    }
    let photosSeq = 0; // unsequenced reloads (paste/upload/delete/style-toggle) must never repaint with stale data (#220)
    async function loadPhotos() {
        const seq = ++photosSeq;
        const r = await RBApi('ph_list', { roadbook: currentRbId });
        if (seq !== photosSeq) return; // a newer load is already in flight
        const g = $('photoGrid');
        if (!r.ok || !r.photos.length) { notePhotos = []; g.innerHTML = `<p class="photo-empty">${esc(t('No photos yet.'))}</p>`; if (map) map.setPhotos([]); if (rb) renderNotes(); return; }
        notePhotos = r.photos.map((p) => ({ ...p, url: RBMediaSrc(p.url) })); // absolute in the app (#232)
        g.innerHTML = notePhotos.map((p) => `<div class="photo-thumb"><img src="${esc(p.url)}" alt="" data-lb="${p.id}" loading="lazy"><button type="button" data-delp="${p.id}" class="del-badge" aria-label="${esc(t('Remove'))}">×</button></div>`).join('');
        g.querySelectorAll('[data-delp]').forEach((s) => s.onclick = async (e) => {
            e.stopPropagation();
            const ph = notePhotos.find((p) => p.id === +s.dataset.delp);
            // never delete a stored photo silently (#209), and show which one (#652)
            if (!(await RBConfirmDanger(t('Delete this photo?') + (ph ? `<br><img class="confirm-thumb" src="${esc(ph.url)}" alt="">` : '')))) return;
            const busy = RBBusy(s);
            const r = await RBApi('ph_delete', { id: +s.dataset.delp });
            if (!r.ok) { busy.reset(); return toast(r.error || 'Could not delete the photo.'); } // say why: silence left the photo on screen with no explanation (#525)
            busy.ok();
            loadPhotos();
        });
        g.querySelectorAll('[data-lb]').forEach((im) => im.onclick = () => openLightbox(+im.dataset.lb));
        // every photo is a pin on the map; tapping a pin (or a thumbnail) opens the lightbox
        if (map) map.setPhotos(notePhotos, (ph) => { if (!photoPlacing && ph && ph.id != null) openLightbox(+ph.id); });
        if (rb) renderNotes(); // refresh the per-note IMG pills
    }
    /* ---------- voice notes (recorded audio) — shown on their nearest note's row ---------- */
    function updateAudio() {
        if (currentRbId > 0) loadAudio();
        else { noteAudio = []; if (rb) renderNotes(); }
    }
    async function loadAudio() {
        const r = await RBApi('audio_list', { roadbook: currentRbId });
        noteAudio = ((r.ok && r.audio) || []).map((a) => ({ ...a, url: RBMediaSrc(a.url) })); // absolute in the app (#232)
        if (rb) renderNotes(); // each clip surfaces on its nearest note row
    }
    /* ---------- photo upload: every photo needs coordinates ---------- */
    // Read GPS from the JPEG's EXIF; if absent, queue the file and let the user tap the
    // map to set its position (one tap per queued photo). No photo is stored without coords.
    let photoPlacing = false, photoQueue = [], photoMoveMarker = null;
    $('addPhotoBtn').onclick = () => { if (!(currentRbId > 0)) return toast('Save to your profile first.'); $('photoFile').click(); };
    $('photoFile').onchange = async (e) => { const files = [...e.target.files]; e.target.value = ''; addPhotos(files); };
    // paste an image from the clipboard (Ctrl/Cmd+V) → upload it like any photo (EXIF or place on map)
    document.addEventListener('paste', async (e) => {
        if (!rb || readOnly()) return;
        const files = [...(e.clipboardData?.items || [])].filter((it) => /^image\//.test(it.type)).map((it) => it.getAsFile()).filter(Boolean);
        if (!files.length) return; // plain text/other paste → leave it to the browser
        e.preventDefault();
        // An armed icon paste wins, and needs no saved roadbook: an icon is embedded in the file (#455)
        if (pasteIconArmed) { pasteIconArmed = false; await addIconFiles(files, true); return; }
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
        if (readOnly()) return toast('Read-only while someone else is editing.');
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

    /* ---------- a gallery photo as a note's Photo extra (#792) ---------- */
    // The note opens on its Photo tab: the photo is already there if the note has one, and a gallery
    // photo taken beside it becomes that extra otherwise (after the note, embedded like any extra —
    // the gallery keeps the original). Caption, side and removal are the extras' own controls.
    const PHOTO_BLOCK = RB.blockType({ type: 'photo' });
    async function photoToExtra(i, photo) {
        const n = rb && rb.notes[i];
        if (!n) return;
        if (photo && !blockOf(n, 'photo') && !readOnly()) { // read-only: the note just opens on its Photo tab
            try {
                const image = await RBImg.toDataURL(await (await fetch(photo.url)).blob(), PHOTO_BLOCK.imageMax);
                (n.blocks = n.blocks || []).push({ type: 'photo', at: 'after', image });
                markDirty(); renderNotes();
            } catch (e) { toast('Could not read the image.'); }
        }
        select(i, 'photo');
    }

    /* ---------- lightbox: browse all the roadbook's photos ---------- */
    let lbList = [], lbIdx = -1;
    // Open the viewer. `list` scopes which photos to browse (e.g. a note's nearby ones);
    // omit it to browse all the roadbook's photos.
    function openLightbox(id, list) {
        lbList = (list && list.length ? list : notePhotos).slice();
        if (!lbList.length) return;
        lbIdx = lbList.findIndex((p) => +p.id === +id); if (lbIdx < 0) lbIdx = 0;
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
        if (!(await RBConfirmDanger(t('Delete this photo?') + `<br><img class="confirm-thumb" src="${esc(p.url)}" alt="">`))) return; // show which one (#652)
        const keep = new Set(lbList.map((x) => +x.id)); keep.delete(+p.id); // stay within the current set (all, or a note's group)
        const busy = RBBusy('lbDelete');
        const r = await RBApi('ph_delete', { id: +p.id });
        if (!r.ok) { busy.reset(); return toast(r.error || 'Could not delete the photo.'); } // a refused delete says why (#525)
        busy.ok();
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
        // preserve text-editing focus + caret + scroll across the full list rebuild below, so adding
        // a point/line (or any structural change) doesn't yank you out of the note you're editing.
        const ae = document.activeElement;
        const keepFocusI = ae && ae.classList && ae.classList.contains('note-title') ? ae.dataset.i : null;
        const keepCaret = keepFocusI != null && ae.selectionStart != null ? ae.selectionStart : null;
        const keepListScroll = $('noteList') ? $('noteList').scrollTop : 0;
        const keepWinScroll = window.scrollY;
        parkEditor(); // park the editor + tulip before wiping the list (innerHTML would destroy moved elements)
        // geotagged media belongs to its nearest note (within 80 m): photos → an IMG pill under the
        // km, voice notes → an inline player on that row
        const byNearestNote = (items) => {
            const buckets = {};
            if (!rb.notes.length) return buckets;
            items.forEach((it) => {
                if (it.lat == null) return;
                const pt = { lat: +it.lat, lon: +it.lon };
                const best = RB.nearestIdx(rb.notes, pt);
                if (RB.geo.haversineM(rb.notes[best], pt) <= 80) (buckets[best] = buckets[best] || []).push(it);
            });
            return buckets;
        };
        const photosByNote = byNearestNote(notePhotos);
        const audioByNote = byNearestNote(noteAudio);
        // The material a note carries, drawn on the side it sits on, so the author reads the
        // roadbook the way it will be read. A tap opens that note's editor, where it is edited.
        const blockRowsHTML = (n, at, i) => RB.noteBlocks(n, at).filter((b) => b.image || b.text).map((b) => {
            const kind = RB.blockType(b);
            return `<div class="note-block block-${kind.id}" data-block="${i}" data-b="${n.blocks.indexOf(b)}" data-tab="${kind.id}">
                ${b.image ? `<img src="${esc(b.image)}" alt="">` : ''}
                <div class="block-text">${esc(b.text || '')}</div>
            </div>`;
        }).join('');
        // A note's row, with the material it carries drawn on the side it sits on (#542): the
        // author reads the roadbook the way it will be read. The left cell holds the number and
        // Delete; then the distances, the tulip and the text.
        $('noteList').style.setProperty('--dist-ch', RB.distanceChars(rb.notes)); // the distance column fits the longest (#730)
        $('noteList').innerHTML = rb.notes.map((n, i) => `${blockRowsHTML(n, 'before', i)}<div class="note-mini${editorOpen && i === sel ? ' sel' : ''}" data-i="${i}">
                <span class="note-number">${n.num}${RB.wpBadgeSVG(n.wp_type, 22)}<button type="button" class="note-del icon-danger" data-del="${i}" aria-label="${esc(t('Delete'))}" title="${esc(t('Delete'))}"><i class="fa-solid fa-trash-can"></i></button></span>
                <span class="note-km"><b>${((n.distance ?? 0) / 1000).toFixed(2)}</b> +${((n.partial_distance ?? 0) / 1000).toFixed(2)}${photosByNote[i] ? `<button type="button" class="note-photo" data-photo="${i}" aria-label="${esc(t('Photo'))}" title="${esc(t('Photo'))}"><i class="fa-solid fa-camera"></i></button>` : ''}</span>
                <span class="note-tulip" id="tulipSlot${i}"></span>
                <div class="note-textcell">
                    <textarea class="note-title field" data-i="${i}" placeholder="${esc(t('Add note text…'))}" autocomplete="off"${readOnly() ? ' readonly' : ''}>${esc(n.text || '')}</textarea>
                    <div class="note-meta">${noteMetaHTML(n)}</div>
                    ${audioByNote[i] ? `<div class="note-audio">${audioByNote[i].map((a) => `<span class="audio-item"><audio controls preload="none" src="${esc(a.url)}"></audio><button type="button" class="del-badge" data-dela="${a.id}" data-note="${esc(n.num)}" aria-label="${esc(t('Remove'))}">×</button></span>`).join('')}</div>` : ''}
                </div>
            </div>${blockRowsHTML(n, 'after', i)}<div class="note-edit-slot" id="editSlot${i}"></div>`).join('');
        // road-type accent colour is data-driven → set the CSS variable per row (material blocks skip it)
        const rows = $('noteList').querySelectorAll('.note-mini');
        rows.forEach((el, i) => el.style.setProperty('--rt', (RB.ROAD_TYPES[rb.notes[i].road_type_out] || RB.ROAD_TYPES[3]).color));
        rows.forEach((el) => el.onclick = (e) => {
            // A click inside the live tulip canvas (icon select/drag, junction, its toolbar) must NOT
            // toggle the row shut — the canvas is hosted inside the open row, so its clicks bubble here.
            if (e.target.closest('#canvasWrap')) return;
            if (!e.target.closest('.note-title') && !e.target.closest('.note-del') && !e.target.closest('.note-audio')) toggleNote(+el.dataset.i);
        });
        $('noteList').querySelectorAll('.note-del').forEach((b) => b.onclick = (e) => { e.stopPropagation(); deleteNoteConfirm(+b.dataset.del); });
        $('noteList').querySelectorAll('.note-block').forEach((el) => el.onclick = (e) => {
            e.stopPropagation(); select(+el.dataset.block, el.dataset.tab);
        });
        // the camera pill: the note's nearby gallery photo becomes its Photo extra (#792)
        $('noteList').querySelectorAll('.note-photo').forEach((b) => b.onclick = (e) => {
            e.stopPropagation();
            photoToExtra(+b.dataset.photo, (photosByNote[+b.dataset.photo] || [])[0]);
        });
        // delete a voice note straight from its note row
        $('noteList').querySelectorAll('[data-dela]').forEach((b) => b.onclick = async (e) => {
            e.stopPropagation();
            if (!(await RBConfirmDanger(t('Delete this voice note?') + '<br><b>' + esc(t('Note')) + ' ' + esc(b.dataset.note) + '</b>'))) return; // name it (#652)
            const busy = RBBusy(b);
            const r = await RBApi('audio_delete', { id: +b.dataset.dela });
            if (!r.ok) { busy.reset(); return toast(r.error || 'Could not delete the voice note.'); } // same rule as the photos (#525)
            busy.ok(); loadAudio();
        });
        // the title is edited in place — update the model only (no rebuild, so focus is kept)
        $('noteList').querySelectorAll('.note-title').forEach((inp) => {
            inp.onfocus = () => { if (!(editorOpen && sel === +inp.dataset.i)) select(+inp.dataset.i); };
            inp.oninput = () => { rb.notes[+inp.dataset.i].text = inp.value; markDirty(); };
        });
        const nc = $('noteCount');
        if (nc) {
            const totalM = (rb.meta && rb.meta.total_distance) || (rb.notes.length ? rb.notes[rb.notes.length - 1].distance : 0) || 0;
            const navCount = rb.notes.length;
            nc.textContent = navCount ? `· ${navCount} · ${RBKm(totalM, 1)}` : '';
        }
        if (editorOpen && sel >= 0 && sel < rb.notes.length) openEditZoneAt(sel); // re-attach inline after a rebuild
        placeTulips();
        // restore focus/caret/scroll captured above so the rebuild isn't disruptive
        if (keepFocusI != null) { const ta = $('noteList').querySelector('.note-title[data-i="' + keepFocusI + '"]'); if (ta) { ta.focus({ preventScroll: true }); if (keepCaret != null) { try { ta.setSelectionRange(keepCaret, keepCaret); } catch (e) {} } } }
        if ($('noteList')) $('noteList').scrollTop = keepListScroll;
        window.scrollTo({ top: keepWinScroll });
    }
    // Below each note's text: the Red CAP on/off toggle on the left, coordinates on the right.
    // The row shows where the note IS. Whether it carries a CAP is a setting, and it lives with
    // the other settings in the Note tab (#560) — a chip saying "CAP disabled" on every row was
    // reading matter in the one place meant for the note's own words.
    const noteMetaHTML = (n) => `<span class="note-coords">${(+n.lat).toFixed(5)}, ${(+n.lon).toFixed(5)}</span>`;
    // Every row shows its vignette (static SVG); the open row instead holds the live canvas.
    const tulipSVG = (n, i) => NoteCanvas.toSVG(n, (ic) => RB.iconSrc(ic, rb, '../assets/icons/'), RB.tulipContext(rb, i));
    function placeTulips() {
        $('noteList').querySelectorAll('.note-tulip[id^="tulipSlot"]').forEach((slot) => {
            const i = +slot.id.slice(9); // 'tulipSlot'.length
            if (!Number.isInteger(i) || !rb.notes[i]) return;
            if (editorOpen && i === sel) return; // the open row keeps the interactive canvas
            slot.innerHTML = tulipSVG(rb.notes[i], i);
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
    // The selected note on the map: highlighted, with its detection radius and — dashed — the radius
    // whose track points shape its tulip (#945), so what the Reader validates and what the tulip draws
    // are both in sight
    function markOnMap(n) { map.select(n, true); paintRings(n); }
    const NOTE_ZOOM_RADIUS_M = 50; // what a selected note shows around it: its 30 m rings and a little road beyond
    function paintRings(n) {
        const i = n ? rb.notes.indexOf(n) : -1;
        map.setNoteRings(i >= 0 ? n : null, i >= 0 ? RB.reachRadius(n, rb.notes[i + 1], rb.meta) : 0, RB.TULIP_SHAPE_M);
    }
    /* A tap inside the open note's rings says what the ring is, and edits it on the spot: the
       detection radius (the yellow disc) and the stretch of track that shapes the tulip (the dashed
       circle). Concentric, the smaller one owns its inside and the larger one the band around it;
       when they coincide, one dialog carries both. */
    function ringInfo(here) {
        const n = editorOpen ? rb.notes[sel] : null;
        if (!n) return;
        const reach = RB.reachRadius(n, rb.notes[sel + 1], rb.meta), shape = RB.TULIP_SHAPE_M, d = RB.geo.haversineM(n, here);
        if (d > Math.max(reach, shape)) return;
        const same = Math.abs(reach - shape) < 1, inner = reach < shape ? 'reach' : 'shape';
        const which = same ? ['reach', 'shape'] : [d <= Math.min(reach, shape) ? inner : (inner === 'reach' ? 'shape' : 'reach')];
        const inherited = RB.detectionRadius({ wp_type: n.wp_type }, rb.meta), pts = RB.tulipPoints(rb, sel);
        const side = (label, count) => count == null ? '' : `<li><i class="fa-solid ${count >= pts.need ? 'fa-circle-check icon-ok' : 'fa-circle-exclamation icon-accent'}"></i> ${esc(t(label))}: <b>${count}</b> / ${pts.need}</li>`;
        const short = pts && [pts.before, pts.after].some((c) => c != null && c < pts.need);
        const sections = {
            reach: `<h3><i class="fa-solid fa-bullseye icon-accent"></i> ${esc(t('Detection radius'))}</h3>
                <p class="muted small">${esc(t('The note’s detection radius: the Reader validates the note the moment the route driven enters this circle.'))}</p>
                <label class="muted small" for="ringRadius">${esc(t('Metres'))}</label>
                <input id="ringRadius" class="modal-in" type="number" min="1" step="1" inputmode="numeric" value="${n.wp_radius != null ? n.wp_radius : ''}" placeholder="${inherited}">
                ${reach < RB.detectionRadius(n, rb.meta) ? `<p class="muted small">${esc(t('Drawn smaller: the circle never reaches past halfway to the next note.'))}</p>` : ''}`,
            shape: `<h3><i class="fa-solid fa-bezier-curve icon-accent"></i> ${esc(t('Tulip shape'))}</h3>
                <p class="muted small">${esc(t('Every track point inside this circle shapes the tulip’s arrow. Draw at least 4 on a side and that road curves the way you drew it; fewer, and it stays straight.'))}</p>
                <ul class="status-list">${pts ? side('Before the note', pts.before) + side('After the note', pts.after) : ''}</ul>
                ${short ? `<div class="btnrow"><button class="btn btn-ghost" type="button" id="ringAddPoints"><i class="fa-solid fa-circle-plus"></i> ${esc(t('Add points'))}</button></div>` : ''}`,
        };
        const hasRadius = which.includes('reach');
        const dlg = RBModal(which.map((k) => sections[k]).join('')
            + `<div class="btnrow end spaced">${hasRadius ? `<button class="btn btn-ghost" type="button" id="ringX">${esc(t('Cancel'))}</button><button class="btn btn-primary" type="button" id="ringGo">${esc(t('Apply'))}</button>`
                : `<button class="btn btn-primary" type="button" id="ringX">${esc(t('Close'))}</button>`}</div>`, 'narrow');
        dlg.q('#ringX').onclick = dlg.close;
        if (hasRadius) {
            dlg.q('#ringGo').onclick = () => {
                const v = parseInt(dlg.q('#ringRadius').value, 10);
                if (isFinite(v) && v > 0) n.wp_radius = v; else delete n.wp_radius;
                dlg.close(); markDirty(); renderEditor();
            };
            dlg.q('#ringRadius').onkeydown = (e) => { if (e.key === 'Enter') dlg.q('#ringGo').click(); };
        }
        // the points go ON the track, so the route stays as it is; Move is armed to bend it
        const add = dlg.q('#ringAddPoints');
        if (add) add.onclick = () => {
            const added = RB.tulipAddPoints(rb, sel, (a, b) => gaps.some((g) => samePoint(g.a, a) && samePoint(g.b, b)));
            dlg.close();
            if (!added) return toast('No room for more points here.');
            RB.recomputeMetrics(rb); RB.recomputeCaps(rb);
            routeChanged(); setMapTool('points');
            toast('Points added — drag them to shape the curve.');
        };
    }
    function toggleNote(i) { if (editorOpen && sel === i) closeEditor(); else select(i); }
    function closeEditor() {
        editorOpen = false; $('noteEditZone').hidden = true; map.setNoteRings(null);
        if (map.map && map.ready && map.map.getBearing()) map.map.easeTo({ bearing: 0, duration: 300 }); // back to north-up
        parkEditor(); // park both pieces back so a list rebuild can't destroy them
        placeTulips(); // restore the static vignette in the row the canvas just left
        markSelectedRow();
    }
    // `tab` opens the editor straight on one material's panel (tapping a photo/advert/text row);
    // selecting a note any other way starts on the note itself.
    function select(i, tab) {
        if (!rb || i < 0 || i >= rb.notes.length) return;
        sel = i; editorOpen = true; selVertex = -1; blockTab = tab || ''; // a note is now the active selection
        openEditZoneAt(i); renderEditor();
        showOnCanvas(i);
        markSelectedRow(); placeTulips(); // refill the static vignette in the row the canvas left
        markOnMap(rb.notes[i]); // highlight
        // recentre + rotate the map to the note's arrival heading. Only a deliberate selection
        // reorients — edits/deletes refresh through renderNotes (not select), so they never move
        // the map and you don't lose your place (the concern behind #65).
        const n = rb.notes[i];
        // a close-up of NOTE_ZOOM_RADIUS_M around it — its rings fill the view — centred on it and
        // turned so the road you arrive on points up: read like the tulip
        if (map.map && map.ready) map.map.easeTo({ center: [n.lon, n.lat], zoom: map.zoomForRadius(NOTE_ZOOM_RADIUS_M), bearing: n.bearing_in || 0, duration: 450 });
        // bring the selection into view: the list row on desktop (side column), the just-opened
        // editor on the stacked mobile/tablet layout — so clicking a note on the map jumps the list
        // to its line.
        if (window.matchMedia('(min-width: 769px)').matches) {
            const row = $('noteList').querySelector('.note-mini[data-i="' + i + '"]');
            if (row) row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else $('noteEditZone').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    /* ---------- a note and the material around it (#542) ----------
       Every row is a NOTE. A note can also carry material — a photo, an advert, a block of text —
       placed BEFORE or AFTER it, none, one or several of each. The tab bar picks what you are
       editing: the note itself, or one type of material; the tabs, the cards and the row preview
       are all built from RB.NOTE_BLOCKS, so a fourth type is one entry in that catalog. */
    // The tabs, in the order the work happens: what the note IS (its parameters), the icons on
    // its tulip, then the material around it. The first two are panes of the editor; the rest come
    // from RB.NOTE_BLOCKS, each showing how many it already holds.
    let blockTab = '';  // '' = the parameters · 'icon' = the palette · otherwise a RB.NOTE_BLOCKS id
    function renderBlockTabs(n) {
        const used = (id) => RB.noteBlocks(n).some((b) => RB.blockType(b).id === id);
        // a piece of material the note already carries is lit in sand (.has) — no counter
        const tab = (id, icon, label, has) =>
            `<button type="button" class="kind-tab${blockTab === id ? ' on' : ''}${has ? ' has' : ''}" role="tab" aria-selected="${blockTab === id}" data-tab="${id}"><i class="fa-solid ${icon}"></i> ${esc(label)}</button>`;
        // two groups on one row (#747): the note itself left, the material around it right
        $('kindTabs').innerHTML = `<div class="kind-group">${tab('', 'fa-location-dot', t('Note'), false) + tab('icon', 'fa-icons', t('Icon'), false)}</div>`
            + `<div class="kind-group">${RB.NOTE_BLOCKS.map((k) => tab(k.id, k.icon, t(k.name), used(k.id))).join('')}</div>`;
        $('kindTabs').querySelectorAll('[data-tab]').forEach((b) => b.onclick = (e) => {
            e.stopPropagation(); blockTab = b.dataset.tab; renderEditor();
        });
    }
    // The open tab IS the control: the note's one photo, one advert or one text, with the side
    // it sits on. There is nothing to "add" first — you pick an image or you type. A slot holds
    // a block only while it holds something, so an empty one is never kept, saved or drawn.
    const blockOf = (n, id) => RB.noteBlocks(n).find((b) => RB.blockType(b).id === id) || null;
    function renderBlockPanel(n) {
        const kind = RB.NOTE_BLOCKS.find((k) => k.id === blockTab);
        const b = blockOf(n, kind.id);
        const at = b ? (b.at === 'before' ? 'before' : 'after') : 'after';
        const side = ['before', 'after'].map((v) =>
            `<label><input type="radio" name="blockAt" value="${v}"${v === at ? ' checked' : ''}> ${esc(t(v === 'before' ? 'Before the note' : 'After the note'))}</label>`).join('');
        $('blockPanel').innerHTML = `<div class="block-card">
            <div class="block-head">
                <span class="block-side">${side}</span>
                ${b ? `<button type="button" class="btn btn-ghost block-del" id="blockDel"><i class="fa-solid fa-trash-can icon-danger"></i> <span>${esc(t('Delete'))}</span></button>` : ''}
            </div>
            ${kind.image ? `<div class="block-img-row">
                ${b && b.image ? `<img class="block-prev" id="blockPick" src="${esc(b.image)}" alt="" title="${esc(t('Change image'))}">` : ''}
                <button type="button" class="btn btn-ghost" id="blockPickBtn"><i class="fa-solid fa-image"></i> <span>${esc(t(b && b.image ? 'Change image' : 'Add image'))}</span></button>
            </div>
            <input class="field" id="blockCaption" value="${esc((b && b.text) || '')}" placeholder="${esc(t('(caption)'))}">`
            : `<textarea class="field" id="blockText" placeholder="${esc(t('(text)'))}">${esc((b && b.text) || '')}</textarea>`}
        </div>`;

        const panel = $('blockPanel');
        panel.querySelectorAll('[name="blockAt"]').forEach((r) => r.onchange = () => {
            const cur = blockOf(n, kind.id);
            if (cur) { cur.at = r.value; markDirty(); renderNotes(); } // with nothing in the slot there is nothing to place yet
        });
        const words = $('blockCaption') || $('blockText');
        if (words) words.oninput = () => setBlockText(n, kind, words.value);
        [$('blockPick'), $('blockPickBtn')].forEach((el) => { if (el) el.onclick = () => pickBlockImage(n, kind); });
        if ($('blockDel')) $('blockDel').onclick = () => deleteBlock(n, b, kind);
    }
    // The slot's block, created the moment there is something to put in it. `at` comes from the
    // radios, which are answered before anything exists.
    function slotBlock(n, kind) {
        let b = blockOf(n, kind.id);
        if (!b) {
            const picked = $('blockPanel').querySelector('[name="blockAt"]:checked');
            b = { type: kind.id, at: picked ? picked.value : 'after' };
            (n.blocks = n.blocks || []).push(b);
        }
        return b;
    }
    // A slot with neither picture nor words is not material — drop it, so nothing empty is saved.
    function pruneBlocks(n) {
        if (!n.blocks) return;
        n.blocks = n.blocks.filter((b) => b.image || b.text);
        if (!n.blocks.length) delete n.blocks;
    }
    // Words update the model and patch the row in place. Rebuilding the list would move the
    // editor — which lives inside it — and moving a focused field drops the caret, so the author
    // would type one character per keystroke into nothing.
    function setBlockText(n, kind, value) {
        const had = !!blockOf(n, kind.id);
        const b = slotBlock(n, kind);
        if (value) b.text = value; else delete b.text;
        markDirty();
        pruneBlocks(n);
        const still = !!blockOf(n, kind.id);
        // the row appears with the first character and goes with the last one; in between it is
        // patched in place so the caret stays where the author left it
        if (had !== still || (still && !b.image && !had)) { renderNotes(); renderEditor(); return; }
        const row = $('noteList').querySelector(`.note-block[data-block="${sel}"][data-b="${(n.blocks || []).indexOf(b)}"] .block-text`);
        if (row) row.textContent = value;
        else renderNotes();
    }
    function pickBlockImage(n, kind) {
        const input = $('edBlockImg');
        input.value = '';
        input.onchange = async (e) => {
            const f = e.target.files[0];
            if (!f) return;
            let data;
            try { data = await RBImg.toDataURL(f, kind.imageMax); } // a photo keeps its detail, a logo stays small
            catch (err) { return toast('Could not read the image.'); } // a file the browser cannot decode says so
            const b = slotBlock(n, kind);
            b.image = data;
            markDirty(); renderEditor(); renderNotes();
        };
        input.click();
    }
    async function deleteBlock(n, b, kind) {
        if (!b) return;
        const what = t(kind.name) + (b.text ? ' — ' + b.text : '');
        if (!(await RBConfirm(t('Delete this from note {n}?').replace('{n}', n.num) + '<br><b>' + esc(what) + '</b>', true))) return;
        n.blocks = (n.blocks || []).filter((x) => x !== b);
        pruneBlocks(n);
        markDirty(); renderEditor(); renderNotes();
    }

    function renderEditor() {
        if (editorOpen && rb && rb.notes[sel]) paintRings(rb.notes[sel]); // the rings follow the note's radius and position
        const n = rb.notes[sel];
        renderBlockTabs(n);
        // One pane at a time, so each tab shows its own job and nothing else. The tulip canvas is
        // not in here: it lives in the note's row, in sight whichever tab is open.
        const material = blockTab && blockTab !== 'icon';
        $('notePane').hidden = !!blockTab;
        $('iconPane').hidden = blockTab !== 'icon';
        $('blockPanel').hidden = !material;
        if (material) { renderBlockPanel(n); return; }
        if (blockTab === 'icon') { renderIcons(); return; } // the palette lists this note's own icons too

        const opts = (cur) => RT.map((l, k) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${t(l)}</option>`).join('');
        const dangerOpts = ['—', '!', '!!', '!!!'].map((l, k) => `<option value="${k}" ${k === (n.danger || 0) ? 'selected' : ''}>${l}</option>`).join('');
        // The note's segment/CAP attributes all live in the Note tab: Road (the road type followed =
        // road_type_out), Danger, the declarative Speed limit, the CAP toggle and its qualifier.
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
            markDirty(); showOnCanvas(sel); canvas.render(); renderEditor(); renderNotes();
        };
        // Compass: does this note carry a heading to hold after it? On computes the bearing and
        // the straight-line distance to the next note; off clears both, and the qualifier with
        // them. The last note has nothing to head toward, so it says so (#560).
        const last = sel >= rb.notes.length - 1;
        const nextNote = rb.notes[sel + 1];
        // The "on" option shows the heading it holds — or, while off, the one it would take, so
        // the choice is never blind.
        const capHeading = n.cap != null ? n.cap : (nextNote ? RB.geo.bearingDeg(n, nextNote) : null);
        const capMetres = n.cap != null ? n.cap_distance : (nextNote ? RB.geo.haversineM(n, nextNote) : null);
        const capLabel = capHeading == null ? t('On')
            : Math.round(capHeading) + '°' + (capMetres != null ? ' · ' + RBKm(capMetres) : '');
        $('capSlot').innerHTML = `<label class="prop-field"><span>${labelHelp('Compass (CAP)', 'help.cap')}</span>
            <select id="edCap" class="field"${last ? ' disabled title="' + esc(t('The last note has no note to head toward.')) + '"' : ''}>
                <option value=""${n.cap == null ? ' selected' : ''}>${esc(t('Off'))}</option>
                <option value="on"${n.cap != null ? ' selected' : ''}>${esc(capLabel)}</option>
            </select></label>`;
        $('edCap').onchange = (e) => setCapAt(sel, e.target.value === 'on');
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
        $('wpTypeSlot').innerHTML = `<div class="prop-field wp-dd"><span>${labelHelp('Note type', 'help.wpType')}</span>
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
        // Detection radius (metres) — the geofence the Reader validates this waypoint with.
        // Available for EVERY waypoint, typed or not. Left empty the note inherits, and the
        // PLACEHOLDER is that inherited number: the field says what is in force either way,
        // without a line of prose under it. The chain is the runtime's own (RB.detectionRadius):
        // note → roadbook → type → system.
        const inherited = RB.detectionRadius({ wp_type: n.wp_type }, rb.meta);
        $('wpRadiusSlot').innerHTML = `<label class="prop-field"><span>${labelHelp('Detection radius', 'help.radius')}</span>
            <input id="edWpRadius" class="field" inputmode="numeric" value="${n.wp_radius != null ? n.wp_radius : ''}" placeholder="${inherited}"></label>`;
        $('edWpRadius').onchange = (e) => { const v = parseInt(e.target.value, 10); if (isFinite(v) && v > 0) n.wp_radius = v; else delete n.wp_radius; markDirty(); renderEditor(); };
    }
    // Set (or clear) a note's CAP: the heading to hold after it, with the straight-line distance
    // to the next note. Clearing it drops the qualifier too — a CAP type with no CAP means nothing.
    function setCapAt(i, on) {
        const n = rb.notes[i], nx = rb.notes[i + 1];
        if (on && !nx) return; // the last note has no following note to head toward
        if (on) { n.cap = Math.round(RB.geo.bearingDeg(n, nx)); n.cap_distance = Math.round(RB.geo.haversineM(n, nx)); }
        else { n.cap = null; n.cap_distance = null; delete n.cap_type; }
        markDirty(); renderNotes();
        if (i === sel) renderEditor(); // the CAP type control follows it in or out of play
    }
    // The minimum-notes guard and the confirm prompt live in deleteNoteConfirm.
    // Deleting a waypoint removes the note AND its own track vertex (the route reconnects between
    // its neighbours) — a wpt occupies its point, so it disappears with the wpt (#65). To keep the
    // point as a plain track vertex instead, use "Transform". RB.deleteNote does the splice + idx
    // shift; here we just keep a pending cut anchored across the shift, then repaint.
    function delNote(i) {
        if (!rb || i < 0 || i >= rb.notes.length) return;
        const removed = RB.deleteNote(rb, i);
        if (removed >= 0 && cutFromIdx > removed) cutFromIdx -= 1;
        // Refresh in place WITHOUT recentring the map (like the track-point ops) — deleting a note
        // must not make the view jump to a neighbour. routeChanged only highlights, never eases.
        sel = Math.min(i, rb.notes.length - 1);
        routeChanged('Note deleted.');
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
        rb.notes.push(RB.bareNote(rb, i, roadOutBefore(i)));
        RB.recomputeMetrics(rb); markDirty();
        refreshMap(true); renderNotes();
        select(rb.notes.findIndex((n) => n.idx === i)); // open the new note to fill it in
        toast('Note added.');
    }
    function addWaypointNear(pt) {
        const idx = splitTrackAt(pt);
        if (rb.notes.some((n) => n.idx === idx)) return toast('There is already a note here.');
        const cur = editorOpen ? rb.notes[sel] : null; // keep editing the same note across the re-sort
        rb.notes.push(RB.bareNote(rb, idx, roadOutBefore(idx)));
        RB.recomputeMetrics(rb);
        if (cur) sel = rb.notes.indexOf(cur);
        refreshMap(true); renderNotes(); markDirty();
        toast('Note added.');
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
        rb.notes.push(RB.bareNote(rb, at, roadOutBefore(at)));
        RB.recomputeMetrics(rb);
        if (cur) sel = rb.notes.indexOf(cur);
        refreshMap(true); renderNotes(); markDirty();
        toast('Note added.');
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
            if (!(await RBConfirmDanger(t('This point is a note — delete the point and its note?') + ' ' + noteLabel(rb.notes.find((n) => n.idx === k))))) return;
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
    /* An icon name that resolves to nothing — a roadbook written elsewhere, a file renamed since —
       is REPORTED, never repaired behind the author's back: the data stays exactly as they wrote
       it, the vignette draws a placeholder where the icon sits, and this names the files to
       re-add (#521). Nothing here marks the roadbook dirty either: an automatic pass on load must
       not leave a checkpoint, or the next visit offers to recover work that was already saved. */
    async function reportUnresolvedIcons() {
        if (!rb) return;
        await loadStd();
        const palette = new Set(Object.values(std.categories || {}).flat().map((x) => x.toLowerCase()));
        const lib = rb.icons || {};
        const known = (name) => /^data:/.test(name) || palette.has(name.toLowerCase()) || Object.keys(lib).some((k) => k.toLowerCase() === name.toLowerCase());
        const candidates = new Set();
        rb.notes.forEach((n) => (n.icons || []).forEach((ic) => { const nm = ic.name || ''; if (nm && !known(nm)) candidates.add(nm); }));
        const missing = [];
        await Promise.all([...candidates].map(async (nm) => {
            try { const r = await fetch('../assets/icons/' + nm, { method: 'HEAD' }); if (!r.ok) missing.push(nm); } catch (e) { missing.push(nm); }
        }));
        if (!missing.length) return;
        // one message, naming the files, so the author knows what to re-add — and nothing else
        toast(t('Some icons could not be found') + ': ' + missing.slice(0, 3).join(', ') + (missing.length > 3 ? ' +' + (missing.length - 3) : ''), 6000);
    }
    // The standard palette's file names, lowercased — what tells a shipped icon from the user's
    // own upload. Used by the palette listing and by the export prune (#454).
    const stdIconNames = async () => { await loadStd(); return new Set(Object.values(std.categories || {}).flat().map((x) => x.toLowerCase())); };
    async function renderIcons() {
        const lib = rb ? rb.icons || {} : {};
        const stdNames = await stdIconNames();
        const custom = Object.keys(lib).filter((n) => !stdNames.has(n.toLowerCase()));
        // an imported tulip (#943) is its note's original vignette, reached by the toggle beside it —
        // never an icon to place on a tulip
        const originals = new Set();
        (rb?.notes || []).forEach((n) => (n.icons || []).forEach((ic) => { if (ic.cover && ic.name) originals.add(ic.name.toLowerCase()); }));
        // newest first (#855): rb.icons keeps insertion order, and an upload is always inserted last
        const yours = custom.filter((n) => !originals.has(n.toLowerCase())).reverse();
        // The strip is icons and nothing else: each tile carries its category, and the chips
        // above are what name and filter the groups.
        let html = '';
        if (yours.length) html += yours.map((n) => iconBtn(n, lib[n], '__yours', true)).join('');
        html += Object.entries(std.categories || {}).map(([cat, files]) => {
            // #94: the Speed dropdown sets the limit (and renders the matching sign), so the S*
            // speed-limit signs are hidden from the palette.
            const shown = files.filter((f) => RB.speedLimitFromName(f) == null);
            return shown.map((f) => iconBtn(f, '../assets/icons/' + f, cat, false)).join('');
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
    // live palette filter: active category chip AND the search box
    $('iconSearch').oninput = filterIcons;
    function filterIcons() {
        const q = $('iconSearch').value.trim().toLowerCase();
        [...$('iconGrid').children].forEach((el) => {
            el.hidden = (iconCat && el.dataset.cat !== iconCat) || (q && !(el.dataset.add || '').toLowerCase().includes(q));
        });
    }
    const iconBtn = (name, src, cat, rmv) =>
        `<button data-add="${esc(name)}" data-cat="${esc(cat)}" title="${esc(name)}">${rmv ? `<span data-del="${esc(name)}" class="del-badge" role="button" tabindex="0" aria-label="${esc(t('Remove'))}">×</span>` : ''}<img src="${esc(src)}" alt="" loading="lazy"></button>`;
    function addIcon(name) {
        if (!editable()) return;
        ownTulip();
        canvas.addIcon(mkIcon(name, [0, 0]));
        toast('Icon added — drag it on the vignette');
    }
    async function delCustomIcon(name) {
        if (!editable()) return;
        const low = name.toLowerCase();
        if (rb.notes.some((n) => (n.icons || []).some((ic) => (ic.name || '').toLowerCase() === low))) return toast('In use; remove it from the notes first.');
        if (!(await RBConfirmDanger(t('Delete icon') + ' “' + esc(name) + '”?'))) return;
        delete rb.icons[name]; markDirty(); renderIcons(); // a change like any other: saved, checkpointed, undoable
    }
    /* Custom icons go into rb.icons, the roadbook's own library, and are offered to EVERY note —
       and one added while a note is open goes straight into its vignette too, since that is what
       it was added for (#855). The library lists the newest first, so a (re-)upload is inserted
       last. markDirty matters: without it an upload was not checkpointed, so a crash between adding the
       icon and the next edit lost it (#454). A pasted image has no meaningful file name — the
       clipboard calls everything "image.png" — so it gets a unique one instead of overwriting the
       last paste (#455). A picked file keeps its name, so re-uploading one deliberately replaces it. */
    async function addIconFiles(files, pasted) {
        if (!editable()) return;
        if (Array.isArray(rb.icons) || !rb.icons) rb.icons = {}; // a map, never a list (#523)
        let n = 0;
        const added = [];
        for (const f of files) {
            // downscaled to a 256 px PNG like every embedded image (#657): an icon is drawn at most
            // 120 px, so a full-size photo would only bloat every .rdbk
            const name = pasted ? 'pasted-' + Date.now() + '-' + n + '.png' : safeName(f.name).replace(/\.[^.]+$/, '') + '.png';
            try { const data = await iconDataURL(f); delete rb.icons[name]; rb.icons[name] = data; added.push(name); n++; }
            catch (e) { toast('Could not read the image.'); }
        }
        if (!n) return;
        if (editorOpen && rb.notes[sel]) { ownTulip(); added.forEach((name) => canvas.addIcon(mkIcon(name, [0, 0]))); markDirty(); await renderIcons(); return toast('Icon added — drag it on the vignette'); }
        markDirty(); await renderIcons();
        toast(n === 1 ? 'Icon added — tap it to place.' : 'Icons added — tap them to place.');
    }
    // An uploaded or pasted icon on a flat backdrop (#694): offer to cut the backdrop out, showing
    // the result first. The library keeps only the version the author chose.
    async function iconDataURL(file) {
        const c = await RBImg.canvas(file, 256), ctx = c.getContext('2d');
        const original = c.toDataURL('image/png');
        const img = ctx.getImageData(0, 0, c.width, c.height);
        const bg = RB.iconBackground(img.data, c.width, c.height);
        if (!bg) return original;
        RB.removeIconBackground(img.data, c.width, c.height, bg);
        ctx.putImageData(img, 0, 0);
        const cleaned = c.toDataURL('image/png');
        return (await askRemoveBackground(original, cleaned)) ? cleaned : original;
    }
    // A question, so No / Yes (#435) — with both versions side by side on a checkerboard, where
    // transparency shows.
    const askRemoveBackground = (original, cleaned) => new Promise((resolve) => {
        const d = RBModal(`<h3><i class="fa-solid fa-wand-magic-sparkles icon-accent"></i> ${esc(t('Remove the background?'))}</h3>
            <p class="muted">${esc(t('The icon sits on a plain background that would cover the vignette.'))}</p>
            <div class="icon-compare">
                <figure><img src="${original}" alt=""><figcaption>${esc(t('Original'))}</figcaption></figure>
                <figure><img src="${cleaned}" alt=""><figcaption>${esc(t('Without background'))}</figcaption></figure>
            </div>
            <div class="btnrow end"><button class="btn btn-ghost" data-no>${esc(t('No'))}</button><button class="btn btn-primary" data-yes>${esc(t('Yes'))}</button></div>`, 'narrow', () => resolve(false));
        d.q('[data-no]').onclick = () => { d.close(); resolve(false); };
        d.q('[data-yes]').onclick = () => { d.close(); resolve(true); };
    });
    $('addIconBtn').onclick = () => $('iconFile').click();
    $('iconFile').onchange = async (e) => { await addIconFiles([...e.target.files], false); e.target.value = ''; };
    /* Paste an image straight into the gallery (#455). Two ways in, because neither works
       everywhere: the button reads the clipboard itself where that is allowed (Chromium, with
       permission), and otherwise arms the next Ctrl+V — which the `paste` listener honours before
       the photo paths, since an icon is embedded in the roadbook and needs no server. */
    let pasteIconArmed = false;
    $('pasteIconBtn').onclick = async () => {
        if (!rb) return toast('Load a roadbook first.');
        try {
            window.focus(); // clipboard.read() needs the document focused
            for (const it of await navigator.clipboard.read()) {
                const ty = it.types.find((x) => /^image\//.test(x));
                if (ty) return void addIconFiles([new File([await it.getType(ty)], 'clipboard.png', { type: ty })], true);
            }
            toast('No image in the clipboard.');
        } catch (e) {
            pasteIconArmed = true;
            toast('Now press Ctrl+V to paste the image.');
        }
    };
    const safeName = (n) => n.replace(/[^a-zA-Z0-9._-]/g, '_');

    // refresh everything after a whole-route operation
    function routeChanged(toastMsg) {
        sel = Math.min(sel, rb.notes.length - 1);
        refreshMap(true); renderNotes(); renderEditor(); showOnCanvas(sel); markDirty();
        markOnMap(rb.notes[sel]);
        if (toastMsg) toast(toastMsg);
    }

    /* ---------- export (single button → popup with every format) ----------
     * The export fns assume open cuts are already confirmed — the modal does that
     * ONCE before running, so a GPX multi-pick never re-prompts per file. */
    const stamp = () => { const d = new Date(), p = RB.pad2; return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()); };
    // Self-contained .rdbk: every used icon embedded as a data URI.
    // A .rdbk is a ZIP container (#162): always roadbook.json (the unchanged schema, icons still
    // base64 inside it), plus — when the user opts in — the geotagged photos/audio fetched from the
    // server gallery under photos/ and audio/, with a media.json manifest carrying their coordinates
    // (so a later import can re-upload them). Media-less exports are just a ZIP with roadbook.json.
    async function exportRdbk(includeMedia) {
        stampMeta(); RB.recomputeMetrics(rb); RB.recomputeCaps(rb); await embedUsed(rb);
        const files = { 'roadbook.json': JSON.stringify(RB.roadbookForExport(rb)) };
        if (includeMedia) {
            const media = { photos: [], audio: [] };
            const grab = async (list, dir, bucket) => {
                for (const it of list) {
                    try {
                        const res = await fetch(it.url); if (!res.ok) continue;
                        const file = dir + '/' + it.url.split('/').pop();
                        files[file] = new Uint8Array(await res.arrayBuffer());
                        bucket.push({ file, lat: it.lat, lon: it.lon });
                    } catch (e) { /* skip a media file that won't fetch — never fail the export */ }
                }
            };
            await grab(notePhotos, 'photos', media.photos);
            await grab(noteAudio, 'audio', media.audio);
            if (media.photos.length || media.audio.length) files['media.json'] = JSON.stringify(media);
        }
        RBDownload(await RBZip.write(files), RB.slug(rb.meta?.title) + '_' + stamp() + '.rdbk');
        exported = true; clearDraft();
    }
    // A4 PDF, generated on the device (jsPDF, lazy-loaded) — see rb-pdf.js
    async function exportPdf() {
        stampMeta(); RB.recomputeMetrics(rb); RB.recomputeCaps(rb);
        toast('Generating PDF…');
        // a public roadbook's PDF carries a QR to its page in the header of every page (#810)
        const link = status === 'public' && publicSlug ? RBPublicLink('/challenge/' + encodeURIComponent(publicSlug)) : null;
        try { await RBPdf.generate(rb, { iconBasePath: '../assets/icons/', link }); }
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
        const tulips = rb.notes.map((n, i) => tulipSVG(n, i));
        const base = RB.slug(rb.meta?.title) + '_' + stamp() + '_OR';
        RBDownload(new Blob([RB.openRallyDocument(rb, { tulips, name: base })], { type: 'application/gpx+xml' }), base + '.gpx');
    }
    // KMZ export: KML 2.2 inside a ZIP (doc.kml). Track + waypoints, no icon mapping.
    async function exportKmz() {
        stampMeta(); RB.recomputeMetrics(rb); RB.recomputeCaps(rb);
        const wpts = rb.notes.map((n) => ({ lat: n.lat, lon: n.lon, name: String(n.num).padStart(3, '0'), desc: (n.text || '').trim() || null }));
        const base = RB.slug(rb.meta?.title) + '_' + stamp() + '_KMZ';
        const kml = RB.kmlDocument(base, rb.track, wpts);
        RBDownload(await RBZip.write({ 'doc.kml': kml }), base + '.kmz');
    }
    // Export (#699): one list, one row per format, each named and described — the choice is the
    // format, so no format outranks another. GPX carries its options right under it; the source
    // view (JSON / GPX, to inspect and copy) is the last row. Close is the way out.
    function openExportModal() {
        if (!rb) return toast('Nothing to export.');
        const row = (x, icon, title, desc) => `<button class="load-card row" data-x="${x}"><i class="fa-solid ${icon}"></i><span><b>${esc(t(title))}</b><small>${esc(t(desc))}</small></span></button>`;
        const m = RBModal(`<h2><i class="fa-solid fa-file-export icon-accent"></i> ${esc(t('Export'))}</h2>
            <div class="load-opts stack">
                ${row('rdbk', 'fa-file-zipper', '.rdbk file', 'The whole roadbook, to open again or share')}
                ${(notePhotos.length || noteAudio.length) ? `<label class="checkbox-row export-opts"><input type="checkbox" data-media checked> ${esc(t('Include photos & audio in the .rdbk'))}</label>` : ''}
                ${row('pdf', 'fa-file-pdf', 'PDF', 'To print or read on paper')}
                ${row('gpx', 'fa-route', 'GPX', 'For a GPS device or another app')}
                <div class="export-opts">
                    <label class="checkbox-row"><input type="checkbox" data-g="track" checked> ${esc(t('Track line'))}</label>
                    <label class="checkbox-row"><input type="checkbox" data-g="wpt" checked> ${esc(t('Waypoints (notes)'))}</label>
                    <label class="checkbox-row gpx-sub"><input type="checkbox" data-g="grm"> ${esc(t('Garmin icons'))}</label>
                    <label class="checkbox-row gpx-sub"><input type="checkbox" data-g="osm"> ${esc(t('OSMAnd icons'))}</label>
                </div>
                ${row('openrally', 'fa-flag-checkered', 'OpenRally', 'The rally GPX format')}
                ${row('kmz', 'fa-earth-americas', 'KMZ', 'To view in Google Earth')}
                ${row('source', 'fa-code', 'View source', 'The roadbook as JSON or GPX, to inspect and copy')}
            </div>
            <div class="btnrow end"><button class="btn btn-ghost modal-close">${esc(t('Close'))}</button></div>`, 'narrow');
        const cb = (g) => m.q(`[data-g="${g}"]`);
        const syncIcons = () => { const on = cb('wpt').checked; ['grm', 'osm'].forEach((g) => { cb(g).disabled = !on; }); }; // icons need waypoints; just enable/disable, keep the checked state
        cb('wpt').onchange = syncIcons; syncIcons();
        m.q('.modal-close').onclick = m.close;
        const run = (x, fn) => { m.q(`[data-x="${x}"]`).onclick = async () => { const opts = { media: !!(m.q('[data-media]') && m.q('[data-media]').checked), track: cb('track').checked, wpt: cb('wpt').checked, grm: cb('grm').checked, osm: cb('osm').checked }; m.close(); if (x === 'source' || await confirmOpenCuts()) await fn(opts); }; };
        run('rdbk', (o) => exportRdbk(o.media));
        run('pdf', () => exportPdf());
        m.q('[data-x="gpx"]').onclick = async () => {
            const o = { track: cb('track').checked, wpt: cb('wpt').checked, grm: cb('grm').checked, osm: cb('osm').checked };
            if (!o.track && !o.wpt) return toast('Pick the track line, the waypoints or both.');
            m.close();
            if (await confirmOpenCuts()) exportCustomGpx(o);
        };
        run('openrally', () => exportOpenRally());
        run('kmz', () => exportKmz());
        run('source', () => openRawJson());
    }
    $('exportBtn').onclick = openExportModal;
    // Raw view (#28): the whole roadbook as pretty JSON (or its GPX) — read-only, to inspect, find
    // and copy. The embedded icons (base64 blobs) show as placeholders.
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
        const m = RBModal(`<h2><i class="fa-solid fa-code icon-accent"></i> ${esc(t('View source'))}</h2>
            <div class="ed-row"><input type="search" id="rawSearch" class="field grow" placeholder="${esc(t('Find in text (Enter)…'))}" spellcheck="false" autocomplete="off"></div>
            <textarea id="rawJson" class="raw-edit" spellcheck="false" readonly></textarea>
            <p id="rawMsg" class="small"></p>
            <div class="btnrow end">
                <button class="btn btn-ghost" data-x="close">${esc(t('Close'))}</button>
                <button class="btn btn-ghost" data-x="gpx">${esc(t('View GPX'))}</button>
                <button class="btn btn-primary" data-x="copy"><i class="fa-solid fa-copy"></i> ${esc(t('Copy'))}</button>
            </div>`, 'wide');
        m.q('[data-x="close"]').onclick = m.close;
        const ta = m.q('#rawJson'), msg = m.q('#rawMsg'), gpxBtn = m.q('[data-x="gpx"]');
        let gpxMode = false;
        ta.value = jsonText();
        const setMsg = (txt, ok) => { msg.textContent = txt; msg.className = 'small msg ' + (ok ? 'ok' : 'err'); };
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
            RBCopy(ta.value, 'Copied.'); // RBCopy reports the outcome itself — success or failure
        };
    }
    // embed EVERY used icon (self-contained .rdbk) and prune the unused ones. The standard
    // palette is canonical (#174): each used icon is re-fetched so updated sign art replaces a
    // stale embedded copy; a custom icon isn't on disk (its fetch fails) and its copy stays.
    async function embedUsed(r) {
        r.icons = r.icons || {};
        const used = new Set();
        r.notes.forEach((n) => (n.icons || []).forEach((ic) => used.add((ic.name || '').split('/').pop())));
        for (const base of used) {
            if (!base || /^data:/.test(base)) continue;
            const u = await RB.urlToDataURL('../assets/icons/' + base);
            if (u) { Object.keys(r.icons).forEach((k) => { if (k !== base && k.toLowerCase() === base.toLowerCase()) delete r.icons[k]; }); r.icons[base] = u; }
        }
        // Prune only what can be got back. An unused STANDARD icon is re-fetchable from
        // assets/icons/, so dropping it keeps the file lean. A CUSTOM icon is the user's own
        // artwork and rb.icons is its only copy — pruning that destroyed uploads and left notes
        // pointing at a name that resolves to a 404, which is the broken image in #454. The
        // custom library is shared by every note on purpose (it is listed as "Yours in this
        // roadbook" precisely so any note can use it).
        const stdNames = await stdIconNames();
        Object.keys(r.icons).forEach((k) => {
            const low = k.toLowerCase();
            if ([...used].some((b) => b.toLowerCase() === low)) return; // in use
            if (stdNames.has(low)) delete r.icons[k];                    // unused and recoverable
        });
    }


    /* ---------- offline-first media queue (#147) — photos captured during "Adjust on the trail"
        are buffered in IndexedDB with retry, so a network drop mid-trail never loses a shot.
        Media the Recorder queued without a roadbook (signed out, or before its draft existed) is
        attached to the roadbook this page saves (#648): until there is one, it stays queued. The
        onDone reconciles the optimistic local pin to the server URL. */
    RBMediaQueue.init({
        resolveRoadbook: () => currentRbId || null,
        onChange: (n) => {
            const el = $('recPending'); if (!el) return;
            el.hidden = !n;
            el.textContent = n ? (n + ' ' + t('awaiting upload')) : '';
        },
        onDone: (item, res) => {
            if (item.kind !== 'photo') return;
            const p = recPhotos.find((x) => x.token === item.token);
            if (!p) return;
            if (p.local && p.url) { try { URL.revokeObjectURL(p.url); } catch (e) {} }
            p.id = res.id; p.url = RBMediaSrc(res.url); p.local = false; p.pending = false;
            if (res.lat != null) { p.lat = res.lat; p.lon = res.lon; }
            if (map) map.setPhotos(recPhotos);
            updateRecStats();
        },
    });

    /* ---------- startup: trip handoff → draft → recording → challenge/?rb ---------- */
    renderIcons();
    (async function startup() {
        const account = RBConfig().then((cfg) => { // offline, a signed-in user is still signed in (#630)
            meUser = cfg.user || null;
            updateSaveBtn();
            if (rb && !rb.meta.author && !$('rbAuthor').value) $('rbAuthor').value = userName(); // default author once we know the user
        });
        // ?trip=1 → a GPX track logged in the Reader or the Tripmaster, handed over via sessionStorage
        // (the Recorder saves its recordings as a draft roadbook and opens that instead, #791).
        if (new URLSearchParams(location.search).get('trip')) {
            try {
                const pts = JSON.parse(sessionStorage.getItem('rb_trip_track') || 'null');
                sessionStorage.removeItem('rb_trip_track');
                if (pts && pts.length >= 2) { setRoadbook(RB.buildRoadbook({ name: t('Recorded trip'), trkpts: pts, wpts: [] })); markDirty(); }
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
        // `declined` is why this is asked ONCE: declining keeps the draft (it is overwritten by the
        // next checkpoint and cleared on save/export, so a mis-tap cannot destroy unsaved work)
        // but the question does not come back for it — a "No" the app ignores is worse than no
        // question at all (#436).
        const draftFits = draft && draft.rb && draft.rb.notes && !draft.declined && (!explicitTarget || (id > 0 && draft.currentRbId === id));
        if (draftFits && !loadStarted) {
            // Named for what it IS — edits that were never stored — with the moment they were made,
            // so it cannot be read as "your save failed" (#459).
            const when = draft.at ? new Date(draft.at).toLocaleString(window.RBi18n ? RBi18n.current() : undefined) : '';
            const what = '<br><b>' + esc((draft.rb.meta && draft.rb.meta.title) || 'Roadbook') + '</b> · ' + draft.rb.notes.length + ' ' + t('notes') + (when ? ' · ' + esc(when) : '');
            if (await RBConfirm(t('You left unsaved changes here. Continue from them?') + what)) {
                currentRbId = draft.currentRbId || 0; setStatus(draft.status);
                reusable = !!draft.reusable; publicSlug = draft.publicSlug || null;
                vehicles = Array.isArray(draft.vehicles) && draft.vehicles.length ? draft.vehicles : ['car']; paintVehicles();
                setOwnership(draft.rbIsOwner !== false, draft.rbOwner || '');
                // a saved roadbook is edited under its soft lock (#154), like opening it by ?rb=: when
                // someone else holds it the draft opens read-only (it stays on this device until then)
                if (currentRbId > 0) {
                    const r = await RBApi('rb_get', { id: currentRbId, lock: 1 });
                    if (r.ok) setLock(r.lock);
                }
                setRoadbook(draft.rb, Array.isArray(draft.gaps) ? draft.gaps : []);
                markDirty();
                return;
            }
            declineDraft();
        }
        // Fork a public challenge → load as a brand-new roadbook (saving creates a new one).
        if (ch) { try { const j = await RBChallenges.loadPublic(ch); if (!j.reusable) { toast(t('This public roadbook cannot be copied.')); return; } currentRbId = 0; setStatus('draft'); reusable = false; vehicles = j.vehicles; paintVehicles(); setRoadbook(j.roadbook); } catch (e) { toast('Could not load the roadbook.'); } return; }
        await account;
        if (id && !meUser) { RBNeedAuth('Sign in to edit this roadbook.'); return; } // never an empty screen (#650)
        if (id && meUser) {
            const r = await RBApi('rb_get', { id, lock: 1 }); // editing intent: take the soft lock (#154)
            if (r.ok && r.roadbook) {
                // A roadbook saved with no route yet would open on an empty map: warn, and on
                // Yes load it straight into draw mode (No falls through to the list, #650).
                const hasRoute = (r.roadbook.track || []).length >= 2;
                if (hasRoute || await RBConfirm('This roadbook has no route yet. Draw it on the map?')) {
                    currentRbId = id; publicSlug = r.slug || null; setStatus(r.status); reusable = !!r.reusable; vehicles = r.vehicles; paintVehicles(); setOwnership(!!r.is_owner, r.owner); setLock(r.lock); setRoadbook(r.roadbook);
                }
            } else {
                toast(t('Roadbook not found or no edit rights.')); // explicit target failed → show error, don't fall through to the list
                return;
            }
        }
        if (!rb && meUser) {
            const n = await RBRoadbookList($('myRbList')); $('myRbSection').hidden = !n; // landing → list the user's saved roadbooks
            // …plus the roadbooks you can edit through your events (#123), each named after its event
            const ce = await RBApi('rb_coedit_list');
            const coedit = (ce.ok && ce.roadbooks) || [];
            $('coeditSection').hidden = !coedit.length;
            $('coeditList').innerHTML = coedit.map((r) => `<div class="roadbook-row">
                <div class="meta"><b>${esc(r.title)}</b><small>@${esc(r.owner)} · <i class="fa-solid fa-calendar-check icon-accent"></i> ${esc(r.event_title)}</small></div>
                <a class="btn btn-ghost" href="?rb=${r.id}" title="${esc(t('Edit'))}" aria-label="${esc(t('Edit'))}"><i class="fa-solid fa-pen"></i></a>
            </div>`).join('');
            centerOnDefault(); // empty start (e.g. "Draw on the map"): centre on the user's saved default location

        }
        // Opened from My roadbooks "Export" (?export=1): pop the same Export popup straight away.
        if (rb && new URLSearchParams(location.search).get('export') === '1') {
            try { history.replaceState(null, '', location.pathname + '?rb=' + currentRbId); } catch (e) {} // drop the flag so a refresh won't re-open it
            openExportModal();
        }
    })();
})();
