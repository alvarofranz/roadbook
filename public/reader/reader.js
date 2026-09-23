'use strict';
/* RDBK Reader — the co-pilot's navigator: active note centred, odometer, speed,
 * manual/auto validation and, at the end, the run report (#618): notes, speed limits, time —
 * plus penalties and the signed result QR when the run is a competition. A run in
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
    let zones = { count: 0, exceeded: 0, maxOver: 0 }; // speed-limit zones the run went through (#618)
    let rbRef = null, runStartedAt = null;             // the server roadbook this run is of (none for a file) · when it began
    let startedAt = null, endedAt = null, auto = false, meter = null, paused = false;
    let finished = false; // the run is over (finished or left): nothing is checkpointed any more
    // A run's own state back to a fresh start — for a roadbook opened in the same page life after
    // a run was ended (endRun) without leaving the page.
    function resetRun() {
        activeIdx = 0; reached = new Set(); tripTotalM = 0; tripPartialM = 0; curLimit = null; maxSpdSeg = 0;
        armed = false; extraAccum = 0; pen = { acc: 0, cap: 0, skip: 0, extra: 0, speed: 0 }; zones = { count: 0, exceeded: 0, maxOver: 0 };
        runStartedAt = null; startedAt = null; endedAt = null; meter = null; paused = false; finished = false; lastScrollIdx = -1;
        clearInterval(clockTimer);
        if (detachRemote) { detachRemote(); detachRemote = null; } // the remote drives a run, not a preview
    }
    let preview = false; // roadbook opened but navigation not started yet (read-only look)
    let scoredSet = null; // indices inside a start→finish scored section (null = no markers → whole roadbook is scored)
    let inlineMap = null, inlineMapIdx = -1; // the one interactive per-note map
    let lastHere = null, lastAcc = null;     // last TRUSTED position + its accuracy — what every distance is measured from
    let lastPayload = '', lastQrUrl = '';
    let meUser = null; // signed in: the reports go up to the profile (a public roadbook opens for anyone, #884)
    let rbSlug = ''; // the server roadbook's slug (none for a file): the event lookup and the result QR's rb prefix
    // Which roadbook this visit is FOR, if any (the friendly slug, ?rb= or ?admin_rb=). The run
    // checkpoint records it, so a later visit can tell "resume this very run" from "you asked for
    // something else" — in which case there is nothing to ask about (#436). A resumed run takes
    // back the one it was started with.
    let openedAs = (() => {
        const q = new URLSearchParams(location.search);
        const pub = RBChallenges.publicFromUrl();
        if (pub) return 'slug:' + pub;
        if (+(q.get('rb') || 0) > 0) return 'rb:' + q.get('rb');
        if (+(q.get('admin_rb') || 0) > 0) return 'admin:' + q.get('admin_rb');
        return '';
    })();
    // session checkpoint: live counters (small, written constantly) + the roadbook (written once at start)
    const SESSION_KEY = 'rb_session', SESSION_RB_KEY = 'rb_session_roadbook';

    /* ---------- startup ---------- */
    $('pickRb').onclick = () => $('rbFile').click();
    RBFullscreen($('odoFs')); // fullscreen toggle in the odometer bar (hides the site header + footer)
    // the "use the app" recommendation, in a browser only (as in the Recorder)
    $('rdNativeHint').hidden = $('prNativeHint').hidden = document.documentElement.classList.contains('native');
    $('rbFile').onchange = async (e) => { const f = e.target.files[0]; if (f) try { loadRb(await RBZip.readRdbk(f)); } catch (err) { toast('Could not load the roadbook.'); } };
    // The public roadbook gallery on the load screen — the same one as /roadbooks/ (#636). A card
    // links to /reader/<slug> — the deep link the Navigate button uses — so opening one navigates
    // here with the slug, where the startup below loads it (sign-in gate included).
    RBChallenges.gallery({ grid: $('readerGallery'), pager: $('readerPager'), search: $('readerSearch'), href: (r) => RBChallenges.ROOT + 'reader/' + encodeURIComponent(r.slug) });
    $('previewBack').onclick = () => { location.href = RBChallenges.ROOT + 'reader/'; }; // back to the load screen (#638)
    // "My roadbooks": shown only when signed in; a picker of the user's saved roadbooks.
    // RBConfig: offline, a signed-in user is still signed in (#630).
    let evCtx = null;
    const cfgReady = RBConfig().then((c) => { meUser = !!c.user; if (meUser) $('pickMine').hidden = false; evCtx = c.participant || null; });
    $('pickMine').onclick = async () => {
        const busy = RBBusy('pickMine');
        const r = await RBApi('rb_list');
        busy.reset();
        if (!r.ok) return toast(navigator.onLine === false ? 'You are offline — reconnect to see your roadbooks.' : (r.error || 'Could not load.'));
        RBRowPicker({
            title: 'My roadbooks', icon: 'fa-folder-open', items: r.roadbooks || [], fields: ['title'],
            empty: 'No roadbooks yet. Create one in the Editor.',
            rowHTML: (rb, i) => RBChallenges.pickerRow(rb, i, false), // the same rows as every roadbook picker (#639)
            onPick: async (rb, modal) => {
                modal.close();
                const j = await RBApi('rb_get', { id: +rb.id });
                if (j.ok && j.roadbook) loadRb(j.roadbook, j.id, j.slug); else toast(j.error || 'Could not load the roadbook.');
            },
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
        await cfgReady;
        RBWebGpsWarn(); // browser-only floating warning: web GPS is unreliable on phones
        let session = RBCheckpoint.read(SESSION_KEY);
        let savedRb = null;
        if (session && session.pen) {
            savedRb = RBCheckpoint.read(SESSION_RB_KEY);
            if (!savedRb || !savedRb.notes) session = null;
        } else session = null;
        if (!session) clearSession(); // an unrecoverable checkpoint is just litter
        // A roadbook opened explicitly via the URL (e.g. the challenge "Navigate" button → /reader/<slug>).
        const pub = RBChallenges.publicFromUrl();
        const rbId = +(new URLSearchParams(location.search).get('rb') || 0); // open a personal (private) roadbook by id — owner only (#71)
        const adminRbId = +(new URLSearchParams(location.search).get('admin_rb') || 0); // admins: open any user's roadbook (admin panel "View")
        const loadFromUrl = () => {
            if (pub) {
                RBChallenges.loadPublic(pub).then((j) => { loadRb(j.roadbook, j.id, j.slug); if (eventSlug) openStartDialog(); }).catch(() => toast('Could not load the roadbook.'));
            } else if (rbId > 0) {
                RBApi('rb_get', { id: rbId }).then((j) => { if (j.ok && j.roadbook) { loadRb(j.roadbook, j.id, j.slug); if (eventSlug) openStartDialog(); } else toast(j.error || 'Could not load the roadbook.'); }).catch(() => toast('Could not load the roadbook.'));
            } else if (adminRbId > 0) {
                RBApi('admin_rb_get', { id: adminRbId }).then((j) => { if (j.ok && j.roadbook) loadRb(j.roadbook, j.id, j.slug); else toast(j.error || 'Could not load the roadbook.'); }).catch(() => toast('Could not load the roadbook.'));
            }
        };
        // Worth asking about only when this visit has no target of its own, or when the saved run
        // IS this roadbook (a crash mid-run). Opening a different one is an explicit choice, and
        // interrogating the user about the previous run then is just noise. A "No" is remembered
        // on the checkpoint, so it is asked ONCE — the data is kept either way (the next run
        // overwrites it, an explicit exit clears it), so nothing is destroyed by declining (#436).
        if (session && !session.declined && (!openedAs || session.openedAs === openedAs)) {
            const what = esc((savedRb.meta && savedRb.meta.title) || 'Roadbook') + ' · ' + session.activeIdx + '/' + savedRb.notes.length + ' ' + t('notes');
            if (await RBConfirm(t('Resume the run in progress?') + '<br><b>' + what + '</b> · ' + RBKm(session.totalM))) { resumeSession(session, savedRb); return; }
            declineSession();
            await RBGpxRecorder.offerRecovery(); // a declined run that was logging still gets its GPX back
            loadFromUrl(); // declined → still navigate the roadbook the user explicitly opened
            return;
        }
        if (session) { loadFromUrl(); return; } // a run is parked but this visit is not about it
        await RBGpxRecorder.offerRecovery();
        loadFromUrl();
    })();
    // File Handling API (installed PWA): open a .rdbk straight from the OS. During a run that
    // throws the run away, so it asks first, naming the run it replaces.
    if ('launchQueue' in window && window.LaunchParams) {
        launchQueue.setConsumer(async (params) => {
            if (!params.files || !params.files.length) return;
            if (meter && !finished) {
                const what = esc((rb.meta && rb.meta.title) || t('Roadbook')) + ' · ' + activeIdx + '/' + notes.length + ' ' + t('notes');
                if (!(await RBConfirmDanger(t('Open this file and leave the run in progress? Your progress on the notes will be lost.') + '<br><b>' + what + '</b>'))) return;
                await endRun();
                resetRun();
            }
            try { loadRb(await RBZip.readRdbk(await params.files[0].getFile())); } catch (e) { toast('Could not load the roadbook.'); }
        });
    }

    let competition = false;
    let eventSlug = new URLSearchParams(location.search).get('event'); // opened from an event: it decides the mode (#155 · #617)
    // `id` + `slug`: the server roadbook it is, so the run report can point at it and a competition
    // result names it — a local file has neither
    function loadRb(r, id, slug) {
        r = RB.importRoadbook(r); // canonical schema (so pre-standard Italian files open here too)
        if (!r.notes.length) return toast('Roadbook has no notes.');
        rb = r; notes = r.notes; routeCum = RB.cumulativeM(rb.track || []); rbRef = id ? +id : null; rbSlug = slug || '';
        showPreview();
    }
    // Preview an opened roadbook read-only, BEFORE starting — you might just want to look.
    // No GPS, no active-note highlighting; the bottom tab bar stays (not immersive). The sticky
    // "Navigate" CTA is what opens the start dialog and starts the actual navigation.
    function showPreview() {
        preview = true;
        document.body.classList.remove('rb-immersive');
        document.body.classList.add('rb-preview');
        $('loadScreen').hidden = true; $('navScreen').hidden = false;
        $('previewTitle').textContent = (rb.meta && rb.meta.title) || t('Roadbook');
        renderNotes();
        window.scrollTo(0, 0);
    }
    // Before starting: the run options only. The mode is never a question (#617): competition
    // exists for an event's Ranking, so a roadbook opened from an event whose roadbook is SCORED runs
    // in competition (vehicle number asked, result QR at the end); everything else runs as a trip.
    let runComp = false;
    async function openStartDialog() {
        runComp = false;
        $('startComp').hidden = true;
        $('optRemote').checked = remoteEnabled(); syncRemoteRow(); // the device's remote preference, remembered across runs
        openModal('startModal', () => closeModal('startModal')); // Esc dismisses → back to the preview
        if (!eventSlug) return;
        $('startGo').disabled = true; // until the event says whether this roadbook is scored
        const j = await RBApi('event_get', { slug: eventSlug });
        const er = j.ok && (j.roadbooks || []).find((x) => x.slug === rbSlug);
        runComp = !!(er && er.scoring_mode && er.scoring_mode !== 'free');
        if (runComp) {
            $('startCompTxt').textContent = t('Scored in the event') + ' “' + j.event.title + '”: ' + t('you will be asked your vehicle number, and the result goes to the event ranking.');
            $('startComp').hidden = false;
        }
        $('startGo').disabled = false;
    }
    $('startClose').onclick = () => closeModal('startModal');
    // "Map access from player" is a roadbook-level setting (default allowed when absent): it decides
    // whether the Reader has a map at all — the action-bar toggle and the preview's tap-to-map (#569).
    const mapAllowed = () => !(rb && rb.meta && rb.meta.map_access === false);
    let optGpx = false, sound = true;
    function readStartOpts() {
        // Advancement starts on Automatic (GPS); the nav-screen Auto switch toggles it during the run.
        auto = true; optGpx = $('optGpx').checked; sound = $('optSound').checked;
    }
    // The success bell when a note is validated, auto or manual (#768) — the same bell the Recorder
    // rings on a note — and the fanfare on the last one: the roadbook is completed (#843). The run's
    // start tap unlocks them (startNav), so a GPS auto-validation can play.
    const ring = (i) => { if (sound) (i === notes.length - 1 ? RBSuccess.fanfare : RBSuccess.ring)(); };
    $('startGo').onclick = async () => {
        if (!(await RBWebGpsConfirm(runComp))) return; // one-time browser warning (stronger for a scored run)
        readStartOpts(); closeModal('startModal');
        if (!runComp) { startNav(false); if (optGpx) RBGpxRecorder.begin(); return; }
        $('teamInput').value = '1';
        openModal('teamModal', () => $('teamCancel').click());
        setTimeout(() => $('teamInput').select(), 60);
    };
    $('navigateBtn').onclick = openStartDialog; // preview → run options → navigate
    $('teamOk').onclick = () => { team = ($('teamInput').value || '1').replace(/\D/g, '').slice(0, 3) || '1'; closeModal('teamModal'); startNav(true); if (optGpx) RBGpxRecorder.begin(); };
    $('teamCancel').onclick = () => { closeModal('teamModal'); openModal('startModal', () => closeModal('startModal')); };
    $('teamInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('teamOk').click(); });
    function startNav(comp) {
        competition = comp; window.RB_BUSY = true; // don't auto-refresh mid-run
        preview = false; document.body.classList.remove('rb-preview'); // leaving the read-only look
        if (sound) RBSuccess.unlock(); // this tap is the gesture that lets a later auto-validation ring
        scoredSet = RB.scoredNoteSet(notes);
        $('loadScreen').hidden = true; $('navScreen').hidden = false;
        // Immersive navigation: the Reader owns the screen (its own action row carries the exit
        // button), so the global bottom tab bar hides — no cramped triple bottom stack (#app-tabbar).
        document.body.classList.add('rb-immersive');
        if (runStartedAt == null) runStartedAt = Date.now(); // a resumed run keeps its own start
        publishBottomStack();
        syncAutoBtn();
        $('navGpx').hidden = !optGpx;
        $('mapBtn').hidden = !mapAllowed(); syncMapBtn();
        $('navTitle').textContent = (rb.meta && rb.meta.title) || 'Roadbook';
        // the way back to the event this run was opened from — only that event (#640)
        if (eventSlug && evCtx && evCtx.event_slug === eventSlug) {
            const bar = document.querySelector('.odo-ev-bar') || document.createElement('div');
            bar.className = 'odo-ev-bar';
            bar.innerHTML = `<a href="/event/${encodeURIComponent(eventSlug)}" class="ev-back"><i class="fa-solid fa-arrow-left"></i> ${esc(evCtx.event_title)}</a>`;
            const ob = document.querySelector('.odometer-bar');
            if (ob && !ob.contains(bar)) ob.insertBefore(bar, ob.firstChild);
        }
        const odoLogo = $('odoLogo'); if (rb.meta && rb.meta.logo) { odoLogo.src = rb.meta.logo; odoLogo.hidden = false; } else { odoLogo.hidden = true; }
        RBCheckpoint.write(SESSION_RB_KEY, rb); // roadbook stored once; live counters checkpoint separately
        renderNotes();
        paused = false; updatePauseBtn();
        syncRemote(); // hands-free advance while navigating (#20)
        if (meter) meter.stop(); // startNav can run again in the same page life — one watch at a time
        meter = new RBGpsMeter(onFix, () => setGps('bad'));
        clearInterval(clockTimer); // startNav can run again in the same page life — never stack clocks
        clockTimer = setInterval(() => { const now = new Date(); $('odoClock').textContent = pad(now.getHours(), 2) + ':' + pad(now.getMinutes(), 2); }, 1000);
    }
    let clockTimer = null;

    /* ---------- session checkpoint: survive reloads and OS tab kills ---------- */
    function saveSession() {
        if (!meter || finished) return; // nothing to checkpoint before a run starts or once it is over
        const s = { openedAs, rbSlug, eventSlug, competition, team, auto, sound, gpxOption: optGpx, gpxRecording: RBGpxRecorder.recording, gpxFileName: RBGpxRecorder.fileName, activeIdx, reached: [...reached], totalM: tripTotalM, partialM: tripPartialM, pen, zones, rbRef, runStartedAt, curLimit, maxSpdSeg, extraAccum, armed, startedAt: startedAt ? startedAt.getTime() : null, endedAt: endedAt ? endedAt.getTime() : null };
        RBCheckpoint.write(SESSION_KEY, s);
    }
    function clearSession() { try { localStorage.removeItem(SESSION_KEY); localStorage.removeItem(SESSION_RB_KEY); } catch (e) {} }
    // A declined resume is marked, not deleted: asking twice is nagging, deleting is data loss.
    // The flag lives only on this checkpoint — the next run writes a fresh one without it.
    const declineSession = () => RBCheckpoint.decline(SESSION_KEY);
    function resumeSession(s, savedRb) {
        tripTotalM = s.totalM; tripPartialM = s.partialM;
        rb = savedRb; notes = rb.notes; routeCum = RB.cumulativeM(rb.track || []);
        team = s.team; auto = s.auto; optGpx = s.gpxOption; sound = s.sound !== false;
        activeIdx = s.activeIdx; reached = new Set(s.reached); pen = s.pen; curLimit = s.curLimit; maxSpdSeg = s.maxSpdSeg;
        zones = s.zones; rbRef = s.rbRef; rbSlug = s.rbSlug; eventSlug = s.eventSlug; openedAs = s.openedAs; runStartedAt = s.runStartedAt;
        extraAccum = s.extraAccum; armed = s.armed;
        startedAt = s.startedAt ? new Date(s.startedAt) : null;
        endedAt = s.endedAt ? new Date(s.endedAt) : null;
        startNav(s.competition);
        if (s.gpxRecording) RBGpxRecorder.resume(s.gpxFileName);
    }

    /* ---------- GPS (RBGpsMeter drives one onFix per position) ---------- */
    // The odometer bar is static markup, touched on every GPS fix — cache the refs once.
    const odoEls = { total: $('odoTotal'), partial: $('odoPartial'), brg: $('odoBrg'), arrow: $('odoBrgArrow'), gpsDot: $('gpsDot'), gpsTxt: $('gpsTxt'), speed: $('odoSpeed') };
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
        if (inlineMap && inlineMap.ready) {
            inlineMap.setPosition(here.lat, here.lon, true, meter.heading); // follow: you stay in the middle, the map turns with you
            if (inlineMapIdx >= 0 && notes[inlineMapIdx]) guideTo(inlineMapIdx, here); // the arrow follows the live fix
        }
        tripTotalM += disp; tripPartialM += disp;
        if (curLimit && curLimit > 0 && speedKmh > curLimit) maxSpdSeg = Math.max(maxSpdSeg, speedKmh);
        const an = notes[activeIdx];
        if (an) {
            const dist = RB.geo.haversineM(here, an);
            // P_extra: armed on entering the 100 m radius; moving away again accumulates the overshoot
            if (dist <= C.MANUAL_RADIUS_M) armed = true;
            else if (armed) extraAccum += disp;
            // Auto-validation on arrival: the gate is the driven SEGMENT (RB.autoReachedIdx →
            // RB.noteReached), so a waypoint can't slip between two fixes. It looks one note
            // ahead as well, but only once the active one is behind you (RB.notePassed, fed the
            // partial odometer): a note driven past is left SKIPPED — red on the roadbook — and
            // the one actually reached is validated, instead of the run sitting forever on a
            // waypoint it will never enter. The row-state update happens inside validateAt.
            if (auto) {
                const hit = RB.autoReachedIdx(notes, activeIdx, activeIdx + 1, fix.from, here, reachRadius, tripPartialM);
                if (hit >= 0) autoValidate(hit, here);
            }
        }
        // top odometer bar
        odoEls.total.textContent = (tripTotalM / 1000).toFixed(2);
        odoEls.partial.textContent = (Math.max(0, tripPartialM) / 1000).toFixed(2); // below 0 until the note validated early is passed
        odoEls.speed.textContent = Math.round(speedKmh || 0) + ' km/h';
        // bearing readout (to the next note, else device heading) + a directional arrow
        // that points relative to where you're pointing: 0° = up = straight ahead.
        const brg = an ? RB.geo.bearingDeg(here, an) : meter.heading;
        odoEls.brg.textContent = brg == null ? '—°' : pad(Math.round(brg), 3) + '°';
        const relBrg = brg == null ? 0 : (an ? ((brg - (meter.heading != null ? meter.heading : 0)) + 360) % 360 : 0);
        odoEls.arrow.style.setProperty('--cap-rotation', relBrg + 'deg');
        refreshLive();
        saveSession();
    }
    // Inside the shell the action row is a laid-out row (#429), so nothing here has to position
    // it. What still needs its height is what the SHARED layer pins to the viewport bottom over
    // the top of it — the cookie notice (#401) and the toast — and the answer is simply how tall
    // that row is. No `window.innerHeight`: that arithmetic reads a viewport that moves after
    // load, on resize and on rotation, while the value does not, and it left bars floating
    // mid-list on iOS.
    function publishBottomStack() {
        // offsetHeight is 0 for a hidden row, so the preview (which hides it) clears the
        // variable on its own and the notice drops back to the floor.
        const stack = document.querySelector('.fabrow').offsetHeight || 0;
        if (stack > 0) document.body.style.setProperty('--bottom-stack', stack + 'px');
        else document.body.style.removeProperty('--bottom-stack');
    }
    window.addEventListener('resize', publishBottomStack); // the row re-wraps, so its height changes
    function setGps(state, acc) { odoEls.gpsDot.className = 'gps-dot ' + (state === 'ok' ? 'ok' : 'bad'); odoEls.gpsTxt.textContent = acc != null ? '±' + acc + ' m' : t('GPS lost'); }
    // The active note's reach gate: capped to half the smaller along-track gap to a neighbour
    // (partial_distance is the metres from the previous note) so reaches never overlap, then
    // floored above GPS noise. Dense rally notes get a tight gate; spread-out trails get the cap.
    const reachRadius = (i) => RB.reachRadius(notes[i], notes[i + 1], rb && rb.meta);

    /* ---------- navigation: notes ---------- */
    // Paper-style 3-column rows: total/partial+number | vignette | comments. No buttons column
    // (#569): the whole active row is the note-done target and the map is the action bar's toggle.
    // Row states: reached = green · skipped (passed over, never reached) = pink · active = red
    // border · upcoming = white. The active row additionally takes the LIVE GPS proximity state
    // (near → arriving, painted by paintApproach); `tight` marks the distance cell of a note whose
    // successor is under 50 m away — a property of the roadbook, not of where the driver is.
    // Every distance on the roadbook reads the way the roadbook writes it: km with two decimals (#846)
    const fmtKm = (m) => (m / 1000).toFixed(2);
    // What is left to note i: along the route, never under the straight line (RB.leftToNote, #847).
    // The odometer is the hint that tells apart two passes of a route that goes the same way twice.
    let routeCum = null;
    const ahead = (i, here) => (routeCum && routeCum.length > 1 && here ? RB.routeAhead(rb, routeCum, i, here, tripTotalM) : null);
    const toGoM = (i, here) => RB.leftToNote(rb, routeCum, i, here, tripTotalM);
    // The note map's guide (#890): a short straight arrow from where you are, pointing at the note
    const guideTo = (i, here) => inlineMap.setGuide(here, notes[i]);
    // Whenever the cursor lands on note j — the note before it validated, skipped or jumped past —
    // the odometers re-anchor on the route (#847): the total becomes where the driver really is
    // along it, the partial the distance past note j−1. Projected around that note, so a note
    // validated early, inside its radius, leaves the partial below zero: it reads 0.00 exactly at
    // the note, and the partial always matches the roadbook's own.
    function reanchor(j, here) {
        const prev = notes[j - 1], a = ahead(Math.max(0, j - 1), here);
        if (a) { tripTotalM = a.atM; tripPartialM = a.atM - (prev ? prev.distance : 0); return; }
        if (prev && prev.distance != null) tripTotalM = prev.distance;
        tripPartialM = 0;
    }
    let lastScrollIdx = -1;
    // Advancing puts the note to drive to at the very TOP of the list (#844): the one just
    // validated is done with, and the road ahead gets all the room. The material placed before a
    // note (#542) belongs to it, so the top is its first block. Once the active index changes only.
    function scrollActiveIntoView() {
        const list = $('noteList');
        let top = list.querySelector('.nrow.active');
        if (!top) return;
        while (top.previousElementSibling && top.previousElementSibling.classList.contains('block')) top = top.previousElementSibling;
        list.scrollTo({ top: Math.max(0, top.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop), behavior: 'smooth' });
    }
    function renderNotes() {
        closeInlineMap(); // the list HTML is rebuilt wholesale — tear the GL map down cleanly first
        // the shared paper rows (NoteCanvas.rowsHTML, #635) + the run's state classes + the map slot
        $('noteList').style.setProperty('--dist-ch', RB.distanceChars(rb.notes)); // the distance column fits the longest (#730)
        $('noteList').innerHTML = NoteCanvas.rowsHTML(rb, {
            rowClass: (i) => (preview ? '' : [reached.has(i) ? 'done' : (i < activeIdx ? 'skipped' : ''), i === activeIdx ? 'active' : ''].filter(Boolean).join(' ')),
            after: (i) => `<div class="nmap" id="nmap${i}" hidden></div>`,
        });
        $('noteList').querySelectorAll('.nrow[data-i]').forEach((c) => c.onclick = () => {
            const i = +c.dataset.i;
            if (preview) { if (mapAllowed()) toggleNoteMap(i); return; }
            // The whole active row is the "done" target — aiming at a small button on a moving
            // vehicle is what made validation "scomoda" (#386) — and any other row asks first.
            // With Auto on, advanceNote itself declines: the GPS validates, not the finger.
            if (i === activeIdx) advanceNote(); else jumpToNote(i);
        });
        // only rescroll when the active note actually changed (not on every redraw)
        if (activeIdx !== lastScrollIdx) { lastScrollIdx = activeIdx; scrollActiveIntoView(); }
        refreshLive();
        saveSession();
    }
    // Advancing/validating only changes row STATE: update the classes in place instead of
    // re-rendering every vignette. renderNotes() stays for structural
    // changes (start, auto on/off, language switch) — and the open per-note map survives.
    function updateNoteStates() {
        const list = $('noteList');
        if (!list.firstChild) { renderNotes(); return; } // list not built yet
        list.querySelectorAll('.nrow[data-i]').forEach((row) => {
            const i = +row.dataset.i;
            row.classList.toggle('done', reached.has(i));
            row.classList.toggle('skipped', !reached.has(i) && i < activeIdx);
            row.classList.toggle('active', i === activeIdx);
            if (i !== activeIdx) { // the live proximity state belongs to the active note alone
                row.classList.remove('near', 'arriving');
                const togo = row.querySelector('.togo'); if (togo) togo.textContent = '';
            }
        });
        // an open map belongs to the active note: it moves on with it, still open (#571)
        if (inlineMapIdx >= 0 && !preview && inlineMapIdx !== activeIdx) moveNoteMap(activeIdx);
        if (activeIdx !== lastScrollIdx) { lastScrollIdx = activeIdx; scrollActiveIntoView(); }
        refreshLive();
        saveSession();
    }
    // One interactive map at a time: zoom buttons + satellite/topo toggle (RBMap). It opens as a
    // CLOSE-UP of where the rider is, carrying only this note's waypoint (#427): the whole route
    // at zoom 13 was too coarse to read a junction, and the other notes' pins are noise when the
    // question is "where am I relative to THIS waypoint". Without a fix the note itself is the
    // only position we know, so it becomes the centre. The full route stays on the roadbook's
    // own page and in the Editor.
    //
    // It is YOUR map (#536): centred on you, following every trusted fix, and turned so your
    // direction of travel is UP — left and right on the map are then left and right through the
    // windscreen, and the guidance arrow (drawn in map space) points at the waypoint relative to
    // the way you are facing. The heading-up control locks north for whoever prefers it.
    //
    // Its top-left corner carries the note's number and the distance still to run to it (#571),
    // live from the GPS like the row's own, so it reads without looking away from the map.
    const NOTE_MAP_ZOOM = 16;
    function toggleNoteMap(i) {
        if (inlineMapIdx === i) { closeInlineMap(); return; } // tapping the open one closes it
        closeInlineMap();
        if (!window.maplibregl) return toast('Map not configured.');
        const el = $('nmap' + i); if (!el) return;
        syncMapBtn(true);
        const n = notes[i];
        el.innerHTML = '<div id="nmapMap" class="rb-inline-map"></div><div class="nmap-togo" id="nmapTogo" aria-live="polite"></div>';
        el.hidden = false; inlineMapIdx = i;
        const centre = lastHere || { lat: +n.lat, lon: +n.lon };
        const heading = meter && meter.heading != null ? meter.heading : 0;
        inlineMap = new RBMap('nmapMap', { zoom: NOTE_MAP_ZOOM, center: [centre.lon, centre.lat], bearing: lastHere ? heading : 0, layerToggle: true, geolocate: true, headingToggle: true });
        inlineMap.showRoadbook({ track: [], notes: [n] }, true); // this waypoint alone, no route, no auto-fit
        inlineMap.select(n, true);                               // highlight it (noEase: keep our centre)
        if (lastHere) { inlineMap.setPosition(lastHere.lat, lastHere.lon, true, meter && meter.heading); guideTo(i, lastHere); }
        paintMapTogo();
    }
    // Hand the open map on to note i without closing it (#571): the same GL map (tiles, zoom,
    // layer, heading-up choice all kept) is re-parented under the new row and re-aimed at that
    // note's waypoint. Past the last note there is nothing to aim at, so it closes.
    function moveNoteMap(i) {
        const from = $('nmap' + inlineMapIdx), to = $('nmap' + i), n = notes[i];
        if (!inlineMap || !from || !to || !n) { closeInlineMap(); return; }
        while (from.firstChild) to.appendChild(from.firstChild);
        from.hidden = true; to.hidden = false; inlineMapIdx = i;
        if (inlineMap.map) inlineMap.map.resize();
        inlineMap.showRoadbook({ track: [], notes: [n] }, true);
        inlineMap.select(n, true);
        if (lastHere) guideTo(i, lastHere);
        paintMapTogo();
    }
    function paintMapTogo() {
        const badge = $('nmapTogo'), n = notes[inlineMapIdx];
        if (!badge || !n) return;
        badge.innerHTML = `<span class="num">${n.num}</span>${lastHere ? ' ' + fmtKm(toGoM(inlineMapIdx, lastHere)) : ''}`;
    }
    function closeInlineMap() {
        if (inlineMap) { inlineMap.destroy(); inlineMap = null; }
        if (inlineMapIdx >= 0) { const el = $('nmap' + inlineMapIdx); if (el) { el.hidden = true; el.innerHTML = ''; } inlineMapIdx = -1; }
        syncMapBtn(false);
    }
    // The action bar's one map button (#569): it opens the ACTIVE note's map and closes whatever
    // map is open, and it is lit while one is.
    function syncMapBtn(open) { const b = $('mapBtn'); litBtn(b, !!open); b.setAttribute('aria-pressed', String(!!open)); }
    $('mapBtn').onclick = () => { if (inlineMapIdx >= 0) closeInlineMap(); else if (notes[activeIdx]) toggleNoteMap(activeIdx); };
    // Everything that depends on where we are RIGHT NOW: the active row's proximity state and its
    // distance to go. Driven by every trusted fix, and again whenever the active note changes, so
    // no readout is ever left describing the note before it (#387).
    function refreshLive() {
        const an = notes[activeIdx], live = an && lastHere;
        paintApproach(live ? RB.geo.haversineM(lastHere, an) : null, live ? toGoM(activeIdx, lastHere) : null);
        paintMapTogo();
    }
    // Live proximity on the active row: the roadbook stays paper, but the note you are driving to
    // reacts as you close in — `near` inside the manual radius, `arriving` once inside the reach
    // circle, where auto-validation fires (both on the straight line: that is what the radius
    // measures) — and carries its own distance-to-go, along the route.
    function paintApproach(dist, togoM) {
        const row = $('noteList').querySelector('.nrow.active');
        if (!row) return;
        const arriving = dist != null && dist <= reachRadius(activeIdx);
        row.classList.toggle('arriving', arriving);
        row.classList.toggle('near', !arriving && dist != null && dist <= C.MANUAL_RADIUS_M);
        const togo = row.querySelector('.togo');
        if (togo) togo.textContent = togoM == null ? '' : fmtKm(togoM);
    }
    // Trip mode's "note done": mark it green and move on. No scoring, no proximity gate — a
    // trip is followed by eye, and the driver saying they are there is the whole authority.
    function markReached(i) {
        passLimit(notes[i], false);
        reached.add(i); reanchor(i + 1, lastHere); ring(i);
        activeIdx = i + 1; updateNoteStates();
        if (activeIdx >= notes.length) finishRun(true);
    }
    // Speed-limit zones, followed in EVERY run (#618): a note carrying a limit closes the zone the
    // run was in — counted, and judged against the fastest speed driven in it — and opens the next.
    // In competition a scored zone also costs its speed penalty.
    function closeZone(scored) {
        if (!(curLimit > 0)) return;
        zones.count++;
        if (maxSpdSeg > curLimit) { zones.exceeded++; zones.maxOver = Math.max(zones.maxOver, Math.round(maxSpdSeg - curLimit)); }
        if (competition && scored) pen.speed += RB.speedPenalty(maxSpdSeg, curLimit);
    }
    function passLimit(n, scored) {
        const lim = RB.speedLimitOfNote(n);
        if (lim == null) return;
        closeZone(scored);
        curLimit = lim === 0 ? null : lim; maxSpdSeg = 0;
    }
    // Notes [from, to) passed over without being reached still change the speed limit: the sign
    // was on the road whether or not the note was validated.
    function passOver(from, to) { for (let k = from; k < to; k++) passLimit(notes[k], isScored(k)); }
    // Scored sections (rally special stages) live in the core — RB.scoredNoteSet: only notes
    // between a START and the next FINISH icon are penalised; null = whole roadbook scored.
    const isScored = (i) => RB.isScoredIdx(scoredSet, i);

    // The competition proximity gate, asked BEFORE anything is charged or moved. Manual tracking
    // works with NO GPS at all; when a fix IS present the gate stops a validation being faked far
    // from the note — widened by that fix's own accuracy, so the phone's uncertainty is never
    // charged to the driver — and the refusal states the real distance, so a "too far" can be
    // understood in the field instead of just contradicting the driver (#385).
    // How far the last trusted fix is from note i when that is too far to validate by hand, else
    // null. The rule itself lives in the core (RB.manualGate) because the Reader and the Ranking
    // must agree on it; here it is only ever asked about the position we trust.
    const farFrom = (i) => RB.manualGate(notes[i], lastHere, lastAcc);
    function tooFarFrom(i) {
        const dist = farFrom(i);
        if (dist == null) return false;
        toast(t('Too far from note') + ' ' + notes[i].num + ' · ' + RBKm(dist));
        return true;
    }
    // Put the run on note i. A trip only moves its cursor; in competition, arriving at a later
    // note means validating it there and paying the skip penalty for every scored note jumped
    // over (the overshoot belonged to those, so P_extra resets with them). The gate is asked
    // FIRST: a refused validation must leave the run exactly as it was, penalty included.
    function setActiveNote(i) {
        if (!competition) { passOver(activeIdx, i); activeIdx = i; reanchor(i, lastHere); updateNoteStates(); return; }
        if (tooFarFrom(i)) return;
        pen.skip += RB.skipPenalty(scoredSet, activeIdx, i); extraAccum = 0; armed = false;
        passOver(activeIdx, i);
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
        if (await RBConfirm(msg)) setActiveNote(i);
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
        passLimit(n, scored);
        reached.add(i); reanchor(i + 1, here || lastHere); ring(i); // the odometers follow the roadbook, not the GPS drift
        activeIdx = i + 1; updateNoteStates();
        if (activeIdx >= notes.length) finishRun(true);
    }
    // Auto-advance's validation. When the note reached is not the active one, the ones driven
    // past are left skipped — red on the roadbook — and in competition a skip costs exactly what
    // the same skip costs when the driver asks for it by hand. The overshoot accumulated so far
    // belonged to the notes being given up, so it is dropped rather than charged to this one.
    function autoValidate(i, here) {
        if (i !== activeIdx) {
            if (competition) pen.skip += RB.skipPenalty(scoredSet, activeIdx, i);
            extraAccum = 0; armed = false;
            passOver(activeIdx, i);
        }
        validateAt(i, here);
    }
    // What "advance" means here: validate in competition, mark reached in trip. A tap on the
    // active row and the remote's next command run this same action — and both are MANUAL
    // validation, which belongs to manual mode: with Auto on the GPS is the only
    // authority, so a tap says how to take over instead of quietly doing the GPS's job (#529).
    //
    // In competition the proximity gate can refuse — correctly: a scored validation cannot be
    // faked from a distance. A note you did not reach is *skipped*, which the scoring already
    // models, so that is what gets offered (#431) — named, priced, and never a fake validation from
    // far away, which would corrupt the accuracy score — and the driver is never stuck on it.
    async function advanceNote() {
        if (activeIdx >= notes.length) return;
        if (auto) return toast('Auto validation is on — switch it off to validate notes by hand.', 3500);
        if (!competition) return markReached(activeIdx);
        const i = activeIdx, far = farFrom(i);
        if (far == null) return validateAt(i, lastHere);
        const n = notes[i], pts = RB.skipPenalty(scoredSet, i, i + 1);
        let msg = t('Too far from note') + ' ' + n.num + ' · ' + RBKm(far) + '<br>' + t('Skip it and continue?');
        if (pts) msg += ' ' + t('Penalty:') + ' ' + pts + ' ' + t('pts');
        if (!(await RBConfirm(msg))) return;
        pen.skip += pts; extraAccum = 0; armed = false; // the overshoot belonged to the note being given up
        passOver(i, i + 1);
        activeIdx = i + 1; reanchor(i + 1, lastHere); updateNoteStates();
        if (activeIdx >= notes.length) finishRun(true);
    }

    /* External remote (#20): a Bluetooth page-turner PEDAL or a camera clicker pairs as a keyboard,
     * so the two commands the roadbook rows run are also reachable with your hands on the wheel.
     * RBRemote owns the key mapping and the guards (never while typing, never with a modal open);
     * the Reader only says what the commands MEAN:
     *   next — advance, exactly a tap on the active note (manual mode only, like every hand-made
     *          validation);
     *   prev — step the active note back. Trip mode only: a validated note cannot be un-validated in
     *          competition, so there it does nothing rather than pretend otherwise.
     * The pedal belongs to the device, not to one trip, so the switch is remembered in localStorage
     * instead of the run's session checkpoint. */
    const REMOTE_KEY = 'rb_remote';
    const remoteEnabled = () => { try { return localStorage.getItem(REMOTE_KEY) === '1'; } catch (e) { return false; } };
    let detachRemote = null;
    function stepBackNote() {
        if (competition) return;
        const back = activeIdx - 1;
        if (back >= 0) setActiveNote(back);
    }
    // Called whenever navigation (re)starts or the switch flips — startNav can run twice in one page
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
    $('autoBtn').onclick = () => { auto = !auto; syncAutoBtn(); toast(t(auto ? 'Auto validation on' : 'Auto validation off'), 3000); renderNotes(); };
    // re-render the translated note rows when the language changes mid-session
    window.addEventListener('rb-lang', () => { if (notes.length && !$('navScreen').hidden) renderNotes(); });
    // Pause: stop the GPS watch and release the wake lock to save battery (e.g. a lunch
    // stop). Resume restarts the same meter. The odometer simply doesn't move while paused.
    function updatePauseBtn() {
        const lbl = t(paused ? 'Resume' : 'Pause');
        $('pauseBtn').innerHTML = `<i class="fa-solid fa-${paused ? 'play' : 'pause'}"></i> ${esc(lbl)} RB`; // "RB" makes clear it pauses the roadbook run, not the GPX recording
        $('pauseBtn').title = lbl; $('pauseBtn').setAttribute('aria-label', lbl);
        litBtn($('pauseBtn'), paused);
    }
    $('pauseBtn').onclick = () => {
        if (!meter) return;
        paused = !paused;
        if (paused) { meter.stop(); setGps('bad'); $('gpsTxt').textContent = t('Paused'); } else meter.resume();
        updatePauseBtn();
    };
    // Leave the run WITHOUT a report: the progress on the notes is discarded — asked first. Finish
    // is the way to end a run and keep its report.
    $('endBtn').onclick = async () => {
        if (await RBConfirmDanger(t('Leave the run without a report? Your progress on the notes will be lost.'))) leaveRun('../');
    };
    // The run is over: release the GPS explicitly, not via the unload path (#430), drop the run
    // checkpoint and unblock the version auto-refresh. A GPX log belongs to the run, so it ends
    // with it and goes to its finished-track modal — whose explicit outcomes are the only way the
    // track's own checkpoint is cleared (#460) — before anything else happens.
    async function endRun() {
        finished = true;
        if (meter) meter.stop();
        clearSession(); window.RB_BUSY = false;
        if (RBGpxRecorder.recording) await RBGpxRecorder.handOver();
    }
    async function leaveRun(to) {
        closeModal('reportModal'); // the report is done with; the track's modal must not open under it
        await endRun();
        location.href = to;
    }
    $('navGpx').onclick = () => { if (RBGpxRecorder.recording) RBGpxRecorder.stop(); else RBGpxRecorder.settings(); };

    /* ---------- finish → the run report (#618) ---------- */
    // Finish before the last note asks first: the notes not reached count as skipped.
    $('finishBtn').onclick = async () => {
        if (activeIdx < notes.length && !(await RBConfirm(t('Finish the run now? The notes you have not reached count as skipped.')))) return;
        finishRun(activeIdx >= notes.length);
    };
    // The signed result a competition run hands to the event ranking (QR + upload).
    async function signedResult() {
        const penSpeed = pen.speed; // every zone was closed by finishRun
        const km = Math.round(tripTotalM / 1000 * 10);
        const durH = startedAt && endedAt ? (endedAt - startedAt) / 3600000 : 0;
        const avg = durH > 0 ? Math.round((tripTotalM / 1000 / durH) * 10) : 0;
        const meta = RB.buildMeta({
            team, date: RB.ddmmyy(endedAt || new Date()), start: RB.hhmmss(startedAt), end: RB.hhmmss(endedAt),
            accuracy: Math.min(9999, Math.round(pen.acc)), skip: Math.min(9999, pen.skip), extra: Math.min(9999, Math.round(pen.extra)),
            cap: Math.min(9999, Math.round(pen.cap)), speed: Math.min(9999, penSpeed), km: Math.min(99999, km), avg: Math.min(999, avg),
            rb: rbSlug || '',
        });
        return RB.signMeta(meta, (window.RB_CONFIG || {}).signKey);
    }
    async function finishRun(completed) {
        if (finished) return;
        finished = true;
        closeZone(isScored(Math.min(activeIdx, notes.length - 1))); curLimit = null; // the open zone ends with the run
        if (meter) meter.stop();
        // finished early: the notes not reached count as skipped, exactly as the confirm said
        if (competition) pen.skip += RB.skipPenalty(scoredSet, activeIdx, notes.length);
        const now = Date.now();
        const report = {
            title: (rb.meta && rb.meta.title) || 'Roadbook', roadbook_id: rbRef, event_slug: eventSlug,
            mode: competition ? 'competition' : 'trip', team: competition ? team : null, completed: completed ? 1 : 0, device: RBDeviceLabel(),
            started_at: runStartedAt, ended_at: now, duration_s: Math.round((now - (runStartedAt || now)) / 1000),
            distance_m: Math.round(tripTotalM), notes_total: notes.length, notes_reached: reached.size,
            skipped: notes.map((n, i) => (reached.has(i) ? null : n.num)).filter((x) => x != null),
            speed_zones: zones.count, speed_exceeded: zones.exceeded, max_over_kmh: zones.maxOver,
            penalties: competition ? { acc: Math.round(pen.acc), cap: Math.round(pen.cap), skip: pen.skip, extra: Math.round(pen.extra), speed: pen.speed } : null,
        };
        if (competition) report.result_meta = lastPayload = await signedResult();
        // the report is safe on the device before anything else happens — the run is over, the
        // checkpoint can go (#460: cleared only once the work has reached a safe place)
        const cfg = await RBConfig();
        const askFirst = !!(cfg.user && (cfg.user.runs_visibility || 'ask') === 'ask');
        const key = RBRun.enqueue(report, !askFirst);
        clearSession(); window.RB_BUSY = false;
        showReport(report, key, cfg.user, askFirst);
    }
    // The end of the run (#820): the card first with Share under it, then who sees the run — a
    // Private/Public switch that saves at once and can be flipped at any time — then the figures.
    function showReport(report, key, user, askFirst) {
        $('reportTitle').textContent = t(report.completed ? 'Roadbook completed' : 'Run finished');
        $('reportBadge').classList.toggle('stopped', !report.completed);
        $('reportBadge').innerHTML = `<i class="fa-solid ${report.completed ? 'fa-flag-checkered' : 'fa-circle-stop'}"></i>`;
        $('reportSub').textContent = report.title + ' · ' + RBFmtDate(new Date(report.ended_at).toISOString().slice(0, 10)) + (report.team ? ' · ' + t('Vehicle') + ' ' + report.team : '');
        $('reportStats').innerHTML = RBRun.statsHTML(report) + RBRun.detailsHTML(report);
        $('reportQr').hidden = !report.result_meta;
        if (report.result_meta) {
            lastQrUrl = RBQr.dataURL(report.result_meta); // PNG: the name, the declared type and the bytes must agree (#392)
            $('qrImg').innerHTML = `<img src="${lastQrUrl}" alt="QR" class="qr-image">`;
            $('qrMeta').textContent = report.result_meta;
        }
        $('reportProfile').hidden = !user;
        if (user) $('reportProfile').href = RBProfileLink(user.username);
        $('reportDone').onclick = () => leaveRun('./');
        openModal('reportModal', () => {}); // an explicit outcome below, never a dismiss
        // the shareable image (#785): made while the runner reads the report; once the run is saved
        // on the profile it goes up with it (best-effort — a card that fails never blocks the report)
        const cardP = makeCard(report, user);
        const vis = $('reportVis');
        if (!user) {
            // signed out: the report waits on this device and goes to the profile after sign-in
            vis.innerHTML = `<p class="notice"><i class="fa-solid fa-circle-info"></i> <span>${esc(t('Sign in to keep this report on your profile — it waits on this device until you do.'))}</span></p>
                <div class="btnrow"><a class="btn btn-ghost" href="${RBLoginUrl()}"><i class="fa-solid fa-right-to-bracket"></i> ${esc(t('Sign in'))}</a></div>`;
            return;
        }
        // choice: null until picked ("ask each time"), else the runner's default, saved right away
        let choice = askFirst ? null : (user.runs_visibility === 'public' ? 'public' : 'private');
        // Share before any choice asks first (#852): a shared card carries the run's page, so
        // sharing makes it public — Yes picks Public and then shares, No leaves everything as it is
        shareGate = async () => {
            if (choice) return true;
            if (!(await RBConfirm(t('Sharing makes this run public. Share it?')))) return false;
            await pick('public');
            return true;
        };
        let saved = null, busy = false, carded = false;
        const status = () => {
            if (!choice) return `<i class="fa-solid fa-circle-info"></i> ${esc(t('Choose who sees this run to save it to your profile.'))}`;
            if (busy) return `<i class="fa-solid fa-spinner fa-spin"></i> ${esc(t('Saving…'))}`;
            if (!saved) return `<i class="fa-solid fa-mobile-screen"></i> ${esc(t('Saved on this device — it uploads to your profile as soon as you are online.'))}`;
            return `<i class="fa-solid fa-circle-check"></i> ${esc(t(saved.is_public ? 'Saved to your profile — public.' : 'Saved to your profile — private.'))}`;
        };
        const segment = (v, icon, label) => `<button class="segment${choice === v ? ' on' : ''}" data-vis="${v}" type="button" role="radio" aria-checked="${choice === v}"${busy ? ' disabled' : ''}><i class="fa-solid ${icon}"></i> ${esc(t(label))}</button>`;
        const render = () => {
            vis.innerHTML = `<div class="report-vis">
                <span class="field-label">${esc(t('Who sees this run'))}</span>
                <div class="segmented fill" role="radiogroup">${segment('private', 'fa-lock', 'Private')}${segment('public', 'fa-globe', 'Public')}</div>
                ${askFirst && !saved && !busy ? `<label class="checkbox-row"><input type="checkbox" id="reportRemember"> <span>${esc(t('Remember my choice'))}</span></label>` : ''}
                <p class="muted small report-vis-status">${status()}</p>
            </div>`;
            vis.querySelectorAll('[data-vis]').forEach((b) => b.onclick = () => pick(b.dataset.vis));
            // an unpicked report would never leave the device (#460), and leaving mid-save would send it
            // twice: the upload lands, but the page is gone before the queue can drop it
            $('reportDone').disabled = !choice || busy;
        };
        // the card follows the run: uploaded once it is saved, and Share sends the run's page while it is public (#803)
        const followCard = async () => {
            cardLink = saved && saved.is_public ? RBPublicLink('/run/' + saved.id) : null;
            const blob = await cardP;
            if (!blob || !saved || carded) return;
            carded = true;
            await RBUpload({ type: 'run_card', run: String(saved.id) }, new File([blob], 'run.png', { type: 'image/png' }), 'run.png').catch(() => {});
        };
        const upload = async () => {
            busy = true; render();
            const res = await RBRun.flush();
            saved = res[key] || null; busy = false;
            if (saved) { choice = saved.is_public ? 'public' : 'private'; followCard(); }
            render();
        };
        async function pick(v) {
            if (v === choice || busy) return;
            const first = !choice;
            choice = v;
            if (first) { RBRun.update(key, { ready: true, visibility: v, remember: !!(vis.querySelector('#reportRemember') || {}).checked }); return upload(); }
            if (!saved) { RBRun.update(key, { visibility: v }); return render(); } // still on the device: it goes up as chosen
            busy = true; render();
            const x = await RBApi('run_update', { id: saved.id, is_public: v === 'public' ? 1 : 0 });
            busy = false;
            if (x.ok) { saved.is_public = v === 'public' ? 1 : 0; followCard(); }
            else { choice = saved.is_public ? 'public' : 'private'; toast(x.error || 'Could not save.'); }
            render();
        }
        render();
        if (!askFirst) upload();
    }
    // The run card: rendered once per report, shown, shared and saved from the same Blob.
    let cardBlob = null, cardLink = null, cardReport = null, shareGate = async () => true;
    async function makeCard(report, user) {
        cardBlob = null; cardLink = null; cardReport = report; shareGate = async () => true;
        try { cardBlob = await RBRunCard.render({ report, roadbook: rb, username: user && user.username }); }
        catch (e) { cardBlob = null; }
        if (cardBlob) { $('reportCardImg').src = URL.createObjectURL(cardBlob); $('reportCardImg').hidden = false; }
        else $('reportCard').hidden = true; // no card, no hero: the figures take the dialog
        $('cardShare').disabled = $('cardSave').disabled = !cardBlob;
        return cardBlob;
    }
    const cardName = () => 'rdbk-' + RB.slug((rb.meta && rb.meta.title) || 'run') + '-' + RB.ddmmyy(new Date()) + '.png';
    $('cardShare').onclick = async () => {
        if (!cardBlob || !(await shareGate())) return;
        RBShareFile(cardBlob, cardName(), RBRun.shareText(cardReport, cardLink));
    };
    $('cardSave').onclick = () => { if (cardBlob) RBDownload(cardBlob, cardName()); };
    $('qrDownload').onclick = () => RBDownload(lastQrUrl, 'RB_' + team + '_' + RB.ddmmyy(new Date()) + '.png');
    $('qrShare').onclick = async () => RBShareFile(await (await fetch(lastQrUrl)).blob(), 'RB_' + team + '.png', lastPayload);
    // reports that finished offline or signed out go up as soon as the Reader can reach the server
    cfgReady.then(() => { if (meUser) { RBRun.settleAbandoned(); RBRun.flush(); } });

    /* ---------- utils ---------- */
    // An action-bar button that is ON swaps ghost for primary: stacked, .btn-ghost (declared later
    // in app.css) would win and the lit state would never show.
    function litBtn(b, on) { b.classList.toggle('btn-primary', on); b.classList.toggle('btn-ghost', !on); }
    const pad = (n, w) => String(n).padStart(w, '0'); // display padding (bearing, clock); META codecs live in the core
})();
