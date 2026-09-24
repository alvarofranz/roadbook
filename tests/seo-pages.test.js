import { describe, it, expect } from 'vitest';
import fs from 'fs';

/* What search engines read: the structured data of the standard, the home and "Who we are", and a
   link rule that never repaints a button (sand text on a sand button read as nothing). */
const read = (p) => fs.readFileSync(p, 'utf8');
const ldOf = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
const nodes = (html) => ldOf(html).flatMap((d) => d['@graph'] || [d]);

describe('structured data', () => {
    it('the standard answers its FAQ in JSON-LD, one Question per visible question', () => {
        const html = read('public/standard/index.html');
        const faq = nodes(html).find((n) => n['@type'] === 'FAQPage');
        const visible = html.match(/<summary data-i18n="faq\.q\d+">/g);
        expect(faq.mainEntity.length).toBe(visible.length);
        for (const q of faq.mainEntity) expect(html).toContain(`>${q.name}</summary>`);
    });
    it('“Who we are” names both founders with their LinkedIn profiles', () => {
        const people = nodes(read('public/about/index.html')).filter((n) => n['@type'] === 'Person');
        const links = people.flatMap((p) => p.sameAs);
        expect(links).toContain('https://www.linkedin.com/in/alvaro-franz/');
        expect(links).toContain('https://www.linkedin.com/in/maurizioandreotti/');
    });
    it('the home publishes the app and its organization', () => {
        const types = nodes(read('public/index.html')).map((n) => n['@type']);
        expect(types).toEqual(expect.arrayContaining(['WebApplication', 'Organization']));
    });
});

describe('a text page’s links leave buttons alone', () => {
    it('.doc colours links, never a .btn', () => {
        const css = read('public/assets/css/app.css');
        expect(css).toContain('.doc a:not(.btn) { color: var(--sand-2); }');
        expect(css).not.toMatch(/^\.doc a \{/m);
    });
});
