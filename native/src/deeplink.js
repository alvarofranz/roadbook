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
 * A FILE the OS opens with the app (tap a .gpx or a .rdbk in Files, a download, a chat, #996)
 * arrives the same way, as a file:// (iOS) or content:// (Android) URL.
 *
 * Returns:
 *   { join: '<code>' }             a /go/<code> event-join link
 *   { navigate: '/path?q#h' }      any other rdbk.app link → open that route
 *   { file: '<url>' }              a file handed to the app → read it (openedFileKind) and open it
 *   null                           not an rdbk.app link (ignored)
 */
function parseDeepLink(url) {
    let u;
    try { u = new URL(url); } catch (e) { return null; }
    if (u.protocol === 'file:' || u.protocol === 'content:') return { file: url };
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

/* What a file handed to the app is, read from its first bytes — never its name: an Android
 * content:// URL often has none, and a chat app renames what it passes on. A ZIP (`PK`) or a JSON
 * object is a roadbook (.rdbk, or a bare roadbook.json) → the Reader; a GPX → the Editor, which
 * turns it into a roadbook. Anything else is not ours: null. */
function openedFileKind(head) {
    if (head.length >= 2 && head[0] === 0x50 && head[1] === 0x4b) return 'rdbk';
    const text = new TextDecoder().decode(head).replace(/^\uFEFF/, '').trimStart();
    if (text.startsWith('{')) return 'rdbk';
    if (/<gpx[\s>]/i.test(text)) return 'gpx';
    return null;
}

/* The page that opens each kind, and the name the file takes there when its URL gives none. */
const OPENED_FILE_PAGE = { rdbk: '/reader/?open=file', gpx: '/editor/?open=file' };
function openedFileName(url, kind) {
    const last = decodeURIComponent(String(url).split(/[?#]/)[0].split('/').pop() || '');
    return /\.(gpx|rdbk|json)$/i.test(last) ? last : (kind === 'gpx' ? 'track.gpx' : 'roadbook.rdbk');
}

export { parseDeepLink, launchAction, openedFileKind, openedFileName, OPENED_FILE_PAGE };
