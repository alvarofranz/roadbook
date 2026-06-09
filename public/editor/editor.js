'use strict';
/* Roadbook Editor — el HUB de creación/edición. Importa GPX (→ roadbook), carga
 * roadbook .json o un Challenge, edita notas (texto, tipo de pista, CAP, iconos),
 * añade/borra waypoints, empalma GPX (desvío/prolongación) y guarda un roadbook
 * AUTOCONTENIDO (iconos embebidos en icons → un único .json portable). */
(function () {
    const $ = (id) => document.getElementById(id);
    const t = RBt, esc = RBesc; // shared helpers (app.js / i18n.js)
    const RT = ['Default', 'Motorway', 'Asphalt', 'Track', 'Off-piste'];
    const map = new RBMap('edMap', { zoom: 13 });
    let rb = null, sel = 0, std = null, spliceTrk = null, dirty = false, exported = false;
    const markDirty = () => { dirty = true; exported = false; updateSaveBtn(); };
    function updateSaveBtn() {
        const b = $('saveAccount'); if (!b) return;
        if (!meUser) { b.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Save'; b.classList.add('btn-primary'); return; }
        if (currentRbId && !dirty) { b.innerHTML = '<i class="fa-solid fa-circle-check"></i> Saved'; b.classList.remove('btn-primary'); }
        else { b.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Save'; b.classList.add('btn-primary'); }
    }
    const mkIcon = (name, pos) => ({ file: 'icons/' + name, name, pos, angle: 0, size: 32, flip_x: false });
    const canvas = new NoteCanvas($('noteCanvas'), { toolbarEl: $('noteToolbar'), onChange: () => markDirty(), resolveIcon: (ic) => RB.iconSrc(ic, rb, '../assets/icons/') });
    canvas.onDropIcon((name, pos) => canvas.addIcon(mkIcon(name, pos)));
    $('addBivio').onclick = () => { if (!rb) return toast('Load a roadbook first.'); canvas.addBivio(); };

    map.onWaypoint((i) => select(i));
    if (map.map) map.map.on('click', (e) => {
        if (!rb) return;
        if (map.map.queryRenderedFeatures(e.point, { layers: ['rb-wpts'] }).length) return;
        addWaypointNear({ lat: e.lngLat.lat, lon: e.lngLat.lng });
    });

    /* ---------- carga ---------- */
    $('loadGpx').onclick = () => $('gpxFile').click();
    $('loadJson').onclick = () => $('jsonFile').click();
    $('demos').onclick = () => window.RBChallenges && RBChallenges.pick((r) => setRoadbook(r));
    $('gpxFile').onchange = async (e) => {
        const files = Array.from(e.target.files);
        const g = files.find((f) => /\.gpx$/i.test(f.name)); if (!g) return;
        const w = files.find((f) => /\.wpt$/i.test(f.name));
        try {
            const p = RB.parseGPX(await g.text());
            if (w && (!p.wpts || !p.wpts.length)) p.wpts = RB.parseWPT(await w.text());
            setRoadbook(RB.buildRoadbook({ name: p.name || g.name.replace(/\.gpx$/i, ''), trkpts: p.trkpts, wpts: p.wpts }));
        } catch (err) { toast('Error: ' + err.message); }
    };
    $('jsonFile').onchange = async (e) => {
        const f = e.target.files[0]; if (!f) return;
        try { const j = JSON.parse(await f.text()); if (!j.track || !j.notes) throw new Error('Not a roadbook'); setRoadbook(j); }
        catch (err) { toast('Error: ' + err.message); }
    };
    function setRoadbook(r) {
        rb = r; rb.icons = rb.icons || {}; rb.meta = rb.meta || {};
        dirty = false;
        $('loadFrom').hidden = true; $('recBar').hidden = true; $('rbPanel').hidden = false;
        $('rbTitle').value = rb.meta.title || ''; $('rbDesc').value = rb.meta.description || '';
        $('rbAuthor').value = rb.meta.author || userName() || ''; $('rbOrg').value = rb.meta.organization || '';
        setLogoPreview(rb.meta.logo); $('rbModified').textContent = rb.meta.modified || '—';
        updatePhotos(); updateSaveBtn();
        map.showRoadbook(rb); renderNotes(); renderIcons();
        sel = 0; canvas.setNote(rb.notes[0]); renderEditor();
        showView('map'); // start on the map + notes; tap a note to edit it
    }
    $('rbTitle').oninput = (e) => { if (rb) { rb.meta.title = e.target.value; markDirty(); } };
    $('rbDesc').oninput = (e) => { if (rb) { rb.meta.description = e.target.value; markDirty(); } };
    $('rbAuthor').oninput = (e) => { if (rb) { rb.meta.author = e.target.value; markDirty(); } };
    $('rbOrg').oninput = (e) => { if (rb) { rb.meta.organization = e.target.value; markDirty(); } };
    $('rbLogoBtn').onclick = () => $('rbLogoFile').click();
    $('rbLogoClr').onclick = () => { if (rb) { delete rb.meta.logo; setLogoPreview(null); markDirty(); } };
    $('rbLogoFile').onchange = async (e) => { const f = e.target.files[0]; if (f && rb) { rb.meta.logo = await RBImg.toDataURL(f, 256); setLogoPreview(rb.meta.logo); markDirty(); } e.target.value = ''; };
    // event logo: embedded as a base64 data URI in meta.logo (self-contained, like the icons)
    function userName() { if (!meUser) return ''; return (((meUser.first_name || '') + ' ' + (meUser.last_name || '')).trim()) || meUser.username || ''; }
    function setLogoPreview(src) { const i = $('rbLogoPrev'); if (src) { i.src = src; i.style.display = ''; $('rbLogoClr').hidden = false; } else { i.removeAttribute('src'); i.style.display = 'none'; $('rbLogoClr').hidden = true; } }
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
    window.addEventListener('beforeunload', (e) => { if (rb && dirty && !exported) { e.preventDefault(); e.returnValue = ''; } });
    // ?track=<slug> → cargar challenge directo
    (function () { const slug = window.RBChallenges && RBChallenges.fromUrl(); if (slug) RBChallenges.load(slug).then(setRoadbook).catch((e) => toast(e.message)); })();
    // ?trip=1 → a track recorded in the Tripmaster, handed over via sessionStorage
    (function () {
        if (!new URLSearchParams(location.search).get('trip')) return;
        try { const pts = JSON.parse(sessionStorage.getItem('rb_trip_track') || 'null'); sessionStorage.removeItem('rb_trip_track'); if (pts && pts.length >= 2) { setRoadbook(RB.buildRoadbook({ name: 'Recorded trip', trkpts: pts, wpts: [] })); markDirty(); } } catch (e) { toast('Could not load the recorded trip.'); }
    })();

    /* ---------- record / adjust route (live GPS) ---------- */
    let recTrack = [], recWpts = [], recPhotos = [], recWatch = null, recLast = null, recHere = null, recWake = null, recPaused = false;
    let recMode = 'new', draftId = 0, adjP1 = -1, adjP2 = -1; // adjust: entry/exit index on the base track
    const REC_KEY = 'rb_recording';
    const saveRec = () => { try { if (recMode === 'new') localStorage.setItem(REC_KEY, JSON.stringify({ track: recTrack, wpts: recWpts })); } catch (e) {} };
    const clearRec = () => { try { localStorage.removeItem(REC_KEY); } catch (e) {} };
    // Light 3-point moving average — limes micro-zigzag from weak-signal fixes.
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
    $('adjustBtn').onclick = () => { if (!rb) return toast('Load a roadbook first.'); startRecording('adjust'); };
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
        if (document.visibilityState === 'visible' && recWatch != null && 'wakeLock' in navigator && (!recWake || recWake.released)) {
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
        if (mode === 'adjust') { showView('map'); if (map) { map.showRoadbook(rb, false); map.setOverlay([]); } draftId = currentRbId; toast('Walk onto the trail (≤10 m) to start adjusting.'); }
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
        const d = RBModal(`<h3 style="margin:0 0 .5rem">Waypoint ${note.num}</h3>
            <input id="wfText" class="fld" style="width:100%" placeholder="${t('Quick note (optional)…')}" autocomplete="off">
            <div class="btnrow" style="justify-content:flex-end;margin-top:.7rem"><button class="btn btn-primary" id="wfBtn">${t('Edit later')} (5)</button></div>`, 'max-width:380px', () => finish());
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
    $('recPhoto').onclick = () => { if (!draftId) return RBNeedAuth('Sign in to attach photos.'); $('recPhotoFile').click(); };
    $('recPhotoFile').onchange = async (e) => {
        const f = e.target.files[0]; e.target.value = ''; if (!f || !draftId) return;
        const fields = { type: 'photo', roadbook: String(draftId) };
        if (recHere) { fields.lat = recHere.lat; fields.lon = recHere.lon; }
        toast('Uploading photo…');
        const r = await RBUpload(fields, f);
        if (!r.ok) return toast(r.error || 'Photo failed.');
        recPhotos.push({ id: r.id, url: r.url, lat: r.lat, lon: r.lon }); if (map) map.setPhotos(recPhotos);
        const lat = r.lat != null ? r.lat : (recHere && recHere.lat), lon = r.lon != null ? r.lon : (recHere && recHere.lon);
        const d = RBModal(`<img src="${r.url}" alt="" style="width:100%;border-radius:12px;max-height:48vh;object-fit:cover">
            <div class="btnrow" style="justify-content:center;margin-top:.8rem">
                <button class="btn btn-ghost" id="ptOk">OK</button>
                <button class="btn btn-primary" id="ptWpt"><i class="fa-solid fa-location-dot"></i> ${t('Convert into waypoint')}</button>
            </div>`, 'max-width:340px;text-align:center');
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
        if (adjP1 < 0 || recTrack.length < 2) { if (map) map.showRoadbook(rb); return toast('Adjust cancelled — you never got on the trail.'); }
        const rejoin = adjP2 >= 0;
        const ok = await RBConfirm(rejoin ? `Replace the trail between points ${adjP1} and ${adjP2} with your ${recTrack.length}-point variant?` : `Replace everything after point ${adjP1} with your new ${recTrack.length}-point ending?`, 'Apply');
        if (!ok) { if (map) map.showRoadbook(rb); return; }
        spliceByIndex(rb, smoothTrack(recTrack), adjP1, rejoin ? adjP2 : null);
        // merge any waypoints dropped during the adjust session (snap to the new track)
        recWpts.forEach((w) => {
            const idx = RB.nearestIdx(rb.track, w);
            if (!rb.notes.some((n) => n.idx === idx)) rb.notes.push({ num: 0, idx, distance: 0, partial_distance: 0, lat: w.lat, lon: w.lon, text: w.text || '', cap: null, cap_distance: null, bearing_in: 0, bearing_out: 0, road_type_in: 3, road_type_out: 3, junctions: null, icons: [] });
        });
        RB.recomputeMetrics(rb); RB.recomputeCaps(rb);
        sel = 0; map.showRoadbook(rb); renderNotes(); renderEditor(); canvas.setNote(rb.notes[0]); updatePhotos(); markDirty();
        toast('Trail adjusted · metrics recomputed.');
    }
    function spliceByIndex(r, newTrk, i1, i2) {
        const nt = r.track.slice(0, i1 + 1).concat(newTrk.map((p) => ({ lat: RB.round6(p.lat), lon: RB.round6(p.lon) }))).concat(i2 != null ? r.track.slice(i2) : []);
        const last = r.notes[r.notes.length - 1];
        r.notes = r.notes.filter((n) => n.idx <= i1 || (i2 != null && n.idx >= i2));
        // tail replace (no rejoin): keep an end note at the new finish
        if (i2 == null) { const e = nt[nt.length - 1]; r.notes.push({ num: 0, idx: nt.length - 1, distance: 0, partial_distance: 0, lat: e.lat, lon: e.lon, text: '', cap: null, cap_distance: null, bearing_in: 0, bearing_out: 0, road_type_in: last ? last.road_type_out : 3, road_type_out: last ? last.road_type_out : 3, junctions: null, icons: [] }); }
        r.track = nt;
        r.notes.forEach((n) => { n.idx = RB.nearestIdx(nt, { lat: n.lat, lon: n.lon }); });
        RB.recomputeMetrics(r); RB.recomputeCaps(r);
    }
    // Recover an interrupted recording (crash/closed tab) on next visit.
    function checkRecovery() {
        let s; try { s = JSON.parse(localStorage.getItem(REC_KEY) || 'null'); } catch (e) {}
        if (!s || !s.track || s.track.length < 2) return;
        RBConfirm(`Recover your unsaved recording (${s.track.length} points)?`, 'Recover').then((yes) => {
            clearRec();
            if (yes && !rb) { try { setRoadbook(RB.buildRoadbook({ name: 'Recovered route', trkpts: smoothTrack(s.track), wpts: s.wpts || [] })); markDirty(); } catch (e) {} }
        });
    }
    checkRecovery();

    /* ---------- account: save to profile · public/private · load by ?rb ---------- */
    let meUser = null, currentRbId = 0, isPublic = 0;
    const apiPost = (body) => fetch('../api/index.php', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json()).catch(() => ({ ok: false, error: 'Network error.' }));
    $('visPrivate').onclick = () => { setVis(0); markDirty(); };
    $('visPublic').onclick = () => { setVis(1); markDirty(); };
    function setVis(v) { isPublic = v; $('visPrivate').classList.toggle('on', !v); $('visPublic').classList.toggle('on', !!v); }
    async function doSave() {
        stampMeta(); RB.recomputeMetrics(rb); RB.recomputeCaps(rb); await embedUsed(rb);
        const r = await apiPost({ action: 'rb_save', id: currentRbId, is_public: isPublic, roadbook: rb });
        if (r.ok) { currentRbId = r.id; dirty = false; updatePhotos(); updateSaveBtn(); }
        return r;
    }
    $('saveAccount').onclick = async () => {
        if (!meUser) return RBNeedAuth('Sign in to save this roadbook to your profile.');
        if (!rb) return toast('Nothing to save.');
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
        g.innerHTML = r.photos.map((p) => `<div style="position:relative"><img src="${p.url}" style="width:100%;height:64px;object-fit:cover;border-radius:8px" alt=""><span data-delp="${p.id}" style="position:absolute;top:-6px;right:-6px;background:var(--track);color:#fff;border-radius:50%;width:18px;height:18px;line-height:18px;text-align:center;font-weight:800;cursor:pointer">×</span></div>`).join('');
        g.querySelectorAll('[data-delp]').forEach((s) => s.onclick = async () => { await apiPost({ action: 'ph_delete', id: +s.dataset.delp }); loadPhotos(); });
        // pins on the map; tap a 📷 pin to promote it to a waypoint
        if (map) map.setPhotos(r.photos, (ph) => {
            if (ph.lat == null) return;
            RBConfirm('Create a waypoint at this photo?', 'Create').then((yes) => { if (yes && rb) addWaypointNear({ lat: ph.lat, lon: ph.lon }); });
        });
    }
    $('addPhotoBtn').onclick = () => { if (!currentRbId) return toast('Save to your profile first.'); $('photoFile').click(); };
    $('photoFile').onchange = async (e) => {
        for (const f of e.target.files) {
            await RBUpload({ type: 'photo', roadbook: String(currentRbId) }, f);
        }
        e.target.value = ''; loadPhotos(); toast('Photos uploaded.');
    };
    (async function initAccount() {
        const cfg = await apiPost({ action: 'config' });
        meUser = cfg.user || null;
        updateSaveBtn();
        if (rb && !rb.meta.author && !$('rbAuthor').value) $('rbAuthor').value = userName(); // default author once we know the user
        // Fork a public challenge → load as a brand-new roadbook (saving creates a new one).
        const ch = RBChallenges.publicFromUrl();
        if (ch) { try { const j = await RBChallenges.loadPublic(ch); currentRbId = 0; setVis(0); setRoadbook(j.roadbook); } catch (e) { toast('Could not load challenge.'); } return; }
        const id = +(new URLSearchParams(location.search).get('rb') || 0);
        if (id && meUser) { const r = await apiPost({ action: 'rb_get', id }); if (r.ok && r.roadbook) { currentRbId = id; setVis(r.is_public ? 1 : 0); setRoadbook(r.roadbook); } }
    })();

    /* ---------- notas + selección ---------- */
    function renderNotes() {
        $('noteList').innerHTML = rb.notes.map((n, i) => {
            const rt = RB.ROAD_TYPES[n.road_type_out] || RB.ROAD_TYPES[3];
            return `<div class="note-mini ${i === sel ? 'sel' : ''}" data-i="${i}" style="--rt:${rt.color}">
                <span class="nn">${n.num}</span>
                <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${n.text ? esc(n.text) : '<span class="muted">(no text)</span>'}</span>
                <span class="muted small">${((n.distance ?? 0) / 1000).toFixed(1)}km</span>
            </div>`;
        }).join('');
        $('noteList').querySelectorAll('.note-mini').forEach((c) => c.onclick = () => select(+c.dataset.i));
        const nc = $('noteCount'); if (nc) nc.textContent = rb.notes.length ? '· ' + rb.notes.length : '';
        fillSplice();
    }
    function fillSplice() {
        if (!rb) return;
        const opt = (n) => `<option value="${n.num}">Note ${n.num}${n.text ? ' · ' + n.text.slice(0, 18) : ''}</option>`;
        const a = $('spliceA'), b = $('spliceB');
        if (a) a.innerHTML = rb.notes.map(opt).join('');
        if (b) { b.innerHTML = rb.notes.map(opt).join(''); b.value = rb.notes[rb.notes.length - 1].num; }
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
        if (!window.RBMap || !rb) return;
        if (!noteMap) {
            noteMap = new RBMap('noteMap', { zoom: 14 });
            // tapping another note on the map switches the one being edited, staying on the map
            noteMap.onWaypoint((i) => { sel = i; renderEditor(); canvas.setNote(rb.notes[i]); placeEditMarker(); });
        }
        noteMap.showRoadbook(rb, true);
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
            noteMap.showRoadbook(rb, true); placeEditMarker();
            renderNotes(); renderEditor(); canvas.setNote(rb.notes[sel]);
        });
    }
    function renderEditor() {
        const n = rb.notes[sel];
        const opts = (cur) => RT.map((l, k) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${l}</option>`).join('');
        $('editor').innerHTML = `
            <div class="ed-row"><label>Note ${n.num}</label><span class="muted small">${((n.distance ?? 0) / 1000).toFixed(2)} km · trip +${((n.partial_distance ?? 0) / 1000).toFixed(2)}</span></div>
            <div class="ed-row"><label>Text</label><input type="text" id="edText" value="${(n.text || '').replace(/"/g, '&quot;')}" placeholder="Description"></div>
            <div class="ed-row"><label>Road in</label><select id="edRin">${opts(n.road_type_in)}</select></div>
            <div class="ed-row"><label>Road out</label><select id="edRout">${opts(n.road_type_out)}</select></div>
            <div class="ed-row"><label>Red CAP</label><input type="checkbox" id="edCap" ${n.cap != null ? 'checked' : ''}> <span class="muted small">${n.cap != null ? Math.round(n.cap) + '° · ' + ((n.cap_distance || 0) / 1000).toFixed(2) + ' km' : 'off'}</span></div>`;
        $('edText').oninput = (e) => { n.text = e.target.value; renderNotes(); markDirty(); };
        $('edRin').onchange = (e) => { n.road_type_in = +e.target.value; renderNotes(); map.showRoadbook(rb); markDirty(); };
        $('edRout').onchange = (e) => { n.road_type_out = +e.target.value; renderNotes(); map.showRoadbook(rb); markDirty(); };
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
        map.showRoadbook(rb); select(Math.min(sel, rb.notes.length - 1));
    }
    function addWaypointNear(pt) {
        const idx = RB.nearestIdx(rb.track, pt);
        if (rb.notes.some((n) => n.idx === idx)) return toast('There is already a note here.');
        const tp = rb.track[idx];
        rb.notes.push({ num: 0, idx, distance: 0, partial_distance: 0, lat: tp.lat, lon: tp.lon, text: '', cap: null, cap_distance: null, bearing_in: 0, bearing_out: 0, road_type_in: 3, road_type_out: 3, junctions: null, icons: [] });
        RB.recomputeMetrics(rb); map.showRoadbook(rb); renderNotes(); markDirty();
        select(Math.max(0, rb.notes.findIndex((n) => n.idx === idx)));
        toast('Waypoint added.');
    }

    /* ---------- iconos (paleta estándar + tuyos, embebidos en el roadbook) ---------- */
    async function loadStd() { if (std) return std; try { std = await (await fetch('../assets/icons/index.json')).json(); } catch (e) { std = { categories: {} }; } return std; }
    async function renderIcons() {
        await loadStd();
        const lib = rb ? rb.icons || {} : {};
        const stdNames = new Set(Object.values(std.categories || {}).flat().map((x) => x.toLowerCase()));
        const custom = Object.keys(lib).filter((n) => !stdNames.has(n.toLowerCase()));
        let html = '';
        if (custom.length) html += `<div style="grid-column:1/-1" class="icat">Yours (in this roadbook)</div>` + custom.map((n) => iconBtn(n, lib[n], true)).join('');
        html += Object.entries(std.categories || {}).map(([cat, files]) => `<div style="grid-column:1/-1" class="icat">${cat}</div>` + files.map((f) => iconBtn(f, '../assets/icons/' + f, false)).join('')).join('');
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
    }
    const iconBtn = (name, src, rmv) =>
        `<button data-add="${name}" title="${name}" style="position:relative">${rmv ? `<span data-del="${name}" style="position:absolute;top:-6px;right:-6px;background:var(--track);color:#fff;border-radius:50%;width:18px;height:18px;line-height:18px;text-align:center;font-weight:800;cursor:pointer">×</span>` : ''}<img src="${src}" alt="" loading="lazy"></button>`;
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

    /* ---------- empalme (desvío / prolongación) ---------- */
    $('spliceOp').onchange = () => { $('spliceDev').style.display = $('spliceOp').value === 'dev' ? '' : 'none'; };
    $('spliceGpx').onclick = () => $('spliceFile').click();
    $('spliceFile').onchange = async (e) => { const f = e.target.files[0]; if (!f) return; try { spliceTrk = RB.parseGPX(await f.text()).trkpts; $('spliceInfo').textContent = spliceTrk.length + ' pts'; } catch (err) { toast('GPX: ' + err.message); } };
    $('spliceApply').onclick = () => {
        if (!rb) return toast('Load a roadbook.');
        if (!spliceTrk || spliceTrk.length < 2) return toast('Load the GPX to splice.');
        try {
            if ($('spliceOp').value === 'dev') deviation(rb, spliceTrk, +$('spliceA').value, +$('spliceB').value);
            else extension(rb, spliceTrk);
            RB.recomputeMetrics(rb); RB.recomputeCaps(rb); markDirty();
            map.showRoadbook(rb); renderNotes(); select(0); toast('Spliced · metrics recomputed.');
        } catch (err) { toast('Error: ' + err.message); }
    };
    function deviation(r, trk, a, b) {
        const A = r.notes.find((n) => n.num === a), B = r.notes.find((n) => n.num === b);
        if (!A || !B) throw new Error('Notes A/B not found'); if (A.idx >= B.idx) throw new Error('A must come before B');
        const nt = r.track.slice(0, A.idx + 1).concat(trk.map((p) => ({ lat: p.lat, lon: p.lon }))).concat(r.track.slice(B.idx));
        r.notes = r.notes.filter((n) => n.idx <= A.idx || n.idx >= B.idx); r.track = nt;
        r.notes.forEach((n) => n.idx = RB.nearestIdx(nt, { lat: n.lat, lon: n.lon }));
    }
    function extension(r, trk) {
        const nt = r.track.concat(trk.slice(1).map((p) => ({ lat: p.lat, lon: p.lon })));
        const last = r.notes[r.notes.length - 1], e = nt[nt.length - 1];
        r.track = nt; r.notes.forEach((n) => n.idx = RB.nearestIdx(nt, { lat: n.lat, lon: n.lon }));
        r.notes.push({ num: 0, idx: nt.length - 1, distance: 0, partial_distance: 0, lat: e.lat, lon: e.lon, text: '', cap: null, cap_distance: null, bearing_in: 0, bearing_out: 0, road_type_in: last ? last.road_type_out : 3, road_type_out: last ? last.road_type_out : 3, junctions: null, icons: [] });
    }

    /* ---------- export (self-contained .rdbk) ---------- */
    const slugify = (s) => (String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'roadbook');
    const stamp = () => { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()); };
    $('save').onclick = async () => { if (!rb) return toast('Nothing to save.'); stampMeta(); RB.recomputeMetrics(rb); RB.recomputeCaps(rb); await embedUsed(rb); download(rb, slugify(rb.meta?.title) + '_' + stamp() + '.rdbk'); exported = true; };
    // garantiza que TODOS los iconos usados estén embebidos (autocontenido) y poda los no usados
    async function embedUsed(r) {
        r.icons = r.icons || {};
        const used = new Set();
        r.notes.forEach((n) => (n.icons || []).forEach((ic) => used.add((ic.name || ic.file || '').split('/').pop())));
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
    const iconSrc = (ic) => RB.iconSrc(ic, rb, '../assets/icons/');
    let toastT = null;
    function toast(m) { const el = $('toast'); el.textContent = RBt(m); el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => el.hidden = true, 2500); }

    renderIcons();
})();
