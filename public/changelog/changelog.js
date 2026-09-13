'use strict';
/* Changelog page — what changed in each recent release (RBChangelog). Rendered entries are
 * translated like the rest of the UI and re-rendered on a language switch. */
(function () {
    const $ = (id) => document.getElementById(id);
    const t = RBt, esc = RBesc;
    const SHOWN = 5;       // releases listed before "Show earlier releases"
    let expanded = false;  // are the older releases open?

    /* One entry per release: the version on its rail, then the date, the headline and what
     * changed. The release this copy runs is marked, so the list answers "what am I missing?". */
    function releaseHtml(rel, index, running) {
        const badge = (cls, label) => `<span class="rel-badge${cls}">${esc(t(label))}</span>`;
        return `<li class="rel"${index >= SHOWN ? ' hidden' : ''}>
            <div class="rel-rail"><span class="rel-ver">${esc(rel.version)}</span></div>
            <div class="rel-body">
                <div class="rel-meta"><time datetime="${esc(rel.date)}">${esc(RBFmtDate(rel.date))}</time>${index === 0 ? badge('', 'Latest') : ''}${running && running.version === rel.version ? badge(' rel-badge-here', 'Your version') : ''}</div>
                <h3 class="rel-title">${esc(t(rel.title))}</h3>
                <ul class="rel-items">${rel.items.map((item) => `<li>${esc(t(item))}</li>`).join('')}</ul>
            </div>
        </li>`;
    }

    async function paintReleases() {
        const releases = window.RBChangelog || [];
        const running = await RBRunningRelease();
        $('relList').innerHTML = releases.map((rel, i) => releaseHtml(rel, i, running)).join('');
        const older = [...document.querySelectorAll('.rel')].slice(SHOWN);
        const more = $('relMore');
        const paintToggle = () => {
            older.forEach((el) => el.hidden = !expanded);
            more.innerHTML = `<i class="fa-solid fa-chevron-${expanded ? 'up' : 'down'}"></i> ${esc(t(expanded ? 'Show fewer releases' : 'Show earlier releases'))}`;
        };
        more.hidden = !older.length;
        more.onclick = () => { expanded = !expanded; paintToggle(); };
        paintToggle();
    }

    paintReleases();
    // A language switch re-renders what the page built itself, translations included.
    window.addEventListener('rb-lang', () => { paintReleases(); });
})();
