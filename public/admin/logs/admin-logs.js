'use strict';
/* Admin · Logs (#200). The global activity log — searchable + paginated — plus the cron log tail,
 * on their own page (moved out of Site settings). Gated to admins. */
(function () {
    const $ = (id) => document.getElementById(id);
    const t = RBt, esc = RBesc;
    let q = '', page = 1, per = 50, searchTimer = null;

    /* Cron health, at a glance (#505). The log itself is a wall of text; what an admin needs to
       know is whether the runner ran AT ALL — every minute it writes a `[YYYY-MM-DD HH:MM:SS]`
       line, so the newest one answers it. Without the `* * * * *` entry on the host nothing ever
       purges — this panel says so instead of leaving it to reading the log. */
    /* `serverNow` is the server's own clock, which is also the clock the log's timestamps were
       written with: both are parsed the same naive way, so the age is exact whatever timezone the
       admin is browsing from. (Measuring against the BROWSER's clock reported a cron that had run
       one minute earlier as "120 minutes ago" for an admin two hours ahead of the server.) */
    function cronHealth(log, serverNow) {
        const stamps = String(log || '').match(/\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]/g) || [];
        if (!stamps.length) return { state: 'never', minutes: null };
        const parse = (s) => new Date(String(s).replace(' ', 'T'));
        const last = parse(stamps[stamps.length - 1].slice(1, -1));
        const now = serverNow ? parse(serverNow) : new Date();
        const minutes = Math.max(0, Math.round((now.getTime() - last.getTime()) / 60000));
        return { state: minutes <= 10 ? 'ok' : 'stale', minutes, last };
    }
    async function loadCron() {
        const r = await RBApi('admin_logs');
        if (!r.ok) return;
        $('logCron').textContent = r.cron || t('No cron log yet.');
        const h = cronHealth(r.cron, r.now);
        const el = $('cronHealth');
        if (h.state === 'never') {
            el.className = 'cron-health bad';
            el.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ${esc(t('The cron runner has never run — nothing is being purged or cleaned up.'))}`;
        } else if (h.state === 'stale') {
            el.className = 'cron-health bad';
            el.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> ${esc(t('Last cron run'))}: ${esc(RBFmtDateTime(h.last))} — ${h.minutes} ${esc(t('minutes ago'))}. ${esc(t('It should run every minute; check the crontab entry on the server.'))}`;
        } else {
            el.className = 'cron-health ok';
            el.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${esc(t('Last cron run'))}: ${esc(RBFmtDateTime(h.last))} — ${h.minutes} ${esc(t('minutes ago'))}.`;
        }
        el.hidden = false;
    }

    async function loadActivity() {
        const r = await RBApi('admin_activity_log', { q, page });
        if (!r.ok) { $('logTable').textContent = t(r.error || 'Could not load the log.'); return; }
        per = r.per_page || 50; page = r.page || 1;
        const rows = r.rows || [];
        $('logTable').innerHTML = rows.length
            ? `<table class="act-table"><tbody>${rows.map((e) => `<tr>
                <td class="small">${esc(RBFmtDateTime(e.created_at))}</td>
                <td>${e.username ? esc(e.username) : (e.user_id ? '#' + esc(e.user_id) : '—')}</td>
                <td>${esc(String(e.action).replace(/_/g, ' '))}</td>
                <td class="muted small">${esc(e.detail || '')}</td>
                <td class="muted small">${esc(e.ip || '')}</td></tr>`).join('')}</tbody></table>`
            : `<span class="muted">${esc(t('No activity yet.'))}</span>`;
        const pages = Math.max(1, Math.ceil((r.total || 0) / per));
        // the shared pager, like every other list: it also reports the total when there is one page
        RBPager($('logPager'), page, pages, (p) => { page = p; loadActivity(); }, (r.total || 0) + ' ' + esc(t('entries')));
    }

    (async function init() {
        if (!(await RBRequireUser($('adminMsg'), { admin: true }))) return;
        $('adminMsg').hidden = true; $('logsWrap').hidden = false;
        $('logSearch').addEventListener('input', () => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => { q = $('logSearch').value.trim(); page = 1; loadActivity(); }, 300);
        });
        loadActivity();
        loadCron();
    })();
})();
