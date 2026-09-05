import { describe, it, expect } from 'vitest';
import fs from 'fs';

/* The event page's copy, where getting it wrong sends the visitor somewhere that does not exist.
   · the signed-out join prompt must match the event's joining mode (#367): an open-join event
     asks for no code, so telling the visitor to get one from the organizer was a dead end;
   · an event link — which is what the event QR resolves to — must say that the native app is the
     better tool for driving it (#350), without saying it to the app itself. */

const LANGS = ['es', 'it', 'de', 'fr'];
const OPEN_PROMPT = 'Sign in to join this event.';
const CODE_PROMPT = "Sign in to join this event with the organizer's code.";
const read = (p) => fs.readFileSync(p, 'utf8');

function loadLangs() {
    delete window.RBi18nLangs;
    for (const lang of LANGS) eval(read(`public/assets/js/i18n.${lang}.js`));
    return window.RBi18nLangs;
}

describe('event join prompt (signed out)', () => {
    const source = read('public/event/event.js');

    it('picks the prompt from open_join instead of always asking for a code', () => {
        expect(source).toContain(String.raw`e.open_join ? t('Sign in to join this event.')`);
    });

    it('still asks for the code when the event is code-gated', () => {
        expect(source).toContain(String.raw`t('Sign in to join this event with the organizer\'s code.')`);
    });

    const langs = loadLangs();
    for (const lang of LANGS) {
        it(`${lang} translates both prompts`, () => {
            expect(langs[lang][OPEN_PROMPT]).toBeTruthy();
            expect(langs[lang][CODE_PROMPT]).toBeTruthy();
        });
    }
});

describe('event link recommends the app (#350)', () => {
    const html = read('public/event/index.html');

    it('carries the hint on the event page, where the QR lands', () => {
        expect(html).toContain('data-i18n="native.better.event"');
        expect(html).toContain('href="/install/"');
    });

    it('uses the shared .native-hint, which hides itself inside the app', () => {
        // recommending the app TO the app would be nonsense; `.native .native-hint {display:none}`
        // in app.css is what prevents it, so the hint must not roll its own box
        const hint = html.match(/<p class="([^"]*)">\s*<i class="fa-solid fa-mobile-screen-button">/);
        expect(hint, 'the hint must be a .native-hint paragraph').not.toBeNull();
        expect(hint[1].split(/\s+/)).toContain('native-hint');
        expect(read('public/assets/css/app.css')).toContain('.native .native-hint { display: none; }');
    });

    for (const lang of LANGS) {
        it(`${lang} translates the hint and its link`, () => {
            const t = loadLangs()[lang];
            expect(t['native.better.event'], 'native.better.event').toBeTruthy();
            expect(t['Get the app'], 'Get the app').toBeTruthy();
        });
    }
});
