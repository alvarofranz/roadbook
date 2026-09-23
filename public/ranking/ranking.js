'use strict';
/* RDBK Ranking — the classification of ONE scored roadbook inside an event, opened as
 * /ranking/?event=<slug>&rb=<slug> from the event page. It lives on the server (event_results,
 * #590): every organizer device sees and edits the same list, and the event's active participants
 * read it. A competition run of a signed-in participant enters it by itself; results brought to
 * the desk as a QR are scanned or pasted here. Accuracy, CAP, speed and regularity are computed
 * from each signed result (RB.rankEntry) into a final score — lower is better. */
(function () {
    const $ = (id) => document.getElementById(id);
    const t = RBt, esc = RBesc;
    const params = new URLSearchParams(location.search);
    const scope = { event: params.get('event'), rb: params.get('rb') };
    let results = [], isOrg = false, rows = [];
    let stream = null, scanning = false;

    if (!scope.event || !scope.rb) { $('noEvent').hidden = false; return; }

    // Why the classification is not shown — the reason that fits, never "sign in" to someone who is
    // signed in (#625), and never an empty page (#626).
    function gate(reason, signIn) {
        $('gateMsg').textContent = t(reason);
        $('gateSignIn').hidden = !signIn;
        if (signIn) $('gateSignInLink').href = RBLoginUrl();
        $('gate').hidden = false; $('rankTools').hidden = true; $('rankResults').hidden = true;
    }
    const REFUSALS = {
        'Not allowed.': 'Only this event’s organizers and active participants can see its ranking.',
        'Not found.': 'This roadbook is not a scored roadbook of this event.',
    };
    async function load() {
        const cfg = await RBConfig();
        if (!cfg.user) return gate('Sign in to see this event’s ranking.', true);
        const r = await RBApi('ranking_list', scope);
        if (!r.ok) return gate(r.error === 'Network error.' ? 'You are offline — reconnect to load this event.' : (REFUSALS[r.error] || r.error));
        results = r.results; isOrg = r.is_org;
        // a result the server has not judged (valid null — a run the Reader sent, #590) is checked
        // here, the same signature check as a scanned QR
        const key = (window.RB_CONFIG || {}).signKey;
        await Promise.all(results.filter((x) => x.valid === null).map(async (x) => { x.valid = (await RB.verifyMeta(x.meta, key)).valid ? 1 : 0; }));
        $('evHeader').hidden = false;
        $('evHeader').innerHTML = `<a href="/event/${encodeURIComponent(r.event.slug)}"><i class="fa-solid fa-calendar-check"></i> ${esc(r.event.title)}</a> · <i class="fa-solid fa-book"></i> ${esc(r.roadbook.title)}`;
        $('gate').hidden = true; $('rankResults').hidden = false;
        $('rankTools').hidden = !isOrg; $('orgTools').hidden = !isOrg; // participants read, organizers edit (#608)
        render();
    }
    load();
    window.addEventListener('rb-lang', () => { if (results.length || isOrg) render(); });

    /* ---------- adding a result (organizers) ---------- */
    async function addMeta(str) {
        if (!str) return;
        const { meta, valid } = await RB.verifyMeta(str, (window.RB_CONFIG || {}).signKey);
        const m = RB.parseMeta(meta);
        if (!m.team || !/^\d+$/.test(m.team)) return msg(t('Code not recognized.'), true);
        // The QR carries only a fixed-width slug prefix (RB.metaRbPrefix), so compare like against like.
        if (m.rb && m.rb !== RB.metaRbPrefix(scope.rb)) return msg(t('This result is for a different roadbook.'), true);
        const team = String(parseInt(m.team, 10));
        const body = Object.assign({}, scope, { meta: str, team, valid: valid === false ? 0 : 1 });
        let x = await RBApi('ranking_add', body);
        if (x.ok && x.duplicate) return msg(t('This result is already in the ranking.') + ' · ' + t('Vehicle') + ' ' + team, false);
        // another result for a vehicle already listed replaces it only when asked (#607)
        if (x.ok && x.conflict) {
            if (!(await RBConfirm(t('Vehicle') + ' ' + team + ' ' + t('already has a result. Replace it with this one?')))) return;
            x = await RBApi('ranking_add', Object.assign(body, { replace: 1 }));
        }
        if (!x.ok) return msg(x.error || t('Could not save.'), true);
        $('manualMeta').value = '';
        const added = t('Added vehicle') + ' ' + team;
        msg(valid === false ? t('Invalid signature') + ' · ' + added : added, valid === false);
        load();
    }
    $('addManual').onclick = () => addMeta($('manualMeta').value.trim());
    $('manualMeta').addEventListener('keydown', (e) => { if (e.key === 'Enter') addMeta($('manualMeta').value.trim()); });

    $('scanBtn').onclick = async () => {
        if (scanning) return stopScan();
        try {
            stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
            const v = $('video'); v.hidden = false; v.srcObject = stream; await v.play();
            scanning = true; $('scanBtn').innerHTML = `<i class="fa-solid fa-stop"></i> ${esc(t('Stop'))}`;
            loopScan();
        } catch (e) { msg(t('Could not open the camera') + ': ' + e.message, true); }
    };
    async function loopScan() {
        if (!scanning) return;
        const track = stream && stream.getVideoTracks()[0];
        if (!track || track.readyState === 'ended') { stopScan(); return msg(t('Camera stopped.'), true); }
        try {
            const raw = await RBQrScan.detect($('video'));
            if (raw) { stopScan(); return addMeta(raw.trim()); }
        } catch (e) { /* no frame yet */ }
        requestAnimationFrame(loopScan);
    }
    function stopScan() {
        scanning = false;
        if (stream) stream.getTracks().forEach((tr) => tr.stop());
        stream = null; $('video').hidden = true;
        $('scanBtn').innerHTML = `<i class="fa-solid fa-camera"></i> ${esc(t('Scan QR'))}`;
    }

    /* ---------- the classification ---------- */
    function render() {
        const avgTarget = parseFloat($('targetAvg').value) || 0;
        rows = results.map((r) => Object.assign(RB.rankEntry(RB.parseMeta(RB.metaOf(r.meta)), avgTarget), { id: r.id, valid: r.valid, fromRun: r.from_run }))
            .sort((a, b) => a.finalScore - b.finalScore);
        $('empty').hidden = !!rows.length;
        if (!rows.length) { $('table').innerHTML = ''; return; }
        const bad = `<i class="fa-solid fa-triangle-exclamation icon-danger" title="${esc(t('Invalid signature'))}" aria-label="${esc(t('Invalid signature'))}"></i> `;
        $('table').innerHTML =
            `<thead><tr><th scope="col">${esc(t('Rank'))}</th><th scope="col">${esc(t('Vehicle'))}</th><th scope="col">km</th><th scope="col">${esc(t('Accuracy'))}</th><th scope="col">CAP</th><th scope="col">${esc(t('Speed'))}</th><th scope="col">${esc(t('Regularity'))}</th><th scope="col">${esc(t('Final'))}</th>${isOrg ? '<th scope="col"></th>' : ''}</tr></thead>`
            + '<tbody>' + rows.map((r, i) => `<tr class="${i === 0 ? 'top' : ''}"><td>${i + 1}</td><td>${r.valid === 0 ? bad : ''}${esc(r.team)}</td><td>${r.km.toFixed(1)}</td>`
                + `<td>${r.accuracy}</td><td>${r.cap}</td><td>${r.speed}</td><td>${r.reg}</td><td class="final-score">${r.finalScore}</td>`
                + (isOrg ? `<td><button class="btn btn-ghost btn-sm" data-del="${r.id}" data-team="${esc(r.team)}" type="button" title="${esc(t('Remove'))}" aria-label="${esc(t('Remove'))}"><i class="fa-solid fa-trash-can icon-danger"></i></button></td>` : '') + '</tr>').join('')
            + '</tbody>';
        $('table').querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
            if (!(await RBConfirmDanger(t('Remove vehicle') + ' ' + esc(b.dataset.team) + '?'))) return;
            const x = await RBApi('ranking_remove', Object.assign({}, scope, { id: +b.dataset.del }));
            if (x.ok) load(); else RBToast(x.error || 'Could not remove.');
        });
    }
    $('targetAvg').addEventListener('input', render);
    $('clearAll').onclick = async () => {
        if (!results.length) return;
        if (!(await RBConfirmDanger(t('Clear all results?') + ' (' + results.length + ')'))) return;
        const x = await RBApi('ranking_clear', scope);
        if (x.ok) load(); else RBToast(x.error || 'Could not remove.');
    };
    $('exportCsv').onclick = () => {
        if (!rows.length) return;
        const head = ['rank', 'vehicle', 'km', 'accuracy', 'cap', 'speed', 'regularity', 'final', 'valid'];
        const lines = rows.map((r, i) => [i + 1, r.team, r.km.toFixed(1), r.accuracy, r.cap, r.speed, r.reg, r.finalScore, r.valid === 0 ? 'no' : 'yes'].join(','));
        RBDownload(new Blob([head.join(',') + '\n' + lines.join('\n')], { type: 'text/csv' }), 'rdbk-ranking-' + scope.rb + '.csv');
    };

    function msg(text, err) { const el = $('msg'); el.textContent = text; el.classList.toggle('err', !!err); el.classList.toggle('ok', !err); }
})();
