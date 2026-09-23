import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import RBRemote from '../public/assets/js/rb-remote.js';

/* External remote (#20). The whole transport is `keydown`, because the cheap hardware (Bluetooth
   page-turner pedals, camera clickers, ring remotes) pairs as a keyboard. Two failure modes matter:
   a press that does nothing (the device is useless) and a press that fires while the user is doing
   something else — typing a vehicle number, activating a focused button, using a browser shortcut —
   which in competition mode would validate a note by accident. Both are pinned here. */

const press = (key, extra = {}) => ({ key, target: { tagName: 'BODY' }, ...extra });

describe('key → command mapping', () => {
    it('advances on everything the common devices send', () => {
        for (const key of ['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Spacebar', 'Enter']) {
            expect(RBRemote.commandFor(press(key)), key).toBe('next');
        }
    });

    it('goes back on the reverse keys', () => {
        for (const key of ['ArrowLeft', 'ArrowUp', 'PageUp']) {
            expect(RBRemote.commandFor(press(key)), key).toBe('prev');
        }
    });

    it('ignores keys no device maps', () => {
        for (const key of ['a', 'Escape', 'Tab', 'F5', 'Home', 'End']) {
            expect(RBRemote.commandFor(press(key)), key).toBeNull();
        }
    });

    it('ignores browser and OS shortcuts', () => {
        expect(RBRemote.commandFor(press('ArrowRight', { ctrlKey: true }))).toBeNull();
        expect(RBRemote.commandFor(press('ArrowRight', { altKey: true }))).toBeNull();
        expect(RBRemote.commandFor(press('ArrowRight', { metaKey: true }))).toBeNull();
    });

    // A field owns every key, arrows included (the caret moves).
    it('stays out of the way while the user is typing', () => {
        for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) {
            expect(RBRemote.commandFor(press(' ', { target: { tagName } })), tagName).toBeNull();
            expect(RBRemote.commandFor(press('ArrowRight', { target: { tagName } })), tagName).toBeNull();
        }
        expect(RBRemote.commandFor(press('Enter', { target: { tagName: 'DIV', isContentEditable: true } }))).toBeNull();
    });

    // The one that decides whether a pedal works in the field: after tapping an on-screen button the
    // focus STAYS on it, so only the keys that would click it may be ignored — never the arrows, or
    // the remote would go dead for the rest of the run.
    it('still advances with a button focused, except on the keys that would click it', () => {
        for (const tagName of ['BUTTON', 'A', 'SUMMARY']) {
            expect(RBRemote.commandFor(press(' ', { target: { tagName } })), tagName).toBeNull();
            expect(RBRemote.commandFor(press('Enter', { target: { tagName } })), tagName).toBeNull();
            expect(RBRemote.commandFor(press('ArrowRight', { target: { tagName } })), tagName).toBe('next');
            expect(RBRemote.commandFor(press('PageDown', { target: { tagName } })), tagName).toBe('next');
            expect(RBRemote.commandFor(press('ArrowLeft', { target: { tagName } })), tagName).toBe('prev');
        }
    });

    it('survives a missing or bare event', () => {
        expect(RBRemote.commandFor(null)).toBeNull();
        expect(RBRemote.commandFor({})).toBeNull();
        expect(RBRemote.commandFor({ key: 'ArrowRight' })).toBe('next'); // no target → still a remote press
    });

    it('every default button runs a known action', () => {
        for (const action of Object.values(RBRemote.DEFAULT_MAP)) expect(RBRemote.ACTIONS).toContain(action);
    });
});

