'use strict';
/* RB Ranking — recoge resultados (QR por cámara o pegados), calcula precisión,
 * CAP, velocidad y regularidad, y una puntuación final (menor = mejor). */
(function () {
    const $ = (id) => document.getElementById(id);
    const C = RB.CONST;
    let entries = load();
    let stream = null, scanning = false, detector = null;

    if ('BarcodeDetector' in window) { try { detector = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch (e) {} }

    /* ---------- añadir ---------- */
    $('addManual').onclick = () => addMeta($('manualMeta').value.trim());
    $('manualMeta').addEventListener('keydown', (e) => { if (e.key === 'Enter') addMeta($('manualMeta').value.trim()); });

    async function addMeta(str) {
        if (!str) return;
        const { meta, valid } = await RB.verifyMeta(str, (window.RB_CONFIG || {}).signKey);
        const m = RB.parseMeta(meta);
        if (!m.team || !/^\d+$/.test(m.team)) { msg('Code not recognized.', true); return; }
        entries.push({ raw: str, m, valid, ts: Date.now() + '.' + Math.floor(Math.random() * 1e6) });
        save(); render();
        $('manualMeta').value = '';
        msg((valid === false ? '⚠ INVALID signature · ' : valid === true ? '✓ ' : '') + 'Added vehicle ' + parseInt(m.team, 10), valid === false);
    }

    /* ---------- cámara ---------- */
    $('scanBtn').onclick = async () => {
        if (scanning) return stopScan();
        if (!detector) { msg('Your browser does not support camera scanning; paste the code by hand.', true); return; }
        try {
            stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            const v = $('video'); v.hidden = false; v.srcObject = stream; await v.play();
            scanning = true; $('scanBtn').innerHTML = '<i class="fa-solid fa-stop"></i> Stop';
            loopScan();
        } catch (e) { msg('Could not open the camera: ' + e.message, true); }
    };
    async function loopScan() {
        if (!scanning) return;
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
        stream = null; $('video').hidden = true; $('scanBtn').innerHTML = '<i class="fa-solid fa-camera"></i> Scan QR';
    }

    /* ---------- cálculo ---------- */
    const toSec = (hhmmss) => { const s = String(hhmmss).padStart(6, '0'); return (+s.slice(0, 2)) * 3600 + (+s.slice(2, 4)) * 60 + (+s.slice(4, 6)); };
    function compute(e) {
        const m = e.m;
        const accuracy = num(m.accuracy) + num(m.skip) + num(m.extra);
        const cap = num(m.cap);
        const speed = num(m.speed);
        const km = num(m.km) / 10;
        const avg = num(m.avg) > 0 ? num(m.avg) / 10 : (parseFloat($('targetAvg').value) || 30);
        let reg = 0;
        let actual = toSec(m.end) - toSec(m.start);
        if (actual < 0) actual += 86400; // run crossed midnight
        if (avg > 0 && km > 0 && actual > 0) {
            const expected = Math.round(3600 * km / avg);
            const early = Math.max(0, expected - actual);
            const late = Math.max(0, actual - expected);
            reg = early + Math.max(0, late - C.REG_GRACE_S);
        }
        const finalScore = accuracy + cap + speed + reg;
        return { team: parseInt(m.team, 10), km, accuracy, cap, speed, reg, finalScore, valid: e.valid };
    }
    const num = (x) => { const n = parseInt(x, 10); return isFinite(n) ? n : 0; };

    /* ---------- render ---------- */
    let lastRows = [];
    function render() {
        const rows = entries.map((e) => Object.assign(compute(e), { ts: e.ts })).sort((a, b) => a.finalScore - b.finalScore);
        lastRows = rows;
        $('empty').style.display = rows.length ? 'none' : '';
        if (!rows.length) { $('table').innerHTML = ''; return; }
        $('table').innerHTML =
            `<thead><tr><th>#</th><th>Vehicle</th><th>km</th><th>Accuracy</th><th>CAP</th><th>Speed</th><th>Regularity</th><th>Final</th><th></th></tr></thead>`
            + '<tbody>' + rows.map((r, i) =>
                `<tr class="${i === 0 ? 'top' : ''}"><td>${i + 1}</td><td>${r.valid === false ? '<span title="Invalid signature" class="icon-danger">⚠</span> ' : ''}${r.team}</td><td>${r.km.toFixed(1)}</td>`
                + `<td>${r.accuracy}</td><td>${r.cap}</td><td>${r.speed}</td><td>${r.reg}</td><td class="fs">${r.finalScore}</td>`
                + `<td><button class="link-delete" data-del="${r.ts}" title="Remove">✕</button></td></tr>`).join('')
            + '</tbody>';
        $('table').querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
            if (await RBConfirm('Remove vehicle ' + entries.find((e) => e.ts == b.dataset.del)?.m.team + '?', 'Remove')) {
                entries = entries.filter((e) => String(e.ts) !== b.dataset.del); save(); render();
            }
        });
    }
    $('clearAll').onclick = async () => { if (await RBConfirm('Clear all results?', 'Clear')) { entries = []; save(); render(); } };
    $('exportCsv').onclick = () => {
        if (!lastRows.length) return;
        const head = ['rank', 'vehicle', 'km', 'accuracy', 'cap', 'speed', 'regularity', 'final', 'valid'];
        const lines = lastRows.map((r, i) => [i + 1, r.team, r.km.toFixed(1), r.accuracy, r.cap, r.speed, r.reg, r.finalScore, r.valid === false ? 'no' : 'yes'].join(','));
        const csv = head.join(',') + '\n' + lines.join('\n');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
        a.download = 'rdbk-ranking.csv'; document.body.appendChild(a); a.click(); a.remove();
    };

    /* ---------- persistencia ---------- */
    function load() { try { return JSON.parse(localStorage.getItem('rb_ranking') || '[]'); } catch (e) { return []; } }
    function save() { localStorage.setItem('rb_ranking', JSON.stringify(entries)); }

    let toastT = null;
    function msg(t, err) { $('msg').textContent = t; $('msg').style.color = err ? 'var(--track)' : 'var(--ok)'; }

    render();
})();
