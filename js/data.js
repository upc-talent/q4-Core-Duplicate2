'use strict';

/* =====================================================================
   United Pharmacy — shared data layer for the Home and Activity 2 pages.
   Reads the Google Sheet through Google's built-in JSONP endpoint (a
   <script> tag, so no CORS, no Apps Script). The sheet must be shared as
   "Anyone with the link can view".

   A page includes this file, then calls:
       startPolling(["leaderboard"], renderFn);
   and only the tabs it asks for are requested on each refresh.
   ===================================================================== */

/* ---------- CONFIG ---------- */
const SHEET_ID = "1LkycpdDicCo6r0zx8ohvjnjMHBV7wkDyQ5mv4aw9ukA";
const SHEET_BASE = "https://docs.google.com/spreadsheets/d/";

// Tab name + the columns each tab must contain (a wrong tab name/column shows as an error, not garbage).
const SPECS = {
  leaderboard: { tab: "Leaderboard", cols: ["Team Number", "Total Coins"] },
  results: { tab: "Results", cols: ["TeamNumber", "CaseID", "TotalScore", "SubmittedAt", "Rank", "Coins"] },
  answerKey: { tab: "AnswerKey", cols: ["CaseID", "Question", "CorrectAnswer", "MaxPoints"] },
  sessionLog: { tab: "SessionLog", cols: ["Team", "CaseID", "FinalSubmittedAt"] }
};

const POLL_MS = 5000;        // refresh cadence
const TIMEOUT_MS = 10000;    // give up on a request after this long
const MSG_ERROR = "Couldn't reach the sheet — retrying…";

/* =====================================================================
   HELPERS
   ===================================================================== */
