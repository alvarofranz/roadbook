'use strict';
/* Admin · Logs (#200). The global activity log — searchable + paginated — plus the cron log tail,
 * on their own page (moved out of Site settings). Gated to admins. */
(function () {
    const $ = (id) => document.getElementById(id);
    const t = RBt, esc = RBesc;
    let q = '', page = 1, per = 50, searchTimer = null;

    async function loadCron() {
        const r = await RBApi('admin_logs');
        if (r.ok) $('logCron').textContent = r.cron || t('No cron log yet.');
    }

    async function loadActivity() {
        const r = await RBApi('admin_activity_log', { q, page });
        if (!r.ok) { $('logTable').textContent = t(r.error || 'Could not load the log.'); return; }
        per = r.per_page || 50; page = r.page || 1;
        const rows = r.rows || [];
        $('logTable').innerHTML = rows.length
            ? `<table class="act-table"><tbody>${rows.map((e) => `<tr>
                <td class="small">${esc(e.created_at)}</td>
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
