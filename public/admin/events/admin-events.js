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
            <div class="meta"><b>${esc(e.title)}</b><small>${esc(t(e.is_public ? 'Public' : 'Draft'))} · ${e.roadbooks.length} ${esc(t('roadbooks'))}${fmtDates(e) ? ' · ' + esc(fmtDates(e)) : ''}</small></div>
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

    // Participation modes for an associated roadbook (#6). 'fia' is shown but disabled (not
    // implemented); the API refuses it and falls back to 'free'.
    const MODES = [['free', 'No race (free)'], ['roadbook_suite', 'Roadbook-suite rules'], ['fia', 'FIA rules (unavailable)']];

    function editEvent(e) {
        e = e || { id: 0, title: '', description: '', starts_on: '', ends_on: '', is_public: 0, roadbooks: [], categories: [] };
        // per-roadbook participation mode — the source of truth (survives filtering/typing); id → mode
        const rbModes = new Map((e.roadbooks || []).map((r) => [r.id, r.scoring_mode || 'free']));
        let cats = (e.categories || []).map((c) => c.name); // ordered category names
        const modeOptions = (sel) => MODES.map(([v, l]) => `<option value="${v}"${v === sel ? ' selected' : ''}${v === 'fia' ? ' disabled' : ''}>${esc(t(l))}</option>`).join('');
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
            <label class="field-label">${esc(t('Categories'))}</label>
            <div id="evCats"></div>
            <div class="btnrow"><button class="btn btn-ghost" id="evCatAdd" type="button"><i class="fa-solid fa-plus"></i> ${esc(t('Add category'))}</button></div>
            <div class="btnrow end"><button class="btn btn-ghost" data-cancel>${esc(t('Cancel'))}</button><button class="btn btn-primary" id="evSave">${esc(t('Save'))}</button></div>`, 'wide', null, { dismissable: false });
        m.q('#evTitleIn').value = e.title || '';
        m.q('#evDescIn').value = e.description || '';
        m.q('#evStart').value = e.starts_on || '';
        m.q('#evEnd').value = e.ends_on || '';
        m.q('#evPublic').checked = !!e.is_public;
        // Filterable roadbook pool. `rbModes` is the source of truth so filtering/typing never
        // drops a selection; each picked roadbook shows its participation-mode selector.
        const poolEl = m.q('#evPool');
        const rbRow = (r) => { const on = rbModes.has(r.id); return `<div class="ev-rb-row">
            <label class="checkbox-row"><input type="checkbox" data-rb="${r.id}"${on ? ' checked' : ''}> <span>${esc(r.title)} <span class="muted small">@${esc(r.username)}</span></span></label>
            <select data-rbmode="${r.id}" class="field ev-rbmode"${on ? '' : ' disabled'}>${modeOptions(rbModes.get(r.id) || 'free')}</select></div>`; };
        const renderPool = (q) => {
            const list = (window.RB && RB.filterByText) ? RB.filterByText(pool, q, ['title', 'username']) : pool;
            poolEl.innerHTML = list.length ? list.map(rbRow).join('') : `<p class="muted small">${esc(t('No matching roadbooks.'))}</p>`;
        };
        if (pool.length) { renderPool(''); m.q('#evRbSearch').oninput = (ev) => renderPool(ev.target.value); }
        poolEl.addEventListener('change', (ev) => {
            const cb = ev.target.closest('[data-rb]');
            if (cb) {
                const id = +cb.dataset.rb;
                if (cb.checked) rbModes.set(id, rbModes.get(id) || 'free'); else rbModes.delete(id);
                const sel = poolEl.querySelector(`[data-rbmode="${id}"]`); if (sel) sel.disabled = !cb.checked;
                return;
            }
            const md = ev.target.closest('[data-rbmode]');
            if (md && rbModes.has(+md.dataset.rbmode)) rbModes.set(+md.dataset.rbmode, md.value);
        });
        // Categories editor: add / rename / reorder / remove; `cats` (ordered names) is the source of truth.
        const catsEl = m.q('#evCats');
        const renderCats = () => {
            catsEl.innerHTML = cats.map((name, i) => `<div class="ev-cat-row">
                <input class="field" data-cat="${i}" value="${esc(name)}" placeholder="${esc(t('Category name'))}" autocomplete="off">
                <button class="btn btn-ghost" type="button" data-catup="${i}" title="${esc(t('Move to the row above'))}" aria-label="${esc(t('Move to the row above'))}"${i === 0 ? ' disabled' : ''}>↑</button>
                <button class="btn btn-ghost" type="button" data-catdown="${i}" title="${esc(t('Move to the row below'))}" aria-label="${esc(t('Move to the row below'))}"${i === cats.length - 1 ? ' disabled' : ''}>↓</button>
                <button class="btn btn-ghost" type="button" data-catdel="${i}" title="${esc(t('Remove'))}" aria-label="${esc(t('Remove'))}"><i class="fa-solid fa-trash-can icon-danger"></i></button>
            </div>`).join('');
        };
        catsEl.addEventListener('input', (ev) => { const inp = ev.target.closest('[data-cat]'); if (inp) cats[+inp.dataset.cat] = inp.value; });
        catsEl.addEventListener('click', (ev) => {
            const up = ev.target.closest('[data-catup]'), dn = ev.target.closest('[data-catdown]'), del = ev.target.closest('[data-catdel]');
            if (up) { const i = +up.dataset.catup; if (i > 0) { [cats[i - 1], cats[i]] = [cats[i], cats[i - 1]]; renderCats(); } }
            else if (dn) { const i = +dn.dataset.catdown; if (i < cats.length - 1) { [cats[i + 1], cats[i]] = [cats[i], cats[i + 1]]; renderCats(); } }
            else if (del) { cats.splice(+del.dataset.catdel, 1); renderCats(); }
        });
        m.q('#evCatAdd').onclick = () => { cats.push(''); renderCats(); const inp = catsEl.querySelector(`[data-cat="${cats.length - 1}"]`); if (inp) inp.focus(); };
        renderCats();
        m.q('[data-cancel]').onclick = m.close;
        m.q('#evSave').onclick = async () => {
            // Save from rbModes, not the pool — an attached roadbook that is no longer public
            // (so absent from the pool) must keep its association instead of being dropped.
            const roadbooks = [...rbModes].map(([id, scoring_mode]) => ({ id, scoring_mode }));
            const categories = cats.map((c) => c.trim()).filter(Boolean);
            const x = await api('event_save', {
                id: e.id, title: m.q('#evTitleIn').value.trim(), description: m.q('#evDescIn').value.trim(),
                starts_on: m.q('#evStart').value, ends_on: m.q('#evEnd').value,
                is_public: m.q('#evPublic').checked ? 1 : 0, roadbooks, categories,
            });
            if (x.ok) { m.close(); load(); } else toast(x.error || 'Could not save.');
        };
    }

    async function load() {
        const r = await api('events_manage');
        events = (r.ok && r.events) || [];
        render();
    }

    (async function init() {
        const cfg = await api('config');
        if (!cfg.user) { $('adminMsg').innerHTML = `${esc(t('Sign in to continue.'))} <a href="../../account/">${esc(t('Sign in'))}</a>`; return; }
        // admins manage every event; organizers manage their own (#121)
        if (!cfg.user.is_admin && !cfg.user.is_organizer) { $('adminMsg').textContent = t('Organizers only.'); return; }
        $('adminMsg').hidden = true; $('evBody').hidden = false;
        const pr = await api('public_list'); // the public roadbooks an event can gather
        pool = (pr.ok && pr.roadbooks) || [];
        $('evNew').onclick = () => editEvent(null);
        load();
    })();
})();
