'use strict';

/* Activity 2 page — summary table, team filter, detail card. Needs data.js (loaded first). */

let selected = "";   // team chosen in the filter ("" = all teams)

function sortedTeams() {
  return state.data.teams.slice().sort((a, b) => {
    const ra = a.rank == null ? Infinity : a.rank, rb = b.rank == null ? Infinity : b.rank;
    return (ra - rb) || (b.total - a.total) || natural(a.team, b.team);
  });
}

function renderSummary() {
  const el = $("summary"), count = $("teamCount");
  if (!state.data) { count.textContent = ""; setHtml(el, placeholder("rows")); return; }

  const teams = sortedTeams();
  count.textContent = teams.length + (teams.length === 1 ? " team" : " teams");
  if (!teams.length) { setHtml(el, '<div class="state">No submissions yet.</div>'); return; }

  const rows = teams.map(t =>
    '<tr data-team="' + esc(t.team) + '" tabindex="0">' +
      '<td><span class="rank' + (t.rank === 1 ? " r1" : "") + '">' + (t.rank == null ? "–" : esc(fmt(t.rank))) + '</span></td>' +
      '<td class="tname">' + esc(t.team) + '</td>' +
      '<td class="tcase">' + esc(t.caseName || "—") + '</td>' +
      '<td class="num ttotal">' + esc(fmt(t.total)) + '</td>' +
      '<td class="num"><span class="coins"><i class="coin"></i>' + esc(fmt(t.coins)) + '</span></td>' +
      '<td class="ttime">' + esc(t.submittedAt || "—") + '</td>' +
    '</tr>').join("");

  setHtml(el,
    '<div class="tscroll"><table class="stable"><thead><tr>' +
    '<th scope="col">Rank</th><th scope="col">Team</th><th scope="col">Case</th>' +
    '<th scope="col" class="num">Total score</th><th scope="col" class="num">Coins</th><th scope="col">Last submission</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table></div>');
  markSelectedRow();
}

function markSelectedRow() {
  document.querySelectorAll("#summary tr[data-team]").forEach(tr =>
    tr.classList.toggle("sel", selected !== "" && tr.dataset.team === selected));
}

// Rebuild the <select> options only when the team list changes, so the open
// dropdown / current choice never flickers on the 5s refresh.
function syncSelect() {
  const sel = $("teamFilter");
  if (!state.data) {
    sel.disabled = true;
    const label = state.status === "error" ? "Couldn't load teams" : "Loading teams…";
    setHtml(sel, '<option value="">' + esc(label) + '</option>');
    return;
  }
  const names = state.data.teams.map(t => t.team).sort(natural);
  if (selected && names.indexOf(selected) === -1) selected = "";
  setHtml(sel, '<option value="">All teams</option>' +
    names.map(n => '<option value="' + esc(n) + '">' + esc(n) + '</option>').join(""));
  sel.value = selected;
  sel.disabled = names.length === 0;
}

function statusOf(q) {
  if (q.score >= q.max) return ["full", "✓ Full"];
  if (q.score === 0) return ["zero", "✗ Zero"];
  return ["part", "◐ Partial"];
}

