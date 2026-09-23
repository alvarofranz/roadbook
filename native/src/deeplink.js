'use strict';
/* Deep-link routing for the native shells (#268).
 *
 * Universal Links (iOS) / App Links (Android) hand an https://rdbk.app/… URL to the
 * installed app instead of the browser. This pure helper maps that URL to the in-app
 * action — kept free of Capacitor so it is bundled into native.bundle.js AND imported
 * straight into the unit tests.
 *
 * A `/go/<code>` link is the event-join deep link. There is no PHP server inside the app,
 * so `/go/` cannot run there; the code is extracted and the join goes through the API
 * (Bearer). Every other rdbk.app link is a real bundled route, so it is simply opened in
 * the WebView (RDBKRouter resolves the friendly slug pages).
 *
 * Returns:
 *   { join: '<code>' }             a /go/<code> event-join link
 *   { navigate: '/path?q#h' }      any other rdbk.app link → open that route
 *   null                           not an rdbk.app link (ignored)
 */
function parseDeepLink(url) {
    let u;
    try { u = new URL(url); } catch (e) { return null; }
    if (u.hostname !== 'rdbk.app') return null;
    const go = u.pathname.match(/^\/go\/([A-Za-z0-9_-]+)\/?$/);
    if (go) return { join: go[1] };
    return { navigate: u.pathname + u.search + u.hash };
}

/* The URL the app was LAUNCHED with stays the same for the whole session, and the bridge runs on
 * every page — so the page a launch link leads to would open it again, and again: the app "shook"
 * in an endless reload and never showed the page (#812). A launch link is followed once (`handled`
 * is the one already followed this session), and never to the page already on screen (`here`,
 * path + query + hash). Returns the action to run, or null. */
function launchAction(url, handled, here) {
    if (!url || url === handled) return null;
    const action = parseDeepLink(url);
    if (action && action.navigate && action.navigate === here) return null;
    return action;
}

export { parseDeepLink, launchAction };
