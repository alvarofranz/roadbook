'use strict';
/* RBGpxRecorder — crash-safe GPX track logging, shared by the Tripmaster, the
 * Reader (the log every run keeps) and the Recorder (the route it records). It starts at once —
 * no settings to answer: one point every SAMPLE_MS, a date-and-time name — and owns a
 * localStorage checkpoint recovered after a crash, and the finished-track modal (download ·
 * convert into a roadbook in the Editor, which is where a kept track gets its name). The
 * page reflects on/off state via init({ onChange }) and feeds GPS fixes with feed().
 * Crash safety is the localStorage checkpoint — always available, on every platform;
 * the file itself is written once at the end via RBDownload. */
window.RBGpxRecorder = (() => {
    // one point every 2 s: dense enough for a car at speed, light enough for a day on a bike
    const CHECKPOINT_KEY = 'rb_trip_gpx', SAMPLE_MS = 2000;
    let on = false, pts = [], lastT = 0, fileName = '';
    let useCheckpoint = true, lastPersist = 0;
    let onChange = () => {}, toast = () => {};

    const pad2 = RB.pad2; // shared zero-pad (roadbook-core)
    const defaultName = () => {
        const d = new Date();
        return 'RDBK_trip_' + pad2(d.getDate()) + pad2(d.getMonth() + 1) + pad2(d.getFullYear() % 100) + '_' + pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds());
    };
    const trackKm = (p) => p.length ? RB.cumulativeM(p)[p.length - 1] / 1000 : 0;
    const download = (p, name) => RBDownload(new Blob([RB.gpxDocument(name || defaultName(), p)], { type: 'application/gpx+xml' }), (name || defaultName()) + '.gpx');
    function persist(tnow) {
        // One crash checkpoint per 3 s window, however fast points arrive — serialising the
        // whole growing track on every point would cost O(n²) over a session.
        if (tnow - lastPersist < 3000) return;
        lastPersist = tnow;
        if (useCheckpoint) RBCheckpoint.write(CHECKPOINT_KEY, { pts, name: fileName });
    }

    // checkpoint: false → the caller keeps its own richer crash checkpoint (the
    // Editor's route recording does), so this one stays out of its way.
    // The new log's checkpoint is written at once: until its first point, the one left by an
    // earlier log (declined, or another tool's) would otherwise be what a crash resumes from.
    // opts.name: the log's name (default: date and time) — the Recorder names its route with it
    function begin(opts = {}) {
        fileName = opts.name || defaultName();
        on = true; pts = []; lastT = 0; lastPersist = 0; useCheckpoint = opts.checkpoint !== false;
        if (useCheckpoint) RBCheckpoint.write(CHECKPOINT_KEY, { pts, name: fileName });
        onChange(true); toast('Recording GPX track.');
    }
    // sampled intake (Tripmaster + Reader): one point per interval, junk fixes dropped
    function feed(coords, here, tnow) {
        if (!on || RB.recJunkFix(coords.accuracy) || tnow - lastT < SAMPLE_MS) return;
        pts.push({ lat: here.lat, lon: here.lon, ele: (coords.altitude != null && isFinite(coords.altitude)) ? coords.altitude : null, t: tnow });
        lastT = tnow; persist(tnow); // crash-safe: the localStorage checkpoint
    }
    // direct intake (Editor route recording): the caller already decided this point belongs
    function add(here, tnow) { if (!on) return; pts.push({ lat: here.lat, lon: here.lon, ele: here.ele ?? null, t: tnow }); persist(tnow); }
    const clearCheckpoint = () => { try { localStorage.removeItem(CHECKPOINT_KEY); } catch (e) {} };
    // End the log, KEEPING the crash checkpoint: it is cleared only when the points reach a safe
    // destination (download / convert / the caller's own store), so a stray dismissal can never
    // lose a recording — until then a reload offers recovery (#217). A caller that takes the
    // points owns that promise: it calls `clearCheckpoint()` at the destination, never before (#460).
    function end() {
        on = false; onChange(false);
        return { pts: pts.slice(), name: fileName };
    }
    // End the log and hand it to the standard finished-track modal; resolves once the modal is
    // done with (a download or a confirmed discard — Convert leaves the page). The caller that
    // ends a log along with its own work (the Reader's run) uses this directly.
    function handOver() {
        const r = end();
        if (r.pts.length >= 2) return new Promise((done) => finishedModal(r.pts, r.name, done));
        toast('Track too short.'); clearCheckpoint();
        return Promise.resolve();
    }
    // The user's Stop asks first: it kills the live watch and a recording can't seamlessly
    // restart (#217).
    async function stop() {
        if (!(await RBConfirm(RBt('Stop recording?')))) return;
        return handOver();
    }
    // Continue a log: after a reload from the checkpoint, or — when the caller still holds the
    // points end() handed it — from those, which are fresher than the last 3 s checkpoint.
    function resume(savedName, fromPts) {
        fileName = savedName || defaultName();
        const saved = RBCheckpoint.read(CHECKPOINT_KEY);
        pts = fromPts ? fromPts.slice() : ((saved && saved.pts) || []); lastT = 0; on = true; onChange(true);
    }
    // The user said No to picking this log back up: mark it, never delete it (#436).
    const decline = () => RBCheckpoint.decline(CHECKPOINT_KEY);
    // Offer to rescue an orphaned checkpoint (crash/closed tab with no session to resume). A No is
    // remembered on the checkpoint and never asked again — it is not deleted (#436); a Yes hands the
    // points to the finished-track modal, whose destinations clear it (#460 · #686). A new
    // recording's checkpoint replaces a declined one.
    async function offerRecovery() {
        const saved = RBCheckpoint.read(CHECKPOINT_KEY);
        if (!saved || !saved.pts || saved.pts.length < 2 || saved.declined) return;
        const t = RBt;
        if (await RBConfirm(t('Recover unsaved GPX recording?') + ' (' + saved.pts.length + ' ' + t('points') + ')')) return finishedModal(saved.pts, saved.name || defaultName());
        decline();
    }
    // onDone: called once the modal has closed on an outcome that stays on the page
    function finishedModal(finished, name, onDone = () => {}) {
        const t = RBt;
        // Not dismissable: the recording only leaves through an explicit outcome — download,
        // convert, or a confirmed discard — never a stray backdrop tap or Escape (#217). Each
        // outcome (and only it) clears the crash checkpoint.
        const summary = `${finished.length} ${t('points')} · ${trackKm(finished).toFixed(2)} km`;
        const d = RBModal(`<h3>${t('Recorded track')}</h3>
            <p class="muted small">${summary}</p>
            <div class="btnrow center wrap">
                <button class="btn btn-ghost" id="trDl"><i class="fa-solid fa-download"></i> ${t('Download GPX')}</button>
                <button class="btn btn-primary" id="trEd"><i class="fa-solid fa-map-location-dot"></i> ${t('Convert into roadbook')}</button>
            </div>
            <div class="btnrow center"><button class="btn btn-danger" id="trDiscard"><i class="fa-solid fa-trash"></i> ${t('Discard')}</button></div>`, 'slim center', null, { dismissable: false });
        d.q('#trDl').onclick = () => { download(finished, name); clearCheckpoint(); d.close(); onDone(); };
        d.q('#trEd').onclick = () => { try { sessionStorage.setItem('rb_trip_track', JSON.stringify(finished)); } catch (e) {} clearCheckpoint(); location.href = '../editor/?trip=1'; };
        d.q('#trDiscard').onclick = async () => {
            if (!(await RBConfirmDanger(t('Discard this recording?') + '<br>' + summary))) return; // the same line the modal shows, so the confirm names exactly what goes
            clearCheckpoint(); d.close(); onDone();
        };
    }

    return {
        begin, stop, handOver, end, clearCheckpoint, decline, feed, add, resume, offerRecovery,
        get recording() { return on; },
        get fileName() { return fileName; },
        init(opts) { onChange = opts.onChange || onChange; toast = opts.toast || toast; },
    };
})();
