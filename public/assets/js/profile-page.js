'use strict';
/* Public profile (#620): /u/<username> (?name= inside the app). What anyone may see — avatar,
 * bio, organization, the totals of the public runs, the completed roadbooks with every public run,
 * and the user's public roadbooks — and, for the owner, their private runs too (marked), with the
 * controls to publish, hide or delete a run (#619). Never the real name or the email. */
(function () {
    const $ = (id) => document.getElementById(id);
    const t = RBt, esc = RBesc, toast = RBToast;
    const parts = location.pathname.split('/').filter(Boolean);
    const username = new URLSearchParams(location.search).get('name') || (parts[0] === 'u' && parts[1] ? decodeURIComponent(parts[1]) : '');
    let data = null;

    const tile = (icon, value, label) => `<div class="stat"><i class="fa-solid ${icon}"></i><b>${value}</b><span>${esc(t(label))}</span></div>`;

    function render() {
        const u = data.user, s = data.stats;
        $('pfLoading').hidden = true; $('pfContent').hidden = false;
        $('pfName').textContent = '@' + u.username;
        $('pfAvatar').src = u.avatar ? RBMediaSrc(u.avatar) : '/assets/icon.svg';
        $('pfMeta').textContent = [u.organization, t('Member since') + ' ' + RBFmtDate(u.member_since)].filter(Boolean).join(' · ');
        $('pfBio').textContent = u.bio || '';
        $('pfBio').hidden = !u.bio;
        $('pfEdit').hidden = !data.is_me;
        // your own profile says whose they are (#777); anyone else's just calls them public
        const rbTitle = data.is_me ? 'My public roadbooks' : 'Public roadbooks';
        $('pfRbTitle').setAttribute('data-i18n', rbTitle); $('pfRbTitle').textContent = t(rbTitle);
        RBSetMeta({ title: '@' + u.username + ' · RDBK.app', description: u.bio || undefined, canonical: location.origin + '/u/' + encodeURIComponent(u.username) });
        $('pfStats').innerHTML = `<div class="stat-grid">
            ${tile('fa-flag-checkered', s.completed, 'Roadbooks completed')}
            ${tile('fa-route', RBKm(s.distance_m, 1), 'Distance')}
            ${tile('fa-stopwatch', RBRun.fmtDuration(s.duration_s), 'Time')}
            ${tile('fa-list-ol', s.runs, 'Runs')}
        </div>`;
        renderRuns();
        $('pfRoadbooks').innerHTML = data.roadbooks.length ? data.roadbooks.map((r) => RBRoadbookCard(r, { href: '/challenge/' + encodeURIComponent(r.slug) })).join('') : `<p class="gallery-empty">${esc(t('No public roadbooks yet.'))}</p>`;
        RBFillRoutes($('pfRoadbooks'));
    }

    // Runs grouped by the roadbook they ran, newest first, each group saying how often it was done.
    function renderRuns() {
        const groups = new Map();
        data.runs.forEach((r) => { if (!groups.has(r.roadbook_key)) groups.set(r.roadbook_key, []); groups.get(r.roadbook_key).push(r); });
        $('pfPrivateHint').hidden = !(data.is_me && data.runs.some((r) => !r.is_public));
        if (!groups.size) { $('pfRuns').innerHTML = `<p class="muted small">${esc(t(data.is_me ? 'Your finished runs appear here — navigate a roadbook in the Reader and finish it.' : 'No public runs yet.'))}</p>`; return; }
        $('pfRuns').innerHTML = [...groups.values()].map((runs, gi) => {
            const first = runs[0], done = runs.filter((r) => r.completed).length;
            const title = first.roadbook_slug ? `<a href="/challenge/${encodeURIComponent(first.roadbook_slug)}">${esc(first.title)}</a>` : esc(first.title);
            return `<details class="pf-rb"${gi === 0 ? ' open' : ''}>
                <summary><i class="fa-solid fa-book"></i><b class="grow">${title}</b>
                    <span class="u-badge">${done} × ${esc(t('completed'))}</span><span class="muted small">${runs.length} ${esc(t(runs.length === 1 ? 'run' : 'runs'))}</span></summary>
                ${runs.map(runHTML).join('')}
            </details>`;
        }).join('');
        $('pfRuns').querySelectorAll('[data-vis]').forEach((b) => b.onclick = () => setVisibility(+b.dataset.run, b.dataset.vis === '1'));
        $('pfRuns').querySelectorAll('[data-del]').forEach((b) => b.onclick = () => removeRun(+b.dataset.del));
        $('pfRuns').querySelectorAll('[data-share-card]').forEach((b) => b.onclick = async () => {
            try { RBShareFile(await (await fetch(b.dataset.shareCard)).blob(), 'rdbk-run.avif', 'RDBK.app'); }
            catch (e) { toast('Could not share.'); }
        });
    }
    function runHTML(r) {
        const when = RBFmtDate(String(r.ended_at).slice(0, 10));
        const badges = [
            r.completed ? '' : `<span class="u-badge">${esc(t('Not finished'))}</span>`,
            r.mode === 'competition' ? `<span class="u-badge u-organizer">${esc(t('Competition'))}</span>` : '',
            r.event ? `<a class="small" href="/event/${encodeURIComponent(r.event.slug)}"><i class="fa-solid fa-calendar-check"></i> ${esc(r.event.title)}</a>` : '',
            data.is_me && !r.is_public ? `<span class="u-badge"><i class="fa-solid fa-lock"></i> ${esc(t('Private'))}</span>` : '',
        ].filter(Boolean).join(' ');
        const own = data.is_me ? `<button class="btn btn-ghost btn-sm" data-vis="${r.is_public ? 0 : 1}" data-run="${r.id}" type="button"><i class="fa-solid fa-${r.is_public ? 'lock' : 'globe'}"></i> ${esc(t(r.is_public ? 'Make private' : 'Make public'))}</button>
            <button class="btn btn-ghost btn-sm" data-del="${r.id}" type="button" title="${esc(t('Delete'))}" aria-label="${esc(t('Delete'))}"><i class="fa-solid fa-trash-can icon-danger"></i></button>` : '';
        // the run's shareable image (#785), when it has one — the runner can share it again from here
        const card = r.card ? `<div class="pf-run-card"><a href="${esc(r.card)}" target="_blank" rel="noopener"><img src="${esc(r.card)}" alt="" loading="lazy"></a>
            ${data.is_me ? `<button class="btn btn-ghost btn-sm" data-share-card="${esc(r.card)}" type="button"><i class="fa-solid fa-share-nodes"></i> ${esc(t('Share'))}</button>` : ''}</div>` : '';
        return `<div class="pf-run">
            <div class="pf-run-head"><span class="grow"><i class="fa-regular fa-calendar"></i> ${esc(when)} ${badges}</span>${own}</div>
            ${card}${RBRun.statsHTML(r)}${RBRun.detailsHTML(r)}
        </div>`;
    }
    async function setVisibility(id, isPublic) {
        const x = await RBApi('run_update', { id, is_public: isPublic ? 1 : 0 });
        if (!x.ok) return toast(x.error || 'Could not save.');
        data.runs.find((r) => r.id === id).is_public = isPublic ? 1 : 0;
        toast(isPublic ? 'Saved to your profile — public.' : 'Saved to your profile — private.');
        load(); // the totals count public runs only
    }
    async function removeRun(id) {
        const r = data.runs.find((x) => x.id === id);
        if (!(await RBConfirmDanger(t('Delete this run?') + '<br><b>' + esc(r.title) + '</b> · ' + esc(RBFmtDate(String(r.ended_at).slice(0, 10))) + ' · ' + RBKm(r.distance_m, 1)))) return;
        const x = await RBApi('run_delete', { id });
        if (x.ok) load(); else toast(x.error || 'Could not delete.');
    }

    function load() {
        if (!username) { $('pfLoading').textContent = t('Not found.'); return Promise.resolve(); }
        return RBApi('profile_get', { username }).then((j) => {
            if (!j.ok) { $('pfLoading').textContent = t(j.error === 'Network error.' ? 'You are offline — reconnect to load this page.' : 'Not found.'); return; }
            data = j; render();
        });
    }
    window.addEventListener('rb-lang', () => { if (data) render(); });
    load();
})();
