'use strict';
/* Admin · Site settings page (#103): edit the home-page message banner + view operational
 * logs (recent activity + cron log; deploys link out to GitHub Actions). Gated to admins. */
(function () {
    const $ = (id) => document.getElementById(id);
    const t = RBt, esc = RBesc, toast = RBToast, api = RBApi;

    (async function init() {
        const cfg = await api('config');
        if (!cfg.user) { $('adminMsg').innerHTML = `${esc(t('Sign in to continue.'))} <a href="../../account/">${esc(t('Sign in'))}</a>`; return; }
        if (!cfg.user.is_admin) { $('adminMsg').textContent = t('Admins only.'); return; }
        $('adminMsg').hidden = true; $('cfgBody').hidden = false;

        const s = await api('admin_settings');
        if (s.ok) {
            $('smOn').checked = s.settings.home_message_on === '1';
            $('smText').value = s.settings.home_message || '';
            $('smLevel').value = s.settings.home_message_level || 'info';
            $('smUntil').value = s.settings.home_message_until || '';
        }
        $('smSave').onclick = async () => {
            const x = await api('admin_save_settings', { settings: {
                home_message: $('smText').value,
                home_message_on: $('smOn').checked ? 1 : 0,
                home_message_level: $('smLevel').value,
                home_message_until: $('smUntil').value,
            } });
            toast(x.ok ? 'Saved.' : (x.error || 'Could not save.'));
        };

        const l = await api('admin_logs');
        if (l.ok) {
            $('logCron').textContent = l.cron || t('No cron log yet.');
            $('logActivity').innerHTML = l.activity.length
                ? `<table class="act-table"><tbody>${l.activity.map((e) => `<tr><td class="small">${esc(e.created_at)}</td><td>${e.user_id ? '#' + esc(e.user_id) : '—'}</td><td>${esc(e.action.replace(/_/g, ' '))}</td><td class="muted small">${esc(e.detail || '')}</td><td class="muted small">${esc(e.ip || '')}</td></tr>`).join('')}</tbody></table>`
                : `<span class="muted">${esc(t('No activity yet.'))}</span>`;
        }
    })();
})();
