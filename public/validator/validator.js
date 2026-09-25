'use strict';
/* The .rdbk validator (/validator/): a file is read on the device (RBZip.inspect) and judged by the
 * same functions every surface reads a roadbook with — RB.validateRoadbook for roadbook.json,
 * RB.validateMedia for the container's media — so what passes here opens everywhere. Nothing is
 * uploaded, nothing is stored. */
(function () {
    const $ = (id) => document.getElementById(id);
    const t = RBt, esc = RBesc;
    let last = null; // the last verdict, redrawn on a language switch

    const SHOWN = 100; // a file far from the standard reports thousands: the first hundred say it all
    // one finding: where it is, what is wrong ({values} filled in after translation)
    const finding = (f) => `<li><code>${esc(f.path || 'roadbook.json')}</code><span>${esc(t(f.message).replace('{values}', f.values || ''))}</span></li>`;

    function show(name, verdict) {
        last = { name, verdict };
        const { valid, errors, warnings, facts } = verdict;
        $('result').hidden = false;
        $('verdict').className = 'verdict ' + (valid ? 'valid' : 'invalid');
        const fact = ([label, value]) => `<div><dt>${esc(t(label))}</dt><dd>${esc(value)}</dd></div>`;
        $('verdict').innerHTML = `<i class="fa-solid ${valid ? 'fa-circle-check' : 'fa-circle-xmark'}"></i><div>
            <h2>${esc(t(valid ? 'A valid .rdbk 1 roadbook' : 'Not a valid .rdbk roadbook'))}</h2>
            <p class="muted">${esc(name)}</p>
            ${facts.length ? `<dl class="facts">${facts.map(fact).join('')}</dl>` : ''}</div>`;
        const list = (items) => items.slice(0, SHOWN).map(finding).join('')
            + (items.length > SHOWN ? `<li class="more">${esc(t('And {n} more.').replace('{n}', items.length - SHOWN))}</li>` : '');
        $('errorsBox').hidden = !errors.length;
        $('errorsCount').textContent = errors.length;
        $('errorsList').innerHTML = list(errors);
        $('warningsBox').hidden = !warnings.length;
        $('warningsCount').textContent = warnings.length;
        $('warningsList').innerHTML = list(warnings);
        $('result').scrollIntoView({ block: 'start', behavior: 'smooth' });
    }

    async function check(file) {
        let f;
        try { f = await RBZip.inspect(file); } catch (e) { return show(file.name, { valid: false, errors: [{ path: file.name, message: 'The file could not be read: it is neither a .rdbk container nor JSON.' }], warnings: [], facts: [] }); }
        if (!f.doc) return show(file.name, { valid: false, errors: [{ path: 'roadbook.json', message: f.docError }], warnings: [], facts: [] });
        const doc = RB.validateRoadbook(f.doc);
        const media = f.container === 'zip' ? RB.validateMedia(f.manifest, f.names) : { errors: [], warnings: [] };
        const errors = doc.errors.concat(f.manifestError ? [{ path: 'media.json', message: f.manifestError }] : [], media.errors);
        const facts = [['Container', f.container === 'zip' ? 'ZIP' : 'roadbook.json']];
        if (errors.length === 0) {
            const rb = RB.readRoadbook(f.doc);
            facts.push(['Title', rb.meta.title], ['Notes', String(rb.notes.length)], ['Distance', RBKm(rb.meta.total_distance)],
                ['Track points', String(rb.track.length)], ['Symbols', String(Object.keys(rb.symbols).length)]);
            const photos = f.names.filter((n) => /^photos\/.+/.test(n)).length, audio = f.names.filter((n) => /^audio\/.+/.test(n)).length;
            if (photos) facts.push(['Photos', String(photos)]);
            if (audio) facts.push(['Voice notes', String(audio)]);
        }
        show(file.name, { valid: !errors.length, errors, warnings: doc.warnings.concat(media.warnings), facts });
    }

    const zone = $('dropZone');
    $('rdbkFile').onchange = (e) => { const file = e.target.files[0]; e.target.value = ''; if (file) check(file); };
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('over'));
    zone.addEventListener('drop', (e) => { e.preventDefault(); zone.classList.remove('over'); const file = e.dataTransfer.files[0]; if (file) check(file); });
    window.addEventListener('rb-lang', () => { if (last) show(last.name, last.verdict); });
})();
