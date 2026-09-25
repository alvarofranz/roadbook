import { describe, it, expect } from 'vitest';
import RB from '../public/assets/js/roadbook-core.js';

/* Pre-save consistency report (#339). The editor shows these findings before a save, so a false
   positive nags on every save and a false negative is a speed-controlled zone that never ends. Both directions are pinned here. */

const note = (num, extra = {}) => ({ num, track_index: num, lat: 0, lon: 0, distance: num * 1000, partial_distance: 1000, text: '', ...extra });
const roadbook = (notes, meta = {}) => ({ meta: { title: 'T', ...meta }, notes, track: [], symbols: {} });
const codes = (rb) => RB.consistencyReport(rb).map((f) => f.code);
const finding = (rb, code) => RB.consistencyReport(rb).find((f) => f.code === code);

describe('consistencyReport — validation radius (#773)', () => {
    it('never flags a note without a radius of its own: the defaults always give it one', () => {
        expect(RB.consistencyReport(roadbook([note(1), note(2)]))).toEqual([]);
        expect(RB.consistencyReport(roadbook([note(1)], { default_validation_radius: 60 }))).toEqual([]);
    });
});

describe('consistencyReport — speed-controlled zones', () => {
    const limited = (num, kmh) => note(num, { validation_radius: 50, speed_limit_kmh: kmh });

    it('accepts a zone that opens and closes', () => {
        expect(codes(roadbook([limited(1, 50), note(2, { validation_radius: 50 }), limited(3, 0)]))).toEqual([]);
    });

    it('flags a zone that is never lifted, naming the note that opens it', () => {
        const rb = roadbook([note(1, { validation_radius: 50 }), limited(2, 30), note(3, { validation_radius: 50 })]);
        expect(finding(rb, 'speed_zone_unclosed').notes).toEqual([2]);
    });

    it('flags a limit lifted where none is in force', () => {
        const rb = roadbook([limited(1, 0), limited(2, 50), limited(3, 0), limited(4, 0)]);
        const f = finding(rb, 'speed_zone_unopened');
        expect(f.count).toBe(2);
        expect(f.notes).toEqual([1, 4]);
    });

    it('a speed sign alone imposes nothing: the limit is the declared field', () => {
        const withIcon = (num, icon) => note(num, { validation_radius: 50, symbols: [{ name: icon }] });
        expect(codes(roadbook([withIcon(1, 'S03_30km.svg')]))).toEqual([]);
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

    it('reports several problems together, in reading order', () => {
        const rb = roadbook([note(1, { speed_limit_kmh: 0 }), note(2, { speed_limit_kmh: 50 })]);
        expect(codes(rb)).toEqual(['speed_zone_unclosed', 'speed_zone_unopened']);
    });

    // The editor renders one line per code — an unknown code would throw there, so the report must
    // only ever emit codes the UI knows about.
    it('emits only the two documented codes', () => {
        const known = ['speed_zone_unclosed', 'speed_zone_unopened'];
        const rb = roadbook([note(1), note(2, { speed_limit_kmh: 0 }), note(3, { speed_limit_kmh: 50 })]);
        for (const f of RB.consistencyReport(rb)) expect(known).toContain(f.code);
    });
});
