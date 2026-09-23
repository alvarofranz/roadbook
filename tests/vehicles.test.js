import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import RB from '../public/assets/js/roadbook-core.js';

// Which vehicles a roadbook suits (#713): car · moto · bike, any combination, default car.
describe('roadbook vehicles', () => {
    const list = [
        { id: 1, vehicles: ['car'] },
        { id: 2, vehicles: ['moto', 'bike'] },
        { id: 3, vehicles: ['car', 'moto', 'bike'] },
    ];
    const ids = (l) => l.map((r) => r.id);

    it('the gallery keeps the roadbooks that suit ANY picked vehicle; nothing picked keeps all', () => {
        expect(ids(RB.filterByVehicles(list, []))).toEqual([1, 2, 3]);
        expect(ids(RB.filterByVehicles(list, ['bike']))).toEqual([2, 3]);
        expect(ids(RB.filterByVehicles(list, ['car', 'moto']))).toEqual([1, 2, 3]);
        expect(ids(RB.filterByVehicles(list, ['car']))).toEqual([1, 3]);
    });

    it('the server stores only known values, never none, and keeps the owner’s choice when a client omits it', () => {
        const php = fs.readFileSync('app/roadbooks.php', 'utf8');
        expect(php).toContain("const RB_VEHICLES = ['car', 'moto', 'bike'];");
        expect(php).toContain("return $picked ? implode(',', $picked) : 'car';");
        expect(php).toContain("$vehicles = array_key_exists('vehicles', $d) ? rb_clean_vehicles($d['vehicles']) : null;");
        expect(php).toContain("$vehicles = $vehicles ?? rb_clean_vehicles($row['vehicles']);");
        expect(php).toContain("'vehicles' => rb_vehicle_list($r['vehicles'])"); // public_list feeds the filter
        expect(fs.readFileSync('migrations/038_roadbook_vehicles.sql', 'utf8')).toContain("vehicles SET('car','moto','bike') NOT NULL DEFAULT 'car'");
    });

    it('the owner picks them in the Editor, never ending with none; the gallery filters on them', () => {
        const editor = fs.readFileSync('public/editor/editor.js', 'utf8');
        expect(editor).toContain("if (vehicles.includes(v) && vehicles.length === 1) return toast('A roadbook suits at least one vehicle.');");
        expect(editor).toContain('vehicles, roadbook: RB.roadbookForExport(rb)');
        expect(fs.readFileSync('public/assets/js/challenges.js', 'utf8')).toContain('RB.filterByVehicles(');
        // the gallery's toggles come from the one vehicle table, which covers the whole catalog
        const table = fs.readFileSync('public/assets/js/app.js', 'utf8').match(/const VEHICLE_ICON = \{([^}]*)\}/)[1];
        for (const v of ['car', 'moto', 'bike']) expect(table).toContain(`${v}: [`);
        expect(fs.readFileSync('public/roadbooks/roadbooks.js', 'utf8')).toContain('RBVehicleSegmentsHTML()');
    });
});
