import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

// The Tripmaster review (#721): one clock, the stopwatch is its tile, a dashboard on desktop.
describe('tripmaster dashboard', () => {
    const html = fs.readFileSync('public/tripmaster/index.html', 'utf8');
    const js = fs.readFileSync('public/tripmaster/tripmaster.js', 'utf8');
    it('the clock is the status bar’s alone — no second clock tile', () => {
        expect(html).not.toContain('id="tmClock"');
        expect(js).not.toContain('tmClock');
    });
    it('the stopwatch is its own tile, not a separate icon button', () => {
        expect(html).toMatch(/class="mini tm-timer">\s*<button class="mini-tap" id="tmTimerBtn"/);
        expect(html).not.toContain('tm-timerbtns');
        expect(js).toContain("$('tmTimerBtn').closest('.tm-timer').classList.toggle('running', timerOn);");
    });
    it('the speed tile says what it is and what tapping it set', () => {
        expect(js).toContain("tmEls.speedKey.textContent = saLimit ? t('Alert') + ' ' + saLimit : t('Speed');");
    });
    it('desktop gets a two-column dashboard with the actions on the right', () => {
        expect(html).toMatch(/@media \(min-width: 900px\)[\s\S]*?grid-template-areas: "odo ctl" "tiles ctl"/);
        expect(html).toContain('<button class="btn btn-primary tm-marknote" id="tmNoteBtn"');
    });
});
