import { describe, it, expect } from 'vitest';
import fs from 'fs';

/* The event editor (/admin/events/edit/): the form is saved by Save, the immediate actions only
   refresh their own section — never overwriting, or secretly saving, what is being typed. */
const read = (p) => fs.readFileSync(p, 'utf8');
const js = read('public/admin/events/edit/event-edit.js');
const html = read('public/admin/events/edit/index.html');
const php = read('app/events.php');

describe('the form vs the immediate actions', () => {
    it('only Save sends event_save — no action saves the form behind the organizer (#592)', () => {
        expect(js.match(/api\('event_save'/g)).toHaveLength(1);
        expect(js).not.toContain('confirmCodeGate');
    });
    it('an immediate action refreshes the sections, never refills the form (#591)', () => {
        const load = js.match(/async function load\(\) \{([\s\S]*?)\n {4}\}/)[1];
        expect(load).not.toContain('fillForm');
        expect(js).toContain('await load();\n        fillForm(); // the saved values');
    });
    it('leaving with unsaved edits asks first (#591)', () => {
        expect(js).toContain("window.addEventListener('beforeunload'");
        expect(js).toContain("RBConfirm(t('Leave without saving your changes?'))");
    });
});

describe('registration', () => {
    it('closing registration is the Closed gate — the Disable-joining button is gone (#593)', () => {
        expect(html).not.toContain('joinClear');
        expect(php).not.toContain("$d['clear']"); // no shim for the removed button (#732)
        expect(php).not.toContain('open_join');
    });
    it('an invite-code registration always has a code, generated on save (#593)', () => {
        expect(php).toContain('if ($st->fetchColumn() === null) event_generate_join_code($id);');
    });
    it('a new event starts from the documented defaults, visible in the form (#595)', () => {
        expect(js).toContain("const NEW_EVENT = { join_gate: 'code', require_activation: 1 };");
        expect(html).not.toMatch(/id="regSection"[^>]*hidden/);
    });
});

describe('page structure', () => {
    it('the HQ map is created once per page (#594)', () => {
        expect(js.match(/new RBMap\(/g)).toHaveLength(1);
        const load = js.match(/async function load\(\) \{([\s\S]*?)\n {4}\}/)[1];
        expect(load).not.toContain('initHqMap');
    });
    it('roadbooks show their real status and warn about drafts (#596)', () => {
        expect(js).toContain("const STATUS = { draft: 'Draft', ready: 'Ready', public: 'Public' };");
        expect(js).toContain("t('Participants cannot see a draft — set it to Ready or Public in the Editor.')");
    });
    it('a heading row with the event name and its actions, Delete for the owner (#597)', () => {
        expect(html).toMatch(/<div class="head-row" id="evHead"[\s\S]*id="evHeading"[\s\S]*id="evDelete"/);
        expect(js).toContain("$('evDelete').hidden = !(ev && isOwner());");
    });
    it('organizers are called Organizers (#598)', () => {
        expect(html).toContain('data-i18n="Organizers"');
        expect(html).not.toContain('Event collaborators');
    });
    it('the HQ map opens on the organizer\'s own location, not on Italy (#599)', () => {
        expect(js).not.toContain('43.7');
        expect(js).toContain('me.default_lat != null && me.default_lon != null');
    });
});
