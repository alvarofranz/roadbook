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
    // Comment notes (note_kind 'comment') are coordinate-less and non-navigational: the active
    // cursor must always skip over them, else onFix reads a note with no lat/lon and auto-advance
    // stalls forever on a NaN distance. nextNav/prevNav resolve the nearest real note each way.
    const nextNav = (i) => { while (i < notes.length && RB.isComment(notes[i])) i++; return i; };
    const prevNav = (i) => { while (i >= 0 && notes[i] && RB.isComment(notes[i])) i--; return i; };
    let reached = new Set(); // indices actually validated — a passed-over note that is not in here was skipped
    let tripTotalM = 0, tripPartialM = 0;
    let curLimit = null, maxSpdSeg = 0;
    let armed = false, extraAccum = 0; // P_extra: overshoot-and-return
    let pen = { acc: 0, cap: 0, skip: 0, extra: 0, speed: 0 };
    let startedAt = null, endedAt = null, auto = false, meter = null, paused = false;
    let showMap = true; // per-note map button
    let preview = false; // roadbook opened but navigation not started yet (read-only look)
    let scoredSet = null; // indices inside a start→finish scored section (null = no markers → whole roadbook is scored)
    let inlineMap = null, inlineMapIdx = -1; // the one interactive per-note map
    let lastHere = null, lastAcc = null;     // last TRUSTED position + its accuracy — what every distance is measured from
    let lastPayload = '', lastQrUrl = '';
    let meUser = null; // #146: public roadbooks open in the Reader only for signed-in users
    const rbSlug = location.pathname.replace(/\/+$/, '').split('/').pop(); // roadbook slug from URL
    // session checkpoint: live counters (small, written constantly) + the roadbook (written once at start)
    const SESSION_KEY = 'rb_session', SESSION_RB_KEY = 'rb_session_roadbook';

    /* ---------- startup ---------- */
    $('pickRb').onclick = () => $('rbFile').click();
    RBFullscreen($('odoFs')); // fullscreen toggle in the odometer bar (hides the site header + footer)
    $('rbFile').onchange = async (e) => { const f = e.target.files[0]; if (f) try { loadRb(await RBZip.readRdbk(f)); } catch (err) { toast('Could not load the roadbook.'); } };
    // Public roadbook gallery, inline on the load screen (below the "Open from" card). Each card
    // links to /reader/<slug> — the same deep link the Navigate button uses — so opening one just
    // navigates here with the slug, where the startup below loads it (sign-in gate included).
    (function publicGallery() {
        const grid = $('readerGallery'); if (!grid) return;
        RBChallenges.listPublic().then((rbs) => {
            if (rbs === null) { grid.innerHTML = `<p class="gallery-empty">${t('Could not load.')}</p>`; return; }
            if (!rbs.length) { grid.innerHTML = `<p class="gallery-empty">${t('No public roadbooks yet.')}</p>`; return; }
            grid.innerHTML = rbs.map((r) => RBGalleryCard({
                href: RBChallenges.ROOT + 'reader/' + encodeURIComponent(r.slug),
                thumb: r.thumb, title: r.title,
                meta: '@' + esc(r.username) + ' · ' + RBSummary(r.total_distance, r.note_count),
            })).join('');
        });
    })();
    // "Load one of your RBs": shown only when signed in; a picker of the user's saved roadbooks.
    // #146: the same config load also tells us whether public roadbooks may be opened at all.
    let evCtx = null;
    const cfgReady = RBApi('config').then((c) => { meUser = !!(c && c.user); if (meUser) $('pickMine').hidden = false; evCtx = (c && c.participant) || null; }).catch(() => {});
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
        await cfgReady; // #146: know sign-in state before deciding to open a public roadbook
        RBWebGpsWarn(); // browser-only floating warning: web GPS is unreliable on phones
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
        const adminRbId = +(new URLSearchParams(location.search).get('admin_rb') || 0); // admins: open any user's roadbook (admin panel "View")
        const loadFromUrl = () => {
            if (pub) {
                if (!meUser) return RBNeedAuth('Sign in to read public roadbooks.');
                RBChallenges.loadPublic(pub).then((j) => { loadRb(j.roadbook); if (eventSlug) openModeModal(); }).catch(() => toast('Could not load challenge.'));
            } else if (rbId > 0) {
                RBApi('rb_get', { id: rbId }).then((j) => { if (j.ok && j.roadbook) { loadRb(j.roadbook); if (eventSlug) openModeModal(); } else toast(j.error || 'Could not load the roadbook.'); }).catch(() => toast('Could not load the roadbook.'));
            } else if (adminRbId > 0) {
                RBApi('admin_rb_get', { id: adminRbId }).then((j) => { if (j.ok && j.roadbook) loadRb(j.roadbook); else toast(j.error || 'Could not load the roadbook.'); }).catch(() => toast('Could not load the roadbook.'));
            }
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
            try { loadRb(await RBZip.readRdbk(await params.files[0].getFile())); } catch (e) {}
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
        showPreview();
    }
    // Preview an opened roadbook read-only, BEFORE choosing a mode — you might just want to look.
    // No GPS, no active-note highlighting; the bottom tab bar stays (not immersive). The sticky
    // "Navigate" CTA is what opens the mode chooser and starts the actual navigation.
    function showPreview() {
        preview = true;
        document.body.classList.remove('rb-immersive');
        document.body.classList.add('rb-preview');
        showMap = mapAllowed();
        $('loadScreen').hidden = true; $('navScreen').hidden = false;
        $('previewTitle').textContent = (rb.meta && rb.meta.title) || t('Roadbook');
        renderNotes();
        window.scrollTo(0, 0);
    }
    // Usage-mode modal. For a roadbook opened from an event (?event=<slug>) the organizer's mode is
    // fetched from the public event and the Trip/Competition choice is locked to it (#155).
    async function openModeModal() {
        applyModeLock(null);
        $('optRemote').checked = remoteEnabled(); syncRemoteRow(); // the device's remote preference, remembered across runs
        openModal('modeModal', () => closeModal('modeModal')); // Esc dismisses → back to the load screen
        if (!eventSlug) return;
        try {
            const j = await RBApi('event_get', { slug: eventSlug });
            const rbId = +(new URLSearchParams(location.search).get('rb') || 0);
            const er = j.ok && (j.roadbooks || []).find((x) => x.slug === rbSlug || (rbId && x.id === rbId));
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
    const startTrip = async () => {
        if (!(await RBWebGpsConfirm(false))) return; // one-time browser warning before navigation
        readModeOpts(); closeModal('modeModal'); startNav(false); if (optGpx) RBGpxRecorder.begin();
    };
    const startComp = async () => {
        if (!(await RBWebGpsConfirm(true))) return; // stronger warning: a scored run depends on GPS
        readModeOpts(); closeModal('modeModal'); $('teamInput').value = '1';
        openModal('teamModal', () => $('teamCancel').click());
        setTimeout(() => $('teamInput').select(), 60);
    };
    $('navigateBtn').onclick = openModeModal; // preview → choose a mode → navigate
    $('modeTrip').onclick = startTrip;
    $('modeComp').onclick = startComp;
    $('modeLockedStart').onclick = () => (eventMode === 'competition' ? startComp() : startTrip());
    $('teamOk').onclick = () => { team = ($('teamInput').value || '1').replace(/\D/g, '').slice(0, 3) || '1'; closeModal('teamModal'); startNav(true); if (optGpx) RBGpxRecorder.begin(); };
    $('teamCancel').onclick = () => { closeModal('teamModal'); openModal('modeModal'); };
    $('teamInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('teamOk').click(); });
    function startNav(comp) {
        competition = comp; window.RB_BUSY = true; // don't auto-refresh mid-run
        preview = false; document.body.classList.remove('rb-preview'); // leaving the read-only look
        if (sound) { try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); audioCtx.resume(); } catch (e) {} } // unlock audio on this user gesture
        scoredSet = RB.scoredNoteSet(notes);
        activeIdx = nextNav(activeIdx); // never sit the cursor on a leading/edge comment note
        $('loadScreen').hidden = true; $('navScreen').hidden = false;
        // Immersive navigation: the Reader owns the screen (its own action row carries the exit
        // button), so the global bottom tab bar hides — no cramped triple bottom stack (#app-tabbar).
        document.body.classList.add('rb-immersive');
        $('finishBtn').hidden = !comp;
        sizeCapBar(); // the action row just changed height (Competition adds Finish)
        syncAutoBtn();
        $('validateBtn').innerHTML = `<i class="fa-solid fa-circle-check"></i> ${esc(t(comp ? 'Validate' : 'Note done'))}`;
        $('navGpx').hidden = !optGpx;
        $('navTitle').textContent = (rb.meta && rb.meta.title) || 'Roadbook';
        if (evCtx) {
            var bar = document.querySelector('.odo-ev-bar') || document.createElement('div');
            bar.className = 'odo-ev-bar'; bar.innerHTML = '<a href="/event/' + esc(evCtx.event_slug) + '" class="ev-back"><i class="fa-solid fa-arrow-left"></i> ' + esc(evCtx.event_title) + '</a>';
            var ob = document.querySelector('.odometer-bar');
            if (ob && !ob.contains(bar)) ob.insertBefore(bar, ob.firstChild);
        }
        const odoLogo = $('odoLogo'); if (rb.meta && rb.meta.logo) { odoLogo.src = rb.meta.logo; odoLogo.hidden = false; } else { odoLogo.hidden = true; }
        try { localStorage.setItem(SESSION_RB_KEY, JSON.stringify(rb)); } catch (e) {} // roadbook stored once; live counters checkpoint separately
        renderNotes();
        paused = false; updatePauseBtn();
        syncRemote(); // hands-free advance while navigating (#20)
        meter = new RBGpsMeter(onFix, () => setGps('bad'));
        clearInterval(clockTimer); // startNav can run again in the same page life — never stack clocks
        clockTimer = setInterval(() => { const now = new Date(); $('odoClock').textContent = pad(now.getHours(), 2) + ':' + pad(now.getMinutes(), 2); }, 1000);
        startBattery();
    }
    // battery charge in the indicator row — fed by the shared RBStatusBar battery watch
    let clockTimer = null, battWired = false;
    function startBattery() {
        if (battWired) return; battWired = true; // the listeners live for the page — wire once
        const ok = RBStatusBar.watchBattery(({ pct, icon }) => { $('odoBatt').textContent = pct + '%'; $('odoBattIcon').className = 'fa-solid ' + icon; });
        if (!ok) $('odoBatt').textContent = 'N/A';
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
    // The odometer + CAP bars are static markup, touched on every GPS fix — cache the refs once.
    const odoEls = { total: $('odoTotal'), partial: $('odoPartial'), brg: $('odoBrg'), arrow: $('odoBrgArrow'), gpsDot: $('gpsDot'), gpsTxt: $('gpsTxt') };
    const capEls = { bar: $('capbar'), heading: $('capHeading'), speed: $('capSpeed'), dist: $('capDist'), arrow: $('capArrow') };
    // Every fix arrives judged (RBGpsMeter · RB.odometerStep): `disp` is ground actually covered
    // and `trusted` says whether this position may drive anything at all. An untrusted fix only
    // updates the accuracy readout — it is not where we are, so it must never move a counter, a
    // note or a marker (#383).
    function onFix(fix) {
        const { here, coords, disp, speedKmh, trusted } = fix;
        setGps(trusted && coords.accuracy <= 25 ? 'ok' : 'bad', Math.round(coords.accuracy));
        RBGpxRecorder.feed(coords, here, fix.tnow); // the logger applies its own accuracy gate
        if (!trusted) return;
        lastHere = here; lastAcc = coords.accuracy;
        if (inlineMap && inlineMap.ready) inlineMap.setPosition(here.lat, here.lon, false, meter.heading);
        tripTotalM += disp; tripPartialM += disp;
        if (curLimit && curLimit > 0 && speedKmh > curLimit) maxSpdSeg = Math.max(maxSpdSeg, speedKmh);
        const an = notes[activeIdx];
        if (an) {
            const dist = RB.geo.haversineM(here, an);
            // P_extra: armed on entering the 100 m radius; moving away again accumulates the overshoot
            if (dist <= C.MANUAL_RADIUS_M) armed = true;
            else if (armed) extraAccum += disp;
            // Auto-validation on arrival: the gate is the driven SEGMENT (RB.noteReached), so a
            // waypoint can't slip between two fixes. It can't cascade either — reach radii never
            // overlap, so the next note's gate only opens once this one advances. The row-state
            // update happens inside validateAt.
            if (auto && RB.noteReached(an, fix.from, here, reachRadius(activeIdx))) validateAt(activeIdx, here);
        }
        // top odometer bar
        odoEls.total.textContent = (tripTotalM / 1000).toFixed(2);
        odoEls.partial.textContent = (tripPartialM / 1000).toFixed(2);
        // bearing readout (to the next note, else device heading) + a directional arrow
        // that points relative to where you're pointing: 0° = up = straight ahead.
        const brg = an ? RB.geo.bearingDeg(here, an) : meter.heading;
        odoEls.brg.textContent = brg == null ? '—°' : pad(Math.round(brg), 3) + '°';
        const relBrg = brg == null ? 0 : (an ? ((brg - (meter.heading != null ? meter.heading : 0)) + 360) % 360 : 0);
        odoEls.arrow.style.setProperty('--cap-rotation', relBrg + 'deg');
        refreshLive();
        saveSession();
    }
    // The CAP bar rides directly on top of the action row, whose height depends on the mode
    // (Competition adds Finish), on the viewport and on fullscreen — measure it instead of
    // trusting a constant, or the bar clips the top of the buttons it sits on.
    function sizeCapBar() {
        const fab = document.querySelector('.fabrow');
        const top = fab.getBoundingClientRect().top;
        if (top > 0) document.body.style.setProperty('--capbar-bottom', Math.round(window.innerHeight - top) + 'px');
    }
    window.addEventListener('resize', sizeCapBar);
    function setGps(state, acc) { odoEls.gpsDot.className = 'gps-dot ' + (state === 'ok' ? 'ok' : 'bad'); odoEls.gpsTxt.textContent = acc != null ? '±' + acc + ' m' : t('GPS lost'); }
    // The active note's reach gate: capped to half the smaller along-track gap to a neighbour
    // (partial_distance is the metres from the previous note) so reaches never overlap, then
    // floored above GPS noise. Dense rally notes get a tight gate; spread-out trails get the cap.
    const reachRadius = (i) => RB.reachRadius(notes[i], notes[nextNav(i + 1)], rb && rb.meta);

    /* ---------- navigation: notes ---------- */
    const iconSrc = (ic) => RB.iconSrc(ic, rb, '../assets/icons/');
    // Paper-style 4-column rows: total/partial+number | vignette | comments | buttons.
    // Row states: reached = green · skipped (passed over, never reached) = pink · active = red
    // border · upcoming = white. The active row additionally takes the LIVE GPS proximity state
    // (near → arriving, painted by paintApproach); `tight` marks the distance cell of a note whose
    // successor is under 50 m away — a property of the roadbook, not of where the driver is.
    const fkm = (m) => ((m ?? 0) / 1000).toFixed(2);
    // live distances read in metres up close and in km further out — the co-pilot's own units
    const fmtDist = (m) => m >= 1000 ? (m / 1000).toFixed(2) + ' km' : Math.round(m) + ' m';
    const CAP_TYPE_LABEL = { average: 'Average', calculated: 'Calculated', turning: 'Turning' }; // exit = the plain CAP, no qualifier
    let lastScrollIdx = -1;
    // Keep the just-completed note on screen when advancing (#177). Centring the active (next)
    // note slid the note you just used up behind the sticky odometer bar; instead anchor the
    // PREVIOUS row just below that bar, so the completed note stays visible with the active note
    // right under it. Measures the sticky-bar height at runtime (it collapses in fullscreen).
    function scrollActiveIntoView() {
        const list = $('noteList');
        const act = list.querySelector('.nrow.active');
        if (!act) return;
        const rows = list.querySelectorAll('.nrow');
        let anchor = act;
        for (let k = 0; k < rows.length; k++) { if (rows[k] === act) { if (k > 0) anchor = rows[k - 1]; break; } }
        const odo = document.querySelector('.odometer-bar');
        const topOcc = odo ? odo.getBoundingClientRect().bottom : 56; // pixels hidden behind the sticky top bar(s)
        const y = anchor.getBoundingClientRect().top + window.scrollY - topOcc - 8;
        window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
    }
    function renderNotes() {
        closeInlineMap(); // the list HTML is rebuilt wholesale — tear the GL map down cleanly first
        $('noteList').innerHTML = notes.map((n, i) => {
            const comment = n.note_kind === 'comment';
            const cls = ['nrow'];
            if (comment) cls.push('comment');
            if (!preview && !comment) { // no state colouring in the preview, nor on non-navigational comment rows
                if (reached.has(i)) cls.push('done'); else if (i < activeIdx) cls.push('skipped');
                if (i === activeIdx) cls.push('active');
            }
            const tight = !comment && notes[i + 1] && (notes[i + 1].partial_distance ?? 1e9) < 50 ? ' tight' : '';
            const capQual = n.cap != null && CAP_TYPE_LABEL[n.cap_type] ? ' · ' + esc(t(CAP_TYPE_LABEL[n.cap_type])) : '';
            const cap = n.cap != null ? `<div class="note-cap">CAP ${Math.round(n.cap)}°${n.cap_distance != null ? ' · ' + fkm(n.cap_distance) + ' km' : ''}${capQual}</div>` : '';
            const speed = n.speed_limit != null ? `<div class="note-speed">${n.speed_limit === 0 ? `<span class="lim lifted">${esc(t('END'))}</span>` : `<span class="lim">${n.speed_limit}</span>`}</div>` : '';
            const reach = (!comment && !preview && !auto && i === activeIdx) ? `<button class="note-button reach" data-reach title="${t('Note reached')}"><i class="fa-solid fa-check"></i></button>` : '';
            const mapb = (!comment && showMap) ? `<button class="note-button" data-map="${i}" title="${t('Open on map')}"><i class="fa-solid fa-map-location-dot"></i></button>` : '';
            const textClass = comment && !n.image ? ' col-text-wide' : '';
            if (comment) {
                return `<div class="${cls.join(' ')}" data-i="${i}">
                <div class="col-distance"></div>
                <div class="col-vignette${comment && !n.image ? ' col-vignette-empty' : ''}">${NoteCanvas.toSVG(n, iconSrc)}</div>
                <div class="col-text${textClass}"><div class="text">${esc(n.text || '')}</div></div>
                <div class="col-buttons"></div>
            </div><div class="nmap" id="nmap${i}" hidden></div>`;
            }
            return `<div class="${cls.join(' ')}" data-i="${i}">
                <div class="col-distance${tight}"><div class="total">${fkm(n.distance)}</div><div class="partial">+${fkm(n.partial_distance)}</div><div class="togo"></div><div class="num-row"><span class="num">${n.num}</span>${RB.wpBadgeSVG(n.wp_type, 22)}</div></div>
                <div class="col-vignette">${NoteCanvas.toSVG(n, iconSrc)}</div>
                <div class="col-text"><div class="text">${esc(n.text || '')}</div>${cap}${speed}<div class="coords">${(+n.lat).toFixed(5)}, ${(+n.lon).toFixed(5)}</div></div>
                <div class="col-buttons">${reach}${mapb}</div>
            </div><div class="nmap" id="nmap${i}" hidden></div>`;
        }).join('');
        $('noteList').querySelectorAll('[data-reach]').forEach((b) => b.onclick = (e) => { e.stopPropagation(); advanceNote(); });
        $('noteList').querySelectorAll('[data-map]').forEach((b) => b.onclick = (e) => { e.stopPropagation(); toggleNoteMap(+b.dataset.map); });
        $('noteList').querySelectorAll('.nrow').forEach((c) => c.onclick = () => {
            if (c.classList.contains('comment')) return;
            const i = +c.dataset.i;
            if (preview) { if (showMap) toggleNoteMap(i); return; }
            // The whole active row is the "done" target — aiming at a 42 px button on a moving
            // vehicle is what made validation "scomoda" (#386) — and any other row asks first.
            if (i === activeIdx) advanceNote(); else jumpToNote(i);
        });
        // only rescroll when the active note actually changed (not on every redraw)
        if (activeIdx !== lastScrollIdx) { lastScrollIdx = activeIdx; scrollActiveIntoView(); }
        refreshLive();
        saveSession();
    }
    // Advancing/validating only changes row STATE: update the classes and the reach button
    // in place instead of re-rendering every vignette. renderNotes() stays for structural
    // changes (start, auto on/off, language switch) — and the open per-note map survives.
    function updateNoteStates() {
        const list = $('noteList');
        if (!list.firstChild) { renderNotes(); return; } // list not built yet
        list.querySelectorAll('.nrow').forEach((row) => {
            const i = +row.dataset.i;
            row.classList.toggle('done', reached.has(i));
            row.classList.toggle('skipped', !reached.has(i) && i < activeIdx);
            row.classList.toggle('active', i === activeIdx);
            if (i !== activeIdx) { // the live proximity state belongs to the active note alone
                row.classList.remove('near', 'arriving');
                const togo = row.querySelector('.togo'); if (togo) togo.textContent = '';
            }
        });
        list.querySelectorAll('[data-reach]').forEach((b) => b.remove()); // the button follows the active row
        if (!auto && notes[activeIdx] && notes[activeIdx].note_kind !== 'comment') {
            const cell = list.querySelector(`.nrow[data-i="${activeIdx}"] .col-buttons`);
            if (cell) {
                const b = document.createElement('button');
                b.className = 'note-button reach'; b.dataset.reach = ''; b.title = t('Note reached');
                b.innerHTML = '<i class="fa-solid fa-check"></i>';
                b.onclick = (e) => { e.stopPropagation(); advanceNote(); };
                cell.prepend(b);
            }
        }
        if (activeIdx !== lastScrollIdx) { lastScrollIdx = activeIdx; scrollActiveIntoView(); }
        refreshLive();
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
        inlineMap = new RBMap('nmapMap', { zoom: 13, center: [+n.lon, +n.lat], layerToggle: true, geolocate: true });
        inlineMap.showRoadbook(rb, true); // no auto-fit: keep our centre on this note
        inlineMap.select(n, true);        // highlight the note
        if (lastHere) inlineMap.setPosition(lastHere.lat, lastHere.lon, false); // show user position
    }
    function closeInlineMap() {
        if (inlineMap) { inlineMap.destroy(); inlineMap = null; }
        if (inlineMapIdx >= 0) { const el = $('nmap' + inlineMapIdx); if (el) { el.hidden = true; el.innerHTML = ''; } inlineMapIdx = -1; }
    }
    // Everything that depends on where we are RIGHT NOW: the active row's proximity state and the
    // bottom CAP bar. Driven by every trusted fix, and again whenever the active note changes, so
    // no readout is ever left describing the note before it (#387).
    function refreshLive() {
        const an = notes[activeIdx];
        const dist = (an && lastHere) ? RB.geo.haversineM(lastHere, an) : null;
        paintApproach(dist);
        updateCapBar(dist);
    }
    // Live proximity on the active row: the roadbook stays paper, but the note you are driving to
    // reacts as you close in — `near` inside the manual radius, `arriving` once inside the reach
    // circle, where auto-validation fires — and carries its own distance-to-go.
    function paintApproach(dist) {
        const row = $('noteList').querySelector('.nrow.active');
        if (!row) return;
        const arriving = dist != null && dist <= reachRadius(activeIdx);
        row.classList.toggle('arriving', arriving);
        row.classList.toggle('near', !arriving && dist != null && dist <= C.MANUAL_RADIUS_M);
        const togo = row.querySelector('.togo');
        if (togo) togo.textContent = dist == null ? '' : fmtDist(dist);
    }
    // Bottom CAP bar: the heading to hold (the previous note's CAP — a CAP is the bearing to keep
    // AFTER a waypoint), live speed, live distance to the active note, direction arrow. It stays up
    // for the whole run: a bar that comes and goes is one the driver stops looking at, so with no
    // CAP in force it reads —° and drops just the arrow.
    function updateCapBar(dist) {
        const an = notes[activeIdx];
        if (!an || preview) { capEls.bar.hidden = true; return; }
        const prev = notes[prevNav(activeIdx - 1)];
        const cap = prev && prev.cap != null ? Math.round(prev.cap) : null;
        capEls.bar.hidden = false;
        capEls.heading.textContent = cap == null ? '—°' : cap + '°';
        capEls.speed.textContent = meter && meter.speedKmh ? Math.round(meter.speedKmh) + ' km/h' : '--';
        capEls.dist.textContent = dist == null ? '—' : fmtDist(dist);
        capEls.arrow.hidden = cap == null;
        if (cap != null) {
            const rel = ((cap - (meter && meter.heading != null ? meter.heading : 0)) + 360) % 360;
            capEls.arrow.style.setProperty('--cap-rotation', (rel - 45) + 'deg'); // data-driven arrow direction
        }
        capEls.bar.classList.toggle('arriving', dist != null && dist <= reachRadius(activeIdx));
    }
    // Trip mode's "note done": mark it green and move on. No scoring, no proximity gate — a
    // trip is followed by eye, and the driver saying they are there is the whole authority.
    function markReached(i) {
        reached.add(i); tripPartialM = 0; beep();
        if (notes[i].distance != null) tripTotalM = notes[i].distance;
        activeIdx = nextNav(i + 1); updateNoteStates();
    }
    // Scored sections (rally special stages) live in the core — RB.scoredNoteSet: only notes
    // between a START and the next FINISH icon are penalised; null = whole roadbook scored.
    const isScored = (i) => RB.isScoredIdx(scoredSet, i);

    // The competition proximity gate, asked BEFORE anything is charged or moved. Manual tracking
    // works with NO GPS at all; when a fix IS present the gate stops a validation being faked far
    // from the note — widened by that fix's own accuracy, so the phone's uncertainty is never
    // charged to the driver — and the refusal states the real distance, so a "too far" can be
    // understood in the field instead of just contradicting the driver (#385).
    function tooFarFrom(i) {
        if (!lastHere) return false;
        const dist = RB.geo.haversineM(lastHere, notes[i]);
        if (dist <= C.MANUAL_RADIUS_M + (lastAcc || 0)) return false;
        toast(t('Too far from note') + ' ' + notes[i].num + ' · ' + fmtDist(dist));
        return true;
    }
    const validateHere = (i) => { if (!tooFarFrom(i)) validateAt(i, lastHere); };
    // Put the run on note i. A trip only moves its cursor; in competition, arriving at a later
    // note means validating it there and paying the skip penalty for every scored note jumped
    // over (the overshoot belonged to those, so P_extra resets with them). The gate is asked
    // FIRST: a refused validation must leave the run exactly as it was, penalty included.
    function setActiveNote(i) {
        if (!competition) { activeIdx = i; tripPartialM = 0; updateNoteStates(); return; }
        if (tooFarFrom(i)) return;
        pen.skip += RB.skipPenalty(scoredSet, activeIdx, i); extraAccum = 0; armed = false;
        validateAt(i, lastHere);
    }
    // Moving the cursor by TAPPING the roadbook is an explicit act, never the outcome of a mis-tap
    // aimed at the note-done button: it leaves the notes in between unvalidated and, in competition,
    // costs 450 pts each — so it names the note and states the price first (#386). A remote's Back
    // press needs no confirm: a dedicated device pressed on purpose is already the confirmation.
    async function jumpToNote(i) {
        const n = notes[i];
        if (competition && i < activeIdx) return toast('A validated note cannot be changed in competition mode.');
        let msg = t('Jump to note') + ' ' + n.num + (n.text ? ' — ' + esc(n.text) : '') + '?';
        if (i > activeIdx) {
            msg += '<br>' + t('The notes in between will be left unvalidated.');
            const pts = competition ? RB.skipPenalty(scoredSet, activeIdx, i) : 0;
            if (pts) msg += ' ' + t('Penalty:') + ' ' + pts + ' ' + t('pts');
        }
        if (await RBConfirm(msg, t('Jump'))) setActiveNote(i);
    }
    function validateAt(i, here) {
        const n = notes[i], now = new Date();
        if (startedAt == null) startedAt = now; // first validated note starts the clock (even if note 0 was skipped)
        endedAt = now;
        // Penalties accrue only inside a start→finish section; the position-based ones
        // (accuracy/CAP) are zero without a GPS fix — the formulas live in the core (#169).
        const scored = isScored(i);
        if (scored) {
            const p = RB.validationPenalties(notes, i, here);
            pen.acc += p.acc; pen.cap += p.cap; pen.extra += extraAccum;
        }
        extraAccum = 0; armed = false;
        const lim = RB.speedLimitOfNote(n);
        if (lim != null) { if (scored) pen.speed += RB.speedPenalty(maxSpdSeg, curLimit); curLimit = lim === 0 ? null : lim; maxSpdSeg = 0; }
        reached.add(i); tripPartialM = 0; beep();
        if (n.distance != null) tripTotalM = n.distance; // keep the total synced with the notes' cumulative distance (absorbs GPS drift / different trajectories)
        activeIdx = nextNav(i + 1); updateNoteStates();
        if (activeIdx >= notes.length) toast('Last note validated! Tap Finish.');
    }
    // What "advance" means here: validate in competition, mark reached in trip. The Validate /
    // Note done button, a tap on the active row and the remote's next command run this same action.
    function advanceNote() {
        if (activeIdx >= notes.length) return;
        if (competition) validateHere(activeIdx); else markReached(activeIdx);
    }
    $('validateBtn').onclick = advanceNote;

    /* External remote (#20): a Bluetooth page-turner PEDAL or a camera clicker pairs as a keyboard,
     * so the two commands the on-screen buttons run are also reachable with your hands on the wheel.
     * RBRemote owns the key mapping and the guards (never while typing, never with a modal open);
     * the Reader only says what the commands MEAN:
     *   next — advance, exactly the Validate / Note done button;
     *   prev — step the active note back. Trip mode only: a validated note cannot be un-validated in
     *          competition, so there it does nothing rather than pretend otherwise.
     * The pedal belongs to the device, not to one trip, so the switch is remembered in localStorage
     * instead of the run's session checkpoint. */
    const REMOTE_KEY = 'rb_remote';
    const remoteEnabled = () => { try { return localStorage.getItem(REMOTE_KEY) === '1'; } catch (e) { return false; } };
    let detachRemote = null;
    function stepBackNote() {
        if (competition) return;
        const back = prevNav(activeIdx - 1);
        if (back >= 0) setActiveNote(back);
    }
    // Called whenever navigation (re)starts or the switch flips — start.Nav can run twice in one page
    // life, and attaching twice would advance twice per press.
    function syncRemote() {
        if (detachRemote) { detachRemote(); detachRemote = null; }
        if (remoteEnabled() && !$('navScreen').hidden && !preview) detachRemote = RBRemote.attach({ next: advanceNote, prev: stepBackNote });
    }
    // The legend is built FROM the key map, so what it promises is always what actually works.
    const KEY_LABELS = { ArrowRight: '→', ArrowLeft: '←', ArrowUp: '↑', ArrowDown: '↓', PageDown: 'Page ↓', PageUp: 'Page ↑', ' ': 'Space', Spacebar: 'Space', Enter: 'Enter' };
    const keyList = (keys) => [...new Set(keys.map((k) => KEY_LABELS[k] || k))].join(' · ');
    function syncRemoteRow() {
        const on = $('optRemote').checked;
        $('remoteLegend').hidden = !on;
        $('remoteLegend').innerHTML = `<b>${esc(t('Advance'))}:</b> ${esc(keyList(RBRemote.KEYMAP.next))} · <b>${esc(t('Back'))}:</b> ${esc(keyList(RBRemote.KEYMAP.prev))} (${esc(t('trip mode'))})`;
    }
    $('optRemote').onchange = () => {
        try { localStorage.setItem(REMOTE_KEY, $('optRemote').checked ? '1' : '0'); } catch (e) {}
        syncRemoteRow(); syncRemote();
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
        if (await RBConfirmDanger(t('End navigation? Your progress on the notes will be lost.'), t('End navigation'))) { clearSession(); window.RB_BUSY = false; location.href = '../'; } // back to the home page; unblock the version auto-refresh before leaving
    };
    $('navGpx').onclick = () => { if (RBGpxRecorder.recording) RBGpxRecorder.stop(); else RBGpxRecorder.settings(); };

    /* ---------- finish → signed META + QR ---------- */
    $('finishBtn').onclick = finish;
    async function finish() {
        // the open segment's speed penalty stays local so Finish is idempotent (re-tap, or resume + re-finish)
        const penSpeed = pen.speed + RB.speedPenalty(maxSpdSeg, curLimit);
        const km = Math.round(tripTotalM / 1000 * 10);
        const durH = startedAt && endedAt ? (endedAt - startedAt) / 3600000 : 0;
        const avg = durH > 0 ? Math.round((tripTotalM / 1000 / durH) * 10) : 0;
        const meta = RB.buildMeta({
            team, date: RB.ddmmyy(endedAt || new Date()), start: RB.hhmmss(startedAt), end: RB.hhmmss(endedAt),
            accuracy: Math.min(9999, Math.round(pen.acc)), skip: Math.min(9999, pen.skip), extra: Math.min(9999, Math.round(pen.extra)),
            cap: Math.min(9999, Math.round(pen.cap)), speed: Math.min(9999, penSpeed), km: Math.min(99999, km), avg: Math.min(999, avg),
            rb: rbSlug || '',
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
    $('qrDownload').onclick = () => RBDownload(lastQrUrl, 'RB_' + team + '_' + RB.ddmmyy(new Date()) + '.png');
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
    const pad = (n, w) => String(n).padStart(w, '0'); // display padding (bearing, clock); META codecs live in the core
})();
