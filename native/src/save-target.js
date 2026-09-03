'use strict';
/* Where a generated file goes on Android (#392).
 *
 * Saving on Android writes through MediaStore, and MediaStore validates the pair it is
 * given: the *collection* a file is inserted into must accept the *relative path* asked
 * for. @capgo/capacitor-file-sharer decides those two from different inputs — the
 * collection from the content type (Images/Video/Audio for media, Downloads for anything
 * else) and the folder from `android.saveDirectory` — so a folder chosen independently of
 * the type can contradict the collection. Asking for `documents` with a non-media file
 * paired the Downloads collection with `RELATIVE_PATH=Documents`, which Android refuses:
 *
 *   IllegalArgumentException: Primary directory Documents not allowed for
 *   content://media/external_primary/downloads/…; allowed directories are [Download]
 *
 * The plugin reports that as ERR_PARAM_DATA_INVALID — a misleading code, since the data
 * was fine — and every save from the app failed: the result QR, the GPX, the .rdbk, the
 * ranking CSV, the account export.
 *
 * So the content type decides BOTH halves. Each folder below is the one the plugin pairs
 * with the collection that same type selects, which is the whole invariant this module
 * exists to hold (and what its unit test pins). Everything that is not media lands in
 * Downloads — where the Files and Downloads apps look anyway.
 *
 * Pure and Capacitor-free, so it is bundled into native.bundle.js AND imported straight
 * into the unit tests.
 */
export function androidSaveFolder(contentType) {
    const type = String(contentType || '').toLowerCase();
    if (type.startsWith('image/')) return 'pictures';
    if (type.startsWith('video/')) return 'movies';
    if (type.startsWith('audio/')) return 'music';
    return 'downloads';
}