const $ = id => document.getElementById(id);
const str = v => (v == null ? "" : String(v));
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const fmt = n => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));
const natural = (a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
const norm = s => s.trim().toLowerCase();
const splitItems = s => str(s).split("|").map(x => x.trim()).filter(Boolean);
const reduceMotion = () => window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

// HTML-escape every piece of data before it goes into markup.
function esc(s) {
  return str(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function ordinal(n) {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
// Only touch the DOM when the markup actually changed (keeps refreshes flicker-free).
function setHtml(el, html) {
  if (el._html === html) return false;
  el._html = html;
  el.innerHTML = html;
  return true;
}

/* =====================================================================
   JSONP LOADER + SHEET PARSING
   ===================================================================== */
const state = {
  data: null,          // last good, normalised data
  status: "loading"    // loading | ok | error
};

let cbSeq = 0;
// makeUrl(callbackName) -> URL. Loaded through a <script> tag, so no CORS involved.
function jsonp(makeUrl, timeoutMs) {
  return new Promise((resolve, reject) => {
    const cb = "upc_cb_" + (++cbSeq);
    const script = document.createElement("script");
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true; cleanup();
      window[cb] = () => { delete window[cb]; };   // swallow a reply that arrives after the timeout
      reject(new Error("timeout"));
    }, timeoutMs);
    function cleanup() { clearTimeout(timer); script.onerror = null; script.remove(); }
    window[cb] = data => { if (settled) return; settled = true; cleanup(); delete window[cb]; resolve(data); };
    script.onerror = () => { if (settled) return; settled = true; cleanup(); delete window[cb]; reject(new Error("network")); };
    script.async = true;
    script.src = makeUrl(cb);
    document.head.appendChild(script);
  });
}

// Google Visualization endpoint for one tab; it wraps the JSON in our callback.
const tabUrl = tab => cb =>
  SHEET_BASE + SHEET_ID + "/gviz/tq?tqx=out:json;responseHandler:" + cb +
  "&headers=1&sheet=" + encodeURIComponent(tab) + "&_=" + Date.now();

// Turn a Google Visualization response into [{ "Column label": value }, …].
// Throws if the tab isn't the one we expect (Google silently serves the first
// tab when a name is wrong), so a renamed tab shows as an error, not garbage.
function tableRows(res, required) {
  if (!res || res.status !== "ok" || !res.table) throw new Error("bad response");
  const cols = res.table.cols.map(c => str(c.label).trim());
  required.forEach(name => { if (cols.indexOf(name) === -1) throw new Error("missing column " + name); });
  return (res.table.rows || []).map(r => {
    const o = {};
    cols.forEach((label, i) => {
      const c = r.c && r.c[i], type = res.table.cols[i].type;
      // Dates keep the sheet's own formatted text ("2026-09-19 17:09:43").
      o[label] = !c ? "" : /date|time/.test(type) ? str(c.f) : (c.v == null ? "" : c.v);
    });
    return o;
  });
}

const loadTab = key => jsonp(tabUrl(SPECS[key].tab), TIMEOUT_MS).then(res => tableRows(res, SPECS[key].cols));

/* =====================================================================
   SHAPE THE DATA
   ===================================================================== */
const teamLabel = n => "Team " + str(n).trim();
const caseKey = s => { const m = /case\s*(\d+)/i.exec(str(s)); return m ? "case" + m[1] : str(s).trim().toLowerCase(); };
const prettyCase = s => str(s).replace(/^case\s*(\d+)/i, "Case $1");   // "Case2" -> "Case 2"
function stamp() {
  const d = new Date(), p = n => String(n).padStart(2, "0");
  return p(d.getDate()) + "/" + p(d.getMonth() + 1) + "/" + d.getFullYear() + " " + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
}

// raw = { tabKey: rows[] } for whichever tabs the page asked for.
function buildData(raw) {
  const data = { lastUpdated: stamp() };

  // Home: ranked by Total Coins (biggest first)
  if (raw.leaderboard) {
    data.leaderboard = raw.leaderboard
      .map(r => ({ team: str(r["Team Number"]).trim(), total: num(r["Total Coins"]) }))
      .filter(r => r.team)
      .sort((a, b) => b.total - a.total);
  }

  // Activity 2: one entry per row of Results, enriched with the team's answers
  if (raw.results) {
    // Model answers, grouped by case
    const keyByCase = {};
    (raw.answerKey || []).forEach(r => {
      const k = caseKey(r.CaseID);
      if (k) (keyByCase[k] = keyByCase[k] || []).push({ q: str(r.Question).trim(), correct: str(r.CorrectAnswer), max: num(r.MaxPoints) });
    });

    // Latest submission per team
    const logByTeam = {};
    (raw.sessionLog || []).forEach(r => {
      const t = str(r.Team).trim();
      if (t && (!logByTeam[t] || str(r.FinalSubmittedAt) >= str(logByTeam[t].FinalSubmittedAt))) logByTeam[t] = r;
    });

    data.teams = raw.results.filter(r => str(r.TeamNumber).trim() !== "").map(r => {
      const n = str(r.TeamNumber).trim(), row = logByTeam[n], caseId = row ? row.CaseID : r.CaseID;
      const questions = row ? (keyByCase[caseKey(caseId)] || []).map(k => ({
        q: k.q, answer: str(row[k.q + "_Answers"]), correct: k.correct, score: num(row[k.q + "_Score"]), max: k.max
      })) : [];
      return {
        team: teamLabel(n), caseName: prettyCase(caseId),
        total: num(r.TotalScore), submittedAt: str(r.SubmittedAt),
        rank: str(r.Rank).trim() === "" ? null : num(r.Rank), coins: num(r.Coins),
        submitted: !!row, questions
      };
    });
  }

  return data;
}

/* =====================================================================
   POLLING + STATUS FOOTER
   ===================================================================== */
let pageNeeds = [], pageRender = function () { }, pollTimer = null, inFlight = false;

async function poll() {
  clearTimeout(pollTimer);
  if (inFlight) return;
  inFlight = true;
  try {
    const raw = {};
    await Promise.all(pageNeeds.map(key => loadTab(key).then(rows => { raw[key] = rows; })));
    state.data = buildData(raw);
    state.status = "ok";
  } catch (e) {
    state.status = "error";          // keep showing the last good data
  } finally {
    inFlight = false;
    pageRender(); renderStatus();
    if (window.UPCNav) UPCNav.done();
    pollTimer = setTimeout(poll, POLL_MS);
  }
}

function renderStatus() {
  const foot = $("foot"), text = $("statusText");
  let msg = "Loading…";
  if (state.status === "error") msg = MSG_ERROR;
  else if (state.status === "ok") msg = "Last updated " + (state.data.lastUpdated || "—");
  foot.className = "foot " + state.status;
  text.textContent = msg;
}

// Called once by each page: which tabs it needs, and how to draw itself.
function startPolling(needs, render) {
  pageNeeds = needs;
  pageRender = render;
  document.addEventListener("upc:refresh", poll);   // the nav's Refresh pill
  render(); renderStatus();                         // loading state right away
  poll();
}

/* =====================================================================
   SHARED PLACEHOLDERS (loading / error)
   ===================================================================== */
function placeholder(kind) {
  if (state.status === "error") return '<div class="state warn">' + esc(MSG_ERROR) + "</div>";
  if (kind === "rows") {
    return '<div class="skel-rows" aria-label="Loading"><div class="skel-line"></div><div class="skel-line"></div><div class="skel-line"></div><div class="skel-line"></div></div>';
  }
  return '<div class="state"><span class="spinner"></span>Loading…</div>';
}
