import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

/* The Profile page (#925) is three tabs — Profile · Preferences · Security — instead of one long
   column of unrelated cards. Pinned: each card sits in the tab it belongs to, the tab in the address
   opens (the first-sign-in prompt links to #defaultLocation, inside Preferences), the old "My
   roadbooks" button is gone (the nav has it), the language row only stands in where the footer is
   hidden, and the guided tours can be started over. */
const html = fs.readFileSync('public/account/index.html', 'utf8');
const js = fs.readFileSync('public/account/account.js', 'utf8');
const app = fs.readFileSync('public/assets/js/app.js', 'utf8');
const pane = (name) => {
    const start = html.indexOf(`id="pane-${name}"`);
    const next = html.indexOf('class="acc-pane"', start + 1);
    return html.slice(start, next < 0 ? html.indexOf('</section>', start) : next);
};

describe('Profile page tabs (#925)', () => {
    it('has one tab button per pane, in order', () => {
        const tabs = [...html.matchAll(/role="tab" data-tab="(\w+)"/g)].map((m) => m[1]);
        expect(tabs).toEqual(['profile', 'preferences', 'security']);
        for (const t of tabs) expect(html).toContain(`id="pane-${t}"`);
        expect(js).toContain("const TABS = ['profile', 'preferences', 'security'];");
    });

    it('puts each card in its tab', () => {
        for (const id of ['pfSave', 'grantsList', 'pfRunsVis']) expect(pane('profile')).toContain(`id="${id}"`);
        for (const id of ['remoteCard', 'defaultLocation', 'tourReplay']) expect(pane('preferences')).toContain(`id="${id}"`);
        for (const id of ['emailForm', 'pwForm', 'delForm']) expect(pane('security')).toContain(`id="${id}"`);
    });

    it('opens the tab named in the address, #defaultLocation inside Preferences', () => {
        expect(js).toContain("openTab(hash === 'defaultLocation' ? 'preferences' : hash);");
        expect(app).toContain('account/#defaultLocation');
    });

    it('drops the My roadbooks button and shows the language row only without the footer', () => {
        expect(html).not.toContain('href="../myroadbooks/"');
        expect(html).toMatch(/@media \(min-width: 1025px\) \{ \.acc-links, \.acc-lang \{ display: none; \} \}/);
    });

    it('starts the guided tours over: opted in, nothing seen', () => {
        expect(app).toContain("RBTour.replay = () => saveTour({ optin: 'yes', seen: [] });");
        expect(js).toContain('RBTour.replay();');
    });
});
