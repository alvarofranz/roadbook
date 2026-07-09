'use strict';
/* In-context UI translation editor (#118, admin-only). Loaded by app.js only for admins.
 * Turns on an "edit mode" in which every translatable label on the current page can be
 * edited in place: click the floating bar to edit all of the page's labels, or right-click
 * a single label to edit just that one. Edits preview live and accumulate in localStorage
 * across pages; Export produces a paste-ready DELTA of the changed keys per language, to
 * commit into the i18n.<lang>.js files (Option B — nothing is served from a DB at runtime). */
(function () {
    if (!window.RBt || !window.RBModal || !window.RBi18nLangs || !window.RBi18n) return;
    const t = RBt, esc = RBesc;
    // English first — it's the source/reference; unlike the others it lives in i18n.js (T.en),
    // exposed on RBi18nLangs.en, and its export delta targets that file, not an i18n.<lang>.js.
    const LANGS = Object.keys(window.RBi18nLangs);
    const ATTRS = ['data-i18n', 'data-i18n-html', 'data-i18n-ph', 'data-i18n-title', 'data-i18n-aria', 'data-i18n-tip', 'data-i18n-content'];
    const SEL = ATTRS.map((a) => '[' + a + ']').join(',');
    const LS_ON = 'rb_i18n_edit', LS_DELTA = 'rb_i18n_delta';
    const langs = window.RBi18nLangs; // live dicts (mutating them + re-applying gives a live preview)

    /* ---------- pending delta (survives navigation) ---------- */
    function loadDelta() {
        const d = {}; LANGS.forEach((l) => { d[l] = {}; });
        try { const s = JSON.parse(localStorage.getItem(LS_DELTA) || '{}'); LANGS.forEach((l) => Object.assign(d[l], s[l] || {})); } catch (e) {}
        return d;
    }
    const delta = loadDelta();
    const saveDelta = () => { try { localStorage.setItem(LS_DELTA, JSON.stringify(delta)); } catch (e) {} };
    const deltaCount = () => LANGS.reduce((n, l) => n + Object.keys(delta[l]).length, 0);

    const isOn = () => localStorage.getItem(LS_ON) === '1';
    const setOn = (v) => { if (v) localStorage.setItem(LS_ON, '1'); else localStorage.removeItem(LS_ON); render(); };

    // Re-apply the pending edits into the live dicts and re-render the page in the current language,
    // so edits are visible immediately and persist visually while navigating.
    function applyDeltaLive() {
        LANGS.forEach((l) => Object.assign(langs[l], delta[l]));
        RBi18n.set(RBi18n.current());
    }

    // English falls back to the key itself (source-string keys display the key when not in T.en),
    // so the English field always shows the real source text to translate from — never blank.
    const valueOf = (lang, key) => {
        if (key in delta[lang]) return delta[lang][key];
        if (langs[lang] && langs[lang][key] != null) return langs[lang][key];
        return lang === 'en' ? key : '';
    };

    function setValue(lang, key, val) {
        delta[lang][key] = val;
        if (langs[lang]) langs[lang][key] = val;
        saveDelta();
        RBi18n.set(RBi18n.current()); // live preview
        refreshBar();
    }
    function clearKey(key) {
        LANGS.forEach((l) => { delete delta[l][key]; });
        saveDelta(); refreshBar();
        // the live dicts keep the typed value until reload — good enough; a full revert is a reload
    }

    /* ---------- editor popups (built on RBModal) ---------- */
    const keysOf = (el) => ATTRS.map((a) => el.getAttribute(a)).filter(Boolean);
    function pageKeys() {
        const s = new Set();
        document.querySelectorAll(SEL).forEach((el) => keysOf(el).forEach((k) => s.add(k)));
        return [...s];
    }
    function keyBlock(key) {
        return `<div class="i18ne-key" data-k="${esc(key)}">
            <div class="i18ne-kname">${esc(key)}</div>
            ${LANGS.map((l) => `<label class="i18ne-row"><span class="i18ne-lang">${l}</span>
                <input class="field" data-l="${l}" value="${esc(valueOf(l, key))}"></label>`).join('')}
            <div class="i18ne-krow"><button class="btn btn-ghost btn-sm" data-reset>${t('Reset key')}</button></div>
        </div>`;
    }
    function openEditor(keys, title) {
        if (!keys.length) return;
        const d = RBModal(`<h3>${esc(title)}</h3>
            <p class="muted small">${t('Edits are saved and previewed automatically. Nothing goes live yet — to publish, use Export and have the delta committed.')}</p>
            <div class="i18ne-list">${keys.map(keyBlock).join('')}</div>
            <div class="btnrow end wrap">
                <button class="btn btn-ghost" data-export><i class="fa-solid fa-file-export"></i> ${t('Export')} (<span data-count>${deltaCount()}</span>)</button>
                <button class="btn btn-primary" data-close>${t('Done')}</button>
            </div>`, 'wide');
        d.el.querySelectorAll('.i18ne-key').forEach((block) => {
            const key = block.getAttribute('data-k');
            block.querySelectorAll('input[data-l]').forEach((inp) => {
                inp.addEventListener('input', () => setValue(inp.getAttribute('data-l'), key, inp.value));
            });
            block.querySelector('[data-reset]').onclick = () => { clearKey(key); d.close(); };
        });
        d.q('[data-export]').onclick = () => { d.close(); exportDelta(); };
        d.q('[data-close]').onclick = d.close;
    }

    function exportDelta() {
        const parts = LANGS.filter((l) => Object.keys(delta[l]).length).map((l) => {
            const lines = Object.entries(delta[l]).map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)},`).join('\n');
            const target = l === 'en'
                ? 'the T.en object in public/assets/js/i18n.js'
                : `window.RBi18nLangs.${l} in public/assets/js/i18n.${l}.js`;
            return `/* → paste inside ${target} */\n${lines}`;
        });
        const text = parts.join('\n\n') || t('No pending changes.');
        const d = RBModal(`<h3>${t('Export translation delta')}</h3>
            <p class="muted small">${t('Paste each block into its i18n.&lt;lang&gt;.js, then commit. This does not change the site by itself.')}</p>
            <textarea class="field i18ne-export" readonly>${esc(text)}</textarea>
            <div class="btnrow end wrap">
                <button class="btn btn-ghost" data-copy><i class="fa-solid fa-copy"></i> ${t('Copy')}</button>
                <button class="btn btn-ghost" data-dl><i class="fa-solid fa-file-arrow-down"></i> ${t('Download')}</button>
                <button class="btn btn-danger" data-clear><i class="fa-solid fa-trash"></i> ${t('Clear pending')}</button>
                <button class="btn btn-primary" data-close>${t('Close')}</button>
            </div>`, 'wide');
        d.q('[data-copy]').onclick = async () => { try { await navigator.clipboard.writeText(text); RBToast('Copied'); } catch (e) {} };
        // Prepend a UTF-8 BOM so Windows tools (Notepad, etc.) read the accents correctly instead
        // of mis-decoding the UTF-8 bytes as Windows-1252 (#118).
        d.q('[data-dl]').onclick = () => RBDownload(new Blob(['﻿' + text], { type: 'text/plain;charset=utf-8' }), 'i18n-delta.txt');
        d.q('[data-clear]').onclick = async () => {
            if (!(await RBConfirm(t('Discard all pending translation edits?'), t('Discard'), true))) return;
            LANGS.forEach((l) => { delta[l] = {}; }); saveDelta(); d.close(); location.reload();
        };
        d.q('[data-close]').onclick = d.close;
    }

    /* ---------- chrome: the admin toggle + the edit bar ---------- */
    let toggleEl = null, barEl = null;
    function refreshBar() {
        const n = deltaCount();
        document.querySelectorAll('[data-count]').forEach((e) => { e.textContent = n; }); // bar + any open popup
        if (toggleEl) toggleEl.classList.toggle('has-pending', n > 0);
    }
    function render() {
        const on = isOn();
        document.body.classList.toggle('i18ne-on', on);
        if (!toggleEl) {
            toggleEl = document.createElement('button');
            toggleEl.type = 'button'; toggleEl.className = 'i18ne-toggle';
            toggleEl.title = 'UI translation editor';
            toggleEl.onclick = () => setOn(!isOn());
            document.body.appendChild(toggleEl);
        }
        toggleEl.innerHTML = `<i class="fa-solid fa-language"></i>`;
        toggleEl.classList.toggle('active', on);
        if (barEl) { barEl.remove(); barEl = null; }
        if (on) {
            barEl = document.createElement('div');
            barEl.className = 'i18ne-bar';
            barEl.innerHTML = `<span class="i18ne-badge"><i class="fa-solid fa-language"></i> ${t('Translate')}</span>
                <button class="btn btn-ghost btn-sm" data-page>${t('Page labels')}</button>
                <button class="btn btn-ghost btn-sm" data-export><i class="fa-solid fa-file-export"></i> ${t('Export')} (<span data-count>0</span>)</button>
                <button class="btn btn-ghost btn-sm" data-off>${t('Done')}</button>
                <span class="i18ne-hint">${t('right-click a label to edit it')}</span>`;
            document.body.appendChild(barEl);
            barEl.querySelector('[data-page]').onclick = () => openEditor(pageKeys(), t('Labels on this page'));
            barEl.querySelector('[data-export]').onclick = exportDelta;
            barEl.querySelector('[data-off]').onclick = () => setOn(false);
        }
        refreshBar();
    }

    // Right-click a translatable element (edit mode only) → edit just its key(s).
    document.addEventListener('contextmenu', (e) => {
        if (!isOn()) return;
        const el = e.target.closest(SEL);
        if (!el) return;
        e.preventDefault();
        openEditor(keysOf(el), t('Edit label'));
    }, true);

    if (deltaCount()) applyDeltaLive(); // reflect pending edits from a previous page/session
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render); else render();
})();
