import { describe, it, expect } from 'vitest';
import fs from 'fs';
import RB from '../public/assets/js/roadbook-core.js';

/* Android's picker only knows the extensions in the OS table: a `.gpx` accept offered only images (#996). */
describe('the native app’s file pickers', () => {
    it('an accept naming an extension opens every file', () => {
        expect(RB.pickerAccept('.gpx,.wpt')).toBe('*/*');
        expect(RB.pickerAccept('.rdbk,.json,application/x-roadbook')).toBe('*/*');
        expect(RB.pickerAccept('.csv, .txt, text/csv')).toBe('*/*');
    });
    it('a MIME-only accept keeps its filter (and the camera)', () => {
        expect(RB.pickerAccept('image/*')).toBe('image/*');
        expect(RB.pickerAccept('')).toBe('');
    });
    it('the app sets it on every file input the moment before it opens', () => {
        const app = fs.readFileSync('public/assets/js/app.js', 'utf8');
        expect(app).toContain("input.type === 'file' && input.accept && window.RB) input.accept = RB.pickerAccept(input.accept);");
    });
});
