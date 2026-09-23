import { describe, it, expect } from 'vitest';
import fs from 'fs';

/* One card design for every gallery (#770). */
const read = (p) => fs.readFileSync(p, 'utf8');
const app = read('public/assets/js/app.js'), css = read('public/assets/css/app.css');

describe('the shared card anatomy', () => {
    it('puts badges, actions and stats on the media, title and meta below', () => {
        for (const cls of ['card-media', 'card-badges', 'card-actions', 'card-stats', 'gallery-body']) expect(app).toContain(cls);
        expect(css).toContain('.card-media::after');
        expect(css).toMatch(/\.card-stats > span, \.card-chip, \.card-media \.vehicle-icons \{/);
    });
    it('clamps a long title to two lines instead of widening the card', () => {
        expect(css).toMatch(/\.gallery-card h3 \{[^}]*-webkit-line-clamp: 2;[^}]*overflow-wrap: break-word;/);
    });
});

describe('every roadbook card comes from RBRoadbookCard', () => {
    it('shows vehicles, distance, notes and the author, and the route when there is no photo', () => {
        expect(app).toContain("stats: [['fa-route', RBKm(r.total_distance, 1), RBt('Distance')], ['fa-location-dot', String(r.note_count), RBt('Notes')]]");
        expect(app).toContain('data-route="${RBesc(r.slug || \'\')}"');
    });
    it('is used on the home, the gallery, the event page and the public profile, each filling the route shapes', () => {
        for (const p of ['public/assets/js/home.js', 'public/assets/js/challenges.js', 'public/event/event.js', 'public/assets/js/profile-page.js']) {
            const js = read(p);
            expect(js, p).toContain('RBRoadbookCard(');
            expect(js, p).toContain('RBFillRoutes(');
            expect(js, p).not.toContain('RBGalleryCard(');
        }
    });
    it('draws the route shape in one shared place', () => {
        expect(app).toContain('window.RBFillRoutes = (container) =>');
        expect(read('public/assets/js/home.js')).not.toContain('function routeSvg');
    });
});

describe('every event card comes from RBEventCard', () => {
    it('carries a date tile, a state chip, the roadbook count and the vehicles', () => {
        expect(app).toContain('<span class="card-date"><b>');
        expect(app).toContain("e.ended ? ['ended', 'Ended'] : (e.starts_on && e.starts_on <= today ? ['live', 'Live'] : ['upcoming', 'Upcoming'])");
        expect(read('public/events/events.js')).toContain('RBEventCard(e)');
    });
    it('gets the vehicles of the event page roadbooks from the API', () => {
        expect(read('app/events.php')).toContain("'vehicles' => rb_vehicle_list($r['vehicles']), // the card's vehicle icons (#770)");
    });
});

describe('an event card image covers its box, like a roadbook photo', () => {
    it('has no contain mode', () => {
        expect(app).not.toMatch(/contain: true|card-media\$\{contain/);
        expect(css).not.toContain('.card-media.contain');
    });
});

describe('a card hover is subtle (#790)', () => {
    it('never moves or zooms the card or its image', () => {
        expect(css).not.toMatch(/\.gallery-card:hover[^{]*\{[^}]*transform/);
        expect(css).not.toMatch(/\.gallery-card:hover \.thumb/);
    });
    it('lightens the darker overlay a little, only on a pointer that hovers', () => {
        expect(css).toContain('@media (hover: hover) { .gallery-card:hover .card-media::after { opacity: .7; } }');
        expect(css).toContain('rgba(8, 10, 14, .9) 0%');
    });
});
