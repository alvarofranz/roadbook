import { describe, it, expect } from 'vitest';
import fs from 'fs';

/* The vehicle icons (#713): one table in app.js drives every place a vehicle is drawn. */
const read = (p) => fs.readFileSync(p, 'utf8');
const app = read('public/assets/js/app.js');

describe('vehicle icons', () => {
    it('are the monster truck, the motorbike and the cyclist', () => {
        expect(app).toContain("const VEHICLE_ICON = { car: ['fa-truck-monster', '4x4'], moto: ['fa-motorcycle', 'Motorbike'], bike: ['fa-person-biking', 'Bicycle'] };");
    });
    it('are written once: the gallery filter and the Editor settings render them from the table', () => {
        for (const p of ['public/roadbooks/index.html', 'public/editor/index.html']) expect(read(p), p).not.toContain('data-vehicle=');
        expect(read('public/roadbooks/roadbooks.js')).toContain("$('rbVehicles').querySelector('.segmented').innerHTML = RBVehicleSegmentsHTML();");
        expect(read('public/editor/editor.js')).toContain("document.querySelector('#vehField .segmented').innerHTML = RBVehicleSegmentsHTML();");
    });
});
