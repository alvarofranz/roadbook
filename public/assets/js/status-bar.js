'use strict';
/* RBStatusBar — a shared sticky status bar (clock · battery · satellite/GPS signal)
 * shown by the Recorder and the Tripmaster while a GPS session is active. It owns
 * the clock tick and the Battery Status API; the page feeds it the GPS accuracy of
 * each fix via setGps(). The bar is created once, just below the global header. */
window.RBStatusBar = (function () {
    let el = null, clockTimer = null, battery = null, gpsCls = 'bad', gpsTxt = '—';
    const pad2 = (n) => String(n).padStart(2, '0');
    const battIcon = (p) => p > 80 ? 'fa-battery-full' : p > 55 ? 'fa-battery-three-quarters' : p > 30 ? 'fa-battery-half' : p > 10 ? 'fa-battery-quarter' : 'fa-battery-empty';
    function ensure() {
        if (el) return el;
        el = document.createElement('div');
        el.className = 'status-bar'; el.hidden = true;
        el.innerHTML = '<div class="status-cell"><i class="fa-solid fa-clock"></i><span data-sb="clock">--:--</span></div>'
            + '<div class="status-cell"><i class="fa-solid fa-battery-half" data-sb="bicon"></i><span data-sb="batt">—</span></div>'
            + '<div class="status-cell" data-sb="gpscell"><i class="fa-solid fa-satellite-dish"></i><span data-sb="gps">—</span></div>';
        const h = document.querySelector('header.topbar');
        if (h) h.insertAdjacentElement('afterend', el); else document.body.prepend(el);
        // battery is best-effort: not all browsers expose the API (e.g. iOS Safari)
        if ('getBattery' in navigator) { try { navigator.getBattery().then((b) => { battery = b; ['levelchange', 'chargingchange'].forEach((e) => b.addEventListener(e, render)); render(); }).catch(() => {}); } catch (e) {} }
        return el;
    }
    const q = (k) => el.querySelector('[data-sb="' + k + '"]');
    function render() {
        if (!el) return;
        const now = new Date();
        q('clock').textContent = pad2(now.getHours()) + ':' + pad2(now.getMinutes());
        if (battery) { const p = Math.round(battery.level * 100); q('batt').textContent = p + '%'; q('bicon').className = 'fa-solid ' + (battery.charging ? 'fa-bolt' : battIcon(p)); }
        else q('batt').textContent = 'N/A';
        q('gpscell').className = 'status-cell ' + gpsCls;
        q('gps').textContent = gpsTxt;
    }
    return {
        show() { ensure(); el.hidden = false; if (!clockTimer) clockTimer = setInterval(render, 1000); render(); },
        hide() { if (el) el.hidden = true; if (clockTimer) { clearInterval(clockTimer); clockTimer = null; } },
        // The Geolocation API exposes accuracy, not a satellite count — show signal quality.
        setGps(acc) {
            const t = window.RBt || ((k) => k);
            if (acc == null) { gpsCls = 'bad'; gpsTxt = t('No GPS'); }
            else { gpsCls = acc <= 15 ? 'ok' : acc <= 35 ? 'mid' : 'bad'; gpsTxt = '±' + Math.round(acc) + ' m'; }
            render();
        },
    };
})();
