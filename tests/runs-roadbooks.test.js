import { describe, it, expect } from 'vitest';
import fs from 'fs';

/* Completions on the cards and the roadbook page, the profile's completed roadbooks, the run's device (#867–#870). */
const read = (p) => fs.readFileSync(p, 'utf8');
const app = read('public/assets/js/app.js'), runs = read('app/runs.php');

// RBDeviceLabel lifted out of app.js and run against real user agents
const src = app.match(/window\.RBDeviceLabel = \(\) => \{[\s\S]*?\n {4}\};/)[0];
const label = (ua, { app: inApp = false, pwa = false } = {}) => new Function('navigator', 'isNativeApp', 'isStandalone', 'window', src + '; return window.RBDeviceLabel();')({ userAgent: ua }, () => inApp, () => pwa, {});

describe('the run’s device (#870)', () => {
    it('is a coarse model / OS, never an identifier', () => {
        expect(label('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148', { app: true })).toBe('App · iPhone · iOS 17.5');
        expect(label('Mozilla/5.0 (Linux; Android 15; Pixel 8 Build/AP3A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0 Mobile Safari/537.36', { app: true })).toBe('App · Pixel 8 · Android 15');
        expect(label('Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36')).toBe('Web · Chrome · Android 10');
        expect(label('Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.4 Mobile/15E148 Safari/604.1', { pwa: true })).toBe('PWA · Safari · iPhone · iOS 16.4');
    });
    it('is saved with the run and shown to admins only', () => {
        expect(read('public/reader/reader.js')).toContain('device: RBDeviceLabel(),');
        expect(runs).toContain("mb_substr(trim((string)($d['device'] ?? '')), 0, 80) ?: null");
        expect(read('public/api/index.php')).toContain("case 'admin_user_runs':  admin_user_runs(require_admin(), $d); break;");
        expect(runs.match(/function profile_get[\s\S]*?\n\}/)[0]).not.toContain('device');
    });
});

describe('completions (#868 · #869)', () => {
    it('every card listing counts the completed runs, and the card shows the pill', () => {
        expect(runs).toContain("const RB_COMPLETIONS_SQL = '(SELECT COUNT(*) FROM roadbook_runs ru WHERE ru.roadbook_id = r.id AND ru.completed = 1) AS completions';");
        for (const f of ['app/roadbooks.php', 'app/events.php', 'app/runs.php']) expect(read(f)).toContain('RB_COMPLETIONS_SQL');
        expect(app).toContain("r.completions ? [['fa-flag-checkered', r.completions + '×', RBt('Times completed')]] : []");
    });
    it('the roadbook page lists the public completions and only counts the private ones', () => {
        expect(runs).toContain('WHERE ru.roadbook_id = ? AND ru.completed = 1 AND ru.is_public = 1');
        expect(read('public/challenge/challenge.js')).toContain("await RBApi('roadbook_completions', { slug });");
    });
});

describe('the profile’s completed roadbooks (#867)', () => {
    it('show the roadbook’s card, never the share image', () => {
        const page = read('public/assets/js/profile-page.js');
        expect(page).toContain("RBRoadbookCard(card, { href: '/challenge/' + encodeURIComponent(card.slug) })");
        expect(page).not.toContain('pf-run-card');
    });
});
