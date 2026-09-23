/* RDBK.app release notes — the single source for "What's new", rendered on the changelog
   page (`/changelog/`) and linked from the App Info pop-up.

   ONE ENTRY PER RELEASE, newest first. `version` matches the semver in version.json and `date`
   is the day it shipped (YYYY-MM-DD). The strings are English SOURCE strings, translated the
   same way as the rest of the UI: `RBt()` looks them up in i18n.<lang>.js and falls back to
   English, so a new entry is readable everywhere from the moment it is written and gets its
   translations in the same release.

   Releasing: add the entry for the new semver HERE before stamping it — `tests/about-page.test.js`
   fails a release whose version.json is ahead of this list. */
window.RBChangelog = [
    {
        version: '1.9.7', date: '2026-09-23',
        title: 'Every metre counts',
        items: [
            'The distance to the next note is measured along the road, like the roadbook’s own partials, and the next note always sits at the top of the list.',
            'The validation bell plays over your music instead of stopping it, and completing a roadbook ends with a fanfare.',
            'The note map draws just the road still to drive, in one yellow line.',
            'Roadbooks show how many times they were completed and who did it, and the roadbook page has a Comments button and a cleaner header on the phone.',
            'Sharing a finished run asks before making it public, and says it with a smile.',
        ],
    },
    {
        version: '1.9.6', date: '2026-09-23',
        title: 'Talk about the route',
        items: [
            'Public roadbooks have comments: signed-in readers talk about the route on its page, never while navigating it.',
            'Recordings, photos and drafts survive a crash, a sign-in and a full phone; Discard really discards, and a recording you chose not to resume never asks again.',
            'Pausing a run no longer counts the road driven while paused, and a run resumed after a crash keeps its roadbook and its event.',
            'A roadbook locked by someone else is truly read-only, and a public roadbook can only be copied when its owner allows it.',
            'Safer accounts: a password reset signs out the app everywhere, and organizers no longer see the email of the people they add.',
        ],
    },
    {
        version: '1.9.5', date: '2026-09-23',
        title: 'Share the ride',
        items: [
            'Finishing a roadbook opens a new screen: your run card up front, Share right under it, and one switch to make the run private or public.',
            'Links and QR codes to a roadbook or an event open straight in the app again, on iPhone and Android.',
            'The PDF carries the QR to its digital copy on every page, with the same clean header throughout and the cover image as a soft backdrop to the route.',
            'The menu reads Roadbooks · Editor · Recorder · Navigate · Events · Profile everywhere, and the Editor can start a recording straight from its first screen.',
            'Date fields no longer overlap their labels, and user management shows the real distance of each roadbook.',
        ],
    },
    {
        version: '1.9.4', date: '2026-09-23',
        title: 'Built for the ride',
        items: [
            'The Recorder is one big Note button: a bell and a big check confirm each note, the map shows the distance since the last one, and Pause · End sit at the bottom.',
            'The Reader rings the same bell on every validated note, and a long note never hides the next one.',
            'Roadbook and event cards share one clear design, with vehicles, distance, notes and dates at a glance.',
            'In the app your session and any recording in progress survive the phone clearing its storage, and the status bar steps aside while you navigate.',
            'The Editor map is cleaner and darker, a failed sign-in always tells you why, and a car is now a 4x4.',
        ],
    },
    {
        version: '1.9.3', date: '2026-09-23',
        title: 'Polish from the road test',
        items: [
            'Map pins stay visible once the 3D terrain has loaded, and voice notes turn into text again.',
            'Events list what is coming first, soonest on top, and show which vehicles their roadbooks are for.',
            'Account emails are clear and readable in every mail app, in your language.',
            'In the note editor the extras sit in their own group, and Help moves to the foot of the profile menu.',
        ],
    },
    {
        version: '1.9.2', date: '2026-09-22',
        title: 'The roadbook carries its own briefing',
        items: [
            'A note can carry a photo, an advert or a block of big text — before or after it — shown wherever the roadbook is read: the Reader, the PDF and the public page.',
            'The note editor is one tab per job: the note’s settings, its icons, and each piece of material around it.',
            'The map inside a note keeps you in the middle and turns with your course, so left and right on it match the windscreen.',
        ],
    },
    {
        version: '1.9.1', date: '2026-09-21',
        title: 'The roadbook is the interface',
        items: [
            'A note is validated on the note itself: the button at the bottom, the green bar that repeated the distance and the battery readout are gone, and the current speed takes their place.',
            'With automatic validation on, the GPS decides: a note you drive past turns red and the waypoint you actually reach is validated, so a run is never stuck on a note it will never enter.',
            'The note editor brings an icon in from one slim row, and each note says which detection radius applies and where that number comes from.',
        ],
    },
    {
        version: '1.9.0', date: '2026-09-17',
        title: 'Everything since 1.8.2 reaches the apps, and they say what they carry',
        items: [
            'The iOS and Android apps ship five days of work at once: the profile menu on an iPad in landscape, the map of where your users are, the note wording, searchable pickers and the rest.',
            'App info now names the web content your app was built with, next to the latest one, and says plainly when the app is behind.',
        ],
    },
    {
        version: '1.8.2', date: '2026-09-12',
        title: 'Same patterns everywhere, and a tidier phone',
        items: [
            'Every heading now carries its actions the same way, and on a phone the title keeps its own line.',
            'Saved-roadbook cards, admin filters and the activity log all fit a phone screen instead of pushing the page sideways.',
            'A thumbnail whose image is missing shows the map placeholder instead of a stretch of alt text.',
            'The event map credits OpenStreetMap again, like every other map in the app.',
        ],
    },
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
