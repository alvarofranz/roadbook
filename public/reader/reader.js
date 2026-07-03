'use strict';
/* RDBK Reader — the co-pilot's navigator: active note centred, odometer, live
 * CAP, manual/auto validation, penalty engine and a signed result QR. A run in
 * progress is checkpointed to localStorage on every fix/state change and offered
 * for resume on the next visit, so a call, a lock screen or an OS tab kill loses
 * nothing. GPS plumbing lives in RBGpsMeter; GPX logging in RBGpxRecorder. */
(function () {
    const $ = (id) => document.getElementById(id);
    const t = RBt, esc = RBesc, toast = RBToast; // shared helpers (app.js / i18n.js)
    const C = RB.CONST;

    // The Reader's dialogs are static markup; give them the shared focus trap
    // (focus in · Tab confined · Escape → the dialog's own cancel/close action).
    let modalTrap = null;
    function openModal(id, onEscape) { const el = $(id); el.hidden = false; if (modalTrap) modalTrap(); modalTrap = RBFocusTrap(el.querySelector('.modal-card'), onEscape || (() => {})); }
    function closeModal(id) { $(id).hidden = true; if (modalTrap) { modalTrap(); modalTrap = null; } }

    let rb = null, notes = [], activeIdx = 0, team = '0';
    let reached = new Set(); // indices actually validated — a passed-over note that is not in here was skipped
    let tripTotalM = 0, tripPartialM = 0;
    let curLimit = null, maxSpdSeg = 0;
    let armed = false, extraAccum = 0; // P_extra: overshoot-and-return
    let pen = { acc: 0, cap: 0, skip: 0, extra: 0, speed: 0 };
    let startedAt = null, endedAt = null, auto = false, meter = null, paused = false;
    let showMap = true; // per-note map button
    let scoredSet = null; // indices inside a start→finish scored section (null = no markers → whole roadbook is scored)
    let inlineMap = null, inlineMapIdx = -1; // the one interactive per-note map currently open (RBMap)
    // Auto-validation: a note is reached the moment you enter its detection radius — you've
    // arrived, so it validates immediately (no waiting to overshoot it). The reach is a per-note
    // gate, capped to half the smaller gap to a neighbour (so two notes' reaches can't overlap →
    // clustered notes still validate one at a time) and floored above GPS noise.
    const REACH_MIN_M = 18; // reach gate floor (never demand sub-GPS precision). The reach itself is the note's detection radius (RB.detectionRadius), capped by neighbour spacing.
    let lastPayload = '', lastQrUrl = '';
    // session checkpoint: live counters (small, written constantly) + the roadbook (written once at start)
    const SESSION_KEY = 'rb_session', SESSION_RB_KEY = 'rb_session_roadbook';

    /* ---------- startup ---------- */
    $('pickRb').onclick = () => $('rbFile').click();
    RBFullscreen($('odoFs')); // fullscreen toggle in the odometer bar (hides the site header + footer)
    $('rbFile').onchange = async (e) => { const f = e.target.files[0]; if (f) try { loadRb(JSON.parse(await f.text())); } catch (err) { toast('Could not load the roadbook.'); } };
    $('pickChallenge').onclick = () => RBChallenges.pick((r) => loadRb(r));
    // "Load one of your RBs": shown only when signed in; a picker of the user's saved roadbooks.
    RBApi('config').then((c) => { if (c && c.user) $('pickMine').hidden = false; }).catch(() => {});
    $('pickMine').onclick = async () => {
        const r = await RBApi('rb_list');
        const list = (r.ok && r.roadbooks) || [];
        if (!list.length) return toast('No roadbooks yet.');
        const rows = list.map((rb) => `<button type="button" class="challenge-row" data-id="${rb.id}"><span class="grow"><b>${esc(rb.title)}</b></span><small class="muted">${RBSummary(rb.total_distance, rb.note_count)}</small></button>`).join('');
        const d = RBModal(`<h2><i class="fa-solid fa-book icon-accent"></i> ${t('Your roadbooks')}</h2><div class="challenge-list">${rows}</div>`, 'wide');
        d.el.querySelectorAll('[data-id]').forEach((b) => b.onclick = async () => {
            d.close();
            const j = await RBApi('rb_get', { id: +b.dataset.id });
            if (j.ok && j.roadbook) loadRb(j.roadbook); else toast(j.error || 'Could not load the roadbook.');
        });
    };
    RBGpxRecorder.init({ toast, onChange: (recording) => { // recording = an unmistakable red STOP button
        const b = $('navGpx');
        b.classList.toggle('btn-danger', recording);
        b.innerHTML = recording ? '<i class="fa-solid fa-stop"></i> GPX' : '<i class="fa-solid fa-circle-dot"></i> GPX';
        saveSession();
    } });
    // Resume an interrupted run first; otherwise fall back to a challenge passed
    // in the URL, then to rescuing an orphaned GPX recording.
    (async function () {
        let session; try { session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (e) {}
        let savedRb = null;
        if (session && session.pen) {
            try { savedRb = JSON.parse(localStorage.getItem(SESSION_RB_KEY) || 'null'); } catch (e) {}
            if (!savedRb || !savedRb.notes) session = null;
        } else session = null;
        if (!session) clearSession(); // an unrecoverable checkpoint is just litter
        // A roadbook opened explicitly via the URL (e.g. the challenge "Navigate" button → /reader/<slug>).
        const pub = RBChallenges.publicFromUrl();
        const rbId = +(new URLSearchParams(location.search).get('rb') || 0); // open a personal (private) roadbook by id — owner only (#71)
        const loadFromUrl = () => {
            if (pub) RBChallenges.loadPublic(pub).then((j) => loadRb(j.roadbook)).catch(() => toast('Could not load challenge.'));
            else if (rbId > 0) RBApi('rb_get', { id: rbId }).then((j) => { if (j.ok && j.roadbook) loadRb(j.roadbook); else toast(j.error || 'Could not load the roadbook.'); }).catch(() => toast('Could not load the roadbook.'));
        };
        if (session) {
            const what = esc((savedRb.meta && savedRb.meta.title) || 'Roadbook') + ' · ' + session.activeIdx + '/' + savedRb.notes.length + ' ' + t('notes');
            // Declining does NOT delete the session — a mis-tap must never destroy a
            // run; it is replaced when a new run starts or cleared on explicit exit.
            // Its GPX log (if any) stays with it, so skip the recovery prompt too.
            if (await RBConfirm(t('Resume the run in progress?') + '<br><b>' + what + '</b> · ' + (session.totalM / 1000).toFixed(2) + ' km', t('Resume'))) { resumeSession(session, savedRb); return; }
            loadFromUrl(); // declined → still navigate the roadbook the user explicitly opened
            return;
        }
        await RBGpxRecorder.offerRecovery();
        loadFromUrl();
    })();
    // File Handling API (installed PWA): open a .rdbk straight from the OS.
    if ('launchQueue' in window && window.LaunchParams) {
        launchQueue.setConsumer(async (params) => {
            if (!params.files || !params.files.length) return;
            try { loadRb(JSON.parse(await (await params.files[0].getFile()).text())); } catch (e) {}
        });
    }

    let competition = false;
    const eventSlug = new URLSearchParams(location.search).get('event'); // opened from an event → mode is dictated (#155)
    let eventMode = null; // 'trip' | 'competition' when the event locks the choice
    function loadRb(r) {
        r = RB.importRoadbook(r); // canonical schema (so pre-standard Italian files open here too)
        if (!r.notes.length) return toast('Roadbook has no notes.');
        rb = r; notes = r.notes;
        // "Map access from player" is a roadbook-level setting (default allowed when absent)
        $('optMap').checked = mapAllowed();
        $('optMapRow').hidden = !mapAllowed();
        openModeModal();
    }
    // Usage-mode modal. For a roadbook opened from an event (?event=<slug>) the organizer's mode is
    // fetched from the public event and the Trip/Competition choice is locked to it (#155).
    async function openModeModal() {
        applyModeLock(null);
        openModal('modeModal', () => closeModal('modeModal')); // Esc dismisses → back to the load screen
        if (!eventSlug) return;
        try {
            const j = await RBApi('event_get', { slug: eventSlug });
            const rbSlug = location.pathname.replace(/\/+$/, '').split('/').pop();
            const er = j.ok && (j.roadbooks || []).find((x) => x.slug === rbSlug);
            if (er) applyModeLock(er.scoring_mode && er.scoring_mode !== 'free' ? 'competition' : 'trip');
        } catch (e) { /* no event mode → keep the free choice */ }
    }
    function applyModeLock(mode) {
        eventMode = mode;
        $('modeGrid').hidden = !!mode;
        $('modeLocked').hidden = !mode;
        if (mode) $('modeLockedTxt').textContent = t('Mode set by the event:') + ' ' + t(mode === 'competition' ? 'Competition mode' : 'Trip mode');
    }
    const mapAllowed = () => !(rb && rb.meta && rb.meta.map_access === false);
    let optGpx = false, sound = true, audioCtx = null;
    function readModeOpts() {
        // Advancement starts on Automatic (GPS); the nav-screen Auto switch toggles it during the run.
        auto = true; showMap = $('optMap').checked && mapAllowed(); optGpx = $('optGpx').checked; sound = $('optSound').checked;
    }
    // Short beep when a note is reached (WebAudio — no asset, CSP-safe). The context is created
    // on the start tap (a user gesture) so it can later sound on a GPS auto-validation.
    function beep() {
        if (!sound) return;
        try {
            audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
            const o = audioCtx.createOscillator(), g = audioCtx.createGain(), t0 = audioCtx.currentTime;
            o.type = 'sine'; o.frequency.value = 880; o.connect(g); g.connect(audioCtx.destination);
            g.gain.setValueAtTime(0.15, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
            o.start(t0); o.stop(t0 + 0.2);
        } catch (e) { /* audio unavailable */ }
    }
    const startTrip = () => { readModeOpts(); closeModal('modeModal'); startNav(false); if (optGpx) RBGpxRecorder.begin(); };
    const startComp = () => {
        readModeOpts(); closeModal('modeModal'); $('teamInput').value = '1';
        openModal('teamModal', () => $('teamCancel').click());
        setTimeout(() => $('teamInput').select(), 60);
    };
    $('modeTrip').onclick = startTrip;
    $('modeComp').onclick = startComp;
    $('modeLockedStart').onclick = () => (eventMode === 'competition' ? startComp() : startTrip());
    $('teamOk').onclick = () => { team = ($('teamInput').value || '1').replace(/\D/g, '').slice(0, 3) || '1'; closeModal('teamModal'); startNav(true); if (optGpx) RBGpxRecorder.begin(); };
    $('teamCancel').onclick = () => { closeModal('teamModal'); openModal('modeModal'); };
    $('teamInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('teamOk').click(); });
    function startNav(comp) {
        competition = comp; window.RB_BUSY = true; // don't auto-refresh mid-run
        if (sound) { try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); audioCtx.resume(); } catch (e) {} } // unlock audio on this user gesture
        buildScored();
        $('loadScreen').hidden = true; $('navScreen').hidden = false;
        $('finishBtn').hidden = !comp;
        syncAutoBtn();
        $('validateBtn').innerHTML = `<i class="fa-solid fa-circle-check"></i> ${esc(t(comp ? 'Validate' : 'Note done'))}`;
        $('navGpx').hidden = !optGpx;
        $('navTitle').textContent = (rb.meta && rb.meta.title) || 'Roadbook';
        const odoLogo = $('odoLogo'); if (rb.meta && rb.meta.logo) { odoLogo.src = rb.meta.logo; odoLogo.hidden = false; } else { odoLogo.hidden = true; }
        try { localStorage.setItem(SESSION_RB_KEY, JSON.stringify(rb)); } catch (e) {} // roadbook stored once; live counters checkpoint separately
        renderNotes();
        paused = false; updatePauseBtn();
        meter = new RBGpsMeter(onFix, () => setGps('bad'));
        setInterval(() => { const now = new Date(); $('odoClock').textContent = pad(now.getHours(), 2) + ':' + pad(now.getMinutes(), 2); }, 1000);
        startBattery();
    }
    // battery charge in the indicator row (best-effort; not all browsers expose the API)
    const battIcon = (p) => p > 80 ? 'fa-battery-full' : p > 55 ? 'fa-battery-three-quarters' : p > 30 ? 'fa-battery-half' : p > 10 ? 'fa-battery-quarter' : 'fa-battery-empty';
    function startBattery() {
        if (!('getBattery' in navigator)) { $('odoBatt').textContent = 'N/A'; return; }
        try {
            navigator.getBattery().then((b) => {
                const upd = () => { const p = Math.round(b.level * 100); $('odoBatt').textContent = p + '%'; $('odoBattIcon').className = 'fa-solid ' + (b.charging ? 'fa-bolt' : battIcon(p)); };
                ['levelchange', 'chargingchange'].forEach((e) => b.addEventListener(e, upd)); upd();
            }).catch(() => {});
        } catch (e) {}
    }

    /* ---------- session checkpoint: survive reloads and OS tab kills ---------- */
    function saveSession() {
        if (!meter) return; // nothing to checkpoint until a run starts
        const s = { competition, team, auto, showMap, sound, gpxOption: optGpx, gpxRecording: RBGpxRecorder.recording, gpxFileName: RBGpxRecorder.fileName, activeIdx, reached: [...reached], totalM: tripTotalM, partialM: tripPartialM, pen, curLimit, maxSpdSeg, extraAccum, armed, startedAt: startedAt ? startedAt.getTime() : null, endedAt: endedAt ? endedAt.getTime() : null };
        try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch (e) {}
    }
    function clearSession() { try { localStorage.removeItem(SESSION_KEY); localStorage.removeItem(SESSION_RB_KEY); } catch (e) {} }
    function resumeSession(s, savedRb) {
        tripTotalM = s.totalM; tripPartialM = s.partialM;
        rb = savedRb; notes = rb.notes;
        team = s.team; auto = s.auto; showMap = s.showMap && mapAllowed(); optGpx = s.gpxOption; sound = s.sound !== false;
        activeIdx = s.activeIdx; reached = new Set(s.reached); pen = s.pen; curLimit = s.curLimit; maxSpdSeg = s.maxSpdSeg;
        extraAccum = s.extraAccum; armed = s.armed;
        startedAt = s.startedAt ? new Date(s.startedAt) : null;
        endedAt = s.endedAt ? new Date(s.endedAt) : null;
        startNav(s.competition);
        if (s.gpxRecording) RBGpxRecorder.resume(s.gpxFileName);
    }

    /* ---------- GPS (RBGpsMeter drives one onFix per position) ---------- */
    function onFix(fix) {
        const { here, coords, disp, speedKmh } = fix;
        setGps(coords.accuracy <= 25 ? 'ok' : 'bad', Math.round(coords.accuracy));
        tripTotalM += disp; tripPartialM += disp;
        RBGpxRecorder.feed(coords, here, fix.tnow);
        if (curLimit && curLimit > 0 && speedKmh > curLimit) maxSpdSeg = Math.max(maxSpdSeg, speedKmh);
        const an = notes[activeIdx];
        if (an) {
            const dist = RB.geo.haversineM(here, an);
            // P_extra: armed on entering the 100 m radius; moving away again accumulates the overshoot
            if (dist <= C.MANUAL_RADIUS_M) armed = true;
            else if (armed) extraAccum += disp;
            if (auto) autoAdvance(dist, here);
        }
        // top odometer bar
        $('odoTotal').textContent = (tripTotalM / 1000).toFixed(2);
        $('odoPartial').textContent = (tripPartialM / 1000).toFixed(2);
        // bearing readout (to the next note, else device heading) + a directional arrow
        // that points relative to where you're pointing: 0° = up = straight ahead.
        const brg = an ? RB.geo.bearingDeg(here, an) : meter.heading;
        $('odoBrg').textContent = brg == null ? '—°' : pad(Math.round(brg), 3) + '°';
        const relBrg = brg == null ? 0 : (an ? ((brg - (meter.heading != null ? meter.heading : 0)) + 360) % 360 : 0);
        $('odoBrgArrow').style.setProperty('--cap-rotation', relBrg + 'deg');
        updateCapBar(here);
        saveSession();
    }
    function setGps(state, acc) { $('gpsDot').className = 'gps-dot ' + (state === 'ok' ? 'ok' : 'bad'); $('gpsTxt').textContent = acc != null ? '±' + acc + ' m' : t('GPS lost'); }
    // The active note's reach gate: capped to half the smaller along-track gap to a neighbour
    // (partial_distance is the metres from the previous note) so reaches never overlap, then
    // floored above GPS noise. Dense rally notes get a tight gate; spread-out trails get the cap.
    function reachRadius(i) {
        const base = RB.detectionRadius(notes[i], rb && rb.meta); // the note's radius from the roadbook (per-note → roadbook default → type default → 30 m)
        const gapPrev = notes[i].partial_distance || Infinity;
        const gapNext = notes[i + 1] ? (notes[i + 1].partial_distance || Infinity) : Infinity;
        return Math.max(REACH_MIN_M, Math.min(base, Math.min(gapPrev, gapNext) / 2));
    }
    // Auto-validation on arrival: the moment the current fix is within the active note's reach,
    // the note is reached → validate against that fix. Immune to the cascade since reaches can't
    // overlap (reachRadius caps to half the neighbour gap), so the next note's gate only opens
    // once this one advances. renderNotes() happens inside validateAt.
    function autoAdvance(dist, here) {
        if (dist <= reachRadius(activeIdx)) validateAt(activeIdx, here);
    }

    /* ---------- navigation: notes ---------- */
    const iconSrc = (ic) => RB.iconSrc(ic, rb, '../assets/icons/');
    // Paper-style 4-column rows: total/partial+number | vignette | comments | buttons.
    // reached = green · skipped (passed over, never reached) = pink · active = red border ·
    // upcoming = white · ≤50 m to next = blue.
    const fkm = (m) => ((m ?? 0) / 1000).toFixed(2);
    const CAP_TYPE_LABEL = { average: 'Average', calculated: 'Calculated', turning: 'Turning' }; // exit = the plain CAP, no qualifier
    let lastScrollIdx = -1;
    function renderNotes() {
        closeInlineMap(); // the list HTML is rebuilt wholesale — tear the GL map down cleanly first
        $('noteList').innerHTML = notes.map((n, i) => {
            const cls = ['nrow'];
            if (reached.has(i)) cls.push('done'); else if (i < activeIdx) cls.push('skipped');
            if (i === activeIdx) cls.push('active');
            const close = notes[i + 1] && (notes[i + 1].partial_distance ?? 1e9) < 50 ? ' close' : '';
            const capQual = n.cap != null && CAP_TYPE_LABEL[n.cap_type] ? ' · ' + esc(t(CAP_TYPE_LABEL[n.cap_type])) : '';
            const cap = n.cap != null ? `<div class="note-cap">CAP ${Math.round(n.cap)}°${n.cap_distance != null ? ' · ' + fkm(n.cap_distance) + ' km' : ''}${capQual}</div>` : '';
            const speed = n.speed_limit != null ? `<div class="note-speed">${n.speed_limit === 0 ? `<span class="lim lifted">${esc(t('END'))}</span>` : `<span class="lim">${n.speed_limit}</span>`}</div>` : '';
            const reach = (!auto && i === activeIdx) ? `<button class="note-button reach" data-reach="${i}" title="${t('Note reached')}"><i class="fa-solid fa-check"></i></button>` : '';
            const mapb = showMap ? `<button class="note-button" data-map="${i}" title="${t('Open on map')}"><i class="fa-solid fa-map-location-dot"></i></button>` : '';
            return `<div class="${cls.join(' ')}" data-i="${i}">
                <div class="col-distance${close}"><div class="total">${fkm(n.distance)}</div><div class="partial">+${fkm(n.partial_distance)}</div><div class="num-row"><span class="num">${n.num}</span>${RB.wpBadgeSVG(n.wp_type, 22)}</div></div>
                <div class="col-vignette">${NoteCanvas.toSVG(n, iconSrc)}</div>
                <div class="col-text"><div class="text">${esc(n.text || '')}</div>${cap}${speed}<div class="coords">${(+n.lat).toFixed(5)}, ${(+n.lon).toFixed(5)}</div></div>
                <div class="col-buttons">${reach}${mapb}</div>
            </div><div class="nmap" id="nmap${i}" hidden></div>`;
        }).join('');
        $('noteList').querySelectorAll('[data-reach]').forEach((b) => b.onclick = (e) => { e.stopPropagation(); markReached(+b.dataset.reach); });
        $('noteList').querySelectorAll('[data-map]').forEach((b) => b.onclick = (e) => { e.stopPropagation(); toggleNoteMap(+b.dataset.map); });
        $('noteList').querySelectorAll('.nrow').forEach((c) => c.onclick = () => tapNote(+c.dataset.i));
        // only recentre when the active note actually changed (not on every redraw)
        if (activeIdx !== lastScrollIdx) { lastScrollIdx = activeIdx; const act = $('noteList').querySelector('.nrow.active'); if (act) act.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
        updateCapBar();
        saveSession();
    }
    // One interactive map at a time: zoom buttons + satellite/topo toggle (RBMap),
    // centred on the note at zoom ~13, with the whole route + pins for context.
    function toggleNoteMap(i) {
        if (inlineMapIdx === i) { closeInlineMap(); return; } // tapping the open one closes it
        closeInlineMap();
        if (!window.maplibregl) return toast('Map not configured.');
        const el = $('nmap' + i); if (!el) return;
        const n = notes[i];
        el.innerHTML = '<div id="nmapMap" class="rb-inline-map"></div>';
        el.hidden = false; inlineMapIdx = i;
        inlineMap = new RBMap('nmapMap', { zoom: 13, center: [+n.lon, +n.lat], layerToggle: true });
        inlineMap.showRoadbook(rb, true); // no auto-fit: keep our centre on this note
        inlineMap.select(n, true);        // highlight the note
    }
    function closeInlineMap() {
        if (inlineMap) { inlineMap.destroy(); inlineMap = null; }
        if (inlineMapIdx >= 0) { const el = $('nmap' + inlineMapIdx); if (el) { el.hidden = true; el.innerHTML = ''; } inlineMapIdx = -1; }
    }
    // Bottom CAP bar: heading to hold (prev note's CAP) · speed · live distance to
    // destination · direction arrow. Appears only while a CAP is active.
    function updateCapBar(here) {
        const bar = $('capbar'), an = notes[activeIdx], prev = notes[activeIdx - 1];
        if (!prev || prev.cap == null || !an) { bar.hidden = true; return; }
        bar.hidden = false;
        $('capHeading').textContent = Math.round(prev.cap) + '°';
        $('capSpeed').textContent = meter && meter.speedKmh ? Math.round(meter.speedKmh) + ' km/h' : '--';
        if (here) {
            const dist = RB.geo.haversineM(here, an);
            $('capDist').textContent = dist >= 1000 ? (dist / 1000).toFixed(2) + ' km' : Math.round(dist) + ' m';
            const rel = ((prev.cap - (meter.heading != null ? meter.heading : 0)) + 360) % 360;
            $('capArrow').style.setProperty('--cap-rotation', (rel - 45) + 'deg'); // data-driven arrow direction
        }
    }
    // "Note reached" button: advance sequentially and mark green (both modes).
    function markReached(i) {
        if (competition) { tapNote(i); return; } // scored validation
        reached.add(i); tripPartialM = 0; beep();
        if (notes[i].distance != null) tripTotalM = notes[i].distance;
        activeIdx = i + 1; renderNotes();
    }
    // Scored sections (rally special stages): only notes between a START icon and the
    // next FINISH icon (both inclusive) are penalised; the liaison/transfer notes
    // outside them are not. A roadbook with no START marker is scored end to end.
    const START_ICON = 'I02_partenza.png', FINISH_ICON = 'I01_arrivo.png';
    const hasIcon = (n, name) => (n.icons || []).some((ic) => ic.name === name);
    function buildScored() {
        if (!notes.some((n) => hasIcon(n, START_ICON))) { scoredSet = null; return; }
        scoredSet = new Set();
        let inStage = false;
        notes.forEach((n, i) => { if (hasIcon(n, START_ICON)) inStage = true; if (inStage) scoredSet.add(i); if (hasIcon(n, FINISH_ICON)) inStage = false; });
    }
    const isScored = (i) => scoredSet === null || scoredSet.has(i);

    function tapNote(i) {
        if (!competition) { activeIdx = i; tripPartialM = 0; renderNotes(); return; } // Trip mode: free navigation, no scoring
        if (i < activeIdx) return;
        // Manual tracking works with NO GPS at all; when a fix IS present, keep the
        // 100 m proximity gate so a validation can't be faked far from the note.
        const here = meter && meter.lastPos;
        if (here && RB.geo.haversineM(here, notes[i]) > C.MANUAL_RADIUS_M) return toast(t('Too far from note') + ' ' + notes[i].num);
        if (i > activeIdx) { // overshoot belonged to the skipped notes — only count skips inside a scored section
            let skips = 0; for (let k = activeIdx; k < i; k++) if (isScored(k)) skips++;
            pen.skip += C.P_SKIP * skips; extraAccum = 0; armed = false;
        }
        validateAt(i, here || null);
    }
    function validateAt(i, here) {
        const n = notes[i], now = new Date();
        if (startedAt == null) startedAt = now; // first validated note starts the clock (even if note 0 was skipped)
        endedAt = now;
        // Penalties accrue only inside a start→finish section, and only the
        // position-based ones (accuracy/CAP) when an actual GPS fix is available —
        // a manual run with no GPS simply has nothing to measure against.
        const scored = isScored(i);
        if (scored && here && i > 0) pen.acc += RB.geo.haversineM(here, n);
        const prev = notes[i - 1];
        if (scored && here && prev && prev.cap != null && prev.cap_distance != null) {
            const tgt = RB.geo.destPoint(prev.lat, prev.lon, prev.cap, prev.cap_distance);
            pen.cap += RB.geo.haversineM(here, tgt);
        }
        if (scored) pen.extra += extraAccum;
        extraAccum = 0; armed = false;
        const lim = RB.speedLimitOfNote(n);
        if (lim != null) { if (scored && curLimit && curLimit > 0 && maxSpdSeg > curLimit) pen.speed += C.P_SPEED_PER_KMH * (Math.floor(maxSpdSeg) - curLimit); curLimit = lim === 0 ? null : lim; maxSpdSeg = 0; }
        reached.add(i); tripPartialM = 0; beep();
        if (n.distance != null) tripTotalM = n.distance; // keep the total synced with the notes' cumulative distance (absorbs GPS drift / different trajectories)
        activeIdx = i + 1; renderNotes();
        if (activeIdx >= notes.length) toast('Last note validated! Tap Finish.');
    }
    $('validateBtn').onclick = () => {
        if (competition) { if (activeIdx < notes.length) tapNote(activeIdx); }
        else if (activeIdx < notes.length) markReached(activeIdx);
    };
    // The auto-advance control is a toggle SWITCH: the knob position shows the current state
    // (on = GPS validates notes automatically), so it never reads as "press to set to the label".
    const syncAutoBtn = () => { $('autoBtn').classList.toggle('on', auto); $('autoBtn').setAttribute('aria-checked', String(auto)); };
    $('autoBtn').onclick = () => { auto = !auto; syncAutoBtn(); renderNotes(); };
    // re-render the translated note rows when the language changes mid-session
    window.addEventListener('rb-lang', () => { if (notes.length && !$('navScreen').hidden) renderNotes(); });
    // Pause: stop the GPS watch and release the wake lock to save battery (e.g. a lunch
    // stop). Resume restarts the same meter. The odometer simply doesn't move while paused.
    function updatePauseBtn() {
        const lbl = t(paused ? 'Resume' : 'Pause');
        $('pauseBtn').innerHTML = `<i class="fa-solid fa-${paused ? 'play' : 'pause'}"></i> ${esc(lbl)} RB`; // "RB" makes clear it pauses the roadbook run, not the GPX recording
        $('pauseBtn').title = lbl; $('pauseBtn').setAttribute('aria-label', lbl);
        $('pauseBtn').classList.toggle('btn-primary', paused);
    }
    $('pauseBtn').onclick = () => {
        if (!meter) return;
        paused = !paused;
        if (paused) { meter.stop(); setGps('bad'); $('gpsTxt').textContent = t('Paused'); } else meter.resume();
        updatePauseBtn();
    };
    // End navigation: leave the run and return to the load screen. The note progress
    // (reached/skipped) is discarded — warn before doing it.
    $('endBtn').onclick = async () => {
        if (await RBConfirmDanger(t('End navigation? Your progress on the notes will be lost.'), t('End navigation'))) { clearSession(); location.href = '../'; } // back to the home page, not the load screen
    };
    $('navGpx').onclick = () => { if (RBGpxRecorder.recording) RBGpxRecorder.stop(); else RBGpxRecorder.settings(); };

    /* ---------- finish → signed META + QR ---------- */
    $('finishBtn').onclick = finish;
    async function finish() {
        // the open segment's speed penalty stays local so Finish is idempotent (re-tap, or resume + re-finish)
        const penSpeed = pen.speed + ((curLimit && curLimit > 0 && maxSpdSeg > curLimit) ? C.P_SPEED_PER_KMH * (Math.floor(maxSpdSeg) - curLimit) : 0);
        const km = Math.round(tripTotalM / 1000 * 10);
        const durH = startedAt && endedAt ? (endedAt - startedAt) / 3600000 : 0;
        const avg = durH > 0 ? Math.round((tripTotalM / 1000 / durH) * 10) : 0;
        const meta = RB.buildMeta({
            team, date: ddmmyy(endedAt || new Date()), start: hhmmss(startedAt), end: hhmmss(endedAt),
            accuracy: Math.min(9999, Math.round(pen.acc)), skip: Math.min(9999, pen.skip), extra: Math.min(9999, Math.round(pen.extra)),
            cap: Math.min(9999, Math.round(pen.cap)), speed: Math.min(9999, penSpeed), km: Math.min(99999, km), avg: Math.min(999, avg),
        });
        lastPayload = await RB.signMeta(meta, (window.RB_CONFIG || {}).signKey);
        const qr = qrcode(0, 'M'); qr.addData(lastPayload); qr.make();
        lastQrUrl = qr.createDataURL(6, 2);
        $('qrImg').innerHTML = `<img src="${lastQrUrl}" alt="QR" class="qr-image">`;
        $('qrMeta').textContent = lastPayload;
        $('qrStats').innerHTML = `${esc(t('Vehicle'))} <b>${team}</b> · ${km / 10} km<br>${esc(t('Accuracy'))} ${Math.round(pen.acc)} · ${esc(t('Skips'))} ${pen.skip} · ${esc(t('Extra'))} ${Math.round(pen.extra)} · CAP ${Math.round(pen.cap)} · ${esc(t('Speed'))} ${penSpeed} ${esc(t('pts'))}`;
        openModal('qrModal', () => $('qrClose').click());
    }
    $('qrClose').onclick = () => closeModal('qrModal');
    $('qrDownload').onclick = () => RBDownload(lastQrUrl, 'RB_' + team + '_' + ddmmyy(new Date()) + '.png');
    $('qrShare').onclick = async () => {
        try {
            const blob = await (await fetch(lastQrUrl)).blob();
            const file = new File([blob], 'RB_' + team + '.png', { type: 'image/png' });
            if (navigator.canShare && navigator.canShare({ files: [file] })) return navigator.share({ files: [file], title: 'RDBK.app result', text: lastPayload });
            if (navigator.share) return navigator.share({ title: 'RDBK.app result', text: lastPayload });
            toast('Sharing not supported here — use Save QR.');
        } catch (e) { /* user cancelled */ }
    };

    /* ---------- utils ---------- */
    const pad = (n, w) => String(n).padStart(w, '0');
    const ddmmyy = (d) => d ? pad(d.getDate(), 2) + pad(d.getMonth() + 1, 2) + pad(d.getFullYear() % 100, 2) : '000000';
    const hhmmss = (d) => d ? pad(d.getHours(), 2) + pad(d.getMinutes(), 2) + pad(d.getSeconds(), 2) : '000000';
})();
