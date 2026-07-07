'use strict';
/* Admin · Site settings page (#103): edit the home-page message banner + view operational
 * logs (recent activity + cron log; deploys link out to GitHub Actions). Gated to admins. */
(function () {
    const $ = (id) => document.getElementById(id);
    const t = RBt, esc = RBesc, toast = RBToast, api = RBApi;

    (async function init() {
        if (!(await RBRequireUser($('adminMsg'), { admin: true, account: '../../account/' }))) return;
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
    })();
})();
