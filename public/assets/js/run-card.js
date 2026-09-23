'use strict';
/* RBRunCard — the shareable image of a finished run (#785), made on the device at the end of the
 * run: a 1080×1350 PNG (4:5, what the social feeds show whole). The whole route over the map with
 * every note on it — reached green, skipped pink — darkened towards the foot, where the roadbook's
 * title, who ran it and when, and the run's figures sit. A roadbook that hides its map
 * (map_access:false) keeps its route to itself: the card then carries the figures alone.
 *
 * render({ report, roadbook, username }) → Promise<Blob|null>. RBRun supplies the figures'
 * formatting, RBCoverMap the map. */
(function () {
    const W = 1080, H = 1350, SIDE = 64;
    const REACHED = '#3ad29f', SKIPPED = '#ff7aa8';

    // A filled pill; canvas roundRect is iOS 16+, so an older WebView gets a plain rectangle.
    function pill(ctx, x, y, w, h, r) {
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
        ctx.fill();
    }

    // Break `text` into at most `max` lines that fit `width` at the current font.
    function wrap(ctx, text, width, max) {
        const words = String(text).split(/\s+/), lines = [];
        let line = '';
        for (const w of words) {
            const next = line ? line + ' ' + w : w;
            if (ctx.measureText(next).width <= width || !line) line = next;
            else { lines.push(line); line = w; }
        }
        if (line) lines.push(line);
        if (lines.length > max) { lines.length = max; lines[max - 1] = lines[max - 1].replace(/\s*\S*$/, '') + '…'; }
        return lines;
    }

    async function render({ report, roadbook, username }) {
        const t = RBt, font = getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif';
        const meta = (roadbook && roadbook.meta) || {}, notes = (roadbook && roadbook.notes) || [], track = (roadbook && roadbook.track) || [];
        const skipped = new Set(report.skipped || []);
        const showMap = meta.map_access !== false && track.length >= 2;
        const mapOpts = {
            width: W, height: H, pad: { top: 120, right: SIDE, bottom: 560, left: SIDE },
            markers: notes.map((n) => ({ lat: n.lat, lon: n.lon, color: skipped.has(n.num) ? SKIPPED : REACHED })),
        };
        let canvas = showMap ? (await RBCoverMap.render(track, mapOpts)) || (await RBCoverMap.render(track, Object.assign({}, mapOpts, { tiles: false }))) : null;
        if (!canvas) { canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H; }
        const ctx = canvas.getContext('2d');
        if (!showMap) { const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#1b2330'); g.addColorStop(1, '#0b0e13'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }

        // the foot darkens so the words read on any map
        const shade = ctx.createLinearGradient(0, 620, 0, 980);
        shade.addColorStop(0, 'rgba(11,14,19,0)'); shade.addColorStop(1, 'rgba(11,14,19,0.97)');
        ctx.fillStyle = shade; ctx.fillRect(0, 620, W, 360);
        ctx.fillStyle = 'rgba(11,14,19,0.97)'; ctx.fillRect(0, 980, W, H - 980);

        // the brand, top-left, on a small dark pill
        ctx.font = `800 34px ${font}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
        const brandW = ctx.measureText('RDBK.app').width + 44;
        ctx.fillStyle = 'rgba(11,14,19,0.78)'; pill(ctx, SIDE - 8, 44, brandW, 60, 30);
        ctx.fillStyle = '#e8b059'; ctx.fillText('RDBK.app', SIDE + 14, 75);

        // the outcome, as a chip above the title
        let y = 842;
        const chip = report.completed ? t('Roadbook completed') : t('Run finished');
        ctx.font = `700 28px ${font}`;
        const chipW = ctx.measureText(chip).width + 40;
        ctx.fillStyle = report.completed ? '#e8b059' : 'rgba(255,255,255,0.14)';
        pill(ctx, SIDE, y - 26, chipW, 52, 26);
        ctx.fillStyle = report.completed ? '#1b1307' : '#ffffff'; ctx.fillText(chip, SIDE + 20, y);

        // title and who · when
        y += 78;
        ctx.font = `800 62px ${font}`; ctx.fillStyle = '#ffffff';
        wrap(ctx, report.title || meta.title || t('Roadbook'), W - 2 * SIDE, 2).forEach((line) => { ctx.fillText(line, SIDE, y); y += 72; });
        ctx.font = `500 32px ${font}`; ctx.fillStyle = 'rgba(255,255,255,0.66)';
        const when = RBFmtDate(new Date(report.ended_at || Date.now()).toISOString().slice(0, 10));
        ctx.fillText([username ? '@' + username : '', when, report.team ? t('Vehicle') + ' ' + report.team : ''].filter(Boolean).join('  ·  '), SIDE, y - 8);

        // the figures, four columns
        const avg = report.duration_s > 0 ? ((report.distance_m / 1000) / (report.duration_s / 3600)).toFixed(1) : '—';
        const figures = [
            [RBKm(report.distance_m, 1), t('Distance')],
            [RBRun.fmtDuration(report.duration_s), t('Time')],
            [avg + ' km/h', t('Average speed')],
            [`${report.notes_reached}/${report.notes_total}`, t('Notes reached')],
        ];
        const top = Math.max(y + 60, 1150), colW = (W - 2 * SIDE) / figures.length;
        figures.forEach(([value, label], i) => {
            const x = SIDE + colW * i;
            if (i) { ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(x - 1, top - 34, 2, 110); }
            ctx.textAlign = 'left'; ctx.fillStyle = '#ffffff'; ctx.font = `800 ${value.length > 8 ? 40 : 48}px ${font}`;
            ctx.fillText(value, x + (i ? 22 : 0), top);
            ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = `600 22px ${font}`;
            ctx.fillText(label.toUpperCase(), x + (i ? 22 : 0), top + 52);
        });

        // where it lives: the runner's profile
        ctx.font = `600 24px ${font}`; ctx.fillStyle = 'rgba(232,176,89,0.9)'; ctx.textAlign = 'right';
        ctx.fillText(username ? 'rdbk.app/u/' + username : 'rdbk.app', W - SIDE, H - 50);

        try { return await new Promise((res) => canvas.toBlob((b) => res(b), 'image/png')); }
        catch (e) { return null; }
    }

    window.RBRunCard = { render };
})();
