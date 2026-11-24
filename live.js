/* SCHOOPS: Live round tracker
 * Live SuperCoach scores for this round, straight from ESPN's free public box scores (read in the
 * browser, no server). Each box-score line is scored with SuperCoach's formula (verified against
 * official round totals: 96% exact, 100% within 3 points):
 *   PTS + REB + AST + 2×STL + 2×BLK − TO − missed FG − missed FT
 * Which games count: the round's fixture list saved by the scraper (supercoach_data.json "fixtures",
 * SuperCoach's tip-off times), matched to ESPN games by time + team. The NBA Cup final isn't in it.
 * Shows: a games strip, your team's live total (best 9 of 10 starters + captain ×2), each player's
 * live round score / games left / current game line, top scorers, and a two-column game view.
 * Finished games are cached in this browser; while games are live we poll ESPN every 30 s.
 */
(function () {
  "use strict";

  const ESPN = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba";
  const CACHE_KEY = "schoops_live_box_v1";
  const POLL_LIVE_MS = 30000;      // box scores of games in progress
  const POLL_BOARD_MS = 60000;     // scoreboard while any game is live (or about to tip off)
  const POLL_IDLE_MS = 10 * 60000; // scoreboard when nothing is on
  // ESPN team codes -> SuperCoach team codes
  const TEAM_FIX = { GS: "GSW", NO: "NOP", NY: "NYK", SA: "SAS", UTAH: "UTA", WSH: "WAS" };
  const teamCode = (abbr) => TEAM_FIX[abbr] || abbr;

  const live = {
    round: null,
    fixtures: [],          // [{t, home, away}] from our data
    games: [],             // fixtures matched to ESPN: {key, t, home, away, eventId, state, detail, period, clock, homeScore, awayScore, logos}
    box: {},               // eventId -> [rows]
    cache: {},             // eventId -> rows for finished games (also in localStorage)
    selected: null,        // game key shown in the game view
    lastFetch: null,
    error: null,
    loading: false,
    started: false,
    timers: {},
    prevScores: {},        // playerId -> last shown live score (to flash changes)
  };

  const store = {
    load() { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}") || {}; } catch (err) { return {}; } },
    save(obj) { try { localStorage.setItem(CACHE_KEY, JSON.stringify(obj)); } catch (err) {} }
  };

  function injectStyles() {
    const style = document.createElement("style");
    style.textContent = `
      .lv { padding: 14px 18px 28px; display: flex; flex-direction: column; gap: 14px; min-width: 0; }
      .lv-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--neg); display: inline-block; flex-shrink: 0; }
      @media (prefers-reduced-motion: no-preference) {
        .lv-dot.pulse { animation: lvPulse 1.6s ease-in-out infinite; }
        .lv-flash { animation: lvFlash 1.2s ease-out; }
      }
      @keyframes lvPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
      @keyframes lvFlash { 0% { background-color: rgba(52, 211, 153, 0.28); } 100% { background-color: transparent; } }

      .sb-live-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--neg); display: none; margin-left: 6px; }
      .sb-item.has-live .sb-live-dot { display: inline-block; }

      /* Games strip */
      .lv-strip-wrap { position: relative; }
      .lv-strip { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px; scrollbar-width: thin; scroll-snap-type: x proximity; }
      .lv-day { display: flex; flex-direction: column; gap: 6px; flex-shrink: 0; }
      .lv-day-label { font-size: 11px; color: var(--text-tertiary); padding-left: 2px; white-space: nowrap; }
      .lv-day-games { display: flex; gap: 6px; }
      .lv-game { width: 148px; flex-shrink: 0; padding: 8px 10px; border-radius: 9px; border: 1px solid var(--border-subtle); background: var(--bg-elevated);
        color: var(--text-primary); text-align: left; cursor: pointer; scroll-snap-align: start;
        transition: border-color 120ms ease, background-color 120ms ease, transform 160ms var(--ease-press); }
      .lv-game:active { transform: scale(0.97); }
      @media (hover: hover) { .lv-game:hover { border-color: var(--border-strong); } }
      .lv-game.sel { border-color: rgba(110, 123, 242, 0.6); background: linear-gradient(180deg in oklab, rgba(110, 123, 242, 0.12), rgba(110, 123, 242, 0.03)), var(--bg-elevated); }
      .lv-game:focus-visible, .lv-btn:focus-visible, .lv-row:focus-visible, .lv-prow:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
      .lv-g-status { display: flex; align-items: center; justify-content: space-between; gap: 6px; font-size: 10.5px; color: var(--text-tertiary); margin-bottom: 5px; white-space: nowrap; }
      .lv-g-status .live { color: var(--neg-soft); font-weight: 600; display: inline-flex; align-items: center; gap: 5px; }
      .lv-g-status .mine { color: #A5AEFF; }
      .lv-g-team { display: flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 500; height: 20px; }
      .lv-g-team img { width: 16px; height: 16px; object-fit: contain; }
      .lv-g-team .sc { margin-left: auto; font-family: var(--mono); font-weight: 600; }
      .lv-g-team.lose { color: var(--text-secondary); }
      .lv-g-team.lose .sc { font-weight: 400; }

      /* Layout */
      .lv-grid { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); gap: 14px; align-items: start; }
      .lv-side { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
      @media (min-width: 1900px) {
        .lv-grid { grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) minmax(280px, 0.6fr); }
        .lv-side { display: contents; }
      }
      @media (max-width: 1100px) { .lv-grid { grid-template-columns: minmax(0, 1fr); } }

      .lv-card { border: 1px solid var(--border-subtle); border-radius: 12px; background: #0F0F12; min-width: 0; overflow: hidden; }
      .lv-card-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 12px 14px 10px; border-bottom: 1px solid var(--border-subtle); }
      .lv-card-title { font-size: 13px; font-weight: 600; color: var(--text-primary); }
      .lv-card-sub { font-size: 11.5px; color: var(--text-tertiary); margin-top: 1px; }

      /* My team summary */
      .lv-sum { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1px; background: var(--border-subtle); border-bottom: 1px solid var(--border-subtle); }
      .lv-sum > div { background: #0F0F12; padding: 12px 14px; min-width: 0; }
      .lv-sum-l { font-size: 11px; color: var(--text-tertiary); white-space: nowrap; }
      .lv-sum-v { font-family: var(--mono); font-size: 22px; font-weight: 600; color: var(--text-primary); margin-top: 3px; white-space: nowrap; }
      .lv-sum-v small { font-size: 12px; font-weight: 500; margin-left: 6px; }
      .lv-prog { height: 4px; background: rgba(255, 255, 255, 0.06); border-radius: 2px; margin-top: 8px; overflow: hidden; }
      .lv-prog i { display: block; height: 100%; background: var(--accent); border-radius: 2px; transform-origin: left; }
      @media (prefers-reduced-motion: no-preference) { .lv-prog i { transition: transform 400ms var(--ease-out); } }

      .lv-sec { padding: 8px 14px 4px; font-size: 11px; font-weight: 600; color: var(--text-tertiary); display: flex; justify-content: space-between; }
      .lv-sec span { font-weight: 400; }
      .lv-row { width: 100%; display: grid; grid-template-columns: 36px minmax(0, 1fr) auto 58px; gap: 10px; align-items: center; padding: 8px 14px;
        border: none; border-top: 1px solid rgba(255, 255, 255, 0.035); background: transparent; color: var(--text-primary); text-align: left; cursor: pointer;
        transition: background-color 100ms ease; }
      @media (hover: hover) { .lv-row:hover { background: var(--bg-hover); } }
      .lv-row.dropped .lv-pts b, .lv-row.bench { opacity: 0.55; }
      .lv-row.is-live { box-shadow: inset 2px 0 0 var(--neg-soft); }
      .lv-name { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 500; min-width: 0; }
      .lv-name > span:first-child { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .lv-pill { font-size: 10px; font-weight: 700; padding: 1px 5px; border-radius: 4px; white-space: nowrap; }
      .lv-pill.c { background: var(--accent); color: #fff; }
      .lv-pill.vc { background: var(--accent-soft); color: #A5AEFF; }
      .lv-pill.drop { background: rgba(255, 255, 255, 0.06); color: var(--text-tertiary); font-weight: 500; }
      .lv-line { font-size: 11.5px; color: var(--text-secondary); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .lv-line .live { color: var(--neg-soft); }
      .lv-pips { display: flex; gap: 3px; }
      .lv-pip { width: 8px; height: 8px; border-radius: 2px; background: rgba(255, 255, 255, 0.1); }
      .lv-pip.done { background: var(--text-secondary); }
      .lv-pip.dnp { background: transparent; box-shadow: inset 0 0 0 1px var(--text-tertiary); }
      .lv-pip.now { background: var(--neg-soft); }
      .lv-pts { text-align: right; font-family: var(--mono); white-space: nowrap; border-radius: 6px; padding: 2px 4px; }
      .lv-pts b { display: block; font-size: 16px; font-weight: 600; }
      .lv-pts small { display: block; font-size: 10.5px; color: var(--text-tertiary); }

      /* Game view: two compact team columns */
      .lv-gv-score { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 10px; padding: 12px 14px; border-bottom: 1px solid var(--border-subtle); }
      .lv-gv-team { display: flex; align-items: center; gap: 8px; min-width: 0; }
      .lv-gv-team.r { justify-content: flex-end; text-align: right; }
      .lv-gv-team img { width: 26px; height: 26px; object-fit: contain; }
      .lv-gv-team b { font-family: var(--mono); font-size: 22px; font-weight: 600; }
      .lv-gv-team span { font-size: 12px; color: var(--text-secondary); }
      .lv-gv-mid { font-size: 11px; color: var(--text-tertiary); text-align: center; white-space: nowrap; display: flex; flex-direction: column; align-items: center; gap: 3px; }
      .lv-gv-mid .live { color: var(--neg-soft); font-weight: 600; display: inline-flex; align-items: center; gap: 5px; }
      .lv-gv-cols { display: grid; grid-template-columns: 1fr 1fr; }
      .lv-gv-cols > div + div { border-left: 1px solid var(--border-subtle); }
      .lv-gv-h { display: flex; justify-content: space-between; padding: 8px 12px 4px; font-size: 10.5px; color: var(--text-tertiary); }
      .lv-prow { width: 100%; display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: center; padding: 5px 12px; border: none;
        background: transparent; color: var(--text-primary); text-align: left; cursor: pointer; font-size: 12.5px; transition: background-color 100ms ease; }
      @media (hover: hover) { .lv-prow:hover { background: var(--bg-hover); } }
      .lv-prow .nm { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 6px; min-width: 0; }
      .lv-prow .nm span:first-child { overflow: hidden; text-overflow: ellipsis; }
      .lv-prow .min { font-family: var(--mono); font-size: 10.5px; color: var(--text-tertiary); margin-right: 6px; }
      .lv-prow .v { font-family: var(--mono); font-weight: 600; }
      .lv-prow.mine { background: rgba(110, 123, 242, 0.08); box-shadow: inset 2px 0 0 var(--accent); }
      .lv-prow.dnp { color: var(--text-tertiary); }
      .lv-prow.dnp .v { font-weight: 400; }
      .lv-sq { font-size: 9.5px; font-weight: 700; color: #A5AEFF; }
      .lv-pre { padding: 14px; font-size: 12px; color: var(--text-tertiary); line-height: 1.5; }

      /* Top scorers */
      .lv-top { counter-reset: lvtop; }
      .lv-top .lv-prow { grid-template-columns: 18px 26px minmax(0, 1fr) auto; padding: 6px 12px; }
      .lv-rank { font-family: var(--mono); font-size: 11px; color: var(--text-tertiary); }

      .lv-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; font-size: 11.5px; color: var(--text-tertiary); line-height: 1.5; }
      .lv-foot p { margin: 0; max-width: 72ch; text-wrap: pretty; }
      .lv-btn { height: 28px; padding: 0 11px; border-radius: 6px; border: 1px solid var(--border-default); background: transparent; color: var(--text-secondary);
        font-size: 12px; font-weight: 500; cursor: pointer; white-space: nowrap; transition: color 120ms ease, background-color 120ms ease, transform 160ms var(--ease-press); }
      .lv-btn:active { transform: scale(0.97); }
      @media (hover: hover) { .lv-btn:hover { color: var(--text-primary); background: var(--bg-hover); } }
      .lv-empty { padding: 16px 14px; font-size: 12.5px; color: var(--text-secondary); line-height: 1.5; }
      .lv-empty .lv-btn { margin-top: 10px; }
      .lv-err { padding: 10px 12px; border-radius: 8px; background: var(--warn-bg); color: var(--warn-bright); font-size: 12px; }

      @media (max-width: 760px) {
        .lv { padding: 10px 12px 24px; gap: 12px; }
        .lv-strip { margin: 0 -12px; padding: 0 12px 4px; scroll-padding: 0 12px; scrollbar-width: none; }
        .lv-strip::-webkit-scrollbar { display: none; }
        .lv-game { width: 136px; }
        .lv-sum-v { font-size: 18px; }
        .lv-sum > div { padding: 10px 10px; }
        .lv-row { grid-template-columns: 30px minmax(0, 1fr) 52px; padding: 8px 12px; }
        .lv-row .lv-pips { display: none; }
        .lv-prow { padding: 5px 10px; font-size: 12px; }
        .lv-prow .min { display: none; }
        .lv-gv-team b { font-size: 18px; }
      }
    `;
    document.head.appendChild(style);
  }

  /* ---------- Scoring and data ---------- */

  const madeAtt = (s) => { const m = String(s || "0-0").split("-"); return [Number(m[0]) || 0, Number(m[1]) || 0]; };

  // One ESPN box-score team group -> compact rows
  function parseSummary(summary) {
    const rows = [];
    ((summary && summary.boxscore && summary.boxscore.players) || []).forEach((team) => {
      const abbr = teamCode((team.team || {}).abbreviation || "");
      (team.statistics || []).forEach((grp) => {
        const labels = (grp.labels || grp.names || []).map((l) => String(l).toUpperCase());
        (grp.athletes || []).forEach((a) => {
          const ath = a.athlete || {};
          const stats = a.stats || [];
          const rec = {};
          labels.forEach((l, i) => { rec[l] = stats[i]; });
          const n = (k) => { const v = parseInt(rec[k], 10); return Number.isNaN(v) ? 0 : v; };
          const [fgm, fga] = madeAtt(rec.FG);
          const [ftm, fta] = madeAtt(rec.FT);
          const dnp = !!a.didNotPlay || !stats.length || n("MIN") === 0 && fga === 0 && n("PTS") === 0 && n("REB") === 0;
          const s = { pts: n("PTS"), reb: n("REB"), ast: n("AST"), stl: n("STL"), blk: n("BLK"), to: n("TO") };
          const sc = s.pts + s.reb + s.ast + 2 * s.stl + 2 * s.blk - s.to - (fga - fgm) - (fta - ftm);
          rows.push({ id: String(ath.id || ""), name: ath.displayName || ath.shortName || "", short: ath.shortName || ath.displayName || "",
            team: abbr, min: n("MIN"), dnp, sc: dnp ? 0 : sc, ...s, reason: a.reason || "" });
        });
      });
    });
    return rows;
  }

  async function getJson(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`ESPN ${res.status}`);
    return res.json();
  }

  async function loadFixtures() {
    // The Live view always follows the live round, even when another round's snapshot is on screen
    try {
      const url = (typeof DATA_URL !== "undefined") ? DATA_URL : "supercoach_data.json";
      const data = await getJson(`${url}?cb=${Date.now()}`);
      live.round = Number(data.round) || null;
      live.fixtures = ((data.fixtures || {})[String(data.round)] || []).map((g) => ({ ...g, ms: new Date(g.t).getTime() }));
    } catch (err) {
      live.fixtures = [];
    }
  }

  const ymd = (ms) => {
    // ESPN's scoreboard dates are US Eastern; step back 5 h from UTC so evening tips land on the right day
    const d = new Date(ms - 5 * 3600000);
    return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  };

  async function refreshBoard() {
    if (!live.fixtures.length) return;
    // ESPN only takes one date per request: ask for each round day, and skip days whose games are all final
    const days = [...new Set(live.fixtures.map((f) => ymd(f.ms)))];
    live.days = live.days || {};
    await Promise.all(days.map(async (d) => {
      const prev = live.days[d];
      if (prev && prev.length && prev.every((ev) => ((ev.competitions || [])[0] || {}).status?.type?.completed)) return;
      const board = await getJson(`${ESPN}/scoreboard?dates=${d}`);
      live.days[d] = board.events || [];
    }));
    const raw = days.flatMap((d) => live.days[d] || []);
    const events = raw.map((ev) => {
      const comp = (ev.competitions || [])[0] || {};
      const st = (comp.status || ev.status || {});
      const by = {};
      (comp.competitors || []).forEach((c) => { by[c.homeAway] = c; });
      const code = (c) => teamCode(((c || {}).team || {}).abbreviation || "");
      return {
        id: ev.id, ms: new Date(ev.date).getTime(),
        home: code(by.home), away: code(by.away),
        homeScore: by.home ? Number(by.home.score) : null, awayScore: by.away ? Number(by.away.score) : null,
        homeLogo: by.home && by.home.team ? by.home.team.logo : "", awayLogo: by.away && by.away.team ? by.away.team.logo : "",
        state: (st.type || {}).state || "pre", detail: (st.type || {}).shortDetail || "", period: st.period || 0, clock: st.displayClock || "",
        completed: !!(st.type || {}).completed,
      };
    });
    live.games = live.fixtures.map((f, i) => {
      const teams = new Set([f.home, f.away]);
      const ev = events.find((e) => Math.abs(e.ms - f.ms) < 4 * 3600000 && (teams.has(e.home) || teams.has(e.away)));
      return { key: ev ? ev.id : `f${i}`, eventId: ev ? ev.id : null, t: f.t, ms: f.ms, home: f.home, away: f.away,
        state: ev ? ev.state : "pre", detail: ev ? ev.detail : "", period: ev ? ev.period : 0, clock: ev ? ev.clock : "",
        homeScore: ev ? ev.homeScore : null, awayScore: ev ? ev.awayScore : null, homeLogo: ev ? ev.homeLogo : "", awayLogo: ev ? ev.awayLogo : "",
        completed: ev ? ev.completed : false };
    });
  }

  async function refreshBoxes(onlyLive) {
    const want = live.games.filter((g) => g.eventId && g.state !== "pre" && (!onlyLive || g.state === "in"));
    const todo = want.filter((g) => !(g.completed && live.cache[g.eventId]));
    want.forEach((g) => { if (g.completed && live.cache[g.eventId]) live.box[g.eventId] = live.cache[g.eventId]; });
    let i = 0;
    const worker = async () => {
      while (i < todo.length) {
        const g = todo[i++];
        try {
          const rows = parseSummary(await getJson(`${ESPN}/summary?event=${g.eventId}`));
          if (rows.length) {
            live.box[g.eventId] = rows;
            if (g.completed) live.cache[g.eventId] = rows;
          }
        } catch (err) { /* keep the last good copy */ }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    // Keep only this round's finished games in the cache
    const keep = {};
    live.games.forEach((g) => { if (g.eventId && live.cache[g.eventId]) keep[g.eventId] = live.cache[g.eventId]; });
    live.cache = keep;
    store.save(keep);
  }

  async function refreshAll(boxesOnlyLive) {
    if (live.loading) return;
    live.loading = true;
    try {
      if (!live.fixtures.length) await loadFixtures();
      await refreshBoard();
      await refreshBoxes(boxesOnlyLive);
      live.lastFetch = Date.now();
      live.error = null;
    } catch (err) {
      live.error = "Couldn't reach ESPN's live scores. Retrying shortly.";
    }
    live.loading = false;
    schedule();
    updateNav();
    if (isOpen()) render();
  }

  // Poll only while it helps: fast while games are live, slow (or until the next tip-off) otherwise
  function schedule() {
    clearTimeout(live.timers.board);
    clearTimeout(live.timers.box);
    if (document.hidden) return;
    const now = Date.now();
    const anyLive = live.games.some((g) => g.state === "in");
    const nextTip = live.games.filter((g) => g.state === "pre" && g.ms > now - 3600000).map((g) => g.ms).sort((a, b) => a - b)[0];
    let wait = POLL_IDLE_MS;
    if (anyLive || (nextTip && nextTip - now < 15 * 60000)) wait = POLL_BOARD_MS;
    else if (nextTip) wait = Math.min(POLL_IDLE_MS * 3, Math.max(POLL_BOARD_MS, nextTip - now - 5 * 60000));
    if (live.error) wait = POLL_BOARD_MS;
    live.timers.board = setTimeout(() => refreshAll(false), wait);
    if (anyLive && isOpen()) {
      live.timers.box = setTimeout(async () => {
        await refreshBoxes(true);
        live.lastFetch = Date.now();
        if (isOpen()) render();
        schedule();
      }, POLL_LIVE_MS);
    }
  }

  /* ---------- Joining ESPN players to SuperCoach players ---------- */

  const normName = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv)\b\.?/g, "").replace(/[^a-z]/g, "");

  function playerIndex(state) {
    const byEspn = {}, byName = {};
    Object.values(state.computedById || {}).forEach((p) => {
      const m = /\/full\/(\d+)\.png/.exec(p.photo || "");
      if (m) byEspn[m[1]] = p;
      byName[`${normName(p.name)}|${p.team}`] = p;
      if (!byName[normName(p.name)]) byName[normName(p.name)] = p;
    });
    return (row) => byEspn[row.id] || byName[`${normName(row.name)}|${row.team}`] || byName[normName(row.name)] || null;
  }

  // Everything the views need, built from the latest box scores
  function compute(state) {
    const find = playerIndex(state);
    const perPlayer = {};   // SC id -> {sc, played, lines: [{game, row}]}
    const perEvent = {};    // eventId -> rows with .p (SC player or null)
    live.games.forEach((g) => {
      const rows = g.eventId ? live.box[g.eventId] : null;
      if (!rows) return;
      perEvent[g.eventId] = rows.map((r) => {
        const p = find(r);
        if (p) {
          const e = perPlayer[p.id] || (perPlayer[p.id] = { sc: 0, played: 0, lines: [] });
          e.lines.push({ game: g, row: r });
          if (!r.dnp) { e.sc += r.sc; e.played += 1; }
        }
        return { ...r, p };
      });
    });
    // Finished games: use SuperCoach's official total once our data sync has caught up with them
    // (same number of finished games), plus our live score for any game in progress.
    Object.entries(perPlayer).forEach(([id, e]) => {
      const p = state.computedById[id];
      if (!p || !p.scRoundGames) return;
      const done = e.lines.filter((l) => l.game.state === "post" && !l.row.dnp);
      const inPlay = e.lines.filter((l) => l.game.state !== "post" && !l.row.dnp);
      if (done.length && p.scRoundGames === done.length) {
        e.ourSc = e.sc;
        e.sc = p.scRoundPoints + inPlay.reduce((s, l) => s + l.row.sc, 0);
        e.official = true;
      }
    });
    return { perPlayer, perEvent };
  }

  const teamGames = (team) => live.games.filter((g) => g.home === team || g.away === team);

  function playerStatus(p, perPlayer) {
    const tg = teamGames(p.team);
    const e = perPlayer[p.id] || { sc: 0, played: 0, lines: [] };
    const now = tg.find((g) => g.state === "in");
    const left = tg.filter((g) => g.state === "pre");
    const nowLine = now ? e.lines.find((l) => l.game.key === now.key) : null;
    const ppg = (p.proj && (p.expGames || p.games)) ? p.proj / (p.expGames || p.games) : 0;
    // Projected finish: what he has + the rest of tonight's game + his remaining games
    let rest = left.length * ppg;
    if (now) {
      const elapsed = Math.min(48, (Math.min(now.period, 4) - 1) * 12 + (12 - clockMins(now.clock)));
      rest += ppg * Math.max(0, (48 - elapsed) / 48);
    }
    const pips = tg.map((g) => {
      const l = e.lines.find((x) => x.game.key === g.key);
      if (g.state === "in") return "now";
      if (g.state === "post") return l && !l.row.dnp ? "done" : "dnp";
      return "";
    });
    return { sc: e.sc, official: !!e.official, played: e.played, total: tg.length, left: left.length, now, nowLine, next: left[0] || null, finish: Math.round(e.sc + rest), pips, lines: e.lines };
  }

  function clockMins(c) {
    const m = /^(\d+):(\d+)/.exec(String(c || ""));
    return m ? Number(m[1]) + Number(m[2]) / 60 : 0;
  }

  /* ---------- Formatting ---------- */

  const dayFmt = (ms) => new Date(ms).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  const timeFmt = (ms) => new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const shortName = (n) => { const parts = String(n).split(" "); return parts.length > 1 ? `${parts[0][0]}. ${parts.slice(1).join(" ")}` : n; };
  const statLine = (r) => {
    const bits = [`${r.pts} pts`, `${r.reb} reb`, `${r.ast} ast`];
    if (r.stl) bits.push(`${r.stl} stl`);
    if (r.blk) bits.push(`${r.blk} blk`);
    if (r.to) bits.push(`${r.to} to`);
    return bits.join(" · ");
  };
  const gameStatus = (g) => {
    if (g.state === "in") return `<span class="live"><span class="lv-dot pulse"></span>${esc(g.detail || "Live")}</span>`;
    if (g.state === "post") return esc(g.detail || "Final");
    return esc(timeFmt(g.ms));
  };
  const esc = (s) => window.SCHOOPS.escapeHtml(String(s ?? ""));

  /* ---------- Views ---------- */

  function lineup(state, squad) {
    const solver = window.SCHOOPS_SOLVER;
    if (!solver || !squad.length) return null;
    const byId = {};
    squad.forEach((p) => { byId[p.id] = p; });
    let slots = (state.court && state.court.slots) || {};
    let cap = state.court && state.court.captainId, vc = state.court && state.court.viceCaptainId;
    const filled = solver.STARTER_SLOTS.filter((s) => slots[s.key] && byId[slots[s.key]]).length;
    if (filled < 5) { const sol = solver.solveOptimalLineup(squad, {}); if (!sol) return null; slots = sol.slots; cap = sol.captainId; vc = sol.viceCaptainId; }
    const ev = solver.evaluateLineup(slots, byId, cap, vc);
    return { ev, fromCourt: filled >= 5 };
  }

  function renderMyTeam(state, perPlayer) {
    const squad = Object.values(state.computedById).filter((p) => p.inSquad);
    if (!squad.length) {
      return `<section class="lv-card"><div class="lv-card-head"><div><div class="lv-card-title">My team</div></div></div>
        <div class="lv-empty">Add your players and this panel follows them live: each one's score so far, games left and your team total against the projection.<br>
        <button type="button" class="lv-btn" data-lv-go="court">Add my players</button></div></section>`;
    }
    const lu = lineup(state, squad);
    if (!lu) return "";
    const { ev } = lu;
    const st = {};
    [...ev.starters, ...ev.bench].forEach((p) => { st[p.id] = playerStatus(p, perPlayer); });
    // Captain counts double; if he doesn't play at all this round, the vice-captain doubles instead
    let cap = ev.captain;
    const capOut = cap && st[cap.id] && st[cap.id].played === 0 && st[cap.id].left === 0 && !st[cap.id].now;
    if (capOut && ev.viceCaptain) cap = ev.viceCaptain;
    const total = (key) => {
      const vals = ev.starters.map((p) => ({ p, v: st[p.id][key] }));
      let drop = null;
      if (vals.length === 10) drop = vals.filter((x) => !cap || x.p.id !== cap.id).sort((a, b) => a.v - b.v)[0];
      const sum = vals.reduce((s, x) => s + (drop && x.p.id === drop.p.id ? 0 : x.v), 0) + (cap ? st[cap.id][key] : 0);
      return { sum: Math.round(sum), drop: drop ? drop.p.id : null };
    };
    const soFar = total("sc");
    const finish = total("finish");
    const proj = ev.totalProj;
    const diff = finish.sum - proj;
    const doneGames = ev.starters.reduce((s, p) => s + (st[p.id].total - st[p.id].left - (st[p.id].now ? 1 : 0)), 0);
    const allGames = ev.starters.reduce((s, p) => s + st[p.id].total, 0) || 1;
    const liveNow = ev.starters.filter((p) => st[p.id].now).length;

    const row = (p, isBench) => {
      const s = st[p.id];
      const pill = cap && p.id === cap.id ? `<span class="lv-pill c">C ×2</span>`
        : (ev.viceCaptain && p.id === ev.viceCaptain.id && !capOut ? `<span class="lv-pill vc">VC</span>` : "");
      const dropPill = !isBench && finish.drop === p.id && ev.starters.length === 10 ? `<span class="lv-pill drop" title="Your lowest starter doesn't count (best 9 of 10)">lowest</span>` : "";
      let line;
      if (s.now && s.nowLine && !s.nowLine.row.dnp) line = `<span class="live">${esc(s.now.detail)}</span> · ${esc(statLine(s.nowLine.row))}`;
      else if (s.now) line = `<span class="live">${esc(s.now.detail)}</span> · not on court yet`;
      else if (s.next) line = `Next: ${esc(dayFmt(s.next.ms).split(",")[0])} ${esc(timeFmt(s.next.ms))} ${s.next.home === p.team ? "vs" : "@"} ${esc(s.next.home === p.team ? s.next.away : s.next.home)}`;
      else if (s.total) line = `Done · ${s.played} of ${s.total} game${s.total === 1 ? "" : "s"} played`;
      else line = "No games this round";
      if (p.injuryStatus && !s.now && s.left) line = `${esc(String(p.injuryStatus))} · ${line}`;
      const prev = live.prevScores[p.id];
      const flash = prev !== undefined && prev !== s.sc ? "lv-flash" : "";
      live.prevScores[p.id] = s.sc;
      const title = `${p.name}: ${s.sc} so far from ${s.played} game${s.played === 1 ? "" : "s"}${s.official ? " (SuperCoach's official score for finished games)" : " (live, may differ from SuperCoach by a point or two until they update)"}, ${s.left} left. Projected finish ${s.finish} (pre-round projection ${p.proj}).`;
      return `<button type="button" class="lv-row ${isBench ? "bench" : ""} ${s.now ? "is-live" : ""} ${dropPill ? "dropped" : ""}" data-lv-player="${esc(p.id)}" title="${esc(title)}">
        ${window.SCHOOPS.renderAvatar(p, 36)}
        <span style="min-width:0"><span class="lv-name"><span>${esc(p.name)}</span>${pill}${dropPill}</span><span class="lv-line">${line}</span></span>
        <span class="lv-pips" aria-hidden="true">${s.pips.map((c) => `<i class="lv-pip ${c}"></i>`).join("")}</span>
        <span class="lv-pts ${flash}"><b>${s.sc}</b><small>→ ${s.finish}</small></span>
      </button>`;
    };
    const order = (arr) => [...arr].sort((a, b) => (st[b.id].now ? 1 : 0) - (st[a.id].now ? 1 : 0) || st[b.id].sc - st[a.id].sc);
    return `<section class="lv-card" aria-label="My team live">
      <div class="lv-card-head"><div><div class="lv-card-title">My team</div>
        <div class="lv-card-sub">${lu.fromCourt ? "Your starting 10 from My Court" : "Best lineup from your squad (set it in My Court)"} · best 9 of 10 + captain ×2</div></div>
        ${liveNow ? `<span class="lv-card-sub" style="display:inline-flex;align-items:center;gap:6px;color:var(--neg-soft)"><span class="lv-dot pulse"></span>${liveNow} on court</span>` : ""}
      </div>
      <div class="lv-sum">
        <div><div class="lv-sum-l">Scored so far</div><div class="lv-sum-v">${soFar.sum}</div>
          <div class="lv-prog" title="${doneGames} of ${allGames} starter games played"><i style="transform:scaleX(${(doneGames / allGames).toFixed(3)})"></i></div></div>
        <div><div class="lv-sum-l">Projected finish</div><div class="lv-sum-v">${finish.sum}<small class="${diff >= 0 ? "pos-text" : "neg-text"}">${diff >= 0 ? "+" : "−"}${Math.abs(diff)}</small></div></div>
        <div><div class="lv-sum-l">Pre-round projection</div><div class="lv-sum-v" style="color:var(--text-secondary)">${proj}</div></div>
      </div>
      <div class="lv-sec">Starters <span>so far → projected finish</span></div>
      ${order(ev.starters).map((p) => row(p, false)).join("")}
      ${ev.bench.length ? `<div class="lv-sec">Bench <span>doesn't count</span></div>${order(ev.bench).map((p) => row(p, true)).join("")}` : ""}
    </section>`;
  }

  function renderStrip(perEvent, squadIds) {
    if (!live.games.length) return "";
    const days = [];
    live.games.forEach((g) => {
      const d = dayFmt(g.ms);
      let day = days.find((x) => x.d === d);
      if (!day) { day = { d, games: [] }; days.push(day); }
      day.games.push(g);
    });
    const card = (g) => {
      const rows = perEvent[g.eventId] || [];
      const mine = Object.values(window.SCHOOPS.getState().computedById).filter((p) => squadIds[p.id] && (p.team === g.home || p.team === g.away)).length;
      const hs = g.homeScore, as = g.awayScore, hasScore = g.state !== "pre" && hs !== null;
      const team = (code, logo, score, other) => `<div class="lv-g-team ${g.state === "post" && score < other ? "lose" : ""}">
        ${logo ? `<img src="${esc(logo)}" alt="" loading="lazy" />` : ""}<span>${esc(code)}</span>${hasScore ? `<span class="sc">${score}</span>` : ""}</div>`;
      return `<button type="button" class="lv-game ${live.selected === g.key ? "sel" : ""}" data-lv-game="${esc(g.key)}" aria-pressed="${live.selected === g.key}" ${rows.length ? "" : ""}>
        <div class="lv-g-status">${gameStatus(g)}${mine ? `<span class="mine" title="Your players in this game">${mine} yours</span>` : ""}</div>
        ${team(g.away, g.awayLogo, as, hs)}${team(g.home, g.homeLogo, hs, as)}
      </button>`;
    };
    return `<div class="lv-strip-wrap"><div class="lv-strip" id="lvStrip">${days.map((day) => `<div class="lv-day"><div class="lv-day-label">${esc(day.d)}</div><div class="lv-day-games">${day.games.map(card).join("")}</div></div>`).join("")}</div></div>`;
  }

  function renderGame(state, perEvent) {
    const g = live.games.find((x) => x.key === live.selected);
    if (!g) return "";
    const rows = perEvent[g.eventId] || [];
    const col = (code, logo) => {
      let list = rows.filter((r) => r.team === code);
      if (!list.length) {
        // Before tip-off: the SuperCoach players on this team, with their per-game projection
        const sc = Object.values(state.computedById).filter((p) => p.team === code && !p.isInactive && (p.proj || 0) > 0)
          .sort((a, b) => b.proj / (b.games || 1) - a.proj / (a.games || 1)).slice(0, 12);
        return `<div><div class="lv-gv-h"><span>${esc(code)}</span><span>proj / game</span></div>
          ${sc.map((p) => `<button type="button" class="lv-prow ${p.inSquad ? "mine" : ""}" data-lv-player="${esc(p.id)}"><span class="nm"><span>${esc(shortName(p.name))}</span>${p.inSquad ? `<span class="lv-sq">YOURS</span>` : ""}</span><span class="v" style="color:var(--text-secondary);font-weight:500">${Math.round(p.proj / ((p.expGames || p.games) || 1))}</span></button>`).join("") || `<div class="lv-pre">No players listed.</div>`}</div>`;
      }
      list = [...list].sort((a, b) => (a.dnp - b.dnp) || (b.sc - a.sc));
      return `<div><div class="lv-gv-h"><span>${esc(code)}</span><span>min · SC</span></div>
        ${list.map((r) => {
          const mine = r.p && r.p.inSquad;
          const attrs = r.p ? `data-lv-player="${esc(r.p.id)}"` : "";
          const title = r.dnp ? `${r.name}: did not play${r.reason ? ` (${r.reason})` : ""}` : `${r.name}: ${statLine(r)} in ${r.min} min = ${r.sc} SC`;
          return `<button type="button" class="lv-prow ${mine ? "mine" : ""} ${r.dnp ? "dnp" : ""}" ${attrs} title="${esc(title)}">
            <span class="nm"><span>${esc(shortName(r.name))}</span>${mine ? `<span class="lv-sq">YOURS</span>` : ""}</span>
            <span><span class="min">${r.dnp ? "DNP" : r.min}</span><span class="v">${r.dnp ? "—" : r.sc}</span></span></button>`;
        }).join("")}</div>`;
    };
    const sum = (code) => rows.filter((r) => r.team === code).reduce((s, r) => s + r.sc, 0);
    const side = (code, logo, score, right) => `<div class="lv-gv-team ${right ? "r" : ""}">
      ${right ? "" : (logo ? `<img src="${esc(logo)}" alt="" />` : "")}
      <div><b>${g.state === "pre" || score === null ? esc(code) : score}</b><br><span>${g.state === "pre" ? "" : `${esc(code)} · ${sum(code)} SC`}</span></div>
      ${right ? (logo ? `<img src="${esc(logo)}" alt="" />` : "") : ""}</div>`;
    return `<section class="lv-card" aria-label="Game">
      <div class="lv-gv-score">
        ${side(g.away, g.awayLogo, g.awayScore, false)}
        <div class="lv-gv-mid">${g.state === "pre" ? `${esc(dayFmt(g.ms))}<br>${esc(timeFmt(g.ms))}` : gameStatus(g)}</div>
        ${side(g.home, g.homeLogo, g.homeScore, true)}
      </div>
      <div class="lv-gv-cols">${col(g.away, g.awayLogo)}${col(g.home, g.homeLogo)}</div>
    </section>`;
  }

  function renderTop(state, perPlayer) {
    const list = Object.entries(perPlayer).map(([id, e]) => ({ p: state.computedById[id], e })).filter((x) => x.p && x.e.played)
      .sort((a, b) => b.e.sc - a.e.sc).slice(0, 10);
    return `<section class="lv-card lv-top" aria-label="Top scorers">
      <div class="lv-card-head"><div><div class="lv-card-title">Top scorers this round</div><div class="lv-card-sub">Live round totals</div></div></div>
      ${list.length ? list.map((x, i) => `<button type="button" class="lv-prow ${x.p.inSquad ? "mine" : ""}" data-lv-player="${esc(x.p.id)}" title="${esc(`${x.p.name}: ${x.e.sc} from ${x.e.played} game${x.e.played === 1 ? "" : "s"}${x.e.official ? " (official)" : " (live)"}`)}">
          <span class="lv-rank">${i + 1}</span>${window.SCHOOPS.renderAvatar(x.p, 26)}
          <span class="nm"><span>${esc(x.p.name)}</span>${x.p.inSquad ? `<span class="lv-sq">YOURS</span>` : ""}</span>
          <span><span class="min">${x.e.played}g</span><span class="v">${x.e.sc}</span></span></button>`).join("")
        : `<div class="lv-pre">No games played yet this round.</div>`}
    </section>`;
  }

  function pickDefaultGame() {
    if (live.selected && live.games.some((g) => g.key === live.selected)) return;
    const liveG = live.games.find((g) => g.state === "in");
    const done = live.games.filter((g) => g.state === "post");
    const next = live.games.find((g) => g.state === "pre");
    const g = liveG || done[done.length - 1] || next;
    live.selected = g ? g.key : null;
  }

  function render() {
    const root = document.getElementById("liveViewRoot");
    if (!root || !window.SCHOOPS) return;
    const state = window.SCHOOPS.getState();
    if (!isOpen()) { root.style.display = "none"; live.wasOpen = false; return; }
    root.style.display = "block";
    syncHeader(state);
    if (!live.started) { start(); }
    else if (!live.wasOpen) schedule(); // just opened: start the 30-second box-score polling if games are live
    live.wasOpen = true;
    if (!live.games.length) {
      root.innerHTML = `<div class="lv">${live.error ? `<div class="lv-err">${esc(live.error)}</div>` : ""}
        <div class="lv-card"><div class="lv-empty">${live.loading || !live.lastFetch ? "Loading this round's games…" : "No fixture list for this round yet. It arrives with the next data refresh."}</div></div></div>`;
      return;
    }
    pickDefaultGame();
    const { perPlayer, perEvent } = compute(state);
    const stripEl = document.getElementById("lvStrip");
    const scrollX = stripEl ? stripEl.scrollLeft : null;
    const ago = live.lastFetch ? Math.max(0, Math.round((Date.now() - live.lastFetch) / 1000)) : null;
    root.innerHTML = `<div class="lv">
      ${live.error ? `<div class="lv-err">${esc(live.error)}</div>` : ""}
      ${renderStrip(perEvent, state.squadIds || {})}
      <div class="lv-grid">
        ${renderMyTeam(state, perPlayer)}
        <div class="lv-side">${renderGame(state, perEvent)}${renderTop(state, perPlayer)}</div>
      </div>
      <div class="lv-foot">
        <p>Live scores are worked out from ESPN box scores with SuperCoach's scoring formula, so during a game they can be a point or two off SuperCoach's. Once SuperCoach publishes a finished game, its official score replaces ours.</p>
        <span style="display:inline-flex;align-items:center;gap:10px">${ago !== null ? `<span id="lvAgo">Updated ${ago < 60 ? `${ago}s` : `${Math.round(ago / 60)}m`} ago</span>` : ""}<button type="button" class="lv-btn" data-lv-refresh>Refresh</button></span>
      </div>
    </div>`;
    const strip = document.getElementById("lvStrip");
    if (strip) {
      if (scrollX !== null) strip.scrollLeft = scrollX;
      else {
        // First paint: bring the selected game into view
        const sel = strip.querySelector(".lv-game.sel");
        if (sel) strip.scrollLeft = Math.max(0, sel.offsetLeft - strip.offsetLeft - sel.offsetWidth - 20);
      }
    }
  }

  function syncHeader(state) {
    const crumb = document.getElementById("vhCrumb");
    const count = document.getElementById("vhCount");
    if (crumb) crumb.textContent = "Live";
    const n = live.games.filter((g) => g.state === "in").length;
    if (count) count.textContent = `Round ${live.round || state.liveRound || state.round}${n ? ` · ${n} live` : ""}`;
    const mkt = document.getElementById("marketHeaderControls");
    const mod = document.getElementById("moduleHeaderActions");
    if (mkt) mkt.style.display = "none";
    if (mod) mod.style.display = "none";
  }

  function updateNav() {
    const n = live.games.filter((g) => g.state === "in").length;
    const btn = document.querySelector('.sb-item[data-nav="live"]');
    if (btn) btn.classList.toggle("has-live", n > 0);
    const cnt = document.getElementById("sbLiveCount");
    if (cnt) cnt.textContent = n ? `${n} live` : "";
    if (isOpen()) syncHeader(window.SCHOOPS.getState());
  }

  const isOpen = () => window.SCHOOPS && window.SCHOOPS.getState().activeNav === "live";

  function start() {
    live.started = true;
    refreshAll(false);
  }

  function init() {
    if (!window.SCHOOPS) return;
    injectStyles();
    live.cache = store.load();
    const tl = document.getElementById("tradeLabViewRoot");
    const root = document.createElement("div");
    root.id = "liveViewRoot";
    root.className = "view-body";
    root.style.display = "none";
    if (tl) tl.insertAdjacentElement("afterend", root);
    if (typeof TAB_GUIDES !== "undefined") {
      TAB_GUIDES.live = {
        title: "How Live works",
        bullets: [
          "Live SuperCoach scores for this round, from ESPN box scores, refreshed every 30 seconds while games are on.",
          "<strong>My team</strong> adds up your starting 10 the SuperCoach way: best 9 of 10 count and your captain scores double.",
          "<strong>Projected finish</strong> = points so far + the rest of tonight's game + his remaining games at his projected points per game.",
          "Tap a game for both teams' players. Your players are highlighted. Live scores can be a point or two off until SuperCoach publishes them; finished games then show SuperCoach's official score."
        ]
      };
    }
    root.addEventListener("click", (e) => {
      const g = e.target.closest("[data-lv-game]");
      if (g) { live.selected = g.dataset.lvGame; render(); return; }
      if (e.target.closest("[data-lv-refresh]")) { refreshAll(false); return; }
      if (e.target.closest('[data-lv-go="court"]')) { window.SCHOOPS.setActiveNav("court"); return; }
      const p = e.target.closest("[data-lv-player]");
      if (p) window.SCHOOPS.openInspector(p.dataset.lvPlayer);
    });
    document.addEventListener("visibilitychange", () => { if (!document.hidden && live.started) refreshAll(false); else schedule(); });
    // Keep "Updated Ns ago" honest without re-rendering everything
    setInterval(() => {
      const el = document.getElementById("lvAgo");
      if (el && live.lastFetch) { const s = Math.round((Date.now() - live.lastFetch) / 1000); el.textContent = `Updated ${s < 60 ? `${s}s` : `${Math.round(s / 60)}m`} ago`; }
    }, 5000);
    window.SCHOOPS.onRender(render);
    // Check the scoreboard in the background too, so the sidebar shows a live dot when games are on
    setTimeout(() => { if (!live.started) start(); }, 1500);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