function renderDetail() {
  const el = $("detail");
  if (!state.data) { setHtml(el, '<div class="glass card">' + placeholder() + "</div>"); return; }
  if (!state.data.teams.length) { setHtml(el, '<div class="glass card"><div class="state">No submissions yet.</div></div>'); return; }
  if (!selected) {
    setHtml(el, '<div class="glass card"><div class="hint"><strong>Pick a team to see the details</strong>' +
      'Choose a team in the filter above (or click a row in the table) to see every question, the team\'s answer and the model answer.</div></div>');
    return;
  }
  const t = state.data.teams.find(x => x.team === selected);
  if (!t) { setHtml(el, ""); return; }

  const rows = t.questions.map(q => {
    const given = splitItems(q.answer), model = splitItems(q.correct);
    const modelSet = new Set(model.map(norm));
    const givenHtml = given.length
      ? '<div class="chips">' + given.map(x => {
          const hit = modelSet.has(norm(x));
          return '<span class="chip ' + (hit ? "ok" : "bad") + '" title="' + (hit ? "In the model answer" : "Not in the model answer") + '">' + esc(x) + "</span>";
        }).join("") + "</div>"
      : '<span class="noans">— no answer —</span>';
    const modelHtml = model.length
      ? '<div class="chips">' + model.map(x => '<span class="chip">' + esc(x) + "</span>").join("") + "</div>"
      : '<span class="noans">—</span>';
    const st = statusOf(q);
    return '<tr>' +
      '<td class="qname" data-label="Question">' + esc(q.q) + '</td>' +
      '<td data-label="Team answer">' + givenHtml + '</td>' +
      '<td data-label="Model answer">' + modelHtml + '</td>' +
      '<td class="qscore" data-label="Score">' + esc(fmt(q.score)) + ' <small>/ ' + esc(fmt(q.max)) + '</small></td>' +
      '<td data-label="Status"><span class="st ' + st[0] + '">' + st[1] + '</span></td>' +
    '</tr>';
  }).join("");

  setHtml(el,
    '<article class="glass card">' +
      '<div class="detail-head">' +
        '<div><h2>' + esc(t.team) + '</h2><p class="case">' + esc(t.caseName || "—") + '</p></div>' +
        '<dl class="kvs">' +
          '<div class="kv"><dt>Rank</dt><dd>' + (t.rank == null ? "–" : '<span class="rank' + (t.rank === 1 ? " r1" : "") + '">' + esc(fmt(t.rank)) + '</span>') + '</dd></div>' +
          '<div class="kv"><dt>Total</dt><dd>' + esc(fmt(t.total)) + '</dd></div>' +
          '<div class="kv"><dt>Coins</dt><dd><span class="coins"><i class="coin"></i>' + esc(fmt(t.coins)) + '</span></dd></div>' +
          '<div class="kv"><dt>Submitted</dt><dd class="small">' + esc(t.submittedAt || "—") + '</dd></div>' +
        '</dl>' +
      '</div>' +
      (t.questions.length
        ? '<p class="legend"><span><span class="chip ok">green</span> in the model answer</span><span><span class="chip bad">red</span> not in the model answer</span></p>' +
          '<div class="tscroll"><table class="qtable"><thead><tr>' +
          '<th scope="col">Question</th><th scope="col">Team answer</th><th scope="col">Model answer</th><th scope="col">Score</th><th scope="col">Status</th>' +
          '</tr></thead><tbody>' + rows + '</tbody></table></div>'
        : '<div class="state">' + (t.submitted ? "No question data for this case." : "This team hasn't submitted yet.") + '</div>') +
    '</article>');
}

function selectTeam(name, scrollTo) {
  selected = name;
  $("teamFilter").value = name;
  markSelectedRow();
  renderDetail();
  if (scrollTo && name) {
    const r = $("detail").getBoundingClientRect();
    if (r.top > innerHeight * 0.55 || r.top < 0) {
      $("detail").scrollIntoView({ behavior: reduceMotion() ? "auto" : "smooth", block: "start" });
    }
  }
}

$("teamFilter").addEventListener("change", e => selectTeam(e.target.value, false));
$("summary").addEventListener("click", e => {
  const tr = e.target.closest("tr[data-team]");
  if (tr) selectTeam(tr.dataset.team, true);
});
$("summary").addEventListener("keydown", e => {
  if (e.key !== "Enter" && e.key !== " ") return;
  const tr = e.target.closest("tr[data-team]");
  if (tr) { e.preventDefault(); selectTeam(tr.dataset.team, true); }
});

function renderAll() {
  renderSummary();
  syncSelect();
  renderDetail();
}

startPolling(["results", "answerKey", "sessionLog"], renderAll);
