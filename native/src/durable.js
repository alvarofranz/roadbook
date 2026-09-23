/* Durable storage for the app (#778). The WebView's localStorage is the app's synchronous working
 * store, but the OS may wipe it (iOS clears website data under storage pressure): the session
 * token and the work in progress would go with it — a signed-out user, a lost recording. So the
 * keys that matter are mirrored into native Preferences (UserDefaults · SharedPreferences), which
 * the OS never purges, and brought back when the WebView storage turns out to have been wiped.
 *
 * Wiped or not is told by a sentinel written into localStorage: missing at startup means the
 * storage is fresh (a first launch, or a purge) and Preferences restores the keys; present means
 * localStorage is the truth and Preferences is realigned to it — so a checkpoint the user
 * discarded before the bridge loaded is dropped from the mirror, never resurrected. */

// The keys worth surviving a purge: the session, who is signed in, participant mode, the run
// reports waiting to upload, every crash checkpoint of a session in progress, and the rider's own
// device settings (the tour answers, the remote's buttons).
export const DURABLE_KEYS = [
    'rb_token', 'rb_cfg_user', 'rb_participant', 'rb_pending_runs',
    'rb_session', 'rb_session_roadbook', 'rb_recorder_session', 'rb_recorder_pending_save',
    'rb_tripmaster_session', 'rb_trip_gpx', 'rb_editor_draft',
    'rb_tour', 'rb_remote_map', // the rider's own settings on this device: the tour answers (#914), the remote's buttons (#909)
];
export const SENTINEL = 'rb_durable';
export const isDurable = (key) => DURABLE_KEYS.includes(key);

// `storage` is a Web Storage (localStorage); `prefs` the Preferences plugin ({get, set, remove},
// promise-based). Writes are debounced per key — a checkpoint rewritten on every GPS fix must not
// cross the native bridge every second — and flushed at once when the app goes to the background;
// a removal is sent at once (a sign-out must not linger in the mirror).
export function createMirror({ storage, prefs, debounceMs = 3000, timers = { set: setTimeout, clear: clearTimeout } }) {
    const pending = new Map(); // key → timer
    const write = (key) => {
        pending.delete(key);
        const value = storage.getItem(key);
        return value == null ? prefs.remove({ key }) : prefs.set({ key, value });
    };
    return {
        onSet(key) {
            if (!isDurable(key)) return;
            if (pending.has(key)) timers.clear(pending.get(key));
            pending.set(key, timers.set(() => { write(key); }, debounceMs));
        },
        onRemove(key) {
            if (!isDurable(key)) return;
            if (pending.has(key)) { timers.clear(pending.get(key)); pending.delete(key); }
            return prefs.remove({ key });
        },
        flush() {
            const keys = [...pending.keys()];
            keys.forEach((key) => timers.clear(pending.get(key)));
            return Promise.all(keys.map(write));
        },
        // At startup. Resolves how many keys came back from Preferences (0 when nothing was lost).
        async reconcile() {
            let restored = 0;
            if (storage.getItem(SENTINEL) == null) {
                for (const key of DURABLE_KEYS) {
                    const { value } = await prefs.get({ key });
                    if (value != null && storage.getItem(key) == null) { storage.setItem(key, value); restored++; }
                }
                storage.setItem(SENTINEL, '1');
            } else {
                await Promise.all(DURABLE_KEYS.map(write)); // localStorage is the truth: the mirror follows it
            }
            return restored;
        },
    };
}