describe('the rider’s own mapping (#909)', () => {
    beforeEach(() => localStorage.clear());
    it('is the standard one until the rider changes it', () => {
        expect(RBRemote.mapping()).toEqual(RBRemote.DEFAULT_MAP);
    });
    it('runs whatever the rider bound, even an odd key, in either case', () => {
        RBRemote.saveMapping({ F5: 'next', m: 'map', '+': 'plus10' });
        expect(RBRemote.commandFor(press('F5'))).toBe('next');
        expect(RBRemote.commandFor(press('M'))).toBe('map');
        expect(RBRemote.commandFor(press('+'))).toBe('plus10');
        expect(RBRemote.commandFor(press('ArrowRight'))).toBeNull(); // no longer bound
    });
    it('a button belongs to one action: binding it again moves it', () => {
        const m = RBRemote.mapping(); m.Enter = 'pause'; RBRemote.saveMapping(m);
        expect(RBRemote.commandFor(press('Enter'))).toBe('pause');
        expect(RBRemote.commandFor(press('PageDown'))).toBe('next');
    });
    it('restores the standard buttons', () => {
        RBRemote.saveMapping({ x: 'next' });
        RBRemote.resetMapping();
        expect(RBRemote.mapping()).toEqual(RBRemote.DEFAULT_MAP);
    });
    it('captures the next button pressed, whatever it is, without acting on it', () => {
        let got = null;
        const stop = RBRemote.capture((k) => { got = k; });
        const event = new window.KeyboardEvent('keydown', { key: 'F7', bubbles: true, cancelable: true });
        document.body.dispatchEvent(event);
        stop();
        expect(got).toBe('F7');
        expect(event.defaultPrevented).toBe(true);
    });
    it('names the buttons plainly', () => {
        expect(RBRemote.labelOf(' ')).toBe('Space');
        expect(RBRemote.labelOf('PageDown')).toBe('Page ↓');
        expect(RBRemote.labelOf('a')).toBe('A');
    });
});

describe('the remote simply works in every hands-free tool (#909)', () => {
    const fs = require('fs');
    it('the Reader attaches it while navigating, with no switch to tick', () => {
        const reader = fs.readFileSync('public/reader/reader.js', 'utf8');
        expect(reader).toContain('detachRemote = RBRemote.attach({');
        expect(fs.readFileSync('public/reader/index.html', 'utf8')).not.toContain('id="optRemote"');
    });
    it('the Tripmaster and the Recorder run their own controls from it', () => {
        expect(fs.readFileSync('public/tripmaster/tripmaster.js', 'utf8')).toContain("next: () => $('tmNoteBtn').click(), reset: doReset,");
        expect(fs.readFileSync('public/recorder/recorder.js', 'utf8')).toContain("next: () => { if (RBGpxRecorder.recording) $('recWpt').click(); },");
    });
    it('the profile lets the rider assign every action', () => {
        const account = fs.readFileSync('public/assets/../account/account.js', 'utf8');
        expect(account).toContain('stopCapture = RBRemote.capture((key) => {');
        for (const action of RBRemote.ACTIONS) expect(account).toMatch(new RegExp(`\\b${action}: \\['`));
    });
});

describe('attach', () => {
    let next, prev, detach;
    beforeEach(() => {
        document.body.innerHTML = '';
        next = vi.fn(); prev = vi.fn();
        detach = RBRemote.attach({ next, prev });
    });
    // A listener left behind would fire in the NEXT test with the previous test's mocks — the whole
    // point of detach(), so the suite has to prove it uses it.
    afterEach(() => detach());

    const fire = (key, target) => {
        const event = new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
        (target || document.body).dispatchEvent(event);
        return event;
    };

    it('runs the command and stops the page from also scrolling', () => {
        const event = fire('ArrowRight');
        expect(next).toHaveBeenCalledTimes(1);
        expect(event.defaultPrevented).toBe(true);
    });

    it('leaves an unmapped key completely alone', () => {
        const event = fire('x');
        expect(next).not.toHaveBeenCalled();
        expect(prev).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(false);
    });

    // A dialog owns the keyboard: the vehicle-number prompt, a confirm, the start dialog.
    it('stays silent while a modal is open', () => {
        document.body.innerHTML = '<div class="modal"><div class="modal-card"></div></div>';
        fire('ArrowRight');
        expect(next).not.toHaveBeenCalled();
        // …and wakes up again once the modal is hidden
        document.querySelector('.modal').hidden = true;
        fire('ArrowRight');
        expect(next).toHaveBeenCalledTimes(1);
    });

    it('does nothing for a command the page did not provide', () => {
        detach();
        const only = vi.fn();
        detach = RBRemote.attach({ next: only });
        const event = fire('ArrowLeft');            // prev has no handler here
        expect(only).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(false); // and the key keeps its normal behaviour
    });

    it('detach really stops listening', () => {
        detach();
        fire('ArrowRight');
        expect(next).not.toHaveBeenCalled();
        detach = () => {};                          // already detached; keep afterEach harmless
    });
});
