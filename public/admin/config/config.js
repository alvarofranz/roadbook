'use strict';
/* Admin · Site settings page (#103): the site banner and the in-context translation editor
 * switch. Gated to admins; the operational logs have their own page (admin/logs). */
(function () {
    const $ = (id) => document.getElementById(id);
    const t = RBt, esc = RBesc, toast = RBToast, api = RBApi;

    (async function init() {
        if (!(await RBRequireUser($('adminMsg'), { admin: true }))) return;
        $('adminMsg').hidden = true; $('cfgBody').hidden = false;

        const s = await api('admin_settings');
        // a failed load must not leave an empty form whose save would wipe the live banner (#667)
        if (!s.ok) { $('smSave').disabled = true; return toast(s.error || 'Could not load.'); }
        $('smOn').checked = s.settings.home_message_on === '1';
        $('smText').value = s.settings.home_message || '';
        $('smLevel').value = s.settings.home_message_level || 'info';
        $('smUntil').value = s.settings.home_message_until || '';
        $('smSave').onclick = async (e) => {
            const busy = RBBusy(e.currentTarget);
            const x = await api('admin_save_settings', { settings: {
                home_message: $('smText').value,
                home_message_on: $('smOn').checked ? 1 : 0,
                home_message_level: $('smLevel').value,
                home_message_until: $('smUntil').value,
            } });
            if (x.ok) busy.ok(); else { busy.reset(); toast(x.error || 'Could not save.'); }
        };
        $('transEditOn').onclick = () => {
            if (!window.RBI18nSetEdit) return toast('The translation editor is still loading — try again in a moment.'); // never a dead button (#667)
            RBI18nSetEdit(true); toast(t('Translation editor is on. Navigate to any page and right-click a label to edit it.'));
        };
    })();
})();
