'use strict';
/* RBRun — the report of a navigated run (#618), shared by the Reader (which builds it at the end
 * of a run) and the public profile (which lists them, #620).
 *
 *  · statsHTML(run)  the tiles: distance · time · average speed · notes · speed limits
 *  · detailsHTML(run) what went wrong: the skipped notes, the exceeded limits, the penalties
 *  · the pending queue: a finished report is stored on the device FIRST and uploaded from there,
 *    so a run is never lost to a dead connection or a signed-out session. An item uploads once it
 *    is `ready` — immediately, or after the runner chose public/private on the report (#619). */
(function () {
    const t = (k) => RBt(k), esc = RBesc;
    const QUEUE_KEY = 'rb_pending_runs';

    const fmtDuration = (s) => {
        s = Math.max(0, Math.round(s || 0));
        const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
        return h ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
    };
    const avgKmh = (run) => run.duration_s > 0 ? ((run.distance_m / 1000) / (run.duration_s / 3600)).toFixed(1) : '—';
    const tile = (icon, value, label, cls = '') => `<div class="stat${cls ? ' ' + cls : ''}"><i class="fa-solid ${icon}"></i><b>${value}</b><span>${esc(t(label))}</span></div>`;

    // a run through no speed-limit zone says nothing about limits (#848)
    function statsHTML(run) {
        return `<div class="stat-grid">
            ${tile('fa-route', RBKm(run.distance_m, 1), 'Distance')}
            ${tile('fa-stopwatch', fmtDuration(run.duration_s), 'Time')}
            ${tile('fa-gauge-high', avgKmh(run) + ' km/h', 'Average speed')}
            ${tile('fa-flag-checkered', `${run.notes_reached}/${run.notes_total}`, 'Notes reached', run.notes_reached < run.notes_total ? 'warn' : 'ok')}
            ${run.speed_zones ? tile('fa-circle-exclamation', `${run.speed_zones - run.speed_exceeded}/${run.speed_zones}`, 'Speed limits respected', run.speed_exceeded ? 'warn' : 'ok') : ''}
        </div>`;
    }
    function detailsHTML(run) {
        const lines = [];
        if ((run.skipped || []).length) lines.push(`<li><i class="fa-solid fa-forward icon-danger"></i> ${esc(t('Skipped notes:'))} ${run.skipped.map((n) => '<b>' + esc(n) + '</b>').join(', ')}</li>`);
        if (run.speed_exceeded) lines.push(`<li><i class="fa-solid fa-gauge-high icon-danger"></i> ${esc(t('Speed limit exceeded in'))} ${run.speed_exceeded} ${esc(t(run.speed_exceeded === 1 ? 'zone' : 'zones'))} · ${esc(t('worst'))} +${run.max_over_kmh} km/h</li>`);
        const p = run.penalties;
        if (p) {
            const total = Object.values(p).reduce((a, b) => a + (+b || 0), 0);
            lines.push(`<li><i class="fa-solid fa-ranking-star icon-accent"></i> ${esc(t('Penalties'))}: <b>${total} ${esc(t('pts'))}</b> <span class="muted small">(${esc(t('Accuracy'))} ${p.acc || 0} · ${esc(t('Skips'))} ${p.skip || 0} · ${esc(t('Extra'))} ${p.extra || 0} · CAP ${p.cap || 0} · ${esc(t('Speed'))} ${p.speed || 0})</span></li>`);
        }
        if (!lines.length) lines.push(`<li><i class="fa-solid fa-circle-check icon-ok"></i> ${esc(t(run.speed_zones ? 'Every note reached and every limit respected.' : 'Every note reached.'))}</li>`);
        return `<ul class="run-details">${lines.join('')}</ul>`;
    }

    /* ---------- the device queue ---------- */
    const read = () => { try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch (e) { return []; } };
    const write = (items) => { try { localStorage.setItem(QUEUE_KEY, JSON.stringify(items.slice(-20))); } catch (e) {} };
    // item: { key, report, ready, visibility: 'public'|'private'|null (null = the runner's preference), remember }
    function enqueue(report, ready) {
        const key = 'run-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
        write(read().concat([{ key, report, ready, visibility: null, remember: false }]));
        return key;
    }
    function update(key, patch) { write(read().map((i) => (i.key === key ? Object.assign(i, patch) : i))); }
    // Upload every ready item; resolves { [key]: saved run id } for what went through. Needs a
    // signed-in user — signed out, the items simply wait for the next flush after sign-in. A call
    // made while a flush is running waits for it and then runs its own: the running one read the
    // queue before this call, so an item made ready since would otherwise be left out.
    let flushing = null;
    function flush() {
        if (flushing) return flushing.then(() => flush());
        flushing = (async () => {
            const done = {};
            for (const item of read().filter((i) => i.ready)) {
                const r = await RBApi('run_save', Object.assign({}, item.report, { visibility: item.visibility, remember: item.remember ? 1 : 0 }));
                // offline or signed out: keep it for the next flush; any other refusal would never pass, so drop it
                if (!r.ok) { if (r.error !== 'Network error.' && r.error !== 'Not signed in.') write(read().filter((i) => i.key !== item.key)); continue; }
                done[item.key] = { id: r.id, is_public: r.is_public };
                write(read().filter((i) => i.key !== item.key));
            }
            return done;
        })().finally(() => { flushing = null; });
        return flushing;
    }
    window.addEventListener('online', () => flush());

    // What a shared run card says (#852): the runner's own words, glad to have done it
    const shareText = (run, link) => [t(run.completed ? 'Check out the roadbook I completed!' : 'Check out my run!'), run.title ? '“' + run.title + '”' : '', link].filter(Boolean).join(' ');

    window.RBRun = { statsHTML, detailsHTML, shareText, fmtDuration, avgKmh, enqueue, update, flush };
})();
