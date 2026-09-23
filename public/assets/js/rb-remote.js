'use strict';
/* RBRemote — external remote control for the hands-free tools (#20 · #909).
 *
 * The cheap, cross-platform hardware people already own — Bluetooth page-turner PEDALS, handlebar
 * rally controllers, camera/selfie remotes, ring and presentation clickers — pairs as a standard
 * Bluetooth KEYBOARD and sends ordinary key presses. So the whole transport is `keydown`: no pairing
 * UI, no permissions, no plugin, and it behaves identically in the browser, the installed PWA and
 * the native app.
 *
 * Which button does what is the USER's own mapping (#909), set up in the profile's "Remote buttons"
 * table and kept on this device: key → action. Without one it is DEFAULT_MAP, what the common devices
 * send. The page owns what an action DOES (each tool attaches only the ones it has); this module owns
 * the mapping and the guards, so a key never fires while the user is typing, while a modal is open,
 * or as a browser shortcut.
 *
 * Usage:  const detach = RBRemote.attach({ next: …, prev: … });   // detach() to stop listening
 */
(function () {
    // Every action a remote button can run, and where it acts. `next` is the one-button remote's:
    // it validates the note in the Reader, marks one in the Tripmaster and drops one in the Recorder.
    const ACTIONS = ['next', 'prev', 'auto', 'map', 'pause', 'reset', 'plus10', 'minus10', 'timer'];
    // What the common devices send, and so what a remote does before anyone maps it: page-turners
    // and clickers send arrows, Page Up/Down, Space or Enter.
    const DEFAULT_MAP = { ArrowRight: 'next', ArrowDown: 'next', PageDown: 'next', ' ': 'next', Enter: 'next', ArrowLeft: 'prev', ArrowUp: 'prev', PageUp: 'prev' };
    const MAP_KEY = 'rb_remote_map';
    // One name per physical key: the old 'Spacebar' is Space, and a letter is the same button in either case.
    const keyOf = (event) => { const k = event && event.key; if (!k) return null; return k === 'Spacebar' ? ' ' : (k.length === 1 ? k.toLowerCase() : k); };
    // The user's mapping on this device, or the default one
    function mapping() {
        try { const m = JSON.parse(localStorage.getItem(MAP_KEY) || 'null'); if (m && typeof m === 'object') return m; } catch (e) {}
        return Object.assign({}, DEFAULT_MAP);
    }
    function saveMapping(map) { try { localStorage.setItem(MAP_KEY, JSON.stringify(map)); } catch (e) {} }
    function resetMapping() { try { localStorage.removeItem(MAP_KEY); } catch (e) {} }
    // A key's readable name, for the settings table
    const LABELS = { ArrowRight: '→', ArrowLeft: '←', ArrowUp: '↑', ArrowDown: '↓', PageDown: 'Page ↓', PageUp: 'Page ↑', ' ': 'Space', Enter: 'Enter', Escape: 'Esc', Tab: 'Tab', Backspace: '⌫' };
    const labelOf = (key) => LABELS[key] || (key.length === 1 ? key.toUpperCase() : key);

    // Two different reasons a key press is the UI's and not the remote's, and they need different
    // treatment — a blanket "ignore anything with a control focused" would kill the remote for good
    // the moment someone taps an on-screen button, since the focus STAYS there afterwards:
    //   · typing — a field owns every key, including the arrows moving the caret;
    //   · activating — Space/Enter click the focused button, so acting on them too would advance
    //     twice; the arrows and Page keys never activate anything, so they stay ours.
    const TYPING_TAGS = ['INPUT', 'TEXTAREA', 'SELECT'];
    const ACTIVATABLE_TAGS = ['BUTTON', 'A', 'SUMMARY'];
    const ACTIVATION_KEYS = [' ', 'Enter'];

    // The command a key event means under `map` (the user's by default), or null when the event is
    // not ours. Pure but for reading the stored mapping, so it is unit-testable without a DOM.
    function commandFor(event, map) {
        if (!event) return null;
        if (event.ctrlKey || event.altKey || event.metaKey) return null;   // browser/OS shortcut, not a remote
        const target = event.target || {};
        const tag = (target.tagName || '').toUpperCase();
        const key = keyOf(event);
        if (!key) return null;
        if (target.isContentEditable || TYPING_TAGS.indexOf(tag) >= 0) return null;
        if (ACTIVATABLE_TAGS.indexOf(tag) >= 0 && ACTIVATION_KEYS.indexOf(key) >= 0) return null;
        return (map || mapping())[key] || null;
    }

    // Listen until the returned function is called. A key that maps to a command the page did not
    // provide is left alone — the page decides which commands exist.
    function attach(commands) {
        const onKeyDown = (event) => {
            if (document.querySelector('.modal:not([hidden])')) return;    // a dialog owns the keyboard
            const command = commandFor(event);
            const run = command && commands[command];
            if (!run) return;
            event.preventDefault();                                        // no scrolling on Space/arrows
            run();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }

    // The settings' "press a button" (#909): the next key press, whatever it is, goes to `onKey` and
    // is not acted on; returns the function that stops listening.
    function capture(onKey) {
        const onKeyDown = (event) => {
            if (['Shift', 'Control', 'Alt', 'Meta'].indexOf(event.key) >= 0) return; // a modifier alone is not a button
            event.preventDefault(); event.stopPropagation();
            onKey(keyOf(event));
        };
        window.addEventListener('keydown', onKeyDown, true);
        return () => window.removeEventListener('keydown', onKeyDown, true);
    }

    const RBRemote = { ACTIONS, DEFAULT_MAP, mapping, saveMapping, resetMapping, labelOf, keyOf, commandFor, attach, capture };
    if (typeof window !== 'undefined') window.RBRemote = RBRemote;
    if (typeof module !== 'undefined' && module.exports) module.exports = RBRemote; // unit tests (Node)
})();
