import { describe, it, expect } from 'vitest';
import { parseDeepLink } from '../native/src/deeplink.js';

/* Deep-link routing (#268): the pure map from an incoming Universal Link / App Link URL
   to the in-app action. `/go/<code>` is an event-join; any other rdbk.app link is a route
   to open; anything off-host is ignored. */
describe('parseDeepLink', () => {
    it('reads the event code from a /go/<code> link', () => {
        expect(parseDeepLink('https://rdbk.app/go/AFCD8402')).toEqual({ join: 'AFCD8402' });
    });

    it('tolerates a trailing slash on /go/', () => {
        expect(parseDeepLink('https://rdbk.app/go/AFCD8402/')).toEqual({ join: 'AFCD8402' });
    });

    it('routes an event link to its bundled page, keeping query + hash', () => {
        expect(parseDeepLink('https://rdbk.app/event/my-rally?x=1#top'))
            .toEqual({ navigate: '/event/my-rally?x=1#top' });
    });

    it('routes a public roadbook link', () => {
        expect(parseDeepLink('https://rdbk.app/challenge/dakar-2026')).toEqual({ navigate: '/challenge/dakar-2026' });
    });

    it('treats /go/ with no code as a plain route, not a join', () => {
        expect(parseDeepLink('https://rdbk.app/go/')).toEqual({ navigate: '/go/' });
    });

    it('ignores links from another host', () => {
        expect(parseDeepLink('https://evil.example/go/AFCD8402')).toBeNull();
    });

    it('ignores a www. host that has no association file', () => {
        expect(parseDeepLink('https://www.rdbk.app/go/AFCD8402')).toBeNull();
    });

    it('returns null for a non-URL string', () => {
        expect(parseDeepLink('not a url')).toBeNull();
    });
});
