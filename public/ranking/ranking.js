'use strict';
/* RDBK Ranking — collects results (QR via camera or pasted), computes accuracy,
 * CAP, speed and regularity, and a final score (lower = better). */
(function () {
    const $ = (id) => document.getElementById(id);
    const t = RBt, esc = RBesc; // shared helpers (i18n.js / app.js)
    let entries = load();
    let stream = null, scanning = false, detector = null;

    if ('BarcodeDetector' in window) { try { detector = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch (e) {} }

    /* ---------- add ---------- */
    $('addManual').onclick = () => addMeta($('manualMeta').value.trim());
    $('manualMeta').addEventListener('keydown', (e) => { if (e.key === 'Enter') addMeta($('manualMeta').value.trim()); });
    $('targetAvg').addEventListener('input', render); // live-recompute the regularity column

    async function addMeta(str) {
        if (!str) return;
        const { meta, valid } = await RB.verifyMeta(str, (window.RB_CONFIG || {}).signKey);
        const m = RB.parseMeta(meta);
        if (!m.team || !/^\d+$/.test(m.team)) { msg('Code not recognized.', true); return; }
        entries.push({ raw: str, m, valid, ts: Date.now() + '.' + Math.floor(Math.random() * 1e6) });
        save(); render();
        $('manualMeta').value = '';
        const added = t('Added vehicle') + ' ' + parseInt(m.team, 10);
        msg(valid === false ? '⚠ ' + t('Invalid signature') + ' · ' + added : (valid === true ? '✓ ' : '') + added, valid === false);
    }

    /* ---------- camera ---------- */
    $('scanBtn').onclick = async () => {
        if (scanning) return stopScan();
        if (!detector) { msg('Your browser does not support camera scanning; paste the code by hand.', true); return; }
        try {
            stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            const v = $('video'); v.hidden = false; v.srcObject = stream; await v.play();
            scanning = true; $('scanBtn').innerHTML = `<i class="fa-solid fa-stop"></i> ${RBt('Stop')}`;
            loopScan();
        } catch (e) { msg(t('Could not open the camera') + ': ' + e.message, true); }
    };
    async function loopScan() {
        if (!scanning) return;
        const track = stream && stream.getVideoTracks()[0];
        if (!track || track.readyState === 'ended') { stopScan(); msg('Camera stopped.', true); return; } // permission revoked / camera lost
        try {
            const codes = await detector.detect($('video'));
            if (codes && codes.length) {
                const val = codes[0].rawValue;
                await addMeta(val.trim());
                stopScan();
                return;
            }
        } catch (e) {}
        requestAnimationFrame(loopScan);
    }
    function stopScan() {
        scanning = false;
        if (stream) stream.getTracks().forEach((t) => t.stop());
        stream = null; $('video').hidden = true; $('scanBtn').innerHTML = `<i class="fa-solid fa-camera"></i> ${RBt('Scan QR')}`;
    }

    /* ---------- render (the scoring itself is RB.rankEntry — shared with the Reader's tests, #169) ---------- */
    let lastRows = [];
    function render() {
        // Regularity reference = the organizer-set target average; the run's own m.avg is informational only.
        const avgTarget = parseFloat($('targetAvg').value) || 0;
        const rows = entries.map((e) => Object.assign(RB.rankEntry(e.m, avgTarget), { valid: e.valid, ts: e.ts })).sort((a, b) => a.finalScore - b.finalScore);
        lastRows = rows;
        $('empty').hidden = !!rows.length;
        if (!rows.length) { $('table').innerHTML = ''; return; }
        $('table').innerHTML =
            `<thead><tr><th scope="col">${RBt('Rank')}</th><th scope="col">${RBt('Vehicle')}</th><th scope="col">km</th><th scope="col">${RBt('Accuracy')}</th><th scope="col">CAP</th><th scope="col">${RBt('Speed')}</th><th scope="col">${RBt('Regularity')}</th><th scope="col">${RBt('Final')}</th><th scope="col"></th></tr></thead>`
            + '<tbody>' + rows.map((r, i) =>
                `<tr class="${i === 0 ? 'top' : ''}"><td>${i + 1}</td><td>${r.valid === false ? `<span title="${t('Invalid signature')}" aria-label="${t('Invalid signature')}" class="icon-danger">⚠</span> ` : ''}${r.team}</td><td>${r.km.toFixed(1)}</td>`
                + `<td>${r.accuracy}</td><td>${r.cap}</td><td>${r.speed}</td><td>${r.reg}</td><td class="final-score">${r.finalScore}</td>`
                + `<td><button class="link-delete" data-del="${r.ts}" title="${t('Remove')}" aria-label="${t('Remove')}">✕</button></td></tr>`).join('')
            + '</tbody>';
        $('table').querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
            if (await RBConfirmDanger(t('Remove vehicle') + ' ' + RBesc(entries.find((e) => String(e.ts) === b.dataset.del)?.m.team) + '?', 'Remove')) {
                entries = entries.filter((e) => String(e.ts) !== b.dataset.del); save(); render();
            }
        });
    }
    $('clearAll').onclick = async () => { if (await RBConfirmDanger('Clear all results?', 'Clear')) { entries = []; save(); render(); } };
    $('exportCsv').onclick = () => {
        if (!lastRows.length) return;
        const head = ['rank', 'vehicle', 'km', 'accuracy', 'cap', 'speed', 'regularity', 'final', 'valid'];
        const lines = lastRows.map((r, i) => [i + 1, r.team, r.km.toFixed(1), r.accuracy, r.cap, r.speed, r.reg, r.finalScore, r.valid === false ? 'no' : 'yes'].join(','));
        RBDownload(new Blob([head.join(',') + '\n' + lines.join('\n')], { type: 'text/csv' }), 'rdbk-ranking.csv');
    };

    /* ---------- persistence ---------- */
    function load() { try { return JSON.parse(localStorage.getItem('rb_ranking') || '[]'); } catch (e) { return []; } }
    function save() { localStorage.setItem('rb_ranking', JSON.stringify(entries)); }

    function msg(text, err) { const el = $('msg'); el.textContent = RBt(text); el.classList.toggle('err', !!err); el.classList.toggle('ok', !err); }

    render();
})();
