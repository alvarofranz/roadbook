import { describe, it, expect } from 'vitest';
import fs from 'fs';

/* The event page's signed-out join prompt must match the event's joining mode (#367):
   an open-join event asks for no code, so telling the visitor to get one from the
   organizer sent them looking for something that does not exist. Both prompts must
   stay translated in every language. */

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
