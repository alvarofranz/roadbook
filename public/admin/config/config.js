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
        // label search (#709): results as rows; a row opens that label in the editor, and the
        // editor saves, previews and exports exactly as the in-page one does
        $('transSearch').oninput = RBDebounce(() => {
            const box = $('transResults'), q = $('transSearch').value;
            if (!window.RBI18nFind) { box.innerHTML = `<p class="muted small">${esc(t('The translation editor is still loading — try again in a moment.'))}</p>`; return; }
            const hits = RBI18nFind(q);
            if (q.trim().length < 2) { box.innerHTML = ''; return; }
            box.innerHTML = hits.length
                ? hits.map((h, i) => `<button type="button" class="roadbook-row trans-hit" data-hit="${i}"><div class="meta"><b>${esc(h.text)}</b><small>${esc(h.key)}</small></div><i class="fa-solid fa-pen icon-accent"></i></button>`).join('')
                : `<p class="muted small">${esc(t('No label matches.'))}</p>`;
            box.querySelectorAll('[data-hit]').forEach((b) => b.onclick = () => RBI18nEditKeys([hits[+b.dataset.hit].key], hits[+b.dataset.hit].text));
        }, 200);
        $('transEditOn').onclick = () => {
            if (!window.RBI18nSetEdit) return toast('The translation editor is still loading — try again in a moment.'); // never a dead button (#667)
            RBI18nSetEdit(true); toast(t('Translation editor is on. Navigate to any page and right-click a label to edit it.'));
        };
    })();
})();
