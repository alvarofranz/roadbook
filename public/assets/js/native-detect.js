'use strict';
/* Native app detection, run before paint on the landing page so the launcher shows instead of the
 * marketing home (CSS toggles `.web-only`/`.app-only`) with no flash. Inert in a browser — Capacitor
 * is only defined inside the app shell. Lives in its own file so the page carries no inline script and
 * the Content-Security-Policy can forbid inline scripts outright (see public/.htaccess). */
if (window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform()) {
    document.documentElement.classList.add('native');
}
