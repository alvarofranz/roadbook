import { describe, it, expect } from 'vitest';
import fs from 'fs';

/* The admin's user form shows where the user's maps start (#939): the default map location they
   set in their profile — for admins only, never on a public page, and shown, not edited. */
const read = (p) => fs.readFileSync(p, 'utf8');

describe('the admin user form shows the user’s location (#939)', () => {
    it('comes with the admin user list only', () => {
        const admin = read('app/admin.php');
        expect(admin).toContain("'location'   => $r['default_lat'] !== null && $r['default_lon'] !== null ? ['lat' => (float)$r['default_lat'], 'lon' => (float)$r['default_lon']] : null,");
        expect(read('app/runs.php')).not.toContain('default_lat'); // never on the public profile
    });
    it('is drawn as a pin on a small map, or says it is not set', () => {
        const js = read('public/admin/admin.js');
        expect(js).toContain(`\${u.location ? '<div id="euLocMap" class="loc-picker-map"></div>' : \`<p class="muted small">\${esc(t('Not set'))}</p>\`}`);
        expect(js).toContain("new maplibregl.Marker({ color: RBCssVar('--sand') }).setLngLat([u.location.lon, u.location.lat]).addTo(map.map);");
        expect(read('public/assets/css/app.css')).toContain('.loc-picker-map {'); // one rule, shared with the account settings
        expect(read('public/account/index.html')).not.toContain('.loc-picker-map {');
    });
});
