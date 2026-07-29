import { describe, it, expect } from 'vitest';
import RB from '../public/assets/js/roadbook-core.js';

/* Pre-save consistency report (#339). The editor shows these findings before a save, so a false
   positive nags on every save and a false negative is a roadbook that silently validates notes at
   the wrong radius (or a speed-controlled zone that never ends). Both directions are pinned here. */

const note = (num, extra = {}) => ({ num, idx: num, lat: 0, lon: 0, distance: num * 1000, partial_distance: 1000, text: '', ...extra });
const roadbook = (notes, meta = {}) => ({ meta: { title: 'T', ...meta }, notes, track: [], icons: {} });
const codes = (rb) => RB.consistencyReport(rb).map((f) => f.code);
const finding = (rb, code) => RB.consistencyReport(rb).find((f) => f.code === code);

describe('consistencyReport — validation radius', () => {
    it('says nothing when every note carries its own radius', () => {
        expect(codes(roadbook([note(1, { wp_radius: 50 }), note(2, { wp_radius: 80 })]))).toEqual([]);
    });

    it('counts the notes with no radius and names them', () => {
        const rb = roadbook([note(1, { wp_radius: 50 }), note(2), note(3)]);
        const f = finding(rb, 'notes_without_radius');
        expect(f.count).toBe(2);
        expect(f.notes).toEqual([2, 3]);
    });

    it('flags the missing roadbook default only when notes actually fall back to it', () => {
        expect(codes(roadbook([note(1), note(2)]))).toContain('no_default_radius');
        // a default IS set → the fallback is deliberate, so only the count is reported
        expect(codes(roadbook([note(1), note(2)], { default_wp_radius: 60 }))).toEqual(['notes_without_radius']);
        // every note has its own radius → no default needed, no nagging
        expect(codes(roadbook([note(1, { wp_radius: 40 })]))).toEqual([]);
    });

    it('treats radius 0 as a set radius, not a missing one', () => {
        expect(codes(roadbook([note(1, { wp_radius: 0 })]))).toEqual([]);
    });

    it('uses the note index when a note has no num', () => {
        const rb = roadbook([{ lat: 0, lon: 0, text: '' }, { lat: 0, lon: 0, text: '' }]);
        expect(finding(rb, 'notes_without_radius').notes).toEqual([1, 2]);
    });
});

describe('consistencyReport — speed-controlled zones', () => {
    const limited = (num, kmh) => note(num, { wp_radius: 50, speed_limit: kmh });

    it('accepts a zone that opens and closes', () => {
        expect(codes(roadbook([limited(1, 50), note(2, { wp_radius: 50 }), limited(3, 0)]))).toEqual([]);
    });

    it('flags a zone that is never lifted, naming the note that opens it', () => {
        const rb = roadbook([note(1, { wp_radius: 50 }), limited(2, 30), note(3, { wp_radius: 50 })]);
        expect(finding(rb, 'speed_zone_unclosed').notes).toEqual([2]);
    });

    it('flags a limit lifted where none is in force', () => {
        const rb = roadbook([limited(1, 0), limited(2, 50), limited(3, 0), limited(4, 0)]);
        const f = finding(rb, 'speed_zone_unopened');
        expect(f.count).toBe(2);
        expect(f.notes).toEqual([1, 4]);
    });

    it('reads a limit encoded in an icon name when there is no declarative field', () => {
        const withIcon = (num, icon) => note(num, { wp_radius: 50, icons: [{ name: icon }] });
        expect(codes(roadbook([withIcon(1, 'S03_30km.png')]))).toEqual(['speed_zone_unclosed']);
        expect(codes(roadbook([withIcon(1, 'S03_30km.png'), withIcon(2, 'S99_end.png')]))).toEqual([]);
    });

    it('a second limit inside an open zone changes it without opening a new one', () => {
        const rb = roadbook([limited(1, 50), limited(2, 30), limited(3, 0)]);
        expect(codes(rb)).toEqual([]);
    });

    it('only the last zone can be left unclosed', () => {
        const rb = roadbook([limited(1, 50), limited(2, 0), limited(3, 30)]);
        const report = RB.consistencyReport(rb);
        expect(report.map((f) => f.code)).toEqual(['speed_zone_unclosed']);
        expect(report[0].notes).toEqual([3]);
    });
});

describe('consistencyReport — shape', () => {
    it('is empty for a clean roadbook and never throws on an empty/absent one', () => {
        expect(RB.consistencyReport(roadbook([]))).toEqual([]);
        expect(RB.consistencyReport({})).toEqual([]);
        expect(RB.consistencyReport(null)).toEqual([]);
    });

    it('reports several problems together, radius first', () => {
        const rb = roadbook([note(1), note(2, { speed_limit: 50 })]);
        expect(codes(rb)).toEqual(['notes_without_radius', 'no_default_radius', 'speed_zone_unclosed']);
    });

    // The editor renders one line per code — an unknown code would throw there, so the report must
    // only ever emit codes the UI knows about.
    it('emits only the four documented codes', () => {
        const known = ['notes_without_radius', 'no_default_radius', 'speed_zone_unclosed', 'speed_zone_unopened'];
        const rb = roadbook([note(1), note(2, { speed_limit: 0 }), note(3, { speed_limit: 50 })]);
        for (const f of RB.consistencyReport(rb)) expect(known).toContain(f.code);
    });
});
