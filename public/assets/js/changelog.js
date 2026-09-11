/* RDBK.app release notes — the single source for "What's new", rendered on the About page
   (`/about/#changelog`) and linked from the App Info pop-up.

   ONE ENTRY PER RELEASE, newest first. `version` matches the semver in version.json and `date`
   is the day it shipped (YYYY-MM-DD). The strings are English SOURCE strings, translated the
   same way as the rest of the UI: `RBt()` looks them up in i18n.<lang>.js and falls back to
   English, so a new entry is readable everywhere from the moment it is written and gets its
   translations in the same release.

   Releasing: add the entry for the new semver HERE before stamping it — `tests/about-page.test.js`
   fails a release whose version.json is ahead of this list. */
window.RBChangelog = [
    {
        version: '1.8.1', date: '2026-09-11',
        title: 'A tidy-up pass across the whole app',
        items: [
            'The .rdbk specification reads in Spanish and Italian too, like the rest of the site.',
            'No page drifts sideways on a phone any more: long words wrap and wide tables scroll on their own.',
            'Every tool wears the same icon everywhere, and an event roadbook marked Ready finally looks it.',
        ],
    },
    {
        version: '1.8.0', date: '2026-09-11',
        title: 'A clearer About page, app info and these release notes',
        items: [
            'About opens with what RDBK.app runs on, the version you are using and the latest one available.',
            'Every recent release is listed here with what changed in it, newest first.',
        ],
    },
    {
        version: '1.7.10', date: '2026-09-11',
        title: 'Roadbook cards on a phone, the first note and GPS warnings',
        items: [
            'Your saved roadbooks stack cleanly on a phone instead of running over their own buttons.',
            'The first note draws no incoming road: nothing comes before the start of a roadbook.',
            'The app warns you when a phone setting would quietly ruin a recording.',
            'The map editor names each of its modes and answers to keyboard shortcuts.',
        ],
    },
    {
        version: '1.7.9', date: '2026-09-10',
        title: 'Saving that reports itself',
        items: [
            'The button you pressed shows the work through — a spinner while it runs, then a green tick.',
            'Comment rows use the full width of the description column in the Reader.',
        ],
    },
    {
        version: '1.7.8', date: '2026-09-09',
        title: 'The Editor keeps your own icons',
        items: [
            'Custom icons survive saving and stay available to every note of the roadbook.',
            'Pasting an image adds it to the gallery instead of overwriting the last one.',
        ],
    },
    {
        version: '1.7.7', date: '2026-09-09',
        title: 'Truer tulip arrows',
        items: [
            'A repeated track point no longer twists the direction arrow of a note.',
        ],
    },
    {
        version: '1.7.6', date: '2026-09-09',
        title: 'The finish line',
        items: [
            'The last note draws no exit arrow — past the finish there is nothing left to follow.',
            'Event organizers get the rights they need over the roadbooks of their event.',
        ],
    },
    {
        version: '1.7.5', date: '2026-09-09',
        title: 'Dialogs that ask a real question',
        items: [
            'Every confirmation answers a question: No or Yes, with the message naming what is at stake.',
            'A prompt you decline stops coming back, and the Add note tool is back in the map toolbar.',
        ],
    },
    {
        version: '1.7.4', date: '2026-09-08',
        title: 'One word for one thing',
        items: [
            'Public roadbooks are called roadbooks everywhere, in every language — one name for one thing.',
            'Copying a link always reports what happened instead of failing in silence.',
        ],
    },
    {
        version: '1.7.3', date: '2026-09-08',
        title: 'The Reader owns the screen',
        items: [
            'Navigation runs in a real app shell: the bars stay put and only the note list scrolls.',
            'GPS is released with the page, and being far from a note is no longer a dead end.',
        ],
    },
    {
        version: '1.7.2', date: '2026-09-08',
        title: 'Events, sharing and shared bars',
        items: [
            'Events can take their own registrations, with the organizer activating each participant.',
            'A PDF export says who exported that copy and when.',
            'A shared bar never covers a tool’s controls again.',
        ],
    },
    {
        version: '1.7.1', date: '2026-09-01',
        title: 'GPS you can trust',
        items: [
            'The odometer only counts ground actually covered — a junk fix adds no phantom kilometres.',
            'A waypoint is validated on the segment you drove, so none slips past at speed.',
            'The tools warn how unreliable a browser’s GPS is on a phone, and point to the app.',
        ],
    },
    {
        version: '1.7.0', date: '2026-07-29',
        title: 'Sign in with Apple and hands-free navigation',
        items: [
            'Sign in with Apple, next to Google and email.',
            'A Bluetooth remote or pedal advances the notes without touching the screen.',
            'An install guide for every device, and a consistency check before saving a roadbook.',
        ],
    },
];
