import { describe, it, expect } from 'vitest';
import fs from 'fs';

/* The public event page (/event/<slug>) — registration, re-rendering and the HQ map. */
const read = (p) => fs.readFileSync(p, 'utf8');
const js = read('public/event/event.js');
const html = read('public/event/index.html');
const editJs = read('public/admin/events/edit/event-edit.js');

describe('registration on the event page', () => {
    it('a join names the event by its slug — never a shadowed click event (#581)', () => {
        expect(js).toContain("RBApi('event_join', { slug, ...extra })");
        expect(js).not.toMatch(/slug: e\.slug/);
    });
    it('a participant can leave, after a confirm that names the event (#582)', () => {
        expect(js).toContain("RBApi('event_leave', { slug })");
        const leave = js.match(/function wireLeave\(root, e\) \{([\s\S]*?)\n {4}\}/)[1];
        expect(leave).toContain('RBConfirm(msg)');
        expect(leave).toContain('esc(e.title)');
        expect(leave).toContain('RBLeaveParticipantMode()');
    });
    it('organizers get a way to manage it and are never asked to join it (#585)', () => {
        expect(html).toContain('id="evManage"');
        expect(js).toContain("$('evManage').href = '/admin/events/edit/?id=' + e.id;");
        expect(js).toContain('if (!e.can_join || e.org_read || RBIsParticipant()) return;');
    });
    it('a finished event says so (#587)', () => {
        expect(js).toContain("e.ended ? ` <span class=\"u-badge u-blocked\">${esc(t('Ended'))}</span>`");
    });
});

describe('re-rendering never duplicates what is built once', () => {
    it('the gallery listener and the HQ map are created once (#584)', () => {
        expect(js.match(/\$\('evRoadbooks'\)\.addEventListener\('click'/g)).toHaveLength(1);
        expect(js).toContain('if (!has || hqMap) return;');
    });
    it('a language switch re-renders the whole view (#586)', () => {
        expect(js).toContain("window.addEventListener('rb-lang', () => { if (data) render(); });");
    });
    it('no map re-centres itself on idle — that loop never stopped rendering (#583)', () => {
        for (const src of [js, editJs]) expect(src).not.toMatch(/on\('idle'/);
    });
    it('logos are cached by their stored, versioned URL — no per-render cache busting (#588)', () => {
        for (const p of ['public/event/event.js', 'public/events/events.js', 'public/admin/events/edit/event-edit.js']) {
            expect(read(p), p).not.toMatch(/logo[^\n]*Date\.now\(\)/);
        }
        expect(read('public/api/upload.php')).toContain("$url = '/event-logos/' . (int)$e['id'] . '.avif?v=' . time();");
    });
});
