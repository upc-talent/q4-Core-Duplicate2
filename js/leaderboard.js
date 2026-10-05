'use strict';

/* Home page — leaderboard podium. Needs data.js (loaded first). */

const AVATAR_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="3.6"/><path d="M4.5 20c.6-4 3.7-6 7.5-6s6.9 2 7.5 6"/></svg>';
let podiumAnimated = false;

function renderPodium() {
  const el = $("podium"), note = $("podiumNote");
  note.hidden = true;

  if (!state.data) {
    if (state.status === "error") {
      el.classList.remove("animate");
      setHtml(el, placeholder());
    } else {
      // skeleton podium while the first response is on its way
      setHtml(el, [2, 1, 3, 4].map(r =>
        '<div class="pod skel" data-rank="' + r + '"><div class="pod-text"><div class="skel-line"></div><div class="skel-line"></div></div>' +
        '<div class="pod-bar"><div class="pod-avatar"></div></div></div>').join(""));
    }
    return;
  }

  const rows = state.data.leaderboard;
  if (!rows.length) { setHtml(el, '<div class="state">No teams on the leaderboard yet.</div>'); return; }

  // Competition ranking (1,1,3,…) so ties share a place instead of breaking the podium.
  const top = rows.slice(0, 4).map((r, i) => ({
    team: r.team, total: r.total,
    rank: 1 + rows.filter(o => o.total > r.total).length,
    shared: rows.filter(o => o.total === r.total).length > 1
  }));
  // Left→right: 2nd | 1st | 3rd | 4th (by position); slots with no team are skipped.
  const slots = [1, 0, 2, 3].filter(i => i < top.length).map(i => top[i]);

  const html = slots.map(p =>
    '<div class="pod" data-rank="' + p.rank + '">' +
      '<div class="pod-text"><div class="pod-name">' + esc(p.team) + '</div>' +
      '<div class="pod-pts">' + esc(fmt(p.total)) + (p.total === 1 ? " pt" : " pts") + '</div></div>' +
      '<div class="pod-bar"><div class="pod-avatar">' + AVATAR_SVG + '</div>' +
      '<div class="pod-place">' + ordinal(p.rank) + ' Place</div>' +
      (p.shared ? '<span class="tie">Tie</span>' : '') + '</div>' +
    '</div>').join("");

  if (html !== el._html) {
    el.classList.toggle("animate", !podiumAnimated && !reduceMotion());   // rise animation only on the first render
    podiumAnimated = true;
    setHtml(el, html);
  }
  if (rows.length > 4) {
    note.textContent = "Showing the top 4 of " + rows.length + " teams. See the Activity 2 Dashboard for everyone.";
    note.hidden = false;
  }
}

startPolling(["leaderboard"], renderPodium);
