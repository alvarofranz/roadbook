import { describe, it, expect } from 'vitest';
import fs from 'fs';
import RB from '../public/assets/js/roadbook-core.js';
import { parseDeepLink, launchAction, openedFileKind, openedFileName, OPENED_FILE_PAGE } from '../native/src/deeplink.js';

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

/* Opening a .gpx or a .rdbk from the OS, on Android and iOS (#996). */
const bytes = (s) => new TextEncoder().encode(s);
describe('a file the OS opens with the app', () => {
    it('arrives as a file:// (iOS) or content:// (Android) URL and is read, once', () => {
        expect(parseDeepLink('file:///var/mobile/Containers/Data/Application/X/Documents/Inbox/giro.gpx')).toEqual({ file: 'file:///var/mobile/Containers/Data/Application/X/Documents/Inbox/giro.gpx' });
        expect(parseDeepLink('content://com.android.providers.downloads.documents/document/1234')).toEqual({ file: 'content://com.android.providers.downloads.documents/document/1234' });
        const url = 'content://media/external/file/9';
        expect(launchAction(url, null, '/')).toEqual({ file: url });
        expect(launchAction(url, url, '/reader/?open=file')).toBe(null); // followed once per session
        expect(parseDeepLink('https://rdbk.app/event/x/')).toEqual({ navigate: '/event/x/' }); // links unchanged
    });
    it('is known by its first bytes, never its name: a roadbook → the Reader, a GPX → the Editor', () => {
        expect(openedFileKind(new Uint8Array([0x50, 0x4b, 3, 4]))).toBe('rdbk');
        expect(openedFileKind(bytes('﻿  {"rdbk_version":1}'))).toBe('rdbk');
        expect(openedFileKind(bytes('<?xml version="1.0"?>\n<gpx version="1.1" creator="Wikiloc">'))).toBe('gpx');
        expect(openedFileKind(bytes('<?xml version="1.0"?><kml>'))).toBe(null);
        expect(openedFileKind(bytes('\xff\xd8\xff'))).toBe(null);
        expect(OPENED_FILE_PAGE).toEqual({ rdbk: '/reader/?open=file', gpx: '/editor/?open=file' });
    });
    it('keeps its own name, or takes one that says what it is', () => {
        expect(openedFileName('file:///x/Inbox/Giro%20del%20lago.gpx', 'gpx')).toBe('Giro del lago.gpx');
        expect(openedFileName('content://downloads/document/1234', 'gpx')).toBe('track.gpx');
        expect(openedFileName('content://downloads/document/1234', 'rdbk')).toBe('roadbook.rdbk');
    });
    it('the pages take it from the bridge, as an explicit target with no recovery prompt', () => {
        const editor = fs.readFileSync('public/editor/editor.js', 'utf8'), reader = fs.readFileSync('public/reader/reader.js', 'utf8');
        expect(editor).toContain("else await (opened.kind === 'gpx' ? importGpx([opened.file]) : importRdbk(opened.file));");
        expect(editor).toContain('const g = files.find((f) => f !== w); if (!g) return;'); // any picked file is read as the GPX
        expect(reader).toContain("if (q.get('open') === 'file') return 'file';");
        expect(reader).toContain('try { loadRb(await RBZip.readRdbk(opened.file)); }');
        expect(fs.readFileSync('native/src/native.js', 'utf8')).toContain('else if (action.file) openFile(action.file);');
    });
    it('both apps say they open .gpx and .rdbk', () => {
        const manifest = fs.readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');
        for (const t of ['application/gpx+xml', 'application/x-roadbook', 'application/octet-stream', '.*\\\\.gpx', '.*\\\\.rdbk']) expect(manifest).toContain(t);
        const plist = fs.readFileSync('ios/App/App/Info.plist', 'utf8');
        for (const t of ['<string>app.rdbk.roadbook</string>', '<string>com.topografix.gpx</string>', '<key>LSSupportsOpeningDocumentsInPlace</key>\n\t<false/>']) expect(plist).toContain(t);
    });
});
