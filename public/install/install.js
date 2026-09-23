'use strict';
/* Install guide (#333 · #794). The native apps first, with the same store badges as the home
 * (RBGetAppHTML — one set of buttons for the whole site), then the web app for every device, all of
 * it open: the device you are on first and badged, the others right after, so a Windows user
 * helping someone with an iPhone finds the steps without opening anything.
 *
 * Where the browser supports the PWA install prompt (Chromium: Android + desktop) the card offers a
 * real "Install now" button wired to it; iOS Safari never fires that event, so there it is the
 * Share → Add to Home Screen walkthrough. Detection comes from RBDevice() (app.js), so the floating
 * Install chip and this page always agree on which device they are looking at. */
(function () {
    const t = RBt;
    // How to install the web app, per device (the native apps have their store badges above)
    const PLATFORMS = [
        {
            key: 'ios', icon: 'fa-brands fa-apple', title: 'iPhone · iPad',
            steps: [
                'Open <b>rdbk.app</b> in Safari (it has to be Safari).',
                'Tap <b>Share</b> <i class="fa-solid fa-arrow-up-from-bracket icon-accent"></i> in the bar.',
                'Choose <b>Add to Home Screen</b> <i class="fa-solid fa-square-plus icon-accent"></i>.',
                'Tap <b>Add</b>. Done!',
            ],
        },
        {
            key: 'android', icon: 'fa-brands fa-android', title: 'Android',
            steps: [
                'Open <b>rdbk.app</b> in Chrome.',
                'Tap the <b>⋮</b> menu, top right.',
                'Choose <b>Install app</b> (or <b>Add to Home screen</b>).',
            ],
        },
        {
            key: 'desktop', icon: 'fa-solid fa-desktop', title: 'Windows · Mac · Linux',
            steps: [
                'Open <b>rdbk.app</b> in Chrome or Edge.',
                'Click the <b>install</b> icon <i class="fa-solid fa-circle-down icon-accent"></i> in the address bar (or the ⋮ menu → <b>Install</b>).',
                'Confirm — RDBK then opens in its own window.',
            ],
        },
    ];

    const card = (platform, detected) => `
        <section class="install-card${detected ? ' detected' : ''}" data-platform="${platform.key}">
            <h3><i class="${platform.icon}"></i> ${RBesc(platform.title)}${detected ? `<span class="install-badge">${t('Your device')}</span>` : ''}</h3>
            <ol class="modal-list">${platform.steps.map((step) => `<li>${t(step)}</li>`).join('')}</ol>
            <div class="btnrow" data-prompt hidden>
                <button class="btn btn-primary" data-install><i class="fa-solid fa-circle-down"></i> ${t('Install now')}</button>
            </div>
        </section>`;

    const here = RBDevice();                                       // 'ios' · 'android' · 'desktop'
    const ordered = PLATFORMS.filter((p) => p.key === here).concat(PLATFORMS.filter((p) => p.key !== here));
    document.getElementById('installCards').innerHTML = `
        <section class="install-apps">
            <h2><i class="fa-solid fa-mobile-screen-button icon-accent"></i> ${t('The app')}</h2>
            <p class="muted">${t('The native app keeps recording in the background, with the screen locked, and is more accurate.')}</p>
            ${RBGetAppHTML(false)}
        </section>
        <h2 class="install-web-title"><i class="fa-solid fa-globe icon-accent"></i> ${t('Or install the web app')}</h2>
        <div class="install-grid">${ordered.map((p) => card(p, p.key === here)).join('')}</div>`;

    // The captured install prompt (app.js holds it) turns the steps into one tap. It can land after
    // this script runs, so the button is revealed whenever that happens.
    function offerPrompt() {
        const row = document.querySelector(`.install-card[data-platform="${here}"] [data-prompt]`);
        if (!row || !RBInstallPrompt.available()) return;
        row.hidden = false;
        row.querySelector('[data-install]').onclick = async () => { if (await RBInstallPrompt.fire()) row.hidden = true; };
    }
    offerPrompt();
    window.addEventListener('beforeinstallprompt', () => setTimeout(offerPrompt, 0));   // after app.js has stored it
    window.addEventListener('appinstalled', () => { RBToast('RDBK is installed — open it from your home screen.'); offerPrompt(); });
})();
