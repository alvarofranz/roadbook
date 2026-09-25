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

    // The Reader's dialogs are static markup; give them the shared focus trap (focus in · Tab
    // confined). One that can be left without deciding anything takes `onClose`: its corner close
    // (RBModalX) and Escape run it. Without it the dialog is a decision — nothing but its own
    // buttons leave it.
    let modalTrap = null;
    function openModal(id, onClose) {
        const el = $(id), card = el.querySelector('.modal-card');
        if (onClose) RBModalX(card, onClose);
        el.hidden = false; if (modalTrap) modalTrap(); modalTrap = RBFocusTrap(card, onClose || null);
    }
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
    // the "use the app" recommendation, in a browser only (as in the Recorder)
    $('rdNativeHint').hidden = $('prNativeHint').hidden = document.documentElement.classList.contains('native');
    $('rbFile').onchange = async (e) => { const f = e.target.files[0]; if (f) try { loadRb(await RBZip.readRdbk(f)); } catch (err) { toast(err.report ? 'This file is not a valid .rdbk roadbook.' : 'Could not load the roadbook.'); } };
    // The public roadbook gallery on the load screen — the same one as /roadbooks/ (#636). A card
    // links to /reader/<slug> — the deep link the Navigate button uses — so opening one navigates
    // here with the slug, where the startup below loads it (sign-in gate included).
    RBChallenges.gallery({ grid: $('readerGallery'), pager: $('readerPager'), search: $('readerSearch'), href: (r) => RBChallenges.ROOT + 'reader/' + encodeURIComponent(r.slug) });
    $('previewBack').onclick = () => { location.href = RBChallenges.ROOT + 'reader/'; }; // back to the load screen (#638)
    // "My roadbooks": shown only when signed in; a picker of the user's saved roadbooks.
    // RBConfig: offline, a signed-in user is still signed in (#630).
    const cfgReady = RBConfig().then((c) => { meUser = !!c.user; if (meUser) $('pickMine').hidden = false; });
    $('pickMine').onclick = async () => {
        const busy = RBBusy('pickMine');
        const r = await RBApi('rb_list');
        busy.reset();
        if (!r.ok) return toast(navigator.onLine === false ? 'You are offline — reconnect to see your roadbooks.' : (r.error || 'Could not load.'));
        RBRowPicker({
            title: 'My roadbooks', icon: 'fa-folder-open', items: r.roadbooks || [], fields: ['title'],
            empty: 'No roadbooks yet. Create one in the Editor.',
            rowHTML: (rb, i) => RBChallenges.pickerRow(rb, i), // the shared picker row (#639)
            onPick: async (rb, modal) => {
                modal.close();
                const j = await RBApi('rb_get', { id: +rb.id });
                if (j.ok && j.roadbook) loadRb(j.roadbook, j.id, j.slug); else toast(j.error || 'Could not load the roadbook.');
            },
        });
    };
    // the GPX log is a run option chosen at the start, and it ends with the run (#936)
    RBGpxRecorder.init({ toast, onChange: () => saveSession() });
    // Resume an interrupted run first; otherwise fall back to a challenge passed
    // in the URL, then to rescuing an orphaned GPX recording.
    (async function () {
        await cfgReady;
        RBWebGpsWarn(); // browser-only floating warning: web GPS is unreliable on phones
        let session = RBCheckpoint.read(SESSION_KEY);
        let savedRb = null;
        if (session && session.pen) {
            savedRb = RBCheckpoint.read(SESSION_RB_KEY);
            if (!savedRb || savedRb.rdbk_version !== RB.FORMAT_VERSION) session = null; // a roadbook of another .rdbk version is no run to resume
        } else session = null;
        if (!session) clearSession(); // an unrecoverable checkpoint is just litter
        // reports that finished offline or signed out go up now — except the legs of a chained run
        // that may still be resumed: they wait for its end, where its runner picks who sees it
        if (meUser) { RBRun.settleAbandoned(session && !session.declined ? (session.legs || []).map((l) => l.key) : []); RBRun.flush(); }
        // A roadbook opened explicitly via the URL (e.g. the challenge "Navigate" button → /reader/<slug>).
        const pub = RBChallenges.publicFromUrl();
        const rbId = +(new URLSearchParams(location.search).get('rb') || 0); // open a personal (private) roadbook by id — owner only (#71)
        const adminRbId = +(new URLSearchParams(location.search).get('admin_rb') || 0); // admins: open any user's roadbook (admin panel "View")
        const loadFromUrl = () => {
            if (pub) {
                RBChallenges.loadPublic(pub).then((j) => { loadRb(j.roadbook, j.id, j.slug); }).catch(() => toast('Could not load the roadbook.'));
            } else if (rbId > 0) {
                RBApi('rb_get', { id: rbId }).then((j) => { if (j.ok && j.roadbook) { loadRb(j.roadbook, j.id, j.slug); } else toast(j.error || 'Could not load the roadbook.'); }).catch(() => toast('Could not load the roadbook.'));
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
                endRun();
                resetRun();
            }
            try { loadRb(await RBZip.readRdbk(await params.files[0].getFile())); } catch (e) { toast(e.report ? 'This file is not a valid .rdbk roadbook.' : 'Could not load the roadbook.'); }
        });
    }

    let competition = false;
    let eventSlug = new URLSearchParams(location.search).get('event'); // opened from an event: it decides the mode (#155 · #617)
    /* A chained run (#944): an event may chain its roadbooks — at one's last note the runner picks
       the next and carries on, in the same run, and sees one report at the very end. Every roadbook
       stays its own run on the server (its completions, its classification: one result per leg).
       `chain`: the event's roadbooks ({id, slug, title, scoring_mode, next}), null outside an event ·
       `legs`: the finished legs ({key, slug} — each report already waiting on the device, its
       roadbook while in memory) · `chainCache`: the next roadbooks, fetched when a leg starts so the
       choice at its end works offline. */
    let chain = null, legs = [], chainCache = {};
    const chainEntry = () => (chain && chain.find((x) => x.slug === rbSlug)) || null;
    const isScoredEntry = (er) => !!(er && er.scoring_mode && er.scoring_mode !== 'free');
    const nextOptions = () => {
        const er = chainEntry();
        return er ? (er.next || []).map((n) => { const to = chain.find((x) => x.id === n.id); return to && { label: n.label || to.title, entry: to }; }).filter(Boolean) : [];
    };
    /* Live tracking for the event's organizers (#947 · #970 · #976): a participant of an event shares
       their last position whenever they navigate one of its roadbooks — opened from the event or not,
       on its dates or any other day. Whether they want to is asked ONCE per event and kept on the
       server (live_status · live_consent). The Live switch in the action bar shows it the whole run
       and changes it: off asks first and holds for this run; on starts sending at once (and turns a
       no given for the event into a yes). The last trusted position goes up (RB.liveDue); a failed
       send just waits for the next fix — no backlog. It stops for good with the run. */
    const live = { events: [], sent: null, tried: null, busy: false, on: false };
    const syncLiveBtn = () => { const b = $('liveBtn'); b.hidden = !live.events.length || finished; b.classList.toggle('on', live.on); b.setAttribute('aria-checked', String(live.on)); };
    async function liveStart() {
        live.on = false; live.events = []; live.sent = null; live.tried = null; syncLiveBtn();
        if (!meUser || !rbRef) return;
        const r = await RBApi('live_status', { roadbook_id: rbRef });
        if (!r.ok) return;
        live.events = r.events || [];
        const ask = live.events.filter((e) => e.consent === null);
        if (ask.length) {
            const yes = await RBConfirm(t('Share your live position with the organizers of {events} while you navigate its roadbooks?').replace('{events}', ask.map((e) => '<b>' + esc(e.title) + '</b>').join(', '))
                + '<br><span class="muted small">' + esc(t('Asked once for this event. Only its organizers see it, only while you navigate — your last position. The Live switch turns it off for a run.')) + '</span>');
            await Promise.all(ask.map((e) => RBApi('live_consent', { event_id: e.id, consent: yes ? 1 : 0 })));
            ask.forEach((e) => { e.consent = yes ? 1 : 0; });
        }
        live.on = !finished && RB.liveAllowed(live.events);
        syncLiveBtn();
    }
    async function liveTick(here, coords, speedKmh) {
        if (!live.on || live.busy || paused || !RB.liveDue(live.sent, live.tried, here, Date.now())) return;
        live.busy = true; live.tried = Date.now();
        const skipped = notes.slice(0, activeIdx).filter((n, i) => !reached.has(i)).length;
        const r = await RBApi('live_ping', {
            roadbook_id: rbRef, team: competition ? team : '', lat: here.lat, lon: here.lon,
            acc: coords && coords.accuracy, speed: speedKmh, heading: meter && meter.heading, note_idx: activeIdx, notes_total: notes.length, reached: reached.size, skipped,
        });
        live.busy = false;
        if (r.ok) live.sent = { at: Date.now(), lat: here.lat, lon: here.lon };
        else if (r.error !== 'Network error.') liveEnd(false); // refused (no longer a participant…): never again this run
    }
    // Sharing stops: its last position stays with the organizers, marked as the end
    function liveEnd(tell = true) {
        if (live.on && tell) RBApi('live_stop', { roadbook_id: rbRef });
        live.on = false; syncLiveBtn();
    }
    // The Live switch (#976): off asks first — the organizers lose sight of you — and holds for this
    // run; on starts again at once, the next fix already on its way
    $('liveBtn').onclick = async () => {
        if (live.on) {
            if (!(await RBConfirm(t('Stop sharing your position with the organizers for this run?')))) return;
            liveEnd(); toast('Live position off for this run.');
            return;
        }
        const no = live.events.filter((e) => e.consent !== 1);
        await Promise.all(no.map((e) => RBApi('live_consent', { event_id: e.id, consent: 1 })));
        no.forEach((e) => { e.consent = 1; });
        live.on = !finished && RB.liveAllowed(live.events); live.sent = null; live.tried = null;
        syncLiveBtn();
        if (live.on) { toast('Live position on: the organizers see you.'); if (lastHere) liveTick(lastHere, { accuracy: lastAcc }, 0); }
    };
    window.addEventListener('online', () => { if (live.on && lastHere) liveTick(lastHere, { accuracy: lastAcc }, 0); });
    const prefetchNext = () => nextOptions().forEach(({ entry }) => {
        if (!chainCache[entry.slug]) RBChallenges.loadPublic(entry.slug).then((j) => { chainCache[entry.slug] = j; }).catch(() => {});
    });
    // `id` + `slug`: the server roadbook it is, so the run report can point at it and a competition
    // result names it — a local file has neither
    // `doc`: a .rdbk document, from a file or the server
    function loadRb(doc, id, slug) {
        const r = RB.readRoadbook(doc);
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
    // Navigate navigates (#936): no options to answer first. The GPX log always runs with the run,
    // and the validation sound is always on. The mode is never a question either (#617):
    // competition exists for an event's Ranking, so a roadbook opened from an event whose roadbook
    // is SCORED runs in competition — the vehicle number, which the result needs, is the one thing
    // asked — and everything else runs as a trip.
    // "Map access from player" is a roadbook-level setting (default allowed when absent): it decides
    // whether the Reader has a map at all — the action-bar toggle and the preview's tap-to-map (#569).
    const mapAllowed = () => !(rb && rb.meta && rb.meta.map_allowed === false);
    // The success bell when a note is validated, auto or manual (#768) — the same bell the Recorder
    // rings on a note — and the fanfare on the last one: the roadbook is completed (#843).
    const ring = (i) => (i === notes.length - 1 ? RBSuccess.fanfare : RBSuccess.ring)();
    $('navigateBtn').onclick = async (e) => {
        RBSuccess.unlock(); // inside the tap itself: iOS lets a sound play later only after one
        auto = true; // a fresh run validates by GPS; the runner's switch then holds through every leg
        const busy = RBBusy(e.currentTarget);
        if (eventSlug) { // does this event score the roadbook, and what does it chain it to?
            const j = await RBApi('event_get', { slug: eventSlug });
            chain = j.ok ? (j.roadbooks || []).map((x) => ({ id: +x.id, slug: x.slug, title: x.title, scoring_mode: x.scoring_mode, next: x.next || [] })) : null;
        }
        busy.reset();
        const comp = isScoredEntry(chainEntry());
        if (!(await RBWebGpsConfirm(comp))) return; // one-time browser warning (stronger for a scored run)
        if (!comp) return startRun(false);
        askTeam();
    };
    // the vehicle number a scored run needs — asked once per run, a later scored leg keeps it
    function askTeam() {
        $('teamInput').value = team !== '0' ? team : '1';
        openModal('teamModal', leaveTeam);
        setTimeout(() => $('teamInput').select(), 60);
    }
    $('teamOk').onclick = () => { team = ($('teamInput').value || '1').replace(/\D/g, '').slice(0, 3) || '1'; closeModal('teamModal'); startRun(true); };
    // left without a number: back to the preview — or, between two legs, the run ends with the legs already driven
    function leaveTeam() { closeModal('teamModal'); if (legs.length) finalize(); }
    $('teamInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('teamOk').click(); });
    // a roadbook's run: its GPX log from the first fix (a resumed one restores it), and the next
    // roadbooks of a chain fetched while there is a connection
    function startRun(comp) { startNav(comp); RBGpxRecorder.begin(); prefetchNext(); liveStart(); }
    function startNav(comp) {
        competition = comp; window.RB_BUSY = true; // don't auto-refresh mid-run
        preview = false; document.body.classList.remove('rb-preview'); // leaving the read-only look
        scoredSet = RB.scoredNoteSet(notes);
        $('loadScreen').hidden = true; $('navScreen').hidden = false;
        // Immersive navigation: the Reader owns the screen (its own action row carries the exit
        // button), so the global bottom tab bar hides — no cramped triple bottom stack (#app-tabbar).
        document.body.classList.add('rb-immersive');
        if (runStartedAt == null) runStartedAt = Date.now(); // a resumed run keeps its own start
        publishBottomStack();
        syncAutoBtn();
        $('mapBtn').hidden = !mapAllowed(); syncMapBtn();
        RBCheckpoint.write(SESSION_RB_KEY, rb); // roadbook stored once; live counters checkpoint separately
        renderNotes();
        paused = false; updatePauseBtn();
        syncRemote(); // hands-free advance while navigating (#20)
        if (meter) meter.stop(); // startNav can run again in the same page life — one watch at a time
        meter = new RBGpsMeter(onFix, () => setGps('bad'));
        clearInterval(clockTimer); // startNav can run again in the same page life — never stack clocks
        clockTimer = setInterval(() => { const now = new Date(); $('odoClock').textContent = pad(now.getHours(), 2) + ':' + pad(now.getMinutes(), 2); }, 1000);
        setTimeout(() => RBTour('reader', READER_TOUR), 700); // the first run, while still standing (#906)
    }
    // The Reader's guided tour (#906): what the navigation screen's controls do, once
    const READER_TOUR = [
        { target: '#noteList', title: 'The roadbook', text: 'The next note always sits on top, and turns blue as you close in.' },
        { target: '.odometer-bar', title: 'Odometers', text: 'Total and partial: they line up with the roadbook at every note.' },
        { target: '#autoBtn', title: 'Auto', text: 'On, the GPS validates each note as you reach it. Off, tap the note yourself.' },
        { target: '#mapBtn', title: 'Note map', text: 'A map of where you are, with an arrow pointing at the next note.' },
        { target: '#pauseBtn', title: 'Pause', text: 'Stops the clock and the odometers.' },
        { target: '#finishBtn', title: 'Finish', text: 'Ends the run and shows your report.' },
    ];
    let clockTimer = null;

    /* ---------- session checkpoint: survive reloads and OS tab kills ---------- */
    function saveSession() {
        if (!meter || finished) return; // nothing to checkpoint before a run starts or once it is over
        const s = { openedAs, rbSlug, eventSlug, chain, legs: legs.map(({ key, slug }) => ({ key, slug })), competition, team, auto, gpxRecording: RBGpxRecorder.recording, gpxFileName: RBGpxRecorder.fileName, activeIdx, reached: [...reached], totalM: tripTotalM, partialM: tripPartialM, pen, zones, rbRef, runStartedAt, curLimit, maxSpdSeg, extraAccum, armed, startedAt: startedAt ? startedAt.getTime() : null, endedAt: endedAt ? endedAt.getTime() : null };
        RBCheckpoint.write(SESSION_KEY, s);
    }
    function clearSession() { try { localStorage.removeItem(SESSION_KEY); localStorage.removeItem(SESSION_RB_KEY); } catch (e) {} }
    // A declined resume is marked, not deleted: asking twice is nagging, deleting is data loss.
    // The flag lives only on this checkpoint — the next run writes a fresh one without it.
    const declineSession = () => RBCheckpoint.decline(SESSION_KEY);
    function resumeSession(s, savedRb) {
        tripTotalM = s.totalM; tripPartialM = s.partialM;
        rb = savedRb; notes = rb.notes; routeCum = RB.cumulativeM(rb.track || []);
        team = s.team; auto = s.auto;
        activeIdx = s.activeIdx; reached = new Set(s.reached); pen = s.pen; curLimit = s.curLimit; maxSpdSeg = s.maxSpdSeg;
        zones = s.zones; rbRef = s.rbRef; rbSlug = s.rbSlug; eventSlug = s.eventSlug; openedAs = s.openedAs; runStartedAt = s.runStartedAt;
        chain = s.chain || null; legs = s.legs || [];
        extraAccum = s.extraAccum; armed = s.armed;
        startedAt = s.startedAt ? new Date(s.startedAt) : null;
        endedAt = s.endedAt ? new Date(s.endedAt) : null;
        startNav(s.competition);
        if (s.gpxRecording) RBGpxRecorder.resume(s.gpxFileName);
        prefetchNext(); liveStart();
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
        liveTick(here, coords, speedKmh);
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
                else resyncFrom(here, coords.accuracy, disp);
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
            if (i !== activeIdx) row.classList.remove('near', 'arriving'); // the live proximity state belongs to the active note alone
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
    // It opens on NOTE_MAP_RADIUS_M around you — about a kilometre across, enough to see the road
    // ahead and the waypoint in it — whatever the screen; the rider zooms in or out from there.
    const NOTE_MAP_RADIUS_M = 500;
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
        inlineMap = new RBMap('nmapMap', { zoom: 15, center: [centre.lon, centre.lat], bearing: lastHere ? heading : 0, layerToggle: true, geolocate: true, headingToggle: true });
        if (inlineMap.map) inlineMap.map.jumpTo({ zoom: inlineMap.zoomForRadius(NOTE_MAP_RADIUS_M) }); // sized to the map as laid out
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
    // Everything that depends on where we are RIGHT NOW: the active row's proximity state and the
    // note map's distance to go. Driven by every trusted fix, and again whenever the active note
    // changes, so no readout is ever left describing the note before it (#387).
    function refreshLive() {
        const an = notes[activeIdx], live = an && lastHere;
        paintApproach(live ? RB.geo.haversineM(lastHere, an) : null);
        paintMapTogo();
    }
    // Live proximity on the active row: the roadbook stays paper, but the note you are driving to
    // reacts as you close in — `near` inside the manual radius, `arriving` once inside the reach
    // circle, where auto-validation fires (both on the straight line: that is what the radius
    // measures). The distance still to run lives on the note map alone (#935), never on the row.
    function paintApproach(dist) {
        const row = $('noteList').querySelector('.nrow.active');
        if (!row) return;
        const arriving = dist != null && dist <= reachRadius(activeIdx);
        row.classList.toggle('arriving', arriving);
        row.classList.toggle('near', !arriving && dist != null && dist <= C.MANUAL_RADIUS_M);
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
    // The run re-syncs to where the rider is (#931): when the active note is behind and the rider is
    // following the track towards the next ones (RB.routeResync), the cursor moves to the first note
    // ahead and every note passed on the way is SKIPPED — exactly as a manual jump leaves them, with
    // the same penalty in competition. Nothing is validated by it: it only saves the tap. The trail
    // is the recent moving fixes since the active note last changed.
    let resyncTrail = [], resyncIdx = -1;
    function resyncFrom(here, acc, disp) {
        if (resyncIdx !== activeIdx) { resyncTrail = []; resyncIdx = activeIdx; }
        if (!(disp > 0)) return; // standing still says nothing about the route
        resyncTrail.push({ lat: here.lat, lon: here.lon, acc });
        if (resyncTrail.length > 8) resyncTrail.shift();
        const j = RB.routeResync(rb, routeCum, activeIdx, resyncTrail, reachRadius);
        if (j <= activeIdx) return;
        if (competition) pen.skip += RB.skipPenalty(scoredSet, activeIdx, j);
        extraAccum = 0; armed = false;
        passOver(activeIdx, j);
        activeIdx = j; reanchor(j, here); updateNoteStates();
    }
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

    /* External remote (#20 · #909): a Bluetooth pedal, handlebar controller or clicker pairs as a
     * keyboard, and its buttons run the actions of the rider's own mapping (the profile's "Remote
     * buttons"). It simply works while navigating — no switch to remember. RBRemote owns the mapping
     * and the guards (never while typing, never with a modal open); the Reader says what they MEAN:
     *   next — advance, exactly a tap on the active note (manual mode only, like every hand-made validation);
     *   prev — step the active note back; trip mode only (a validated note cannot be undone in competition);
     *   auto · map · pause — the action bar's own switches. */
    let detachRemote = null;
    function stepBackNote() {
        if (competition) return;
        const back = activeIdx - 1;
        if (back >= 0) setActiveNote(back);
    }
    // Called whenever navigation (re)starts — startNav can run twice in one page life, and attaching
    // twice would advance twice per press.
    function syncRemote() {
        if (detachRemote) { detachRemote(); detachRemote = null; }
        if (!$('navScreen').hidden && !preview) detachRemote = RBRemote.attach({
            next: advanceNote, prev: stepBackNote,
            auto: () => $('autoBtn').click(),
            map: () => { if (!$('mapBtn').hidden) $('mapBtn').click(); },
            pause: () => $('pauseBtn').click(),
        });
    }
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
        $('pauseBtn').innerHTML = `<i class="fa-solid fa-${paused ? 'play' : 'pause'}"></i> ${esc(lbl)}`;
        litBtn($('pauseBtn'), paused);
    }
    $('pauseBtn').onclick = () => {
        if (!meter) return;
        paused = !paused;
        if (paused) { meter.stop(); setGps('bad'); $('gpsTxt').textContent = t('Paused'); } else meter.resume();
        updatePauseBtn();
    };
    // The run is over: release the GPS explicitly, not via the unload path (#430), drop the run
    // checkpoint and unblock the version auto-refresh. A run left unfinished (another file opened
    // over it) ends its GPX log too — its checkpoint stays, so the track is offered back (#460).
    function endRun() {
        finished = true;
        liveEnd();
        if (meter) meter.stop();
        if (RBGpxRecorder.recording) RBGpxRecorder.end();
        clearSession(); window.RB_BUSY = false;
    }
    function leaveRun(to) {
        closeModal('reportModal');
        endRun();
        location.href = to;
    }

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
    // The end of a roadbook: its leg closes, and then either the next one of the chain starts or
    // the run ends with its report
    async function finishRun(completed) {
        if (finished) return;
        finished = true;
        const leg = await closeLeg(completed);
        legs.push({ key: leg.key, slug: rbSlug, report: leg.report, rb });
        const options = completed ? nextOptions() : [];
        while (options.length) {
            const to = await pickNext(options);
            if (!to) break;
            const j = chainCache[to.entry.slug] || await RBChallenges.loadPublic(to.entry.slug).catch(() => null);
            if (j) return startLeg(j, to.entry);
            toast(navigator.onLine === false ? 'You are offline — reconnect to load the next roadbook.' : 'Could not load the roadbook.');
        }
        finalize();
    }
    // A leg's report — its roadbook, its notes, its penalties and signed result, its track — safe on
    // the device before anything else happens, waiting for the run's end to be made public or private
    async function closeLeg(completed) {
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
        if (competition) report.result_meta = await signedResult();
        // the track the run drove belongs to the run (#940): it travels with the report, public or private
        report.track = RBGpxRecorder.recording ? RBGpxRecorder.end().pts : [];
        // the checkpoints go only once the report is safe (#460): a device too full to hold it keeps
        // the track's own checkpoint, which the next start offers back
        const { key, stored } = RBRun.enqueue(report, false);
        if (stored) RBGpxRecorder.clearCheckpoint();
        clearSession(); window.RB_BUSY = false;
        return { key, report };
    }
    // At the last note of a chained roadbook: carry on with one of the next, or finish here. An
    // explicit choice — no backdrop, no Escape — though nothing is lost either way: the leg is safe.
    function pickNext(options) {
        return new Promise((resolve) => {
            const d = RBModal(`<h2><i class="fa-solid fa-flag-checkered icon-accent"></i> ${esc(t('Roadbook completed'))}</h2>
                <p class="muted small">${esc((rb.meta && rb.meta.title) || t('Roadbook'))} · ${esc(t('Carry on with the next roadbook, or finish the run here.'))}</p>
                <div class="btnrow stack">${options.map((o, i) => `<button class="btn btn-primary" type="button" data-next="${i}"><i class="fa-solid fa-route"></i> ${esc(o.label)}</button>`).join('')}
                    <button class="btn btn-ghost" type="button" data-finish><i class="fa-solid fa-circle-stop"></i> ${esc(t('Finish here'))}</button></div>`, 'narrow', null, { dismissable: false });
            d.q('[data-finish]').onclick = () => { d.close(); resolve(null); };
            d.el.querySelectorAll('[data-next]').forEach((b) => b.onclick = () => { d.close(); resolve(options[+b.dataset.next]); });
        });
    }
    // The next leg: the same run carries on, on a fresh roadbook — its own notes, odometers and
    // penalties, its mode from the event, its own GPX log
    function startLeg(j, entry) {
        resetRun(); closeInlineMap();
        rb = RB.readRoadbook(j.roadbook); notes = rb.notes; routeCum = RB.cumulativeM(rb.track || []); rbRef = +j.id; rbSlug = j.slug;
        toast(t('Next roadbook:') + ' ' + ((rb.meta && rb.meta.title) || entry.title), 3500);
        const comp = isScoredEntry(entry);
        if (comp && team === '0') return askTeam();
        startRun(comp);
    }
    // The end of the whole run: one report for every leg
    async function finalize() {
        liveEnd();
        const cfg = await RBConfig();
        const askFirst = !!(cfg.user && (cfg.user.runs_visibility || 'ask') === 'ask');
        const done = legs.map((l) => ({ key: l.key, rb: l.rb, report: l.report || (RBRun.get(l.key) || {}).report })).filter((l) => l.report);
        // the runner's own choice made once: every leg goes up at the runner's preference
        if (!askFirst) done.forEach((l) => RBRun.update(l.key, { ready: true }));
        legs = [];
        showReport(done, cfg.user, askFirst);
    }
    // One roadbook for the card of a chained run: every leg's route and notes, in order
    function chainRoadbook(done) {
        const withRb = done.filter((l) => l.rb);
        const notesAll = [], skipped = [];
        withRb.forEach((l) => l.rb.notes.forEach((n) => {
            const num = notesAll.length + 1;
            notesAll.push({ num, lat: n.lat, lon: n.lon });
            if ((l.report.skipped || []).includes(n.num)) skipped.push(num);
        }));
        return {
            roadbook: { meta: { title: withRb.map((l) => (l.rb.meta && l.rb.meta.title) || '').join(' → '), map_allowed: withRb.every((l) => !l.rb.meta || l.rb.meta.map_allowed !== false) }, notes: notesAll, track: withRb.flatMap((l) => l.rb.track || []) },
            skipped,
        };
    }
    // The end of the run (#820): the card first with Share under it, then who sees the run — a
    // Private/Public switch that saves at once and can be flipped at any time — then the figures.
    function showReport(done, user, askFirst) {
        const keys = done.map((l) => l.key), reports = done.map((l) => l.report), chained = reports.length > 1;
        const report = chained ? RBRun.combine(reports) : reports[0];
        const card = chained ? chainRoadbook(done) : { roadbook: (done[0] && done[0].rb) || rb, skipped: report.skipped };
        if (chained) report.skipped = card.skipped;
        $('reportTitle').textContent = t(report.completed ? 'Roadbook completed' : 'Run finished');
        $('reportBadge').classList.toggle('stopped', !report.completed);
        $('reportBadge').innerHTML = `<i class="fa-solid ${report.completed ? 'fa-flag-checkered' : 'fa-circle-stop'}"></i>`;
        $('reportSub').textContent = report.title + ' · ' + RBFmtDate(new Date(report.ended_at).toISOString().slice(0, 10)) + (report.team ? ' · ' + t('Vehicle') + ' ' + report.team : '');
        $('reportStats').innerHTML = RBRun.statsHTML(report) + (chained ? RBRun.legsHTML(reports) : RBRun.detailsHTML(report));
        // the track it drove, on a map and as a GPX — the runner's own, whatever the run's visibility
        $('reportTrack').hidden = report.track.length < 2;
        $('reportTrackView').onclick = () => RBRun.showTrack(report.track, { title: report.title, download: true });
        $('reportGpx').onclick = () => RBRun.downloadGpx(report.track, report.title);
        // one signed result per scored leg — each enters its own roadbook's classification
        const results = reports.filter((r) => r.result_meta);
        $('reportQr').hidden = !results.length;
        $('reportQr').innerHTML = results.map((r, i) => `<div class="report-qr">
            ${chained ? `<span class="field-label">${esc(r.title)}</span>` : ''}
            <div class="qr-box"><img src="${RBQr.dataURL(r.result_meta)}" alt="QR" class="qr-image"></div>
            <code class="qr-code-text">${esc(r.result_meta)}</code>
            <div class="btnrow">
                <button class="btn btn-ghost" data-qr-share="${i}" type="button"><i class="fa-solid fa-share-nodes"></i> ${esc(t('Share'))}</button>
                <button class="btn btn-ghost" data-qr-save="${i}" type="button"><i class="fa-solid fa-download"></i> ${esc(t('Save QR'))}</button>
            </div></div>`).join('');
        // PNG: the name, the declared type and the bytes must agree (#392)
        const qrName = (r) => 'RB_' + (r.team || team) + '_' + (chained ? RB.slug(r.title) + '_' : '') + RB.ddmmyy(new Date(r.ended_at)) + '.png';
        $('reportQr').querySelectorAll('[data-qr-save]').forEach((b) => b.onclick = () => { const r = results[+b.dataset.qrSave]; RBDownload(RBQr.dataURL(r.result_meta), qrName(r)); });
        $('reportQr').querySelectorAll('[data-qr-share]').forEach((b) => b.onclick = async () => { const r = results[+b.dataset.qrShare]; RBShareFile(await (await fetch(RBQr.dataURL(r.result_meta))).blob(), qrName(r), r.result_meta); });
        $('reportProfile').hidden = !user;
        if (user) $('reportProfile').href = RBProfileLink(user.username);
        const leave = () => leaveRun(eventSlug ? '/event/' + encodeURIComponent(eventSlug) : './'); // a run opened from an event goes back to it (#640)
        $('reportDone').disabled = false;
        $('reportDone').onclick = leave;
        openModal('reportModal'); // an explicit outcome below, never a dismiss
        // the shareable image (#785): made while the runner reads the report; once the run is saved
        // on the profile it goes up with it (best-effort — a card that fails never blocks the report)
        const cardP = makeCard(report, user, card.roadbook);
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
        // `saved`: the runs on the profile, one per leg — all of them, or null while any still waits
        let saved = null, busy = false, carded = false;
        const status = () => {
            if (!choice) return `<i class="fa-solid fa-circle-info"></i> ${esc(t('Choose who sees this run to save it to your profile.'))}`;
            if (busy) return `<i class="fa-solid fa-spinner fa-spin"></i> ${esc(t('Saving…'))}`;
            if (!saved) return `<i class="fa-solid fa-mobile-screen"></i> ${esc(t('Saved on this device — it uploads to your profile as soon as you are online.'))}`;
            return `<i class="fa-solid fa-circle-check"></i> ${esc(t(saved[0].is_public ? 'Saved to your profile — public.' : 'Saved to your profile — private.'))}`;
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
            // leaving mid-save would send it twice: the upload lands, but the page is gone before the queue can drop it
            $('reportDone').disabled = busy;
        };
        // An unpicked report would never leave the device (#460), so Done asks for the choice first
        // (#968): it stays pressable and points at the Private / Public switch, instead of sitting
        // greyed out with nothing to say why.
        $('reportDone').onclick = () => {
            if (choice) return leave();
            const box = vis.querySelector('.report-vis');
            box.classList.remove('attention'); void box.offsetWidth; box.classList.add('attention'); // replay the nudge on every tap
            box.querySelector('.report-vis-status').innerHTML = `<i class="fa-solid fa-hand-point-up"></i> ${esc(t('Choose Private or Public to finish.'))}`;
            box.scrollIntoView({ behavior: 'smooth', block: 'center' });
        };
        // the card follows the run: uploaded once it is saved, and Share sends the run's page while it is public (#803)
        // every leg's run carries the card of the whole run; Share sends the first one's page
        const followCard = async () => {
            cardLink = saved && saved[0].is_public ? RBPublicLink('/run/' + saved[0].id) : null;
            const blob = await cardP;
            if (!blob || !saved || carded) return;
            carded = true;
            for (const run of saved) await RBUpload({ type: 'run_card', run: String(run.id) }, new File([blob], 'run.png', { type: 'image/png' }), 'run.png').catch(() => {});
        };
        const upload = async () => {
            busy = true; render();
            const res = await RBRun.flush();
            saved = keys.every((k) => res[k]) ? keys.map((k) => res[k]) : null; busy = false;
            if (saved) { choice = saved[0].is_public ? 'public' : 'private'; followCard(); }
            render();
        };
        async function pick(v) {
            if (v === choice || busy) return;
            const first = !choice;
            choice = v;
            if (first) { keys.forEach((k) => RBRun.update(k, { ready: true, visibility: v, remember: !!(vis.querySelector('#reportRemember') || {}).checked })); return upload(); }
            if (!saved) { keys.forEach((k) => RBRun.update(k, { visibility: v })); return render(); } // still on the device: it goes up as chosen
            busy = true; render();
            const xs = await Promise.all(saved.map((run) => RBApi('run_update', { id: run.id, is_public: v === 'public' ? 1 : 0 })));
            busy = false;
            const failed = xs.find((x) => !x.ok);
            saved.forEach((run, i) => { if (xs[i].ok) run.is_public = v === 'public' ? 1 : 0; });
            if (!failed) followCard();
            else { choice = saved[0].is_public ? 'public' : 'private'; toast(failed.error || 'Could not save.'); }
            render();
        }
        render();
        if (!askFirst) upload();
    }
    // The run card: rendered once per report, shown, shared and saved from the same Blob.
    let cardBlob = null, cardLink = null, cardReport = null, shareGate = async () => true;
    async function makeCard(report, user, roadbook) {
        cardBlob = null; cardLink = null; cardReport = report; shareGate = async () => true;
        try { cardBlob = await RBRunCard.render({ report, roadbook, username: user && user.username }); }
        catch (e) { cardBlob = null; }
        if (cardBlob) { $('reportCardImg').src = URL.createObjectURL(cardBlob); $('reportCardImg').hidden = false; }
        else $('reportCard').hidden = true; // no card, no hero: the figures take the dialog
        $('cardShare').disabled = $('cardSave').disabled = !cardBlob;
        return cardBlob;
    }
    const cardName = () => 'rdbk-' + RB.slug((cardReport && cardReport.title) || 'run') + '-' + RB.ddmmyy(new Date()) + '.png';
    $('cardShare').onclick = async () => {
        if (!cardBlob || !(await shareGate())) return;
        RBShareFile(cardBlob, cardName(), RBRun.shareText(cardReport, cardLink));
    };
    $('cardSave').onclick = () => { if (cardBlob) RBDownload(cardBlob, cardName()); };

    /* ---------- utils ---------- */
    // An action-bar button that is ON swaps ghost for primary: stacked, .btn-ghost (declared later
    // in app.css) would win and the lit state would never show.
    function litBtn(b, on) { b.classList.toggle('btn-primary', on); b.classList.toggle('btn-ghost', !on); }
    const pad = (n, w) => String(n).padStart(w, '0'); // display padding (bearing, clock); META codecs live in the core
})();
