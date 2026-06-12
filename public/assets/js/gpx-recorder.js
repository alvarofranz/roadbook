'use strict';
/* RBGpxRecorder — crash-safe GPX track logging, shared by the Tripmaster and
 * the Reader (optional log while navigating). Owns the settings modal (sample
 * rate, file name, optional live File System Access handle), a localStorage
 * checkpoint recovered after a crash, and the finished-track modal (download ·
 * convert into a roadbook in the Editor). The page reflects on/off state via
 * init({ onChange }) and feeds GPS fixes with feed(). */
window.RBGpxRecorder = (() => {
    const CHECKPOINT_KEY = 'rb_trip_gpx', SETTINGS_KEY = 'rb_gpx_settings';
    let on = false, pts = [], lastT = 0, sampleMs = 3000, fileName = '', fileHandle = null;
    let onChange = () => {}, toast = () => {};
    try { const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null'); if (s && s.freq) sampleMs = s.freq; } catch (e) {}

    const pad2 = (n) => String(n).padStart(2, '0');
    const defaultName = () => {
        const d = new Date();
        return 'RDBK_trip_' + pad2(d.getDate()) + pad2(d.getMonth() + 1) + pad2(d.getFullYear() % 100) + '_' + pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds());
    };
    const trackKm = (p) => { let m = 0; for (let i = 1; i < p.length; i++) m += RB.geo.haversineM(p[i - 1], p[i]); return m / 1000; };
    const download = (p, name) => RBDownload(new Blob([RB.gpxDocument(name || defaultName(), p)], { type: 'application/gpx+xml' }), (name || defaultName()) + '.gpx');
    async function writeFile() { if (!fileHandle) return; try { const w = await fileHandle.createWritable(); await w.write(RB.gpxDocument(fileName, pts)); await w.close(); } catch (e) {} }
    function checkpoint() { try { localStorage.setItem(CHECKPOINT_KEY, JSON.stringify({ pts, name: fileName })); } catch (e) {} writeFile(); }

    function begin() { on = true; pts = []; lastT = 0; onChange(true); toast('Recording GPX track.'); }
    // every fix lands here; points are sampled on the configured interval, junk fixes dropped
    function feed(coords, here, tnow) {
        if (!on || (coords.accuracy != null && coords.accuracy > 35) || tnow - lastT < sampleMs) return;
        pts.push({ lat: here.lat, lon: here.lon, ele: (coords.altitude != null && isFinite(coords.altitude)) ? coords.altitude : null, t: tnow });
        lastT = tnow; checkpoint(); // crash-safe: localStorage + live file write
    }
    async function stop() {
        on = false; onChange(false);
        await writeFile(); // final flush to the live file before we report "saved"
        const finished = pts.slice(), name = fileName, savedToFile = !!fileHandle;
        fileHandle = null;
        try { localStorage.removeItem(CHECKPOINT_KEY); } catch (e) {}
        if (finished.length >= 2) finishedModal(finished, name, savedToFile); else toast('Track too short.');
    }
    // continue an interrupted log after a reload (a live file handle cannot survive one)
    function resume(savedName) {
        fileName = savedName || defaultName();
        let saved; try { saved = JSON.parse(localStorage.getItem(CHECKPOINT_KEY) || 'null'); } catch (e) {}
        pts = (saved && saved.pts) || []; lastT = 0; on = true; onChange(true);
    }
    // offer to rescue an orphaned checkpoint (crash/closed tab with no session to resume)
    async function offerRecovery() {
        let saved; try { saved = JSON.parse(localStorage.getItem(CHECKPOINT_KEY) || 'null'); } catch (e) {}
        if (!saved || !saved.pts || saved.pts.length < 2) return;
        const t = RBt;
        const yes = await RBConfirm(t('Recover unsaved GPX recording?') + ' (' + saved.pts.length + ' ' + t('points') + ')', t('Recover'));
        try { localStorage.removeItem(CHECKPOINT_KEY); } catch (e) {}
        if (yes) finishedModal(saved.pts, saved.name || defaultName(), false);
    }
    function settings() {
        const t = RBt, fsa = 'showSaveFilePicker' in window;
        const d = RBModal(`<h3>${t('Record GPX')}</h3>
            <label class="muted small">${t('Sample every (seconds)')}</label>
            <input id="gxFreq" class="modal-in" type="number" min="1" max="60" inputmode="numeric" value="${Math.round(sampleMs / 1000)}">
            <label class="muted small">${t('File name')}</label>
            <input id="gxName" class="modal-in" type="text" value="${defaultName()}">
            <p class="muted small" id="gxLoc">${fsa ? t('Tip: choose a file to save live to disk (crash-safe).') : t('Auto-saved while recording, recovered if the app closes.')}</p>
            <div class="btnrow between">
                ${fsa ? `<button class="btn btn-ghost" id="gxPick"><i class="fa-solid fa-folder-open"></i> ${t('Choose file…')}</button>` : '<span></span>'}
                <span class="btn-group"><button class="btn btn-ghost" id="gxX">${t('Cancel')}</button><button class="btn btn-primary" id="gxGo"><i class="fa-solid fa-circle-dot"></i> ${t('Start')}</button></span>
            </div>`, 'narrow');
        let picked = null;
        d.q('#gxX').onclick = d.close;
        if (fsa) d.q('#gxPick').onclick = async () => {
            try {
                picked = await window.showSaveFilePicker({ suggestedName: d.q('#gxName').value + '.gpx', types: [{ description: 'GPX', accept: { 'application/gpx+xml': ['.gpx'] } }] });
                d.q('#gxLoc').textContent = '✓ ' + picked.name;
                d.q('#gxName').value = picked.name.replace(/\.gpx$/i, '');
            } catch (e) {}
        };
        d.q('#gxGo').onclick = () => {
            sampleMs = Math.max(1, Math.min(60, parseInt(d.q('#gxFreq').value, 10) || 3)) * 1000;
            fileName = (d.q('#gxName').value || defaultName()).trim();
            fileHandle = picked;
            try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ freq: sampleMs })); } catch (e) {}
            d.close(); begin();
        };
    }
    function finishedModal(finished, name, savedToFile) {
        const t = RBt;
        const d = RBModal(`<h3>${t('Recorded track')}</h3>
            <p class="muted small">${finished.length} ${t('points')} · ${trackKm(finished).toFixed(2)} km${savedToFile ? '<br>✓ ' + t('Saved to file') : ''}</p>
            <div class="btnrow center wrap">
                ${savedToFile ? '' : `<button class="btn btn-ghost" id="trDl"><i class="fa-solid fa-download"></i> ${t('Download GPX')}</button>`}
                <button class="btn btn-primary" id="trEd"><i class="fa-solid fa-map-location-dot"></i> ${t('Convert into roadbook')}</button>
            </div>
            <div class="btnrow center"><button class="btn btn-ghost" id="trClose">${t('Close')}</button></div>`, 'slim center');
        const dl = d.q('#trDl'); if (dl) dl.onclick = () => { download(finished, name); d.close(); };
        d.q('#trEd').onclick = () => { try { sessionStorage.setItem('rb_trip_track', JSON.stringify(finished)); } catch (e) {} location.href = '../editor/?trip=1'; };
        d.q('#trClose').onclick = d.close;
    }

    return {
        settings, begin, stop, feed, resume, offerRecovery,
        get recording() { return on; },
        get fileName() { return fileName; },
        init(opts) { onChange = opts.onChange || onChange; toast = opts.toast || toast; },
    };
})();
