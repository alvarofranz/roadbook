'use strict';
/* RBRemote — external remote control for the hands-free tools (#20).
 *
 * The cheap, cross-platform hardware people already own — Bluetooth page-turner PEDALS (hands stay
 * on the wheel), camera/selfie remotes, ring and presentation clickers — pairs as a standard
 * Bluetooth KEYBOARD and sends ordinary key presses. So the whole transport is `keydown`: no
 * pairing UI, no permissions, no plugin, and it behaves identically in the browser, the installed
 * PWA and the native app. Dedicated BLE tripmasters (Web Bluetooth / a native plugin) and the
 * Gamepad API are separate transports that can feed these same commands later.
 *
 * The page owns the commands ({ next, prev } — what "advance" means differs per tool); this module
 * owns the mapping and the guards, so a key never fires while the user is typing, while a modal is
 * open, or as a browser shortcut.
 *
 * Usage:  const detach = RBRemote.attach({ next: …, prev: … });   // detach() to stop listening
 */
(function () {
    // Which keys the common devices actually emit. Page-turners and clickers send arrows, PageUp/
    // PageDown, Space or Enter; every model differs, so each command accepts a family rather than
    // one key. Space and Enter advance, which is what a single-button remote sends.
    const KEYMAP = {
        next: ['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Spacebar', 'Enter'],
        prev: ['ArrowLeft', 'ArrowUp', 'PageUp'],
    };
    // Two different reasons a key press is the UI's and not the remote's, and they need different
    // treatment — a blanket "ignore anything with a control focused" would kill the remote for good
    // the moment someone taps an on-screen button, since the focus STAYS there afterwards:
    //   · typing — a field owns every key, including the arrows moving the caret;
    //   · activating — Space/Enter click the focused button, so acting on them too would advance
    //     twice; the arrows and Page keys never activate anything, so they stay ours.
    const TYPING_TAGS = ['INPUT', 'TEXTAREA', 'SELECT'];
    const ACTIVATABLE_TAGS = ['BUTTON', 'A', 'SUMMARY'];
    const ACTIVATION_KEYS = [' ', 'Spacebar', 'Enter'];

    // The command a key event means, or null when the event is not ours. Pure: it reads only the
    // event, so the mapping is unit-testable without a DOM.
    function commandFor(event) {
        if (!event) return null;
        if (event.ctrlKey || event.altKey || event.metaKey) return null;   // browser/OS shortcut, not a remote
        const target = event.target || {};
        const tag = (target.tagName || '').toUpperCase();
        const key = event.key;
        if (target.isContentEditable || TYPING_TAGS.indexOf(tag) >= 0) return null;
        if (ACTIVATABLE_TAGS.indexOf(tag) >= 0 && ACTIVATION_KEYS.indexOf(key) >= 0) return null;
        for (const command of Object.keys(KEYMAP)) if (KEYMAP[command].indexOf(key) >= 0) return command;
        return null;
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

    const RBRemote = { KEYMAP, commandFor, attach };
    if (typeof window !== 'undefined') window.RBRemote = RBRemote;
    if (typeof module !== 'undefined' && module.exports) module.exports = RBRemote; // unit tests (Node)
})();
