'use strict';
/* Public challenge page: photo gallery + the roadbook's notes in the canonical
 * layout + owner. Navigate (Reader) and Fork (Editor). Slug from /challenge/<slug>. */
(function () {
    const $ = (id) => document.getElementById(id);
    const t = (k) => (window.RBi18n ? RBi18n.t(k) : k);
    const parts = location.pathname.replace(/\/+$/, '').split('/');
    const slug = new URLSearchParams(location.search).get('s') || parts[parts.length - 1];
    if (!slug || slug === 'challenge') { $('chLoading').textContent = t('Challenge not found.'); return; }

    RBChallenges.loadPublic(slug).then((j) => {
        const rb = j.roadbook, o = j.owner || {};
        $('chLoading').hidden = true; $('chContent').hidden = false;
        const title = (rb.meta && rb.meta.title) || 'Roadbook';
        $('chTitle').textContent = title;
        document.title = title + ' · RDBK.app';
        $('chOwner').textContent = o.name || ('@' + (o.username || ''));
        $('chMeta').textContent = '@' + (o.username || '') + ' · ' + (((rb.meta && rb.meta.total_distance) || 0) / 1000).toFixed(1) + ' km · ' + rb.notes.length + ' ' + t('notes') + (j.is_public ? '' : ' · 🔒 ' + t('Private'));
        if (o.avatar) $('chAvatar').src = o.avatar; else $('chAvatar').remove();
        $('chDesc').textContent = (rb.meta && rb.meta.description) || o.bio || '';
        // roadbook-declared credit (author / organization / date) + event logo
        const m = rb.meta || {};
        const credit = [m.author, m.organization, m.modified].filter(Boolean).join(' · ');
        if (credit) $('chMeta').textContent += ' · ' + credit;
        if (m.logo) { const img = document.createElement('img'); img.src = m.logo; img.alt = ''; img.style.cssText = 'height:52px;width:auto;object-fit:contain;margin-bottom:.5rem'; $('chTitle').parentNode.insertBefore(img, $('chTitle')); }
        $('chNav').href = '/reader/' + encodeURIComponent(slug);
        if (j.is_owner) { const f = $('chFork'); f.href = '/editor/?rb=' + j.id; f.innerHTML = '<i class="fa-solid fa-pen"></i> Edit'; }
        else { $('chFork').href = '/editor/' + encodeURIComponent(slug); }

        if (j.photos && j.photos.length) {
            $('chGallery').innerHTML = j.photos.map((u) => `<a href="${u}" target="_blank" rel="noopener"><img src="${u}" loading="lazy" alt=""></a>`).join('');
        }
        const iconSrc = (ic) => RB.iconSrc(ic, rb, '/assets/icons/');
        $('chNotes').innerHTML = rb.notes.map((n) => `<div class="noterow">${NoteCanvas.rowCols(n, iconSrc, true)}</div>`).join('');
    }).catch(() => { $('chLoading').textContent = t('This challenge does not exist or is private.'); });
})();
