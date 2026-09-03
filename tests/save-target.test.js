import { describe, it, expect } from 'vitest';
import { androidSaveFolder } from '../native/src/save-target.js';

/* Where a saved file goes on Android (#392). Every save from the app failed with
   ERR_PARAM_DATA_INVALID because the folder was chosen independently of the content type:
   asking for `documents` with a non-media file paired MediaStore's Downloads collection
   with RELATIVE_PATH=Documents, a combination Android rejects outright.

   The plugin picks the *collection* from the content type and the *folder* from
   saveDirectory, so these two must be decided by the same input. The mapping below is the
   invariant that keeps them agreeing — one case per collection the plugin can select. */

const COLLECTION_OF_FOLDER = { pictures: 'images', movies: 'video', music: 'audio', downloads: 'downloads' };
// The collection @capgo/capacitor-file-sharer derives from a content type, independently.
const collectionOfType = (type) =>
    type.startsWith('image/') ? 'images' :
    type.startsWith('video/') ? 'video' :
    type.startsWith('audio/') ? 'audio' : 'downloads';

describe('androidSaveFolder', () => {
    it('files media in its own folder', () => {
        expect(androidSaveFolder('image/png')).toBe('pictures');
        expect(androidSaveFolder('video/mp4')).toBe('movies');
        expect(androidSaveFolder('audio/webm')).toBe('music');
    });

    it('files everything the app actually generates in Downloads', () => {
        // where the Files / Downloads apps look, and the only folder MediaStore's Downloads
        // collection accepts
        for (const type of [
            'application/gpx+xml',      // a recorded track
            'application/x-roadbook',   // a .rdbk export
            'application/zip',          // the account export
            'text/csv',                 // a ranking export
            'text/plain;charset=utf-8', // the i18n delta
            'application/octet-stream', // a blob with no type of its own
        ]) expect(androidSaveFolder(type), type).toBe('downloads');
    });

    it('never returns a folder that contradicts the collection the type selects', () => {
        for (const type of ['image/png', 'image/gif', 'video/mp4', 'audio/mpeg', 'text/csv',
            'application/gpx+xml', 'application/pdf', 'application/octet-stream']) {
            expect(COLLECTION_OF_FOLDER[androidSaveFolder(type)], type).toBe(collectionOfType(type));
        }
    });

    it('is not fooled by casing or a missing type', () => {
        expect(androidSaveFolder('IMAGE/PNG')).toBe('pictures');
        expect(androidSaveFolder('')).toBe('downloads');
        expect(androidSaveFolder(null)).toBe('downloads');
        expect(androidSaveFolder(undefined)).toBe('downloads');
    });
});
