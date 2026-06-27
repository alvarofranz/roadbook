/* RDBK.app i18n. Applies translations to [data-i18n] / [data-i18n-html] /
   [data-i18n-ph] and remembers the language in localStorage. Auto-detects the
   browser language and falls back to English. Languages: en (default) · es · it · de · fr.
   Extra languages live in i18n.{lang}.js — each must be loaded before this file. */
(function () {
    'use strict';

    const T = {
        en: {
            'hero.title': 'Digital roadbooks for <span class="accent">your adventures</span>',
            'hero.lead': 'Build a roadbook from a GPX, follow it with GPS and share it. 4x4, moto, bike, running… any adventure.',
            'hero.cta_tools': 'Open the Editor', 'hero.cta_challenges': 'Challenges',
            'flow.kicker': 'Features', 'flow.title': 'Everything you need',
            'flow.s1': 'Record a route', 'flow.s2': 'Build a roadbook', 'flow.s3': 'Use it with friends', 'flow.s4': 'Run a club event',
            'feat.1.t': 'Roadbook Editor', 'feat.1.d': 'Build a roadbook from a GPX, Design each note with rally standards.',
            'feat.2.t': 'Route Recorder', 'feat.2.d': 'Record live GPX, dropping waypoints with voice recognition and photos.',
            'feat.3.t': 'Roadbook design', 'feat.3.d': 'Design each note: junction vectors, resizable icons and your own symbols.',
            'feat.4.t': 'Roadbook Reader', 'feat.4.d': 'Navigate with odometer, bearing, a live map and the CAP direction bar.',
            'feat.5.t': 'Tripmaster', 'feat.5.d': 'A precise GPS odometer with no roadbook — partial and total distance.',
            'feat.6.t': 'Validate & QR', 'feat.6.d': 'Validate notes (manual or automatic) and emit a signed result QR.',
            'feat.7.t': 'Event classification', 'feat.7.d': 'Run a rally on one roadbook: compare every team’s run — accuracy, CAP, speed and regularity — into a final classification, from signed result QRs.',
            'events.t': 'Events', 'events.d': 'Organize events around your own roadbooks — invite teams, run the rally and publish the results.', 'Coming soon': 'Coming soon', 'route map': 'route map',
            'feat.8.t': 'Accounts & sharing', 'feat.8.d': 'Sign in to store roadbooks and publish them as public roadbooks.',
            'install.kicker': 'Cross-platform', 'install.title': 'Install it on any device', 'install.text': 'Every feature of RDBK.app is also available as a free, installable web app (PWA) — on Windows and Mac computers, Android and iOS. No app store needed: add it to your home screen and use it like a native app, even offline.',
            'gallery.kicker': 'Gallery', 'gallery.title': 'Public Roadbooks', 'gallery.loading': 'Loading…', 'gallery.empty': 'No public roadbooks yet.', 'gallery.notes': 'notes',
            // Editor field help tooltips (issue #89)
            'help.road': 'The road surface you continue on from this note (default, asphalt, track, off-piste); it stays in force until a later note changes it.',
            'help.danger': 'FIA danger grading, shown as ! / !! / !!! in the vignette — the higher the grade, the more caution the spot demands.',
            'help.speed': 'A declarative speed limit (km/h) in force from this note; “End of limit” lifts it. Setting a limit also marks the note a controlled zone.',
            'help.capType': 'Qualifies the note’s CAP heading (FIA): Exit, Average, Calculated or Turning. Enabled once the note carries a CAP.',
            'help.wpType': 'The FIA waypoint type. It sets the map icon and, in a rally roadbook, how the waypoint is validated and scored.',
            'help.radius': 'Validation radius in metres — the geofence for automatic pass detection. Left empty it falls back to the roadbook default, then the type’s default (shown as the placeholder).',
            'help.visibility': 'Private keeps the roadbook to you. Public lists it on the site so anyone can read it or export a PDF — but only you can download the .rdbk.',
            'help.description': 'Shown on the roadbook’s public page — a short summary of the route or event.',
            'help.author': 'The author’s name, embedded in the roadbook and shown to readers.',
            'help.org': 'The organizing club or event, embedded in the roadbook and shown to readers.',
            'help.profile': 'Basic (adventure) offers a simple waypoint set; Rally (FIA) adds the full FIA waypoint types, which drive how runs are scored.',
            'help.defRadius': 'A validation radius applied only to notes where you haven’t set one. Left empty, each waypoint falls back to its type’s own default.',
            'help.mapAccess': 'When on, the Reader may show the map. Turn it off to make readers navigate by the roadbook notes alone.',
            'help.route': 'Reverse flips the travel direction — the track, note order and all headings are recomputed.',
        },
    };
    // Merge additional languages loaded before this script (i18n.es.js / i18n.it.js / i18n.de.js / i18n.fr.js)
    if (window.RBi18nLangs) Object.assign(T, window.RBi18nLangs);


    function pickLang() {
        const saved = localStorage.getItem('rb_lang');
        if (saved && T[saved]) return saved;
        for (const l of (navigator.languages || [navigator.language || 'en'])) {
            const code = String(l).slice(0, 2).toLowerCase();
            if (T[code]) return code;
        }
        return 'en';
    }

    const tr = (lang, k) => { const d = T[lang] || T.en; return d[k] != null ? d[k] : (T.en[k] != null ? T.en[k] : null); };

    function apply(lang) {
        document.documentElement.lang = lang;
        document.querySelectorAll('[data-i18n]').forEach((el) => {
            const v = tr(lang, el.getAttribute('data-i18n')); if (v == null) return;
            // replace just the text, keeping any leading icon (<i>) intact
            const tn = [...el.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
            if (tn) tn.textContent = (el.firstElementChild ? ' ' : '') + v; else el.textContent = v;
        });
        document.querySelectorAll('[data-i18n-html]').forEach((el) => { const v = tr(lang, el.getAttribute('data-i18n-html')); if (v != null) el.innerHTML = v; });
        document.querySelectorAll('[data-i18n-ph]').forEach((el) => { const v = tr(lang, el.getAttribute('data-i18n-ph')); if (v != null) el.setAttribute('placeholder', v); });
        // accessibility attributes: title + aria-label translate declaratively too
        document.querySelectorAll('[data-i18n-title]').forEach((el) => { const v = tr(lang, el.getAttribute('data-i18n-title')); if (v != null) el.setAttribute('title', v); });
        document.querySelectorAll('[data-i18n-aria]').forEach((el) => { const v = tr(lang, el.getAttribute('data-i18n-aria')); if (v != null) el.setAttribute('aria-label', v); });
        // help tooltips: the bubble text lives in data-tip
        document.querySelectorAll('[data-i18n-tip]').forEach((el) => { const v = tr(lang, el.getAttribute('data-i18n-tip')); if (v != null) el.setAttribute('data-tip', v); });
        document.querySelectorAll('.lang button').forEach((b) => b.classList.toggle('active', b.dataset.lang === lang));
        localStorage.setItem('rb_lang', lang);
        window.dispatchEvent(new CustomEvent('rb-lang', { detail: lang }));
    }

    window.RBi18n = {
        t(key) { const v = tr(pickLang(), key); return v != null ? v : key; },
        current() { return document.documentElement.lang || pickLang(); },
        set(lang) { if (T[lang]) apply(lang); }, // programmatic switch (e.g. a signed-in user's saved preference)
    };
    // Global shorthand used across every page (falls back to the key if i18n is missing).
    window.RBt = (k) => (window.RBi18n ? RBi18n.t(k) : k);

    document.addEventListener('DOMContentLoaded', () => {
        apply(pickLang());
        document.querySelectorAll('.lang button').forEach((b) => b.addEventListener('click', () => apply(b.dataset.lang)));
    });
})();
