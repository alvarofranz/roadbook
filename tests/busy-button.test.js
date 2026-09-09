import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';

/* The Save button answers "did it save?" (#459).
   A toast is easy to miss and gone in seconds, so the button that was pressed reports its own
   work: spinner while it runs, green tick when the roadbook is stored. RBBusy is the one shared
   primitive for that — three pages had each hand-rolled a different spinner before it. */

const read = (p) => fs.readFileSync(p, 'utf8');
const appJs = read('public/assets/js/app.js');

// RBBusy touches nothing but the element and setTimeout, so it runs standalone in happy-dom —
// evaluating the whole of app.js would drag in the header, the service worker and version polling.
const src = appJs.match(/window\.RBBusy = \(el, \{ onEnd \} = \{\}\) => \{[\s\S]*?\n {4}\};/);
eval(src[0]);

const mkBtn = (html) => {
    document.body.innerHTML = `<button class="btn btn-primary" id="save">${html}</button>`;
    return document.getElementById('save');
};

describe('RBBusy: a button that reports its own work', () => {
    beforeEach(() => { vi.useFakeTimers(); });

    it('spins and locks while the work is in flight', () => {
        const btn = mkBtn('<i class="fa-solid fa-floppy-disk"></i>');
        window.RBBusy(btn);
        expect(btn.disabled).toBe(true);           // no double-save while the first is in flight
        expect(btn.classList.contains('btn-busy')).toBe(true);
        expect(btn.querySelector('.spinner')).toBeTruthy();
        expect(btn.querySelector('.fa-floppy-disk')).toBeFalsy();
    });

    it('turns green with a tick on success, then goes back after 3 s', () => {
        const btn = mkBtn('<i class="fa-solid fa-floppy-disk"></i>');
        const onEnd = vi.fn();
        const busy = window.RBBusy(btn, { onEnd });
        busy.ok();
        expect(btn.classList.contains('btn-ok')).toBe(true);
        expect(btn.classList.contains('btn-busy')).toBe(false);
        expect(btn.querySelector('.fa-check')).toBeTruthy();
        expect(btn.disabled).toBe(true);           // the work is done: there is nothing to press
        expect(onEnd).not.toHaveBeenCalled();

        vi.advanceTimersByTime(2999);
        expect(btn.classList.contains('btn-ok')).toBe(true);
        vi.advanceTimersByTime(1);
        expect(btn.classList.contains('btn-ok')).toBe(false);
        expect(btn.querySelector('.fa-floppy-disk')).toBeTruthy(); // exactly the icon it started with
        expect(btn.disabled).toBe(false);
        expect(onEnd).toHaveBeenCalledTimes(1);    // …then the page decides the real disabled state
    });

    it('restores immediately on failure — the toast carries the reason', () => {
        const btn = mkBtn('<i class="fa-solid fa-floppy-disk"></i>');
        const onEnd = vi.fn();
        window.RBBusy(btn, { onEnd }).fail();
        expect(btn.disabled).toBe(false);
        expect(btn.classList.contains('btn-busy')).toBe(false);
        expect(btn.querySelector('.fa-floppy-disk')).toBeTruthy();
        expect(onEnd).toHaveBeenCalledTimes(1);
    });

    it('keeps a labelled button’s text, so nothing jumps', () => {
        const btn = mkBtn('<i class="fa-solid fa-floppy-disk"></i> <span>Save</span>');
        const busy = window.RBBusy(btn);
        expect(btn.textContent).toContain('Save');
        expect(btn.querySelector('.spinner')).toBeTruthy();
        busy.fail();
        expect(btn.innerHTML).toBe('<i class="fa-solid fa-floppy-disk"></i> <span>Save</span>');
    });

    it('takes an element id, and a missing button is a harmless no-op', () => {
        mkBtn('<i class="fa-solid fa-floppy-disk"></i>');
        window.RBBusy('save').fail();
        // leaveEditor saves with no button on screen: that call must not throw
        expect(() => { const b = window.RBBusy(undefined); b.ok(); b.fail(); }).not.toThrow();
    });
});

describe('the editor saves through it', () => {
    const editor = read('public/editor/editor.js');

    it('every Save reports on the button that was pressed', () => {
        expect(editor).toContain("$('saveAccount').onclick = () => saveRoadbook('saveAccount');");
        expect(editor).toContain("$('cfgSave').onclick = () => saveRoadbook('cfgSave');");
        expect(editor).toContain("RBBusy('saveAsAccount'");
        const save = editor.match(/async function saveRoadbook\(btn\) \{([\s\S]*?)\n {4}\}/)[1];
        expect(save).toContain('RBBusy(btn, { onEnd: updateSaveBtn })');
        expect(save).toContain('if (r.ok) busy.ok(); else busy.fail();');
    });

    it('a disabled, busy and done button are all visibly distinct', () => {
        // .btn had NO disabled state, so a Save with nothing left to save looked pressable forever
        const css = read('public/assets/css/app.css');
        expect(css).toMatch(/\.btn:disabled \{[^}]*opacity/);
        expect(css).toMatch(/\.btn\.btn-busy \{/);
        expect(css).toMatch(/\.btn\.btn-ok \{[^}]*var\(--ok\)/);
    });
});

describe('the recovery prompt is not a failure report', () => {
    const editor = read('public/editor/editor.js');

    it('names the changes and when they were made, and never says the save failed', () => {
        expect(editor).toContain("t('You left unsaved changes here. Continue from them?')");
        expect(editor).not.toContain('Recover the unsaved draft?');
        expect(editor).toContain('rbIsOwner, rbOwner, at: Date.now()'); // the checkpoint is timestamped
        expect(editor).toContain('draft.at ? new Date(draft.at).toLocaleString');
    });

    it('is still asked only once, and still keeps the work when declined (#436)', () => {
        expect(editor).toContain('!draft.declined');
        expect(editor).toContain('declineDraft()');
        const decline = editor.match(/const declineDraft = \(\) => \{([\s\S]*?)\n {4}\};/)[1];
        expect(decline).toContain("d.declined = true");
        expect(decline).not.toContain('removeItem'); // declining must never destroy the draft
    });
});
