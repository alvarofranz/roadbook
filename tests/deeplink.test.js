import { describe, it, expect } from 'vitest';
import { parseDeepLink, launchAction } from '../native/src/deeplink.js';

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

describe('the launch link is followed once (#812)', () => {
    const url = 'https://rdbk.app/challenge/giro-del-lago';
    it('opens it the first time', () => {
        expect(launchAction(url, null, '/')).toEqual({ navigate: '/challenge/giro-del-lago' });
    });
    it('never again in the same session — that was the endless reload', () => {
        expect(launchAction(url, url, '/challenge/giro-del-lago')).toBe(null);
        expect(launchAction(url, url, '/')).toBe(null);
    });
    it('never onto the page already on screen', () => {
        expect(launchAction(url, null, '/challenge/giro-del-lago')).toBe(null);
    });
    it('still joins an event from a launch link', () => {
        expect(launchAction('https://rdbk.app/go/ABC123', null, '/')).toEqual({ join: 'ABC123' });
    });
    it('ignores no launch URL and foreign links', () => {
        expect(launchAction(null, null, '/')).toBe(null);
        expect(launchAction('https://example.com/x', null, '/')).toBe(null);
    });
});
