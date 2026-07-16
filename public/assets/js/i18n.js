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
            'flow.kicker': 'Features', 'flow.title': 'Everything you need',
            'flow.s1': 'Record a route', 'flow.s2': 'Build a roadbook', 'flow.s3': 'Use it with friends', 'flow.s4': 'Run a club event',
            'feat.1.t': 'Roadbook Editor', 'feat.1.d': 'Build a roadbook from a GPX, Design each note with rally standards.',
            'feat.2.t': 'Roadbook Recorder', 'feat.2.d': 'Record a Roadbook with waypoints, voice memos, photos and geotags.',
            'feat.4.t': 'Roadbook Reader', 'feat.4.d': 'Navigate with odometer, bearing, a live map and the CAP direction bar.',
            'feat.5.t': 'Tripmaster', 'feat.5.d': 'A precise GPS odometer with no roadbook — partial and total distance.',
            'feat.7.t': 'Event classification', 'feat.7.d': 'Run a rally on one roadbook: compare every team’s run — accuracy, CAP, speed and regularity — into a final classification, from signed result QRs.',
            'events.t': 'Events', 'events.d': 'Organize events around your own roadbooks — invite teams, run the rally and publish the results.', 'Coming soon': 'Coming soon', 'route map': 'route map',
            'install.kicker': 'Cross-platform', 'install.title': 'Install it on any device', 'install.text': 'Every feature of RDBK.app is also available as a free, installable web app (PWA) — on Windows and Mac computers, Android and iOS. No app store needed: add it to your home screen and use it like a native app, even offline.',
            'gallery.kicker': 'Gallery', 'gallery.title': 'Public Roadbooks', 'gallery.loading': 'Loading…', 'gallery.empty': 'No public roadbooks yet.',
            // Editor field help tooltips (issue #89)
            'help.road': 'The road surface you continue on from this note (default, asphalt, track, off-piste); it stays in force until a later note changes it.',
            'help.danger': 'FIA danger grading, shown as ! / !! / !!! in the vignette — the higher the grade, the more caution the spot demands.',
            'help.speed': 'A declarative speed limit (km/h) in force from this note; “End of limit” lifts it. Setting a limit also marks the note a controlled zone.',
            'help.capType': 'Qualifies the note’s CAP heading (FIA): Exit, Average, Calculated or Turning. Enabled once the note carries a CAP.',
            'help.wpType': 'The FIA waypoint type. It sets the map icon and, in a rally roadbook, how the waypoint is validated and scored.',
            'help.radius': 'Validation radius in metres — the geofence for automatic pass detection. Left empty it falls back to the roadbook default, then the type’s default (shown as the placeholder).',
            'help.visibility': 'Draft keeps the roadbook private while you work on it. Ready marks it finished but still private. Public lists it on the site so anyone can read it or export a PDF — but only you can download the .rdbk.',
            'help.description': 'Shown on the roadbook’s public page — a short summary of the route or event.',
            'help.author': 'The author’s name, embedded in the roadbook and shown to readers.',
            'help.org': 'The organizing club or event, embedded in the roadbook and shown to readers.',
            'help.profile': 'Basic (adventure) offers a simple waypoint set; Rally (FIA) adds the full FIA waypoint types, which drive how runs are scored.',
            'help.defRadius': 'A validation radius applied only to notes where you haven’t set one. Left empty, each waypoint falls back to its type’s own default.',
            'help.mapAccess': 'When on, the Reader may show the map. Turn it off to make readers navigate by the roadbook notes alone.',
            'help.reusable': 'Off (default): others can read and navigate this public roadbook but can\'t copy it. On: they can also copy it into their own profile to edit — it appears in the Editor\'s public-roadbook search.',
            'help.route': 'Reverse flips the travel direction — the track, note order and all headings are recomputed.',
            'seo.home.title': 'RDBK.app — digital roadbooks for your adventures', 'seo.home.desc': 'Create, navigate, validate and rank roadbooks for any adventure. Free PWA and the open .rdbk format.',
            'seo.about.title': 'Who we are — RDBK.app', 'seo.about.desc': 'The people and mission behind RDBK.app — free digital roadbook tools and the open .rdbk format for every adventure.',
            'seo.privacy.title': 'Privacy Policy — RDBK.app', 'seo.privacy.desc': 'How RDBK.app handles your data — accounts, roadbooks and photos — on our free digital roadbook tools.',
            'seo.terms.title': 'Terms of Use — RDBK.app', 'seo.terms.desc': 'The terms for using RDBK.app, the free digital roadbook suite and the open .rdbk format.',
            'about.title': 'Who we are',
            'about.lead1': 'RDBK.app is a free suite of <b>digital tools</b> for authoring roadbooks and easily using them. Track recording with audio and photo notes helps later editing; in event preparation, the Roadbook Editor is then usable by multiple authors — and much more!',
            'about.lead2': 'RDBK.app is a one-stop shop for every adventure — 4×4, moto, bike, running — built around the open <b>.rdbk</b> format. It grows out of years of real rally-navigation tooling.',
            'about.history': 'From Roadbook System to RDBK.app',
            'about.history1': 'RDBK.app is the evolution of <a href="https://www.roadbook-system.com/" target="_blank" rel="noopener"><b>Roadbook System</b></a> — the free, open-source rally-navigation suite created by <b>Massimo Sabattini</b> for 4×4 clubs and non-competitive off-road events. Roadbook System paired a roadbook editor, a mobile reader with tripmaster, real-time event ranking and time-locked GPX-trace protection, under one creed: <span class="creed">Logica, Semplice, Utile</span> — logic, simple, useful.',
            'about.history2': 'RDBK.app carries that spirit onto the modern web. The same core ideas — build a roadbook, follow it with GPS, score an event — rebuilt as a free, installable web app (PWA) plus native iOS and Android apps, around the open <b>.rdbk</b> file format, for any adventure and any device, online or off. The aim is to keep what made Roadbook System loved — clarity, the co-driver\'s craft, free and open — while bringing it to everyone, everywhere.',
            'about.team': 'The team',
            'about.team.maurizio': 'He shaped RDBK.app\'s tools — editor, reader, ranking and secure traces — and its design, then pushed the boundaries further: capturing voice notes and geotagged photos while recording a track, OpenRally import &amp; export, the event management, and setting up the online community.',
            'about.team.alvaro': 'The developer behind RDBK.app — the web suite, the open <b>.rdbk</b> format, the PHP/MariaDB back-end and the native iOS &amp; Android apps. A maker of mobile and remote-coding tools, he brought Roadbook System\'s ideas to the modern web.',
            'about.thanks': 'Special thanks',
            'about.thanks.massimo': 'Off-road navigator and event organiser — he shaped the <b>Roadbook System</b> suite and its creed (<i>Logica, Semplice, Utile</i>), the starting point for RDBK.app.',
            'terms.title': 'Terms of Use',
            'terms.updated': 'Version <b>1 July 2026, 17:50 (CEST)</b>. This is the version accepted by the user upon registration.',
            'terms.p1': 'These Terms of Use (the "<b>Terms</b>") govern access to and use of the <b>RDBK.app</b> website and its associated web and native applications (the "<b>Service</b>"). By using the Service the user declares that they have read, understood and fully accepted these Terms. Anyone who does not accept them must not use the Service.',
            'terms.s1h': '1. Prototype nature of the Service',
            'terms.s1': 'RDBK.app is a project in a <b>prototype development stage</b>, offered free of charge for experimental and demonstrative purposes. Features may be incomplete, contain errors, change, be suspended or removed at any time and without notice. The Service is not a finished product and is not intended for professional, production or otherwise critical use.',
            'terms.s2h': '2. No warranties',
            'terms.s2': 'The Service is provided "<b>as is</b>" and "as available", without warranties of any kind, express or implied. In particular <b>we provide no warranty of fitness for any purpose</b>, nor of merchantability, accuracy, reliability, completeness, continuity, security or error-free nature of the data, routes, maps, calculations and any other content or function. The user uses the Service at their own sole risk.',
            'terms.s3h': '3. Availability, maintenance and interruption',
            'terms.s3': 'No guaranteed service level is provided. The user <b>acknowledges and accepts</b> that the Service, in whole or in part, may be suspended, placed under maintenance, limited, modified or <b>permanently shut down at any time</b>, without notice and without any obligation or liability on our part arising. We do not guarantee the retention, backup or recoverability of uploaded data and content.',
            'terms.s4h': '4. No commitment regarding events',
            'terms.s4': 'The Service may allow creating, publishing or following "events", rankings and roadbooks. <b>We assume no commitment</b> to organise, support, keep active, validate or bring to completion any event, competition, ranking or activity, nor to guarantee the correctness of the related results. Each event and its use are the sole responsibility of whoever organises it and whoever participates in it.',
            'terms.s5h': '5. Use at your own risk and safety',
            'terms.s5': 'The navigation, odometer, track recording and similar tools are <b>mere aids</b> and do not replace the user\'s prudence, attention and judgement, who is solely responsible for their own safety and that of others. In particular the user undertakes to:',
            'terms.s5.a': 'always obey traffic regulations, road signs and applicable laws;',
            'terms.s5.b': 'not consult the device while driving or in dangerous situations;',
            'terms.s5.c': 'independently assess the traversability and safety of every itinerary, terrain or condition.',
            'terms.s5.d': 'The Service is <b>not intended</b> for emergency, rescue or otherwise safety-critical uses. Information on routes, distances and positions may be inaccurate, incomplete or out of date.',
            'terms.s6h': '6. Limitation of liability',
            'terms.s6': 'To the maximum extent permitted by applicable law, <b>we decline all liability</b> for any direct, indirect, incidental or consequential damages — including, by way of example, personal injury or property damage, accidents, loss or corruption of data, loss of profits or earnings — arising from or connected to the use of or inability to use the Service, its contents, the routes followed or the decisions made based on it. Any liability that cannot be excluded or limited by law remains unaffected.',
            'terms.s7h': '7. User obligations and conduct',
            'terms.s7': 'The user undertakes to use the Service lawfully and, in particular, not to: infringe the rights of third parties or legal provisions; upload or disseminate unlawful, offensive content or content for which they do not hold the rights; attempt to compromise its security, integrity or availability; use it in a way that causes harm to other users, third parties or us.',
            'terms.s8h': '8. Account and user content',
            'terms.s8': 'Creating an account and uploading content (roadbooks, photos, tracks) is optional. The user remains responsible for the content they upload and guarantees its lawfulness and ownership of the rights. We may, at our discretion and without notice, remove content, suspend or delete accounts, in particular in the event of non-compliant use. As stated in section 3, <b>we do not guarantee backup or retention</b> of data.',
            'terms.s9h': '9. Intellectual property',
            'terms.s9': 'The open <code>.rdbk</code> format and the project code are made available under their respective open source licence. The trademarks, logos and site content remain the property of their respective owners. No provision of these Terms transfers any intellectual property rights unless expressly provided for.',
            'terms.s10h': '10. Personal data',
            'terms.s10': 'The processing of personal data is described in the <a href="/privacy/">Privacy Policy</a>, which forms an integral part of these Terms.',
            'terms.s11h': '11. Changes to the Terms',
            'terms.s11': 'We may modify these Terms at any time. The updated version will be published on this page with the relevant date. Continued use of the Service after publication constitutes acceptance of the changes.',
            'terms.s12h': '12. Applicable law and jurisdiction',
            'terms.s12': 'These Terms are governed by Italian law. For any dispute, the <b>court of Lecco, Italy</b> shall have jurisdiction, without prejudice to mandatory provisions protecting the consumer.',
            'terms.s13h': '13. Owner and contact',
            'terms.s13': 'The Service is offered by <b>Maurizio Andreotti and Álvaro Franz</b>. For information you can write to <a href="mailto:rdbk.admin@gmail.com">rdbk.admin@gmail.com</a>.',
            'seo.contact.title': 'Contact — RDBK.app', 'seo.contact.desc': 'Get in touch with the RDBK.app team — questions, feedback or data requests about our free digital roadbook tools.',
            'seo.standard.title': 'The .rdbk standard — RDBK.app', 'seo.standard.desc': 'The open .rdbk format for digital roadbooks: one self-contained JSON file with track, notes and embedded icons. Full specification.',
            'seo.roadbooks.title': 'Public Roadbooks — RDBK.app', 'seo.roadbooks.desc': 'Browse public roadbooks shared by the community — 4x4, moto, bike and running routes to read, navigate or export.',
            'seo.events.title': 'Events — RDBK.app', 'seo.events.desc': 'Discover roadbook events and rallies: browse upcoming events and their public roadbooks.',
            'seo.feat_editor.title': 'Roadbook Editor — RDBK.app', 'seo.feat_editor.desc': 'Build a digital roadbook from a GPX or record it live — design rally notes, CAP headings, waypoints and icons, then export a self-contained .rdbk.',
            'seo.feat_reader.title': 'Roadbook Reader — RDBK.app', 'seo.feat_reader.desc': 'Navigate any roadbook with GPS: odometer, bearing, live map, CAP direction bar and automatic waypoint validation.',
            'seo.feat_recorder.title': 'Roadbook Recorder — RDBK.app', 'seo.feat_recorder.desc': 'Record your route live with GPS — accuracy-aware sampling, pause/resume, crash-safe GPX and geotagged photos.',
            'seo.feat_tripmaster.title': 'Tripmaster — RDBK.app', 'seo.feat_tripmaster.desc': 'A precise GPS trip computer: partial and total odometer, speed alerts, heading, stopwatch and GPX recording — no roadbook needed.',
            'seo.feat_ranking.title': 'Event classification — RDBK.app', 'seo.feat_ranking.desc': 'Score a rally from signed result QRs — accuracy, CAP, speed and regularity rankings into a final classification, with CSV export.',
            'seo.feat_events.title': 'Organising an event — RDBK.app', 'seo.feat_events.desc': 'How to create and run an event on RDBK.app: get organiser rights, build your team, gather roadbooks and bring in participants.',
            'In preparation': 'In preparation', 'Active participants only': 'Active participants only',
            'Switch to full mode': 'Switch to full mode',
            'Show this QR to the event organizer to activate your participation.': 'Show this QR to the event organizer to activate your participation.',
            'Activation code': 'Activation code', 'Invalid activation code.': 'Invalid activation code.',
            'Participant activated.': 'Participant activated.', 'Could not activate.': 'Could not activate.',
            'Could not activate.': 'Could not activate.', 'Link for participants': 'Link for participants', 'Manage participants': 'Manage participants',
            'Share this link with attendees so they access a simplified view showing only this event and its roadbooks:': 'Share this link with attendees so they access a simplified view showing only this event and its roadbooks:',
            'Participant management': 'Participant management', 'Select an event to manage its participants.': 'Select an event to manage its participants.',
            'Add': 'Add', 'Search users…': 'Search users…', 'added.': 'added.', 'Activate': 'Activate',
            'Point the camera at the participant\'s QR code.': 'Point the camera at the participant\'s QR code.',
            'Waiting for QR code…': 'Waiting for QR code…', 'Scanning…': 'Scanning…',
            'QR scanner not supported in this browser.': 'QR scanner not supported in this browser.',
            'Could not access camera.': 'Could not access camera.',
            'Open ranking': 'Open ranking',
            'Scores for this event. The event organizer collects result QR codes after each run and adds them here.': 'Scores for this event. The event organizer collects result QR codes after each run and adds them here.',
            'Live classification for this event. Scan the result QR from each vehicle after their run.': 'Live classification for this event. Scan the result QR from each vehicle after their run.',
            'Ranking': 'Ranking',
        },
    };
    // Merge additional languages loaded before this script (i18n.es.js / i18n.it.js / i18n.de.js / i18n.fr.js)
    if (window.RBi18nLangs) Object.assign(T, window.RBi18nLangs);
    // Expose the English source dict too, so the in-context translation editor can read and edit it
    // like any other language (its live preview mutates these dicts). Unlike the others, English
    // lives here in i18n.js (T.en) — the editor exports its delta back into this file, not an i18n.<lang>.js.
    (window.RBi18nLangs = window.RBi18nLangs || {}).en = T.en;


    function pickLang() {
        // guarded: blocked storage (cookie-blocking modes, some WebViews) throws on access,
        // and pickLang runs under virtually every render path (#208)
        let saved = null;
        try { saved = localStorage.getItem('rb_lang'); } catch (e) {}
        if (saved && T[saved]) return saved;
        for (const l of (navigator.languages || [navigator.language || 'en'])) {
            const code = String(l).slice(0, 2).toLowerCase();
            if (T[code]) return code;
        }
        return 'en';
    }

    const tr = (lang, k) => { const d = T[lang] || T.en; return d[k] != null ? d[k] : (T.en[k] != null ? T.en[k] : null); };

    // The language selector: a collapsed flag-only trigger that opens a flag + endonym list.
    // Flags are inline SVG (emoji flags don't render on Windows). EN uses the UK flag.
    const LANGS = [
        ['en', 'English',  '<svg viewBox="0 0 19 13"><rect width="19" height="13" fill="#012169"/><path d="M0,0 19,13 M19,0 0,13" stroke="#fff" stroke-width="2.6"/><path d="M0,0 19,13 M19,0 0,13" stroke="#C8102E" stroke-width="1.1"/><rect x="7.6" width="3.8" height="13" fill="#fff"/><rect y="4.6" width="19" height="3.8" fill="#fff"/><rect x="8.45" width="2.1" height="13" fill="#C8102E"/><rect y="5.45" width="19" height="2.1" fill="#C8102E"/></svg>'],
        ['es', 'Español',  '<svg viewBox="0 0 19 13"><rect width="19" height="13" fill="#AA151B"/><rect y="3.25" width="19" height="6.5" fill="#F1BF00"/></svg>'],
        ['it', 'Italiano', '<svg viewBox="0 0 19 13"><rect width="6.33" height="13" fill="#009246"/><rect x="6.33" width="6.34" height="13" fill="#fff"/><rect x="12.67" width="6.33" height="13" fill="#ce2b37"/></svg>'],
        ['de', 'Deutsch',  '<svg viewBox="0 0 19 13"><rect width="19" height="4.33" fill="#000"/><rect y="4.33" width="19" height="4.34" fill="#DD0000"/><rect y="8.67" width="19" height="4.33" fill="#FFCE00"/></svg>'],
        ['fr', 'Français', '<svg viewBox="0 0 19 13"><rect width="6.33" height="13" fill="#0055A4"/><rect x="6.33" width="6.34" height="13" fill="#fff"/><rect x="12.67" width="6.33" height="13" fill="#EF4135"/></svg>'],
    ];
    const flagOf = (code) => (LANGS.find((l) => l[0] === code) || LANGS[0])[2];

    // Sync every selector to the active language: swap the trigger flag, mark the active option.
    function refreshLangControls(lang) {
        document.querySelectorAll('.lang').forEach((el) => {
            const f = el.querySelector('.lang-trigger .lang-flag');
            if (f) f.innerHTML = flagOf(lang);
            el.querySelectorAll('.lang-opt').forEach((o) => o.classList.toggle('active', o.dataset.lang === lang));
        });
    }

    // Turn an empty .lang container into the collapsible control + wire open/close + selection.
    function buildLangControl(el) {
        const cur = document.documentElement.lang || pickLang();
        el.innerHTML =
            `<button type="button" class="lang-trigger" aria-haspopup="listbox" aria-expanded="false" aria-label="${window.RBt ? RBt('Language') : 'Language'}"><span class="lang-flag">${flagOf(cur)}</span><span class="lang-chev">▾</span></button>`
            + '<div class="lang-menu" role="listbox" hidden>'
            + LANGS.map(([code, name, flag]) => `<button type="button" class="lang-opt" role="option" data-lang="${code}"><span class="lang-flag">${flag}</span> ${name}</button>`).join('')
            + '</div>';
        const trig = el.querySelector('.lang-trigger'), menu = el.querySelector('.lang-menu');
        const close = () => { menu.hidden = true; trig.setAttribute('aria-expanded', 'false'); document.removeEventListener('click', onDoc); };
        function onDoc(e) { if (!el.contains(e.target)) close(); }
        trig.addEventListener('click', (e) => {
            e.stopPropagation();
            if (menu.hidden) { menu.hidden = false; trig.setAttribute('aria-expanded', 'true'); setTimeout(() => document.addEventListener('click', onDoc)); }
            else close();
        });
        el.querySelectorAll('.lang-opt').forEach((o) => o.addEventListener('click', () => { close(); apply(o.dataset.lang); }));
    }

    // Remember each element's original (English) content/attribute the first time, so a language
    // that lacks a key — including switching BACK to English, whose source lives inline in the HTML
    // (e.g. the privacy page) — restores the original instead of keeping the previous translation.
    const orig = new WeakMap();
    const baseOf = (el, field, getter) => { let o = orig.get(el); if (!o) orig.set(el, o = {}); if (!(field in o)) o[field] = getter(); return o[field]; };

    function apply(lang) {
        document.documentElement.lang = lang;
        document.querySelectorAll('[data-i18n]').forEach((el) => {
            // replace just the text, keeping any leading icon (<i>) intact
            const tn = [...el.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
            const base = baseOf(el, 'text', () => tn ? tn.textContent : el.textContent);
            const v = tr(lang, el.getAttribute('data-i18n'));
            const val = v != null ? (el.firstElementChild ? ' ' : '') + v : base;
            if (tn) tn.textContent = val; else el.textContent = val;
        });
        document.querySelectorAll('[data-i18n-html]').forEach((el) => {
            const base = baseOf(el, 'html', () => el.innerHTML);
            const v = tr(lang, el.getAttribute('data-i18n-html')); el.innerHTML = v != null ? v : base;
        });
        document.querySelectorAll('[data-i18n-ph]').forEach((el) => {
            const base = baseOf(el, 'ph', () => el.getAttribute('placeholder') || '');
            const v = tr(lang, el.getAttribute('data-i18n-ph')); el.setAttribute('placeholder', v != null ? v : base);
        });
        // accessibility attributes: title + aria-label translate declaratively too
        document.querySelectorAll('[data-i18n-title]').forEach((el) => {
            const base = baseOf(el, 'title', () => el.getAttribute('title') || '');
            const v = tr(lang, el.getAttribute('data-i18n-title')); el.setAttribute('title', v != null ? v : base);
        });
        document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
            const base = baseOf(el, 'aria', () => el.getAttribute('aria-label') || '');
            const v = tr(lang, el.getAttribute('data-i18n-aria')); el.setAttribute('aria-label', v != null ? v : base);
        });
        // SEO meta: <title data-i18n> localizes the tab title; <meta … data-i18n-content> the content attr
        document.querySelectorAll('[data-i18n-content]').forEach((el) => {
            const base = baseOf(el, 'content', () => el.getAttribute('content') || '');
            const v = tr(lang, el.getAttribute('data-i18n-content')); el.setAttribute('content', v != null ? v : base);
        });
        // help tooltips: the bubble text lives in data-tip
        document.querySelectorAll('[data-i18n-tip]').forEach((el) => {
            const base = baseOf(el, 'tip', () => el.getAttribute('data-tip') || '');
            const v = tr(lang, el.getAttribute('data-i18n-tip')); el.setAttribute('data-tip', v != null ? v : base);
        });
        refreshLangControls(lang);
        try { localStorage.setItem('rb_lang', lang); } catch (e) {}
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
        document.querySelectorAll('.lang').forEach(buildLangControl);
        apply(pickLang());
    });
})();
