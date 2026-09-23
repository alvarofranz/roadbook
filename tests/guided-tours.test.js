// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';

/* Guided tours (#906): asked once, each tool once, always skippable. RBTour is lifted out of app.js
   and run against a real DOM; RBConfirm is the only stub (it answers the one-time question). */
const app = fs.readFileSync('public/assets/js/app.js', 'utf8');
const src = app.slice(app.indexOf('    // The device\'s answers'), app.indexOf('    // Cloudflare Turnstile: ONE loader'));
let asked;
const load = (answer) => {
    asked = 0;
    window.RBt = (k) => k;
    window.RBConfirm = async () => { asked++; return answer; };
    new Function('window', 'RBt', 'RBConfirm', src)(window, window.RBt, window.RBConfirm);
};
const steps = [{ target: '#a', title: 'A', text: 'first' }, { target: '#missing', title: 'M', text: 'gone' }, { target: '#b', title: 'B', text: 'second' }];
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('RBTour', () => {
    beforeEach(() => {
        localStorage.clear();
        document.body.innerHTML = '<button id="a">A</button><button id="b">B</button>';
        // happy-dom lays nothing out: give the targets a size so they count as on screen
        for (const el of document.querySelectorAll('button')) el.getBoundingClientRect = () => ({ left: 10, top: 10, right: 60, bottom: 40, width: 50, height: 30 });
    });
    it('asks once; a No means no tour, ever', async () => {
        load(false);
        await window.RBTour('reader', steps); await tick();
        expect(asked).toBe(1);
        expect(document.querySelector('.tour')).toBeNull();
        await window.RBTour('editor', steps); await tick();
        expect(asked).toBe(1);
        expect(document.querySelector('.tour')).toBeNull();
    });
    it('after a Yes, each tool runs once, skipping the controls that are not on screen', async () => {
        load(true);
        await window.RBTour('reader', steps); await tick();
        expect(document.querySelectorAll('.tour-dots i')).toHaveLength(2); // #missing left out
        expect(document.querySelector('.tour-title').textContent).toBe('A');
        document.querySelector('[data-next]').click();
        expect(document.querySelector('.tour-title').textContent).toBe('B');
        document.querySelector('[data-next]').click();
        expect(document.querySelector('.tour')).toBeNull();
        await window.RBTour('reader', steps); await tick();
        expect(document.querySelector('.tour')).toBeNull(); // never again
        expect(asked).toBe(1);
    });
    it('Skip tutorial ends it for good, and so does Escape', async () => {
        load(true);
        await window.RBTour('recorder', steps); await tick();
        document.querySelector('[data-skip]').click();
        expect(document.querySelector('.tour')).toBeNull();
        await window.RBTour('recorder', steps); await tick();
        expect(document.querySelector('.tour')).toBeNull();
        await window.RBTour('tripmaster', steps); await tick();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        expect(document.querySelector('.tour')).toBeNull();
    });
});

describe('a new tour generation (#914)', () => {
    beforeEach(() => {
        localStorage.clear();
        document.body.innerHTML = '<button id="a">A</button><button id="b">B</button>';
        for (const el of document.querySelectorAll('button')) el.getBoundingClientRect = () => ({ left: 10, top: 10, right: 60, bottom: 40, width: 50, height: 30 });
    });
    it('hands the tours back to a device that answered an older one', async () => {
        localStorage.setItem('rb_tour', JSON.stringify({ gen: 1, optin: 'no', seen: ['reader'] }));
        load(true);
        await window.RBTour('reader', steps); await tick();
        expect(asked).toBe(1);                             // asked again
        expect(document.querySelector('.tour')).not.toBeNull(); // and shown
        expect(JSON.parse(localStorage.getItem('rb_tour'))).toMatchObject({ gen: 2, optin: 'yes', seen: ['reader'] });
    });
});

describe('every tool has its tour', () => {
    for (const [file, id] of [['public/reader/reader.js', 'reader'], ['public/editor/editor.js', 'editor'], ['public/recorder/recorder.js', 'recorder'], ['public/tripmaster/tripmaster.js', 'tripmaster']]) {
        it(`${id}: every step points at a control that exists`, () => {
            const js = fs.readFileSync(file, 'utf8');
            expect(js).toContain(`RBTour('${id}', `);
            const html = fs.readFileSync(file.replace(/[^/]+\.js$/, 'index.html'), 'utf8');
            const tour = js.match(/_TOUR = \[([\s\S]*?)\];/)[1];
            for (const [, target] of tour.matchAll(/target: '([^']+)'/g)) {
                const token = target.startsWith('#') ? `id="${target.slice(1)}"` : target.slice(1);
                expect(html, target).toContain(token);
            }
        });
    }
});
