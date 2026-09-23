'use strict';
/* Public roadbook page: /challenge/<slug>. The roadbook's notes in the same paper rows as the
 * Reader (NoteCanvas.rowsHTML, #635), its route map, the owner (linked to their public profile),
 * Navigate (Reader), PDF export and, for the owner, Edit. Reading requires a signed-in account (#146). */
(async function () {
    const $ = (id) => document.getElementById(id);
    const t = RBt, esc = RBesc;
    const params = new URLSearchParams(location.search);
    const parts = location.pathname.replace(/\/+$/, '').split('/');
    const slug = params.get('s') || parts[parts.length - 1];
    const evParam = params.get('event'); // opened from an event: the Reader gets the context (#155)
    if (!slug || slug === 'challenge') { $('chLoading').textContent = t('Roadbook not found.'); return; }

    // RBConfig, not a bare config call: offline, a signed-in reader is still signed in (#630)
    const cfg = await RBConfig();
    if (!cfg.user) { $('chLoading').textContent = t('Sign in to read this roadbook.'); RBNeedAuth('Sign in to read public roadbooks.'); return; }
    let j;
    try { j = await RBChallenges.loadPublic(slug); }
    catch (e) { $('chLoading').textContent = t(e.message === 'Network error.' ? 'You are offline — reconnect to load this page.' : 'This roadbook does not exist or is private.'); return; }

    const rb = RB.importRoadbook(j.roadbook), o = j.owner || {}, m = rb.meta || {}; // canonical schema, like the Reader's
    $('chLoading').hidden = true; $('chContent').hidden = false;
    const title = m.title || t('Roadbook');
    $('chTitle').textContent = title;
    RBSetMeta({ title: title + ' · RDBK.app', description: m.description || undefined, canonical: location.origin + '/challenge/' + encodeURIComponent(slug) });
    // the way back to the event this page was opened from — only that event (#640)
    if (evParam && cfg.participant && cfg.participant.event_slug === evParam) {
        $('chEvent').hidden = false;
        $('chEvent').innerHTML = `<a href="/event/${encodeURIComponent(evParam)}" class="ev-back"><i class="fa-solid fa-arrow-left"></i> ${esc(cfg.participant.event_title)}</a>`;
    }
    // the owner is who they are on their public profile (#620): @username, linked
    $('chOwner').innerHTML = `<a href="${RBProfileLink(o.username)}">@${esc(o.username || '')}</a>`;
    if (o.avatar) $('chAvatar').src = RBMediaSrc(o.avatar); else $('chAvatar').remove();
    // a roadbook that is not public says so with the same badge as the event page (#640)
    if (j.status !== 'public') $('chStatus').innerHTML = `<span class="u-badge"><i class="fa-solid fa-lock"></i> ${esc(t(j.status === 'ready' ? 'Ready' : 'In preparation'))}</span>`;
    const credit = [m.author, m.organization, m.modified].filter(Boolean).join(' · '); // roadbook-declared credit
    $('chMeta').textContent = RBSummary(m.total_distance || 0, rb.notes.length) + (credit ? ' · ' + credit : '');
    if (m.logo) { $('chLogo').src = m.logo; $('chLogo').hidden = false; }
    $('chDesc').textContent = m.description || '';
    $('chNav').href = '/reader/' + encodeURIComponent(slug) + (evParam ? '?event=' + encodeURIComponent(evParam) : '');
    // Owner: Edit. Non-owner: a public roadbook can be read here, navigated and exported to PDF,
    // but not forked or downloaded.
    if (j.is_owner) { $('chEdit').hidden = false; $('chEdit').href = '/editor/?rb=' + j.id; }
    $('chPdf').onclick = async (e) => {
        const busy = RBBusy(e.currentTarget);
        // the closing QR points at this page when it is public, else at the event it was opened from (#784)
        const link = j.status === 'public' ? RBPublicLink('/challenge/' + encodeURIComponent(slug)) : (evParam ? RBPublicLink('/event/' + encodeURIComponent(evParam)) : null);
        try { await RBPdf.generate(rb, { iconBasePath: '/assets/icons/', link }); busy.ok(); }
        catch (err) { busy.reset(); RBToast('Could not export the PDF.'); }
    };

    // Photos and audio are editor-only working material — not shown here (#316).
    const renderRows = () => {
        $('chNotes').style.setProperty('--dist-ch', RB.distanceChars(rb.notes)); // the distance column fits the longest (#730)
        $('chNotes').innerHTML = NoteCanvas.rowsHTML(rb, { iconBase: '/assets/icons/' });
    };
    renderRows();
    window.addEventListener('rb-lang', renderRows);

    // The route + note markers — unless the roadbook hides the map (map_access:false, e.g. a
    // competition that keeps the route secret). A marker scrolls to ITS note row: rows are found
    // by data-i, never by position, since the material blocks sit between them (#634).
    if (m.map_access !== false && rb.track && rb.track.length >= 2) {
        $('chMap').hidden = false;
        const map = new RBMap('chMap', { style: RBMap.STYLE_TOPO });
        map.showRoadbook(rb);
        map.onWaypoint((i) => { const row = $('chNotes').querySelector(`.nrow[data-i="${i}"]`); if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
        setTimeout(() => map.map && map.map.resize(), 60); // the container was just unhidden
    }
})();
