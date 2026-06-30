'use strict';
/* Admin · Events page (#6, P1): create/edit/delete events and pick the public roadbooks they
 * gather. The organizer is the admin who creates it (organizer roles come in a later phase). */
(function () {
    const $ = (id) => document.getElementById(id);
    const t = RBt, esc = RBesc, toast = RBToast, api = RBApi;
    let events = [], pool = [];

    const fmtDates = (e) => e.starts_on ? (e.ends_on && e.ends_on !== e.starts_on ? e.starts_on + ' – ' + e.ends_on : e.starts_on) : '';

    function render() {
        $('evList').innerHTML = events.length ? events.map((e) => `<div class="roadbook-row">
            <div class="meta"><b>${esc(e.title)}</b><small>${esc(t(e.is_public ? 'Public' : 'Draft'))} · ${e.roadbook_ids.length} ${esc(t('roadbooks'))}${fmtDates(e) ? ' · ' + esc(fmtDates(e)) : ''}</small></div>
            ${e.is_public ? `<a class="btn btn-ghost" href="/event/${esc(e.slug)}" title="${esc(t('View'))}" aria-label="${esc(t('View'))}"><i class="fa-solid fa-eye"></i></a>` : ''}
            <button class="btn btn-ghost" data-edit="${e.id}" title="${esc(t('Edit'))}" aria-label="${esc(t('Edit'))}"><i class="fa-solid fa-pen"></i></button>
            <button class="btn btn-ghost" data-del="${e.id}" data-title="${esc(e.title)}" title="${esc(t('Delete'))}" aria-label="${esc(t('Delete'))}"><i class="fa-solid fa-trash-can icon-danger"></i></button>
        </div>`).join('') : `<p class="muted small">${esc(t('No events yet.'))}</p>`;
        $('evList').querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => editEvent(events.find((e) => e.id === +b.dataset.edit)));
        $('evList').querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
            if (!(await RBConfirmDanger(t('Delete event') + ' “' + esc(b.dataset.title || '') + '”?', t('Delete')))) return;
            const x = await api('event_delete', { id: +b.dataset.del });
            if (x.ok) load(); else toast(x.error || 'Could not delete.');
        });
    }

    function editEvent(e) {
        e = e || { id: 0, title: '', description: '', starts_on: '', ends_on: '', is_public: 0, roadbook_ids: [] };
        const checked = new Set(e.roadbook_ids);
        const m = RBModal(`<h2>${esc(e.id ? t('Edit event') : t('New event'))}</h2>
            <label class="field-label" for="evTitleIn">${esc(t('Title'))}</label>
            <input id="evTitleIn" class="field" autocomplete="off">
            <label class="field-label" for="evDescIn">${esc(t('Description'))}</label>
            <textarea id="evDescIn" class="field" rows="3"></textarea>
            <div class="field-grid">
                <div><label class="field-label" for="evStart">${esc(t('Start date'))}</label><input id="evStart" type="date" class="field"></div>
                <div><label class="field-label" for="evEnd">${esc(t('End date'))}</label><input id="evEnd" type="date" class="field"></div>
            </div>
            <label class="checkbox-row"><input type="checkbox" id="evPublic"> <span>${esc(t('Public'))}</span></label>
            <label class="field-label">${esc(t('Roadbooks'))}</label>
            ${pool.length ? `<input id="evRbSearch" class="field" type="search" placeholder="${esc(t('Filter roadbooks…'))}" autocomplete="off">` : ''}
            <div class="ev-pool" id="evPool">${pool.length ? '' : `<p class="muted small">${esc(t('No public roadbooks yet.'))}</p>`}</div>
            <div class="btnrow end"><button class="btn btn-ghost" data-cancel>${esc(t('Cancel'))}</button><button class="btn btn-primary" id="evSave">${esc(t('Save'))}</button></div>`, 'wide', null, { dismissable: false });
        m.q('#evTitleIn').value = e.title || '';
        m.q('#evDescIn').value = e.description || '';
        m.q('#evStart').value = e.starts_on || '';
        m.q('#evEnd').value = e.ends_on || '';
        m.q('#evPublic').checked = !!e.is_public;
        // Filterable roadbook pool. `checked` is the source of truth so filtering/typing never
        // drops a selection (and Save reads the set, not just the rows currently visible).
        const poolEl = m.q('#evPool');
        const rbRow = (r) => `<label class="checkbox-row"><input type="checkbox" data-rb="${r.id}"${checked.has(r.id) ? ' checked' : ''}> <span>${esc(r.title)} <span class="muted small">@${esc(r.username)}</span></span></label>`;
        const renderPool = (q) => {
            const list = (window.RB && RB.filterByText) ? RB.filterByText(pool, q, ['title', 'username']) : pool;
            poolEl.innerHTML = list.length ? list.map(rbRow).join('') : `<p class="muted small">${esc(t('No matching roadbooks.'))}</p>`;
        };
        if (pool.length) { renderPool(''); m.q('#evRbSearch').oninput = (ev) => renderPool(ev.target.value); }
        poolEl.addEventListener('change', (ev) => {
            const cb = ev.target.closest('[data-rb]'); if (!cb) return;
            if (cb.checked) checked.add(+cb.dataset.rb); else checked.delete(+cb.dataset.rb);
        });
        m.q('[data-cancel]').onclick = m.close;
        m.q('#evSave').onclick = async () => {
            const ids = [...checked];
            const x = await api('event_save', {
                id: e.id, title: m.q('#evTitleIn').value.trim(), description: m.q('#evDescIn').value.trim(),
                starts_on: m.q('#evStart').value, ends_on: m.q('#evEnd').value,
                is_public: m.q('#evPublic').checked ? 1 : 0, roadbook_ids: ids,
            });
            if (x.ok) { m.close(); load(); } else toast(x.error || 'Could not save.');
        };
    }

    async function load() {
        const r = await api('admin_events');
        events = (r.ok && r.events) || [];
        render();
    }

    (async function init() {
        const cfg = await api('config');
        if (!cfg.user) { $('adminMsg').innerHTML = `${esc(t('Sign in to continue.'))} <a href="../../account/">${esc(t('Sign in'))}</a>`; return; }
        if (!cfg.user.is_admin) { $('adminMsg').textContent = t('Admins only.'); return; }
        $('adminMsg').hidden = true; $('evBody').hidden = false;
        const pr = await api('admin_roadbooks');
        pool = (pr.ok && pr.roadbooks) || [];
        $('evNew').onclick = () => editEvent(null);
        load();
    })();
})();
