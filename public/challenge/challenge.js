'use strict';
/* Public challenge page: photo gallery + the roadbook's notes in the canonical
 * layout + owner. Navigate (Reader) and Fork (Editor). Slug from /challenge/<slug>. */
(function () {
    const $ = (id) => document.getElementById(id);
    const t = RBt, esc = RBesc; // shared helpers (i18n.js / app.js)
    const parts = location.pathname.replace(/\/+$/, '').split('/');
    const slug = new URLSearchParams(location.search).get('s') || parts[parts.length - 1];
    if (!slug || slug === 'challenge') { $('chLoading').textContent = t('Challenge not found.'); return; }

    RBChallenges.loadPublic(slug).then((j) => {
        const rb = j.roadbook, o = j.owner || {};
        $('chLoading').hidden = true; $('chContent').hidden = false;
        const title = (rb.meta && rb.meta.title) || t('Roadbook');
        $('chTitle').textContent = title;
        document.title = title + ' · RDBK.app';
        $('chOwner').textContent = o.name || ('@' + (o.username || ''));
        $('chMeta').textContent = '@' + (o.username || '') + ' · ' + RBSummary((rb.meta && rb.meta.total_distance) || 0, rb.notes.length) + (j.is_public ? '' : ' · 🔒 ' + t('Private'));
        if (o.avatar) $('chAvatar').src = o.avatar; else $('chAvatar').remove();
        $('chDesc').textContent = (rb.meta && rb.meta.description) || '';
        // roadbook-declared credit (author / organization / date) + event logo
        const m = rb.meta || {};
        const credit = [m.author, m.organization, m.modified].filter(Boolean).join(' · ');
        if (credit) $('chMeta').textContent += ' · ' + credit;
        if (m.logo) { const img = document.createElement('img'); img.src = m.logo; img.alt = ''; img.className = 'ch-logo'; $('chTitle').parentNode.insertBefore(img, $('chTitle')); }
        $('chNav').href = '/reader/' + encodeURIComponent(slug);
        if (j.is_owner) { const f = $('chFork'); f.href = '/editor/?rb=' + j.id; f.setAttribute('data-i18n', 'Edit'); f.innerHTML = '<i class="fa-solid fa-pen"></i> ' + esc(t('Edit')); }
        else { $('chFork').href = '/editor/' + encodeURIComponent(slug); }

        if (j.photos && j.photos.length) {
            $('chGallery').innerHTML = j.photos.map((u, i) => `<a href="${esc(u)}" target="_blank" rel="noopener"><img src="${esc(u)}" loading="lazy" alt="${esc(title + ' — ' + t('photo') + ' ' + (i + 1))}"></a>`).join('');
        }
        const iconSrc = (ic) => RB.iconSrc(ic, rb, '/assets/icons/');
        const fkm = (m) => ((m ?? 0) / 1000).toFixed(2);
        // same white "paper" rows as the Reader (read-only: no buttons/state)
        $('chNotes').innerHTML = rb.notes.map((n) => {
            const cap = n.cap != null ? `<div class="note-cap">CAP ${Math.round(n.cap)}°${n.cap_distance != null ? ' · ' + fkm(n.cap_distance) + ' km' : ''}</div>` : '';
            return `<div class="nrow readonly">
                <div class="col-distance"><div class="total">${fkm(n.distance)}</div><div class="partial">+${fkm(n.partial_distance)}</div><div class="num">${n.num}</div></div>
                <div class="col-vignette">${NoteCanvas.toSVG(n, iconSrc)}</div>
                <div class="col-text"><div class="text">${esc(n.text || '')}</div>${cap}<div class="coords">${(+n.lat).toFixed(5)}, ${(+n.lon).toFixed(5)}</div></div>
            </div>`;
        }).join('');

        // A map of the route + note markers on top — unless the roadbook hides the map
        // (map_access:false, e.g. a competition that keeps the route secret). Tapping a
        // marker scrolls to its note row.
        const mapAllowed = !rb.meta || rb.meta.map_access !== false;
        if (mapAllowed && rb.track && rb.track.length >= 2) {
            $('chMap').hidden = false;
            const map = new RBMap('chMap', { style: RBMap.STYLE_TOPO });
            map.showRoadbook(rb);
            map.onWaypoint((i) => { const row = $('chNotes').children[i]; if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
            setTimeout(() => map.map && map.map.resize(), 60); // the container was just unhidden
        }
    }).catch(() => { $('chLoading').textContent = t('This challenge does not exist or is private.'); });
})();
