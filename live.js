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
  const OFFICIAL_AFTER_TIP_MS = 3.5 * 3600000; // SuperCoach totals only count as final this long after the last tip-off (covers overtime + their update lag)
  // ESPN team codes -> SuperCoach team codes
  const TEAM_FIX = { GS: "GSW", NO: "NOP", NY: "NYK", SA: "SAS", UTAH: "UTA", WSH: "WAS" };
  const teamCode = (abbr) => TEAM_FIX[abbr] || abbr;

  const live = {
    round: null,
    fixtures: [],          // [{t, home, away}] from our data
    games: [],             // fixtures matched to ESPN: {key, t, home, away, eventId, state, detail, period, clock, homeScore, awayScore, logos}
    box: {},               // eventId -> [rows]
    plays: {},             // eventId -> [{q, clock, text, ev: [{id, v}]}] scoring-relevant plays (not cached)
    playsPending: {},
    feedQ: null,           // quarter shown in the play feed (null = latest)
    feedMine: false,       // play feed: only your players
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

      /* Layout: My team + Top scorers side by side, game centre full width below */
      /* Phones / narrow: My team, game, top scorers stacked. Wide: My team + top scorers on the left, game on the right */
      .lv-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 14px; align-items: start; }
      @media (min-width: 1300px) {
        .lv-grid { grid-template-columns: minmax(400px, 0.8fr) minmax(0, 1.5fr); grid-template-areas: "team game" "top game"; }
        .lv-grid > .lv-myteam { grid-area: team; }
        .lv-grid > .lv-gc { grid-area: game; }
        .lv-grid > .lv-top { grid-area: top; }
      }

      /* Game centre sizes itself to its own width (container query), not the screen's */
      .lv-gc { container-type: inline-size; }
      .lv-gc-body { display: grid; grid-template-columns: minmax(0, 1fr); }
      .lv-boxes { display: grid; grid-template-columns: minmax(0, 1fr); min-width: 0; align-content: start; }
      .lv-boxes > .lv-box + .lv-box { border-top: 1px solid var(--border-subtle); }
      @container (min-width: 980px) {
        .lv-boxes { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .lv-boxes > .lv-box + .lv-box { border-top: none; border-left: 1px solid var(--border-subtle); }
      }
      .lv-box { min-width: 0; }
      .lv-box-h { display: flex; align-items: center; gap: 8px; padding: 10px 12px 6px; font-size: 12.5px; font-weight: 600; }
      .lv-box-h img { width: 18px; height: 18px; object-fit: contain; }
      .lv-box-h .dim-text { margin-left: auto; font-family: var(--mono); font-weight: 500; font-size: 11.5px; }
      .lv-box-scroll { overflow-x: auto; overscroll-behavior-x: contain; }
      .lv-bt { width: 100%; border-collapse: collapse; font-size: 12px; font-variant-numeric: tabular-nums; }
      .lv-bt th { padding: 5px 6px; font-size: 10.5px; font-weight: 500; color: var(--text-tertiary); text-align: right; white-space: nowrap; border-bottom: 1px solid var(--border-subtle); }
      .lv-bt td { padding: 4px 6px; text-align: right; font-family: var(--mono); color: var(--text-secondary); white-space: nowrap; border-top: 1px solid rgba(255, 255, 255, 0.03); }
      .lv-bt .pl { text-align: left; font-family: var(--sans); padding-left: 12px; }
      .lv-bt td.pl { color: var(--text-primary); font-size: 12.5px; }
      .lv-bt td.pl > * { vertical-align: middle; }
      .lv-bt td.pl .sc-avatar { display: inline-flex; margin-right: 7px; }
      .lv-bt td.pl .nm { display: inline-block; max-width: 150px; overflow: hidden; text-overflow: ellipsis; }
      .lv-bt td.pl .lv-sq { margin-left: 6px; }
      .lv-bt .scv { color: var(--text-primary); font-weight: 700; font-size: 13px; background: rgba(110, 123, 242, 0.07); }
      .lv-bt th.scv { color: #A5AEFF; font-weight: 600; }
      .lv-bt td.scv.neg { color: var(--neg-soft); }
      .lv-bt .sh { color: var(--text-tertiary); }
      .lv-bt tr[data-lv-player] { cursor: pointer; }
      @media (hover: hover) { .lv-bt tbody tr[data-lv-player]:hover td { background-color: var(--bg-hover); } }
      .lv-bt tr.mine td { background-color: rgba(110, 123, 242, 0.08); }
      .lv-bt tr.mine td.pl { box-shadow: inset 2px 0 0 var(--accent); }
      .lv-bt tr.dnp td { color: var(--text-tertiary); }
      .lv-bt td.why { text-align: left; font-family: var(--sans); font-size: 11px; }
      .lv-bt td.why .lv-wait { color: var(--text-tertiary); opacity: 0.85; }
      .lv-bt tr:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }

      /* SC feed */
      .lv-feed { border-top: 1px solid var(--border-subtle); min-width: 0; display: flex; flex-direction: column; }
      .lv-feed-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; padding: 12px 14px 10px; border-bottom: 1px solid var(--border-subtle); }
      .lv-feed-ctrls { display: flex; align-items: center; gap: 8px; }
      .lv-seg { display: inline-grid; grid-auto-flow: column; gap: 2px; padding: 2px; border-radius: 7px; background: var(--bg-input); border: 1px solid var(--border-subtle); }
      .lv-seg button { height: 24px; min-width: 34px; padding: 0 8px; border: none; border-radius: 5px; background: transparent; color: var(--text-tertiary); font-size: 11.5px; font-weight: 600; cursor: pointer; transition: color 120ms ease, background-color 120ms ease; }
      .lv-seg button.on { background: var(--bg-active); color: var(--text-primary); }
      @media (hover: hover) { .lv-seg button:hover:not(.on) { color: var(--text-secondary); } }
      .lv-chip { height: 28px; padding: 0 10px; border-radius: 999px; border: 1px solid var(--border-default); background: transparent; color: var(--text-secondary); font-size: 11.5px; font-weight: 500; cursor: pointer; white-space: nowrap; transition: color 120ms ease, background-color 120ms ease, border-color 120ms ease; }
      .lv-chip.on { background: var(--accent-soft); border-color: rgba(110, 123, 242, 0.5); color: #C7CCFF; }
      .lv-seg button:focus-visible, .lv-chip:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
      .lv-qdot { display: inline-block; width: 6px; height: 6px; margin-right: 5px; border-radius: 50%; background: var(--neg); vertical-align: 1px; }
      .lv-qhead { position: sticky; top: 0; z-index: 1; padding: 6px 14px; font-size: 11px; font-weight: 700; letter-spacing: 0.04em; color: var(--text-secondary); background: #141419; border-top: 1px solid var(--border-subtle); border-bottom: 1px solid var(--border-subtle); }
      .lv-qlive { margin-left: 6px; padding: 1px 6px; border-radius: 4px; background: var(--neg-bg); color: var(--neg-soft); font-size: 10px; text-transform: uppercase; }
      .lv-follow { display: flex; align-items: center; gap: 7px; padding: 7px 14px; font-size: 11.5px; color: var(--text-tertiary); border-bottom: 1px solid rgba(255, 255, 255, 0.04); }
      .lv-follow i { width: 6px; height: 6px; border-radius: 50%; background: var(--neg); }
      @media (prefers-reduced-motion: no-preference) { .lv-follow i, .lv-qdot { animation: lvPulse 1.6s ease-in-out infinite; } }
      .lv-plays { list-style: none; margin: 0; padding: 0; max-height: 560px; overflow-y: auto; overscroll-behavior: contain; }
      .lv-play { display: grid; grid-template-columns: 40px 26px minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 7px 14px; border-top: 1px solid rgba(255, 255, 255, 0.035); }
      .lv-play:first-child { border-top: none; }
      .lv-play[data-lv-player] { cursor: pointer; }
      @media (hover: hover) { .lv-play[data-lv-player]:hover { background: var(--bg-hover); } }
      /* Your players: soft accent wash from the left, ringed photo, points in an accent pill */
      .lv-play.mine { background: linear-gradient(90deg in oklab, rgba(110, 123, 242, 0.16), rgba(110, 123, 242, 0.03) 60%); box-shadow: inset 3px 0 0 var(--accent); }
      .lv-play.main-mine .sc-avatar { box-shadow: 0 0 0 2px #0F0F12, 0 0 0 3.5px var(--accent); }
      .lv-play.mine .lv-play-t { color: #A5AEFF; }
      .lv-play-t { font-family: var(--mono); font-size: 11px; color: var(--text-tertiary); }
      .lv-play-txt { font-size: 12.5px; color: var(--text-primary); line-height: 1.4; text-wrap: pretty; min-width: 0; }
      .lv-play-ev { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; }
      .lv-ev { display: inline-flex; align-items: baseline; gap: 5px; font-family: var(--mono); font-size: 12.5px; font-weight: 700; white-space: nowrap; }
      .lv-ev small { font-family: var(--sans); font-size: 10.5px; font-weight: 500; color: var(--text-tertiary); }
      .lv-ev.pos { color: var(--pos-bright); }
      .lv-ev.neg { color: var(--neg-soft); }
      .lv-ev.mine { padding: 2px 8px 2px 7px; border-radius: 999px; background: rgba(110, 123, 242, 0.2); box-shadow: inset 0 0 0 1px rgba(110, 123, 242, 0.45); }
      .lv-ev.mine small { color: #C7CCFF; font-weight: 600; }
      .lv-pre-cols .lv-prow { grid-template-columns: 22px minmax(0, 1fr) auto; }

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
      .lv-pts.cap b { color: var(--warn-bright); }

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
        .lv-play { grid-template-columns: 34px 22px minmax(0, 1fr) auto; gap: 8px; padding: 7px 12px; }
        .lv-play-txt { font-size: 12px; }
        .lv-ev small { display: none; }
        .lv-feed-head { padding: 10px 12px; }
      }
    `;
    document.head.appendChild(style);
  }

  /* ---------- Scoring and data ---------- */

  const madeAtt = (s) => { const m = String(s || "0-0").split("-"); return [Number(m[0]) || 0, Number(m[1]) || 0]; };

  // What to say for a player with no stats. ESPN fills in "DNP · Coach's decision" for every bench player
  // from tip-off, so mid-game that only means he hasn't come on yet. Real absences (injury, illness,
  // suspension, not with team, rest) are known before the game, so those keep their reason.
  const ABSENT_RE = /injur|illness|sick|suspen|not with team|personal|rest|health|protocol|g league|two-way|inactive/i;
  function notPlayedText(r, gameState) {
    if (gameState === "post") return `DNP${r.reason ? ` · ${esc(r.reason)}` : ""}`;
    if (r.reason && ABSENT_RE.test(r.reason)) return `Out · ${esc(r.reason)}`;
    if (!r.espnDnp) return `<span class="lv-wait">No stats yet</span>`; // checked in, under a minute played
    return `<span class="lv-wait">Yet to check in</span>`;
  }

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
          // ESPN flags real no-shows with didNotPlay. An all-zero line only counts as "didn't play" for a bench
          // player ESPN doesn't list as active: at tip-off the starters are on court with nothing yet.
          const zeroLine = n("MIN") === 0 && fga === 0 && n("PTS") === 0 && n("REB") === 0;
          const dnp = !!a.didNotPlay || !stats.length || (zeroLine && !a.starter && !a.active);
          const s = { pts: n("PTS"), reb: n("REB"), ast: n("AST"), stl: n("STL"), blk: n("BLK"), to: n("TO") };
          const sc = s.pts + s.reb + s.ast + 2 * s.stl + 2 * s.blk - s.to - (fga - fgm) - (fta - ftm);
          rows.push({ id: String(ath.id || ""), name: ath.displayName || ath.shortName || "", short: ath.shortName || ath.displayName || "",
            team: abbr, min: n("MIN"), dnp, espnDnp: !!a.didNotPlay, sc: dnp ? 0 : sc, ...s, reason: a.reason || "",
            fg: `${fgm}-${fga}`, ft: `${ftm}-${fta}`, tp: String(rec["3PT"] || "0-0"), pf: n("PF"), starter: !!a.starter });
        });
      });
    });
    return rows;
  }

  // Play-by-play -> SuperCoach points per player. Same scoring as the box score (checked: 227 of 227
  // players matched across two nights): made shot +pts (+1 assist), missed shot -1 (end-of-quarter heaves
  // don't count as attempts), block +2, rebound +1, turnover -1 (steal +2). Fouls score nothing.
  function parsePlays(summary) {
    const out = [];
    ((summary && summary.plays) || []).forEach((p) => {
      const t = String((p.type && p.type.text) || "").toLowerCase();
      const txt = String(p.text || "");
      const low = txt.toLowerCase();
      const sd = String(p.shortDescription || "").toLowerCase();
      const a = (p.participants || []).map((x) => String((x.athlete && x.athlete.id) || ""));
      const ev = [];
      if (p.shootingPlay) {
        const ft = t.startsWith("free throw");
        if (p.scoringPlay) { ev.push({ id: a[0], v: Number(p.scoreValue) || 0 }); if (!ft && a[1]) ev.push({ id: a[1], v: 1, ast: true }); }
        else { if (!t.includes("heave")) ev.push({ id: a[0], v: -1 }); if (!ft && a[1] && low.includes("block")) ev.push({ id: a[1], v: 2 }); }
      } else if (t.includes("rebound")) { if (a[0]) ev.push({ id: a[0], v: 1 }); }
      else if (t.includes("turnover") || sd === "turnover" || t.includes("traveling")) {
        if (a[0]) ev.push({ id: a[0], v: -1 });
        if (a[1] && low.includes("steal")) ev.push({ id: a[1], v: 2 });
      }
      const real = ev.filter((e) => e.id && e.v);
      if (!real.length) return;
      out.push({ q: (p.period && p.period.number) || 0, clock: (p.clock && p.clock.displayValue) || "", text: txt.replace(/\s+/g, " ").trim(), ev: real, seq: Number(p.sequenceNumber) || 0 });
    });
    return out;
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
          const summary = await getJson(`${ESPN}/summary?event=${g.eventId}`);
          const rows = parseSummary(summary);
          live.plays[g.eventId] = parsePlays(summary);
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
    // Let the rest of the site (player profile) pick up new live scores
    document.dispatchEvent(new CustomEvent("schoops:live"));
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
    // Finished games: use SuperCoach's official total once our data sync has caught up with them,
    // plus our live score for any game in progress. "Caught up" means the same number of finished games
    // AND the data was saved after his last finished game was over. SuperCoach's feed updates during games,
    // so a sync that runs mid-game saves half-game scores with a matching game count (25 Nov: Lendeborg 15
    // of 23, Wembanyama, Cissoko, Acuff). Until a later sync, those games keep the ESPN box-score total.
    const savedMs = Date.parse(state.lastUpdated || "") || 0;
    Object.entries(perPlayer).forEach(([id, e]) => {
      const p = state.computedById[id];
      if (!p || !p.scRoundGames) return;
      const done = e.lines.filter((l) => l.game.state === "post" && !l.row.dnp);
      const inPlay = e.lines.filter((l) => l.game.state !== "post" && !l.row.dnp);
      const lastTip = Math.max(0, ...done.map((l) => l.game.ms || 0));
      const savedAfterFinal = savedMs > 0 && lastTip > 0 && savedMs >= lastTip + OFFICIAL_AFTER_TIP_MS;
      if (done.length && p.scRoundGames === done.length && savedAfterFinal) {
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
  // Hover box: bold heading, label/value rows, optional grey note. Returned already escaped for a data-tip attribute.
  const tipBox = (head, rows, note) => esc(`<div class="tip-h">${esc(head)}</div>${rows.filter(Boolean).map(([l, v, cls]) => `<div class="tip-row"><span>${esc(l)}</span><b class="${cls || ""}">${esc(v)}</b></div>`).join("")}${note ? `<div class="tip-dim" style="margin-top:4px">${esc(note)}</div>` : ""}`);

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
      return `<section class="lv-card lv-myteam"><div class="lv-card-head"><div><div class="lv-card-title">My team</div></div></div>
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
      const dropPill = !isBench && finish.drop === p.id && ev.starters.length === 10 ? `<span class="lv-pill drop">lowest</span>` : "";
      let line;
      if (s.now && s.nowLine && !s.nowLine.row.dnp) line = `<span class="live">${esc(s.now.detail)}</span> · ${esc(statLine(s.nowLine.row))}`;
      else if (s.now) line = `<span class="live">${esc(s.now.detail)}</span> · not on court yet`;
      else if (s.next) line = `Next: ${esc(dayFmt(s.next.ms).split(",")[0])} ${esc(timeFmt(s.next.ms))} ${s.next.home === p.team ? "vs" : "@"} ${esc(s.next.home === p.team ? s.next.away : s.next.home)}`;
      else if (s.total) line = `Done · ${s.played} of ${s.total} game${s.total === 1 ? "" : "s"} played`;
      else line = "No games this round";
      if (p.injuryStatus && !s.now && s.left) line = `${esc(String(p.injuryStatus))} · ${line}`;
      // Captain (or the VC standing in) shows his doubled score, as it counts in your total
      const isCapRow = !isBench && cap && p.id === cap.id;
      const prev = live.prevScores[p.id];
      const flash = prev !== undefined && prev !== s.sc ? "lv-flash" : "";
      live.prevScores[p.id] = s.sc;
      const mult = isCapRow ? 2 : 1;
      const tip = tipBox(`${p.name}${isCapRow ? " (captain ×2)" : ""}`, [
        ["So far", `${s.sc * mult} · ${s.played} of ${s.total} game${s.total === 1 ? "" : "s"}`],
        ["Games left", s.now ? `${s.left} + playing now` : String(s.left)],
        ["Heading for", String(s.finish * mult), "tip-pos"],
        ["Pre-round projection", String(Math.round(p.proj * mult))]
      ], s.official ? "Finished games use SuperCoach's official scores." : "Live scores can be a point or two off until SuperCoach publishes them.");
      return `<button type="button" class="lv-row ${isBench ? "bench" : ""} ${s.now ? "is-live" : ""} ${dropPill ? "dropped" : ""}" data-lv-player="${esc(p.id)}" data-tip="${tip}">
        ${window.SCHOOPS.renderAvatar(p, 36)}
        <span style="min-width:0"><span class="lv-name"><span>${esc(p.name)}</span>${pill}${dropPill}</span><span class="lv-line">${line}</span></span>
        <span class="lv-pips" aria-hidden="true">${s.pips.map((c) => `<i class="lv-pip ${c}"></i>`).join("")}</span>
        <span class="lv-pts ${flash} ${isCapRow ? "cap" : ""}"><b>${isCapRow ? s.sc * 2 : s.sc}</b><small>→ ${isCapRow ? s.finish * 2 : s.finish}</small></span>
      </button>`;
    };
    // Sort by what each player actually adds: the captain counts double
    const eff = (p) => st[p.id].sc * (cap && p.id === cap.id ? 2 : 1);
    const order = (arr) => [...arr].sort((a, b) => (st[b.id].now ? 1 : 0) - (st[a.id].now ? 1 : 0) || eff(b) - eff(a));
    return `<section class="lv-card lv-myteam" aria-label="My team live">
      <div class="lv-card-head"><div><div class="lv-card-title">My team</div>
        <div class="lv-card-sub">${lu.fromCourt ? "Your starting 10 from My Squad" : "Best lineup from your squad (set it in My Squad)"} · best 9 of 10 + captain ×2</div></div>
        ${liveNow ? `<span class="lv-card-sub" style="display:inline-flex;align-items:center;gap:6px;color:var(--neg-soft)"><span class="lv-dot pulse"></span>${liveNow} on court</span>` : ""}
      </div>
      <div class="lv-sum">
        <div><div class="lv-sum-l">Scored so far</div><div class="lv-sum-v">${soFar.sum}</div>
          <div class="lv-prog" data-tip="${tipBox("Starter games played", [["Played", `${doneGames} of ${allGames}`]])}"><i style="transform:scaleX(${(doneGames / allGames).toFixed(3)})"></i></div></div>
        <div><div class="lv-sum-l">Heading for</div><div class="lv-sum-v">${finish.sum}<small class="${diff >= 0 ? "pos-text" : "neg-text"}">${diff >= 0 ? "+" : "−"}${Math.abs(diff)}</small></div></div>
        <div><div class="lv-sum-l">Pre-round</div><div class="lv-sum-v" style="color:var(--text-secondary)">${proj}</div></div>
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
        <div class="lv-g-status">${gameStatus(g)}${mine ? `<span class="mine">${mine} yours</span>` : ""}</div>
        ${team(g.away, g.awayLogo, as, hs)}${team(g.home, g.homeLogo, hs, as)}
      </button>`;
    };
    return `<div class="lv-strip-wrap"><div class="lv-strip" id="lvStrip">${days.map((day) => `<div class="lv-day"><div class="lv-day-label">${esc(day.d)}</div><div class="lv-day-games">${day.games.map(card).join("")}</div></div>`).join("")}</div></div>`;
  }

  // Small round photo: SuperCoach player's photo if we know him, else ESPN's headshot, else initials
  function face(r, size) {
    if (r && r.p) return window.SCHOOPS.renderAvatar(r.p, size);
    const id = r && r.id;
    const init = esc(String((r && r.name) || "?").split(" ").map((w) => w[0]).slice(0, 2).join(""));
    const img = id ? `<img src="https://a.espncdn.com/i/headshots/nba/players/full/${esc(id)}.png" alt="" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='inline'" />` : "";
    return `<span class="sc-avatar" style="width:${size}px;height:${size}px">${img}<span class="sc-avatar-init" style="${id ? "display:none" : ""}">${init}</span></span>`;
  }

  function renderGame(state, perEvent) {
    const g = live.games.find((x) => x.key === live.selected);
    if (!g) return "";
    ensurePlays(g);
    const rows = perEvent[g.eventId] || [];
    const sum = (code) => rows.filter((r) => r.team === code).reduce((s2, r) => s2 + r.sc, 0);
    const side = (code, logo, score, right) => {
      const img = logo ? `<img src="${esc(logo)}" alt="" />` : "";
      const big = g.state === "pre" || score === null ? esc(code) : score;
      const sub = g.state === "pre" ? "" : `${esc(code)} · ${sum(code)} SC`;
      return `<div class="lv-gv-team ${right ? "r" : ""}">${right ? "" : img}<div><b>${big}</b><br><span>${sub}</span></div>${right ? img : ""}</div>`;
    };
    const mid = g.state === "pre" ? `${esc(dayFmt(g.ms))}<br>${esc(timeFmt(g.ms))}` : gameStatus(g);
    const head = `<div class="lv-gv-score">${side(g.away, g.awayLogo, g.awayScore, false)}<div class="lv-gv-mid">${mid}</div>${side(g.home, g.homeLogo, g.homeScore, true)}</div>`;

    if (g.state === "pre" || !rows.length) {
      // Before tip-off: each team's SuperCoach players with their projection per game
      const col = (code) => {
        const sc = Object.values(state.computedById).filter((p) => p.team === code && !p.isInactive && (p.proj || 0) > 0)
          .sort((a, b) => b.proj / (b.games || 1) - a.proj / (a.games || 1)).slice(0, 12);
        const items = sc.map((p) => {
          const per = Math.round(p.proj / ((p.expGames || p.games) || 1));
          const yours = p.inSquad ? `<span class="lv-sq">YOURS</span>` : "";
          return `<button type="button" class="lv-prow ${p.inSquad ? "mine" : ""}" data-lv-player="${esc(p.id)}">${window.SCHOOPS.renderAvatar(p, 22)}<span class="nm"><span>${esc(p.name)}</span>${yours}</span><span class="v" style="color:var(--text-secondary);font-weight:500">${per}</span></button>`;
        }).join("");
        return `<div><div class="lv-gv-h"><span>${esc(code)}</span><span>proj / game</span></div>${items || `<div class="lv-pre">No players listed.</div>`}</div>`;
      };
      return `<section class="lv-card lv-gc" aria-label="Game centre">${head}<div class="lv-gv-cols lv-pre-cols">${col(g.away)}${col(g.home)}</div></section>`;
    }

    // Box score: one table per team, SC first, then the stats that make it up
    const table = (code, logo) => {
      const list = [...rows.filter((r) => r.team === code)].sort((a, b) => (a.dnp - b.dnp) || (b.sc - a.sc));
      const tr = (r) => {
        const mine = r.p && r.p.inSquad;
        const attrs = r.p ? `data-lv-player="${esc(r.p.id)}" tabindex="0" role="button"` : "";
        const who = `<td class="pl">${face(r, 22)}<span class="nm">${esc(r.name)}</span>${mine ? `<span class="lv-sq">YOURS</span>` : ""}</td>`;
        if (r.dnp) return `<tr class="dnp" ${attrs}>${who}<td class="scv">—</td><td colspan="9" class="why">${notPlayedText(r, g.state)}</td></tr>`;
        return `<tr class="${mine ? "mine" : ""}" ${attrs}>${who}<td class="scv ${r.sc < 0 ? "neg" : ""}">${r.sc}</td><td>${r.min}</td><td>${r.pts}</td><td>${r.reb}</td><td>${r.ast}</td><td>${r.stl}</td><td>${r.blk}</td><td>${r.to}</td><td class="sh">${esc(r.fg || "")}</td><td class="sh">${esc(r.ft || "")}</td></tr>`;
      };
      const img = logo ? `<img src="${esc(logo)}" alt="" />` : "";
      return `<div class="lv-box">
        <div class="lv-box-h">${img}<span>${esc(code)}</span><span class="dim-text">${sum(code)} SC</span></div>
        <div class="lv-box-scroll"><table class="lv-bt">
          <thead><tr><th class="pl">Player</th><th class="scv">SC</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>BLK</th><th>TO</th><th class="sh">FG</th><th class="sh">FT</th></tr></thead>
          <tbody>${list.map(tr).join("")}</tbody></table></div></div>`;
    };

    return `<section class="lv-card lv-gc" aria-label="Game centre">${head}
      <div class="lv-gc-body">
        <div class="lv-boxes">${table(g.away, g.awayLogo)}${table(g.home, g.homeLogo)}</div>
        ${renderFeed(state, g, rows)}
      </div></section>`;
  }

  // SuperCoach feed: every play that scored or cost SC points, by quarter, newest first
  function renderFeed(state, g, rows) {
    const plays = live.plays[g.eventId];
    const byId = {};
    rows.forEach((r) => { byId[r.id] = r; });
    const qLabel = (q) => (q > 4 ? (q === 5 ? "OT" : `OT${q - 4}`) : `Q${q}`);
    const headHtml = (qs, cur, liveQ) => {
      const isAll = cur === "all";
      const tabs = `<button type="button" class="${isAll ? "on" : ""}" data-lv-q="all" aria-pressed="${isAll}">All</button>`
        + qs.map((q) => `<button type="button" class="${q === cur ? "on" : ""}" data-lv-q="${q}" aria-pressed="${q === cur}">${q === liveQ ? `<i class="lv-qdot" aria-label="live"></i>` : ""}${qLabel(q)}</button>`).join("");
      return `<div class="lv-feed-head">
        <div><div class="lv-card-title">SC feed</div><div class="lv-card-sub">Every play that moved a SuperCoach score</div></div>
        <div class="lv-feed-ctrls">
          <div class="lv-seg" role="group" aria-label="Quarter">${tabs}</div>
          <button type="button" class="lv-chip ${live.feedMine ? "on" : ""}" data-lv-mine aria-pressed="${live.feedMine}">My players</button>
        </div></div>`;
    };
    if (plays === undefined || live.playsPending[g.eventId]) return `<div class="lv-feed">${headHtml([1, 2, 3, 4], null)}<div class="lv-pre">Loading plays…</div></div>`;
    if (!plays || !plays.length) return `<div class="lv-feed">${headHtml([1, 2, 3, 4], null)}<div class="lv-pre">No play-by-play for this game yet.</div></div>`;
    const maxQ = Math.max(4, ...plays.map((p) => p.q));
    const qs = Array.from({ length: maxQ }, (_, i) => i + 1);
    const latest = Math.max(...plays.map((p) => p.q));
    // Following (nothing picked) shows the quarter being played and moves on with the game
    const cur = live.feedQ === "all" ? "all" : (live.feedQ && live.feedQ <= maxQ ? live.feedQ : latest);
    const liveQ = g.state === "in" ? latest : null;
    const mine = (id) => byId[id] && byId[id].p && byId[id].p.inSquad;
    let list = cur === "all" ? plays.slice() : plays.filter((p) => p.q === cur);
    if (live.feedMine) list = list.filter((p) => p.ev.some((e) => mine(e.id)));
    list = [...list].sort((a, b) => b.seq - a.seq);
    const chip = (e) => {
      const r = byId[e.id];
      const nm = r ? shortName(r.name) : "";
      return `<span class="lv-ev ${e.v > 0 ? "pos" : "neg"} ${mine(e.id) ? "mine" : ""}">${e.v > 0 ? "+" : "−"}${Math.abs(e.v)}<small>${esc(nm)}</small></span>`;
    };
    const item = (p) => {
      const main = byId[p.ev[0].id] || { id: p.ev[0].id, name: "" };
      const isMine = p.ev.some((e) => mine(e.id));
      const attrs = main.p ? `data-lv-player="${esc(main.p.id)}"` : "";
      return `<li class="lv-play ${isMine ? "mine" : ""} ${mine(main.id) ? "main-mine" : ""}" ${attrs}><span class="lv-play-t">${esc(p.clock)}</span>${face(main, 26)}<span class="lv-play-txt">${esc(p.text)}</span><span class="lv-play-ev">${p.ev.map(chip).join("")}</span></li>`;
    };
    const where = cur === "all" ? "this game" : "this quarter";
    const empty = live.feedMine ? `None of your players scored in ${where}.` : `No scoring plays in ${where} yet.`;
    // All quarters: newest first with a heading where each quarter starts
    let body = "", lastQ = null;
    list.forEach((p) => {
      if (cur === "all" && p.q !== lastQ) { body += `<li class="lv-qhead">${qLabel(p.q)}${p.q === liveQ ? ` <span class="lv-qlive">live</span>` : ""}</li>`; lastQ = p.q; }
      body += item(p);
    });
    const follow = live.feedQ === null && g.state === "in" ? `<div class="lv-follow"><i></i>Following the game: moves to the next quarter by itself</div>` : "";
    return `<div class="lv-feed">${headHtml(qs, cur, liveQ)}${follow}${list.length ? `<ol class="lv-plays">${body}</ol>` : `<div class="lv-pre">${empty}</div>`}</div>`;
  }

  function renderTop(state, perPlayer) {
    const list = Object.entries(perPlayer).map(([id, e]) => ({ p: state.computedById[id], e })).filter((x) => x.p && x.e.played)
      .sort((a, b) => b.e.sc - a.e.sc).slice(0, 10);
    return `<section class="lv-card lv-top" aria-label="Top scorers">
      <div class="lv-card-head"><div><div class="lv-card-title">Top scorers this round</div><div class="lv-card-sub">Live round totals</div></div></div>
      ${list.length ? list.map((x, i) => `<button type="button" class="lv-prow ${x.p.inSquad ? "mine" : ""}" data-lv-player="${esc(x.p.id)}" data-tip="${tipBox(x.p.name, [["Round score", String(x.e.sc)], ["Games played", String(x.e.played)], ["Score", x.e.official ? "SuperCoach official" : "live"]])}">
          <span class="lv-rank">${i + 1}</span>${window.SCHOOPS.renderAvatar(x.p, 26)}
          <span class="nm"><span>${esc(x.p.name)}</span>${x.p.inSquad ? `<span class="lv-sq">YOURS</span>` : ""}</span>
          <span><span class="min">${x.e.played}g</span><span class="v">${x.e.sc}</span></span></button>`).join("")
        : `<div class="lv-pre">No games played yet this round.</div>`}
    </section>`;
  }

  // A finished game's box score comes from the cache, so fetch its plays the first time it's opened
  async function ensurePlays(g) {
    if (!g || !g.eventId || g.state === "pre" || live.plays[g.eventId] || live.playsPending[g.eventId]) return;
    live.playsPending[g.eventId] = true;
    try {
      const summary = await getJson(`${ESPN}/summary?event=${g.eventId}`);
      live.plays[g.eventId] = parsePlays(summary);
      const rows = parseSummary(summary);
      if (rows.length) live.box[g.eventId] = rows;
    } catch (err) { live.plays[g.eventId] = null; }
    live.playsPending[g.eventId] = false;
    if (isOpen()) render();
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
        ${renderGame(state, perEvent)}
        ${renderTop(state, perPlayer)}
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

  // Public: a player's live round (null until this round's games are loaded or if his team has none)
  window.SchoopsLive = {
    ready: () => live.games.length > 0 && !!live.lastFetch, // scoreboard AND box scores loaded
    // Each of a player's games this round: [{eventId, state, detail, sc, dnp, reason, vs}]
    games(id) {
      const state = window.SCHOOPS.getState();
      const p = state.computedById[id];
      if (!p || !live.games.length) return [];
      const { perPlayer } = compute(state);
      const e = perPlayer[id] || { lines: [] };
      return teamGames(p.team).map((g) => {
        const l = e.lines.find((x) => x.game.key === g.key);
        const home = g.home === p.team;
        return { key: g.key, eventId: g.eventId || g.key, ms: g.ms, state: g.state, detail: g.detail, sc: l && !l.row.dnp ? l.row.sc : 0,
          dnp: !!(l && l.row.dnp), played: !!(l && !l.row.dnp), reason: l ? l.row.reason : "", vs: home ? g.away : g.home, home,
          us: home ? g.homeScore : g.awayScore, them: home ? g.awayScore : g.homeScore, min: l && !l.row.dnp ? l.row.min : 0 };
      });
    },
    round: () => live.round,
    // Your team live, same rules as the Live page: best 9 of 10 starters + captain x2 (VC if the captain plays 0).
    // null until this round's games are loaded or if you have no squad.
    team() {
      const state = window.SCHOOPS.getState();
      if (!live.games.length) return null;
      const squad = Object.values(state.computedById || {}).filter((p) => p.inSquad);
      const lu = squad.length ? lineup(state, squad) : null;
      if (!lu) return null;
      const { ev } = lu;
      const { perPlayer } = compute(state);
      const players = {};
      [...ev.starters, ...ev.bench].forEach((p) => {
        const s = playerStatus(p, perPlayer);
        players[p.id] = { sc: s.sc, finish: s.finish, official: s.official, played: s.played, total: s.total, left: s.left,
          now: s.now ? s.now.detail : null, nowLine: s.nowLine && !s.nowLine.row.dnp ? statLine(s.nowLine.row) : null, pips: s.pips };
      });
      let cap = ev.captain;
      const c = cap && players[cap.id];
      if (c && c.played === 0 && c.left === 0 && !c.now && ev.viceCaptain) cap = ev.viceCaptain;
      const total = (key) => {
        const vals = ev.starters.map((p) => ({ id: p.id, v: players[p.id][key] }));
        let drop = null;
        if (vals.length === 10) drop = vals.filter((x) => !cap || x.id !== cap.id).sort((a, b) => a.v - b.v)[0];
        const sum = vals.reduce((s, x) => s + (drop && x.id === drop.id ? 0 : x.v), 0) + (cap ? players[cap.id][key] : 0);
        return { sum: Math.round(sum), drop: drop ? drop.id : null };
      };
      const soFar = total("sc"), finish = total("finish");
      const doneGames = ev.starters.reduce((s, p) => s + (players[p.id].total - players[p.id].left - (players[p.id].now ? 1 : 0)), 0);
      const allGames = ev.starters.reduce((s, p) => s + players[p.id].total, 0);
      return { soFar: soFar.sum, finish: finish.sum, drop: finish.drop, capId: cap ? cap.id : null, players,
        doneGames, allGames, onCourt: ev.starters.filter((p) => players[p.id].now).length, started: doneGames > 0 || ev.starters.some((p) => players[p.id].now) };
    },
    // Open the Live page on one game (from the player profile)
    openGame(key) {
      live.selected = key;
      live.feedQ = null;
      window.SCHOOPS.setActiveNav("live");
      setTimeout(() => { const el = document.querySelector(".lv-gc"); if (el) el.scrollIntoView({ block: "start", behavior: "smooth" }); }, 80);
    },
    player(id) {
      const state = window.SCHOOPS.getState();
      const p = state.computedById[id];
      if (!p || !live.games.length) return null;
      const { perPlayer } = compute(state);
      const s = playerStatus(p, perPlayer);
      if (!s.total) return null;
      return { sc: s.sc, official: s.official, played: s.played, total: s.total, left: s.left, finish: s.finish,
        now: s.now ? s.now.detail : null, nowLine: s.nowLine && !s.nowLine.row.dnp ? statLine(s.nowLine.row) : null,
        done: s.total - s.left - (s.now ? 1 : 0) };
    }
  };

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
          "<strong>Heading for</strong> = points so far + the rest of tonight's game + his remaining games at his projected points per game.",
          "Tap a game in the strip at the top to open it: both teams' box scores with SuperCoach points, and the <strong>SC feed</strong> of every play that moved a score, by quarter. <strong>My players</strong> filters the feed to your team.",
          "Your players are highlighted everywhere. Live scores can be a point or two off until SuperCoach publishes them; finished games then show SuperCoach's official score."
        ]
      };
    }
    root.addEventListener("click", (e) => {
      const g = e.target.closest("[data-lv-game]");
      if (g) { live.selected = g.dataset.lvGame; live.feedQ = null; render(); return; }
      if (e.target.closest("[data-lv-refresh]")) { refreshAll(false); return; }
      const q = e.target.closest("[data-lv-q]");
      if (q) {
        const v = q.dataset.lvQ === "all" ? "all" : Number(q.dataset.lvQ);
        const g2 = live.games.find((x) => x.key === live.selected);
        const pl = g2 && live.plays[g2.eventId];
        const liveQ = g2 && g2.state === "in" && pl && pl.length ? Math.max(...pl.map((p) => p.q)) : null;
        live.feedQ = v === liveQ ? null : v;
        render(); return;
      }
      if (e.target.closest("[data-lv-mine]")) { live.feedMine = !live.feedMine; render(); return; }
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
