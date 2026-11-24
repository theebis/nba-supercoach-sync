/* SCHOOPS Modular Plugin — Phase 2 (Option A Proportions + Option 2 Palette):
 * My Court Tactical Board & Exact Lineup Optimiser
 * Loaded by index.html via <script src="court.js?v=9"></script>
 */
(function () {
  "use strict";

  const STARTER_SLOTS = [
    { key: "PG1", label: "PG", req: "PG" },
    { key: "PG2", label: "PG", req: "PG" },
    { key: "SG1", label: "SG", req: "SG" },
    { key: "SG2", label: "SG", req: "SG" },
    { key: "C1",  label: "C",  req: "C", single: true },
    { key: "SF1", label: "SF", req: "SF" },
    { key: "SF2", label: "SF", req: "SF" },
    { key: "PF1", label: "PF", req: "PF" },
    { key: "PF2", label: "PF", req: "PF" },
    { key: "FLX", label: "FLX", req: "ANY", single: true }
  ];

  const BENCH_SLOTS = [
    { key: "B_PG", label: "PG", req: "PG" },
    { key: "B_SG", label: "SG", req: "SG" },
    { key: "B_C",  label: "C",  req: "C" },
    { key: "B_SF", label: "SF", req: "SF" },
    { key: "B_PF", label: "PF", req: "PF" }
  ];

  const ALL_SLOTS = [...STARTER_SLOTS, ...BENCH_SLOTS];
  const SLOT_BY_KEY = {};
  ALL_SLOTS.forEach((s) => { SLOT_BY_KEY[s.key] = s; });

  const STARTER_KEYS = new Set(STARTER_SLOTS.map((s) => s.key));
  const VALID_POS = new Set(["PG", "SG", "SF", "PF", "C"]);

  const ICON_LOCK_CLOSED = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
  const ICON_LOCK_OPEN = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>`;
  const ICON_BOLT = `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`;

  const ui = {
    selectedSource: null,
    bannerMsg: null,
    bannerTimer: null
  };

  function injectStyles() {
    if (document.getElementById("schoops-court-styles")) return;
    const style = document.createElement("style");
    style.id = "schoops-court-styles";
    style.textContent = `
      .court-shell {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      /* Slim Single-Line Summary Bar matching Market KPI Ticker */
      .court-ticker {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        flex-wrap: wrap;
        padding: 8px 14px;
        background: #10141B;
        border: 1px solid var(--border);
        border-radius: 7px;
      }

      .court-ticker-left {
        display: flex;
        align-items: center;
        gap: 20px;
        flex-wrap: wrap;
      }

      .ct-item {
        display: inline-flex;
        align-items: baseline;
        gap: 6px;
        white-space: nowrap;
      }

      .ct-lbl {
        font-size: 10px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--text-dim);
      }

      .ct-val {
        font-family: var(--mono);
        font-size: 13px;
        font-weight: 700;
        color: var(--text);
      }

      .ct-sub {
        font-family: var(--mono);
        font-size: 11px;
        color: var(--text-muted);
      }

      .court-ticker-right {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }

      .court-banner {
        font-family: var(--mono);
        font-size: 11px;
        font-weight: 600;
        padding: 5px 10px;
        border-radius: 5px;
        border: 1px solid var(--border-strong);
        background: var(--bg);
        color: var(--text-muted);
      }

      .court-banner.pos {
        background: var(--pos-bg);
        color: var(--pos-bright);
        border-color: rgba(16, 185, 129, 0.4);
      }

      .court-banner.warn {
        background: var(--warn-bg);
        color: var(--warn-bright);
        border-color: rgba(245, 158, 11, 0.4);
      }

      .court-banner.neg {
        background: var(--neg-bg);
        color: var(--neg);
        border-color: rgba(239, 68, 68, 0.4);
      }

      .court-opt-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: #22C58B;
        color: #061A12;
        border: 1px solid #4ADEA8;
        padding: 6px 15px;
        border-radius: 6px;
        font-family: var(--mono);
        font-size: 11.5px;
        font-weight: 800;
        letter-spacing: 0.05em;
        cursor: pointer;
        transition: filter 0.12s, transform 0.08s;
      }

      .court-opt-btn:hover { filter: brightness(1.08); }
      .court-opt-btn:active { transform: translateY(1px); }

      /* Main 2-Column Layout: Spacious Court Floor + Compact Bench Sidebar */
      .court-grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 330px;
        gap: 14px;
        align-items: start;
      }

      @media (max-width: 1060px) {
        .court-grid { grid-template-columns: 1fr; }
      }

      .court-panel {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 14px 18px 18px;
        position: relative;
        overflow: hidden;
      }

      .court-panel-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding-bottom: 10px;
        margin-bottom: 14px;
        border-bottom: 1px solid var(--border);
        position: relative;
        z-index: 2;
      }

      .court-panel-title {
        font-family: var(--mono);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--text);
      }

      .court-panel-hint {
        font-size: 11px;
        color: var(--text-dim);
      }

      /* Tactical Court Surface (Visible Geometric Basketball Markings) */
      .court-floor-box {
        position: relative;
        background: radial-gradient(ellipse at 50% 50%, #171D28 0%, #11151E 100%);
        border: 1px solid #262E3E;
        border-radius: 7px;
        padding: 18px 20px;
        overflow: hidden;
      }

      .court-lines-svg {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        opacity: 0.16;
        z-index: 0;
      }

      /* Centered Compact Formation Grid (True Option A Proportions) */
      .court-formation {
        position: relative;
        z-index: 1;
        max-width: 590px;
        margin: 0 auto;
        display: flex;
        flex-direction: column;
        gap: 11px;
      }

      .formation-pair-row {
        display: grid;
        grid-template-columns: 32px minmax(0, 1fr) minmax(0, 1fr);
        align-items: center;
        gap: 12px;
      }

      .formation-center-row {
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
      }

      .formation-center-wrap {
        width: calc(50% - 22px);
        min-width: 255px;
        position: relative;
      }

      .pos-side-label {
        font-family: var(--mono);
        font-size: 10.5px;
        font-weight: 700;
        color: var(--text-dim);
        letter-spacing: 0.05em;
        text-align: right;
      }

      .formation-center-wrap .pos-side-label {
        position: absolute;
        right: calc(100% + 10px);
        top: 50%;
        transform: translateY(-50%);
      }

      @media (max-width: 680px) {
        .formation-pair-row {
          grid-template-columns: 1fr;
          gap: 8px;
        }
        .pos-side-label { text-align: left; }
        .formation-center-wrap { width: 100%; min-width: 0; }
        .formation-center-wrap .pos-side-label {
          position: static;
          transform: none;
          display: block;
          margin-bottom: 5px;
        }
      }

      .bench-stack {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      /* Compact Option A Player Card */
      .mc-card {
        background: rgba(19, 23, 31, 0.94);
        border: 1px solid #2A3244;
        border-radius: 7px;
        padding: 9px 11px 8px 13px;
        cursor: pointer;
        transition: border-color 0.12s, background 0.12s, box-shadow 0.12s, transform 0.1s;
        display: flex;
        flex-direction: column;
        gap: 6px;
        min-height: 76px;
        position: relative;
        overflow: hidden;
        user-select: none;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.28);
      }

      .mc-card::before {
        content: "";
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 3.5px;
        background: var(--team-accent, #525D73);
      }

      .mc-card:hover {
        background: #1B212E;
        border-color: #414D66;
      }

      .mc-card.is-empty {
        background: rgba(13, 16, 21, 0.65);
        border-style: dashed;
        border-color: #2B3345;
        align-items: center;
        justify-content: center;
        color: var(--text-dim);
        font-family: var(--mono);
        font-size: 10.5px;
        box-shadow: none;
      }

      .mc-card.is-empty::before { display: none; }

      .mc-card.is-captain {
        border-color: rgba(245, 158, 11, 0.72);
        background: linear-gradient(135deg, rgba(245, 158, 11, 0.07) 0%, rgba(19, 23, 31, 0.96) 55%);
      }

      .mc-card.is-vc {
        border-color: rgba(59, 130, 246, 0.65);
      }

      .mc-card.is-drop {
        opacity: 0.74;
      }

      .mc-card.is-locked-bench {
        border-color: rgba(245, 158, 11, 0.52);
      }

      .mc-card.selected {
        border-color: #FFFFFF;
        background: #232B3C;
        box-shadow: 0 0 0 2px rgba(242, 244, 248, 0.24);
      }

      .mc-card.valid-target {
        border-color: var(--pos-bright);
        border-style: dashed;
        background: rgba(16, 185, 129, 0.09);
      }

      .mc-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }

      .mc-left {
        display: flex;
        align-items: center;
        gap: 9px;
        min-width: 0;
      }

      .mc-id-col {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }

      .mc-name {
        font-size: 12.5px;
        font-weight: 700;
        color: #FFFFFF;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        line-height: 1.25;
      }

      .mc-sub {
        font-family: var(--mono);
        font-size: 10px;
        color: var(--text-muted);
        display: flex;
        align-items: center;
        gap: 4px;
        margin-top: 2px;
      }

      .mc-score-col {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        flex-shrink: 0;
        gap: 2px;
      }

      .mc-pts {
        font-family: var(--mono);
        font-size: 15px;
        font-weight: 800;
        color: #FFFFFF;
        line-height: 1.1;
      }

      .mc-pts.cap-pts { color: var(--warn-bright); }
      .mc-pts.struck { color: var(--text-dim); text-decoration: line-through; }

      .mc-gms-pill {
        font-family: var(--mono);
        font-size: 9.5px;
        font-weight: 700;
        padding: 1px 5px;
        border-radius: 3px;
        background: #232A38;
        color: var(--text-muted);
      }

      .mc-gms-pill.g4 { background: rgba(16, 185, 129, 0.22); color: var(--pos-bright); }
      .mc-gms-pill.g2 { background: rgba(245, 158, 11, 0.22); color: var(--warn-bright); }
      .mc-gms-pill.g0 { background: rgba(239, 68, 68, 0.22); color: var(--neg); }

      .mc-bottom {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        border-top: 1px solid rgba(255, 255, 255, 0.045);
        padding-top: 5px;
        min-height: 22px;
      }

      .mc-badges {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        flex-shrink: 0;
      }

      .mc-pill {
        font-family: var(--mono);
        font-size: 9px;
        font-weight: 800;
        padding: 1px 5px;
        border-radius: 3px;
        line-height: 1.3;
      }

      .mc-pill.c { background: var(--warn); color: #0D1015; }
      .mc-pill.vc { background: #3B82F6; color: #FFFFFF; }
      .mc-pill.drop { background: #232936; color: var(--text-muted); border: 1px solid #353E52; }
      .mc-pill.lock { background: var(--warn-bg); color: var(--warn-bright); }

      .mc-hover-btns {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        opacity: 0;
        transition: opacity 0.12s;
      }

      .mc-card:hover .mc-hover-btns,
      .mc-card.selected .mc-hover-btns,
      .mc-hover-btns.always-show {
        opacity: 1;
      }

      .mc-act {
        background: #1A202C;
        border: 1px solid #2F384B;
        color: var(--text-muted);
        font-family: var(--mono);
        font-size: 9px;
        font-weight: 700;
        height: 19px;
        min-width: 21px;
        padding: 0 4px;
        border-radius: 3px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transition: all 0.1s;
      }

      .mc-act:hover { color: #FFFFFF; border-color: #52607D; }
      .mc-act.on-c { background: var(--warn); color: #0D1015; border-color: var(--warn); }
      .mc-act.on-vc { background: #3B82F6; color: #FFFFFF; border-color: #3B82F6; }
      .mc-act.on-lock { background: var(--warn-bg); color: var(--warn-bright); border-color: rgba(245, 158, 11, 0.55); }

      .mc-fin {
        font-family: var(--mono);
        font-size: 10px;
        color: var(--text-muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .overflow-box {
        margin-top: 14px;
        padding-top: 12px;
        border-top: 1px dashed var(--border-strong);
      }

      .overflow-title {
        font-family: var(--mono);
        font-size: 9.5px;
        font-weight: 700;
        color: var(--warn-bright);
        text-transform: uppercase;
        letter-spacing: 0.06em;
        margin-bottom: 8px;
      }

      .court-empty-state {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 38px 20px;
        text-align: center;
        color: var(--text-muted);
      }

      .court-empty-state h3 { color: var(--text); font-size: 14px; margin-bottom: 6px; }
    `;
    document.head.appendChild(style);
  }

  function renderCourtLinesSvg() {
    return `
      <svg class="court-lines-svg" viewBox="0 0 900 540" preserveAspectRatio="none" aria-hidden="true">
        <rect x="22" y="18" width="856" height="504" rx="8" fill="none" stroke="#94A3B8" stroke-width="1.8"/>
        <line x1="450" y1="18" x2="450" y2="522" stroke="#94A3B8" stroke-width="1.8"/>
        <circle cx="450" cy="270" r="74" fill="none" stroke="#94A3B8" stroke-width="1.8"/>
        <circle cx="450" cy="270" r="22" fill="none" stroke="#94A3B8" stroke-width="1.4"/>
        <!-- Left key, free-throw circle, restricted arc & 3pt arc -->
        <rect x="22" y="170" width="152" height="200" fill="none" stroke="#94A3B8" stroke-width="1.8"/>
        <circle cx="174" cy="270" r="60" fill="none" stroke="#94A3B8" stroke-width="1.8"/>
        <circle cx="62" cy="270" r="10" fill="none" stroke="#94A3B8" stroke-width="1.6"/>
        <line x1="48" y1="246" x2="48" y2="294" stroke="#94A3B8" stroke-width="2"/>
        <path d="M 22 68 L 106 68 A 226 226 0 0 1 106 472 L 22 472" fill="none" stroke="#94A3B8" stroke-width="1.8"/>
        <!-- Right key, free-throw circle, restricted arc & 3pt arc -->
        <rect x="726" y="170" width="152" height="200" fill="none" stroke="#94A3B8" stroke-width="1.8"/>
        <circle cx="726" cy="270" r="60" fill="none" stroke="#94A3B8" stroke-width="1.8"/>
        <circle cx="838" cy="270" r="10" fill="none" stroke="#94A3B8" stroke-width="1.6"/>
        <line x1="852" y1="246" x2="852" y2="294" stroke="#94A3B8" stroke-width="2"/>
        <path d="M 878 68 L 794 68 A 226 226 0 0 0 794 472 L 878 472" fill="none" stroke="#94A3B8" stroke-width="1.8"/>
      </svg>
    `;
  }

  function getPositions(player) {
    const parts = String(player.pos || "")
      .toUpperCase()
      .split(/[\/,\s]+/)
      .filter((x) => VALID_POS.has(x));
    return parts.length ? parts : ["PG", "SG", "SF", "PF", "C"];
  }

  function canFillSlot(player, slotKey) {
    const def = SLOT_BY_KEY[slotKey];
    if (!def || !player) return false;
    if (def.req === "ANY") return true;
    return getPositions(player).includes(def.req);
  }

  function matchPlayersToSlots(players, slotDefs) {
    const nSlots = slotDefs.length;
    const adj = players.map((p) => {
      const edges = [];
      for (let j = 0; j < nSlots; j++) {
        if (slotDefs[j].req === "ANY" || getPositions(p).includes(slotDefs[j].req)) {
          edges.push(j);
        }
      }
      return edges;
    });

    const slotOwner = new Array(nSlots).fill(-1);

    function dfs(u, visited) {
      const edges = adj[u];
      for (let i = 0; i < edges.length; i++) {
        const v = edges[i];
        if (visited[v]) continue;
        visited[v] = true;
        if (slotOwner[v] === -1 || dfs(slotOwner[v], visited)) {
          slotOwner[v] = u;
          return true;
        }
      }
      return false;
    }

    let matched = 0;
    for (let u = 0; u < players.length; u++) {
      const visited = new Array(nSlots).fill(false);
      if (dfs(u, visited)) matched++;
    }

    const assignment = {};
    const assignedIds = new Set();
    for (let j = 0; j < nSlots; j++) {
      if (slotOwner[j] !== -1) {
        const p = players[slotOwner[j]];
        assignment[slotDefs[j].key] = p.id;
        assignedIds.add(p.id);
      }
    }

    return { matched, assignment, assignedIds };
  }

  function evaluateLineup(slots, byId, captainId, viceCaptainId) {
    const starters = [];
    const bench = [];

    STARTER_SLOTS.forEach((s) => {
      const pid = slots[s.key];
      if (pid && byId[pid]) starters.push(byId[pid]);
    });
    BENCH_SLOTS.forEach((s) => {
      const pid = slots[s.key];
      if (pid && byId[pid]) bench.push(byId[pid]);
    });

    const starterIds = new Set(starters.map((p) => p.id));
    let cap = (captainId && starterIds.has(captainId)) ? byId[captainId] : null;
    if (!cap && starters.length > 0) {
      cap = [...starters].sort((a, b) => (b.proj - a.proj) || (b.games - a.games))[0];
    }

    let vc = (viceCaptainId && starterIds.has(viceCaptainId) && (!cap || viceCaptainId !== cap.id))
      ? byId[viceCaptainId]
      : null;
    if (!vc && starters.length > 1) {
      vc = [...starters]
        .filter((p) => !cap || p.id !== cap.id)
        .sort((a, b) => (b.proj - a.proj) || (b.games - a.games))[0];
    }

    let droppedPlayer = null;
    let totalProj = starters.reduce((sum, p) => sum + (p.proj || 0), 0);

    if (starters.length === 10) {
      const nonCap = starters.filter((p) => !cap || p.id !== cap.id);
      nonCap.sort((a, b) => (a.proj - b.proj) || (a.games - b.games) || (a.price - b.price));
      droppedPlayer = nonCap[0] || null;
      if (droppedPlayer) totalProj -= (droppedPlayer.proj || 0);
    }

    if (cap) totalProj += (cap.proj || 0);

    const starterGames = starters.reduce((sum, p) => sum + (p.games || 0), 0);
    const benchProj = bench.reduce((sum, p) => sum + (p.proj || 0), 0);

    return {
      starters,
      bench,
      captain: cap,
      viceCaptain: vc,
      droppedPlayer,
      totalProj: Math.round(totalProj),
      starterGames,
      benchProj: Math.round(benchProj)
    };
  }

  function solveOptimalLineup(squadPlayers, lockedBenchIds) {
    if (!squadPlayers.length) return null;

    const lockedSet = new Set(Object.keys(lockedBenchIds || {}).filter((id) => lockedBenchIds[id]));
    const unlocked = squadPlayers.filter((p) => !lockedSet.has(p.id));
    unlocked.sort((a, b) => (b.proj - a.proj) || (b.games - a.games) || (b.avg3 - a.avg3));

    const targetStarters = Math.min(10, unlocked.length);
    const pool = unlocked.length > 18 ? unlocked.slice(0, 18) : unlocked;
    const pLen = pool.length;
    const k = Math.min(targetStarters, pLen);

    function scoreStarterSet(starters) {
      const projs = starters.map((p) => p.proj || 0).sort((a, b) => b - a);
      let main = 0;
      let dropScore = 0;
      if (projs.length === 10) {
        main = projs[0] * 2;
        for (let i = 1; i < 9; i++) main += projs[i];
        dropScore = projs[9];
      } else {
        if (projs.length > 0) main = projs[0] * 2;
        for (let i = 1; i < projs.length; i++) main += projs[i];
      }
      const gms = starters.reduce((s, p) => s + (p.games || 0), 0);
      return [main, dropScore, gms];
    }

    function isBetter(a, b) {
      if (!b) return true;
      for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return a[i] > b[i];
      }
      return false;
    }

    function runSearch(requireFullBench) {
      let bestScore = null;
      let bestResult = null;
      const chosen = [];

      function comb(startIdx) {
        const remNeeded = k - chosen.length;
        if (remNeeded === 0) {
          const candScore = scoreStarterSet(chosen);
          if (!isBetter(candScore, bestScore)) return;

          const stMatch = matchPlayersToSlots(chosen, STARTER_SLOTS);
          if (stMatch.matched < k) return;

          const chosenSet = new Set(chosen.map((p) => p.id));
          const benchCandidates = squadPlayers.filter((p) => !chosenSet.has(p.id));
          benchCandidates.sort((a, b) => {
            const al = lockedSet.has(a.id) ? 0 : 1;
            const bl = lockedSet.has(b.id) ? 0 : 1;
            if (al !== bl) return al - bl;
            return (b.proj - a.proj);
          });

          const bMatch = matchPlayersToSlots(benchCandidates.slice(0, 5), BENCH_SLOTS);
          if (requireFullBench) {
            const expectedBench = Math.min(5, benchCandidates.length);
            if (bMatch.matched < expectedBench) return;
          }

          bestScore = candScore;
          bestResult = {
            slots: { ...stMatch.assignment, ...bMatch.assignment },
            starters: [...chosen]
          };
          return;
        }

        if (pLen - startIdx < remNeeded) return;

        if (bestScore) {
          const optimistic = chosen.concat(pool.slice(startIdx, startIdx + remNeeded));
          const optScore = scoreStarterSet(optimistic);
          if (optScore[0] < bestScore[0]) return;
        }

        for (let i = startIdx; i <= pLen - remNeeded; i++) {
          chosen.push(pool[i]);
          comb(i + 1);
          chosen.pop();
        }
      }

      comb(0);
      return bestResult;
    }

    let result = runSearch(true);
    if (!result) result = runSearch(false);
    if (!result) {
      const stMatch = matchPlayersToSlots(pool, STARTER_SLOTS);
      const rest = squadPlayers.filter((p) => !stMatch.assignedIds.has(p.id));
      const bMatch = matchPlayersToSlots(rest, BENCH_SLOTS);
      result = {
        slots: { ...stMatch.assignment, ...bMatch.assignment },
        starters: pool.filter((p) => stMatch.assignedIds.has(p.id))
      };
    }

    const sortedStarters = [...result.starters].sort(
      (a, b) => (b.proj - a.proj) || (b.games - a.games) || (b.avg3 - a.avg3)
    );

    return {
      slots: result.slots,
      captainId: sortedStarters[0] ? sortedStarters[0].id : null,
      viceCaptainId: sortedStarters[1] ? sortedStarters[1].id : null
    };
  }

  function reconcileCourtState(state, squadPlayers) {
    const byId = {};
    squadPlayers.forEach((p) => { byId[p.id] = p; });

    const court = state.court;
    if (!court.slots) court.slots = {};
    if (!court.lockedBenchIds) court.lockedBenchIds = {};

    let changed = false;

    const seen = new Set();
    ALL_SLOTS.forEach((slot) => {
      const pid = court.slots[slot.key];
      if (!pid) return;
      const p = byId[pid];
      if (!p || seen.has(pid) || !canFillSlot(p, slot.key)) {
        delete court.slots[slot.key];
        changed = true;
      } else {
        seen.add(pid);
      }
    });

    Object.keys(court.lockedBenchIds).forEach((pid) => {
      if (!byId[pid]) {
        delete court.lockedBenchIds[pid];
        changed = true;
      }
    });

    if (Object.keys(court.slots).length === 0 && squadPlayers.length > 0) {
      const solved = solveOptimalLineup(squadPlayers, court.lockedBenchIds);
      if (solved) {
        court.slots = solved.slots;
        court.captainId = solved.captainId;
        court.viceCaptainId = solved.viceCaptainId;
        changed = true;
      }
    } else {
      const unassigned = squadPlayers
        .filter((p) => !seen.has(p.id))
        .sort((a, b) => b.proj - a.proj);

      if (unassigned.length > 0) {
        const openStarters = STARTER_SLOTS.filter((s) => !court.slots[s.key]);
        const openBench = BENCH_SLOTS.filter((s) => !court.slots[s.key]);

        unassigned.forEach((p) => {
          const isLocked = !!court.lockedBenchIds[p.id];
          const searchOrder = isLocked ? [...openBench, ...openStarters] : [...openStarters, ...openBench];
          const matchSlot = searchOrder.find((s) => !court.slots[s.key] && canFillSlot(p, s.key));
          if (matchSlot) {
            court.slots[matchSlot.key] = p.id;
            seen.add(p.id);
            changed = true;
          }
        });
      }
    }

    const starterIds = new Set(STARTER_SLOTS.map((s) => court.slots[s.key]).filter(Boolean));
    if (court.captainId && !starterIds.has(court.captainId)) {
      court.captainId = null;
      changed = true;
    }
    if (court.viceCaptainId && (!starterIds.has(court.viceCaptainId) || court.viceCaptainId === court.captainId)) {
      court.viceCaptainId = null;
      changed = true;
    }

    if (changed) window.SCHOOPS.savePrefs();
  }

  function setBanner(text, tone) {
    ui.bannerMsg = { text, tone: tone || "info" };
    if (ui.bannerTimer) clearTimeout(ui.bannerTimer);
    ui.bannerTimer = setTimeout(() => {
      ui.bannerMsg = null;
      renderCourt();
    }, 6500);
  }

  function isValidSwap(source, targetSlotKey, slots, byId) {
    if (!source) return false;
    if (source.type === "slot") {
      if (source.key === targetSlotKey) return false;
      const pA = slots[source.key] ? byId[slots[source.key]] : null;
      const pB = slots[targetSlotKey] ? byId[slots[targetSlotKey]] : null;
      if (!pA && !pB) return false;
      return (!pA || canFillSlot(pA, targetSlotKey)) && (!pB || canFillSlot(pB, source.key));
    }
    if (source.type === "overflow") {
      const pA = byId[source.playerId];
      return !!pA && canFillSlot(pA, targetSlotKey);
    }
    return false;
  }

  function renderSlotCard(slotDef, player, ctx) {
    const { escapeHtml, formatMoney, getTeamColor, renderAvatar } = window.SCHOOPS;
    const isSelected = ui.selectedSource && ui.selectedSource.type === "slot" && ui.selectedSource.key === slotDef.key;
    const isTarget = ui.selectedSource && isValidSwap(ui.selectedSource, slotDef.key, ctx.slots, ctx.byId);

    if (!player) {
      const classes = ["mc-card", "is-empty"];
      if (isSelected) classes.push("selected");
      if (isTarget) classes.push("valid-target");
      return `
        <div class="${classes.join(" ")}" data-slot-key="${slotDef.key}">
          <span>+ EMPTY ${slotDef.label}</span>
        </div>
      `;
    }

    const isStarter = STARTER_KEYS.has(slotDef.key);
    const isCap = isStarter && ctx.evalRes.captain && ctx.evalRes.captain.id === player.id;
    const isVc = isStarter && ctx.evalRes.viceCaptain && ctx.evalRes.viceCaptain.id === player.id;
    const isDrop = isStarter && ctx.evalRes.droppedPlayer && ctx.evalRes.droppedPlayer.id === player.id;
    const isLockedBench = !!ctx.lockedBenchIds[player.id];
    const accent = getTeamColor(player.team);

    const classes = ["mc-card"];
    if (isCap) classes.push("is-captain");
    else if (isVc) classes.push("is-vc");
    if (isDrop) classes.push("is-drop");
    if (isLockedBench) classes.push("is-locked-bench");
    if (isSelected) classes.push("selected");
    if (isTarget) classes.push("valid-target");

    const gClass = player.games >= 4 ? "g4" : (player.games === 0 ? "g0" : (player.games <= 2 ? "g2" : ""));
    const beTxt = player.be === null ? "BE —" : `BE ${player.be}`;
    const displayPts = isCap ? Math.round(player.proj * 2) : Math.round(player.proj);
    const ptsClass = isCap ? "cap-pts" : (isDrop ? "struck" : "");

    const pills = [];
    if (isCap) pills.push(`<span class="mc-pill c">C</span>`);
    else if (isVc) pills.push(`<span class="mc-pill vc">VC</span>`);
    if (isDrop) pills.push(`<span class="mc-pill drop" title="Dropped under Best 9 of 10">DROP</span>`);
    if (isLockedBench && isStarter) pills.push(`<span class="mc-pill lock">LOCK</span>`);

    const showBtnsAlways = !isStarter || isLockedBench;

    return `
      <div class="${classes.join(" ")}" data-slot-key="${slotDef.key}" style="--team-accent:${accent};">
        <div class="mc-top">
          <div class="mc-left">
            ${renderAvatar(player, 36)}
            <div class="mc-id-col">
              <div class="mc-name">${escapeHtml(player.name)}</div>
              <div class="mc-sub">
                <span class="team-dot" style="background:${accent};"></span>
                <span>${escapeHtml(player.team)}</span>
                <span>·</span>
                <span>${escapeHtml(player.pos)}</span>
              </div>
            </div>
          </div>
          <div class="mc-score-col">
            <span class="mc-pts ${ptsClass}" title="${isCap ? "Captain 2× projected score" : "Round projected score"}">${displayPts}</span>
            <span class="mc-gms-pill ${gClass}">${player.games}G</span>
          </div>
        </div>
        <div class="mc-bottom">
          <div class="mc-badges">
            ${pills.join("")}
            <div class="mc-hover-btns ${showBtnsAlways ? "always-show" : ""}">
              ${isStarter ? `
                <button type="button" class="mc-act ${isCap ? "on-c" : ""}" data-set-cap="${escapeHtml(player.id)}" title="Set Captain (2×)">C</button>
                <button type="button" class="mc-act ${isVc ? "on-vc" : ""}" data-set-vc="${escapeHtml(player.id)}" title="Set Vice-Captain">VC</button>
              ` : ""}
              <button type="button" class="mc-act ${isLockedBench ? "on-lock" : ""}" data-toggle-lock="${escapeHtml(player.id)}" title="${isLockedBench ? "Unlock Bench pin" : "Pin to Bench for OPTIMISE"}">${isLockedBench ? ICON_LOCK_CLOSED : ICON_LOCK_OPEN}</button>
            </div>
          </div>
          <div class="mc-fin">
            $${(player.price / 1000000).toFixed(2)}M · ${beTxt} · <span class="${player.priceChange >= 0 ? "pos-text" : "neg-text"}">${formatMoney(player.priceChange)}</span>
          </div>
        </div>
      </div>
    `;
  }

  function renderOverflowCard(player, ctx) {
    const { escapeHtml, getTeamColor, renderAvatar } = window.SCHOOPS;
    const isSelected = ui.selectedSource && ui.selectedSource.type === "overflow" && ui.selectedSource.playerId === player.id;
    const isLockedBench = !!ctx.lockedBenchIds[player.id];
    const accent = getTeamColor(player.team);

    return `
      <div class="mc-card ${isSelected ? "selected" : ""}" data-overflow-id="${escapeHtml(player.id)}" style="--team-accent:${accent};">
        <div class="mc-top">
          <div class="mc-left">
            ${renderAvatar(player, 34)}
            <div class="mc-id-col">
              <div class="mc-name">${escapeHtml(player.name)}</div>
              <div class="mc-sub">
                <span class="team-dot" style="background:${accent};"></span>
                <span>${escapeHtml(player.team)}</span>
                <span>·</span>
                <span>${escapeHtml(player.pos)}</span>
              </div>
            </div>
          </div>
          <div class="mc-score-col">
            <span class="mc-pts">${Math.round(player.proj)}</span>
            <span class="mc-gms-pill">${player.games}G</span>
          </div>
        </div>
        <div class="mc-bottom">
          <div class="mc-badges">
            <div class="mc-hover-btns always-show">
              <button type="button" class="mc-act ${isLockedBench ? "on-lock" : ""}" data-toggle-lock="${escapeHtml(player.id)}" title="Pin to Bench">${isLockedBench ? ICON_LOCK_CLOSED : ICON_LOCK_OPEN}</button>
            </div>
          </div>
          <div class="mc-fin">$${(player.price / 1000000).toFixed(2)}M</div>
        </div>
      </div>
    `;
  }

  function renderCourt() {
    const root = document.getElementById("courtViewRoot");
    if (!root || !window.SCHOOPS) return;

    const state = window.SCHOOPS.getState();
    if (state.activeNav !== "court") return;

    const squadPlayers = window.SCHOOPS.getSquadPlayers();
    if (squadPlayers.length === 0) {
      root.innerHTML = `
        <div class="court-empty-state">
          <h3>No Squad Tracked Yet</h3>
          <p>Head to <strong>Market</strong> and click <strong>+</strong> on your 15 players to build your squad, then return to <strong>My Court</strong> to set starters, pin bench locks, and optimise.</p>
          <div style="margin-top:14px;">
            <button type="button" class="btn btn-primary" data-go-market="1">Go to Market</button>
          </div>
        </div>
      `;
      return;
    }

    reconcileCourtState(state, squadPlayers);

    const byId = {};
    squadPlayers.forEach((p) => { byId[p.id] = p; });
    const slots = state.court.slots;
    const lockedBenchIds = state.court.lockedBenchIds;
    const evalRes = evaluateLineup(slots, byId, state.court.captainId, state.court.viceCaptainId);

    const assignedSet = new Set(Object.values(slots));
    const overflow = squadPlayers.filter((p) => !assignedSet.has(p.id));
    const lockCount = Object.keys(lockedBenchIds).filter((k) => lockedBenchIds[k]).length;

    const ctx = { slots, byId, lockedBenchIds, evalRes, round: state.round };

    const card = (key) => renderSlotCard(SLOT_BY_KEY[key], slots[key] ? byId[slots[key]] : null, ctx);

    const formationHtml = `
      <div class="formation-pair-row">
        <div class="pos-side-label">PG</div>
        ${card("PG1")}
        ${card("PG2")}
      </div>
      <div class="formation-pair-row">
        <div class="pos-side-label">SG</div>
        ${card("SG1")}
        ${card("SG2")}
      </div>
      <div class="formation-center-row">
        <div class="formation-center-wrap">
          <div class="pos-side-label">C</div>
          ${card("C1")}
        </div>
      </div>
      <div class="formation-pair-row">
        <div class="pos-side-label">SF</div>
        ${card("SF1")}
        ${card("SF2")}
      </div>
      <div class="formation-pair-row">
        <div class="pos-side-label">PF</div>
        ${card("PF1")}
        ${card("PF2")}
      </div>
      <div class="formation-center-row">
        <div class="formation-center-wrap">
          <div class="pos-side-label">FLX</div>
          ${card("FLX")}
        </div>
      </div>
    `;

    const benchHtml = BENCH_SLOTS.map((s) => renderSlotCard(s, slots[s.key] ? byId[slots[s.key]] : null, ctx)).join("");

    const overflowHtml = overflow.length > 0 ? `
      <div class="overflow-box">
        <div class="overflow-title">Overflow (${overflow.length}) — Click player then legal slot</div>
        <div class="bench-stack">
          ${overflow.map((p) => renderOverflowCard(p, ctx)).join("")}
        </div>
      </div>
    ` : "";

    let bannerHtml = "";
    if (ui.bannerMsg) {
      bannerHtml = `<span class="court-banner ${ui.bannerMsg.tone}">${window.SCHOOPS.escapeHtml(ui.bannerMsg.text)}</span>`;
    } else if (ui.selectedSource) {
      const selId = ui.selectedSource.type === "slot" ? slots[ui.selectedSource.key] : ui.selectedSource.playerId;
      const selName = (selId && byId[selId]) ? byId[selId].name : "Empty Slot";
      bannerHtml = `<span class="court-banner">Swapping ${window.SCHOOPS.escapeHtml(selName)} · click dashed green slot</span>`;
    }

    const dropText = evalRes.droppedPlayer
      ? `(Drop: ${window.SCHOOPS.escapeHtml(evalRes.droppedPlayer.name)} ${Math.round(evalRes.droppedPlayer.proj)})`
      : `(${evalRes.starters.length}/10 starters)`;

    const capText = evalRes.captain ? `C: ${window.SCHOOPS.escapeHtml(evalRes.captain.name)}` : "No Captain";

    root.innerHTML = `
      <div class="court-shell">
        <div class="court-ticker">
          <div class="court-ticker-left">
            <div class="ct-item">
              <span class="ct-lbl">Rd ${state.round} Proj (Best 9 + 2× C):</span>
              <span class="ct-val pos-text">${evalRes.totalProj.toLocaleString()} PTS</span>
              <span class="ct-sub">${dropText}</span>
            </div>
            <div class="ct-item">
              <span class="ct-lbl">Starter Slate:</span>
              <span class="ct-val">${evalRes.starterGames} Gms</span>
              <span class="ct-sub">· ${capText}</span>
            </div>
            <div class="ct-item">
              <span class="ct-lbl">Bench:</span>
              <span class="ct-val muted-text">${evalRes.bench.length}/5</span>
              <span class="ct-sub">(${evalRes.benchProj.toLocaleString()} uncounted pts)</span>
            </div>
          </div>

          <div class="court-ticker-right">
            ${bannerHtml}
            ${lockCount > 0 ? `<button type="button" class="btn" id="courtClearLocksBtn">Clear Locks (${lockCount})</button>` : ""}
            <button type="button" class="court-opt-btn" id="courtOptimiseBtn" title="Find optimal Best 9 of 10 + 2× Captain respecting Bench Locks">OPTIMISE ${ICON_BOLT}</button>
          </div>
        </div>

        <div class="court-grid">
          <div class="court-panel">
            <div class="court-panel-head">
              <span class="court-panel-title">On-Court Starters (${evalRes.starters.length}/10)</span>
              <span class="court-panel-hint">Click two cards to swap · Hover card for C / VC / Bench Lock</span>
            </div>
            <div class="court-floor-box">
              ${renderCourtLinesSvg()}
              <div class="court-formation">
                ${formationHtml}
              </div>
            </div>
          </div>

          <div class="court-panel">
            <div class="court-panel-head">
              <span class="court-panel-title">Bench (${evalRes.bench.length}/5)</span>
              <span class="court-panel-hint">Lock injured players</span>
            </div>
            <div class="bench-stack">
              ${benchHtml}
            </div>
            ${overflowHtml}
          </div>
        </div>
      </div>
    `;
  }

  function handleCourtClick(e) {
    if (e.target.closest("[data-go-market]")) {
      window.SCHOOPS.setActiveNav("market");
      return;
    }

    const state = window.SCHOOPS.getState();
    const squadPlayers = window.SCHOOPS.getSquadPlayers();
    const byId = {};
    squadPlayers.forEach((p) => { byId[p.id] = p; });

    if (e.target.closest("#courtOptimiseBtn")) {
      ui.selectedSource = null;
      const before = evaluateLineup(state.court.slots, byId, state.court.captainId, state.court.viceCaptainId);
      const solved = solveOptimalLineup(squadPlayers, state.court.lockedBenchIds);
      if (!solved) {
        setBanner("Add players to Squad first.", "neg");
        renderCourt();
        return;
      }
      state.court.slots = solved.slots;
      state.court.captainId = solved.captainId;
      state.court.viceCaptainId = solved.viceCaptainId;
      window.SCHOOPS.savePrefs();

      const after = evaluateLineup(state.court.slots, byId, state.court.captainId, state.court.viceCaptainId);
      const diff = after.totalProj - before.totalProj;
      const lockCount = Object.keys(state.court.lockedBenchIds).filter((k) => state.court.lockedBenchIds[k]).length;
      const lockSuffix = lockCount > 0 ? ` (${lockCount} lock${lockCount > 1 ? "s" : ""})` : "";

      if (diff > 0) setBanner(`+${diff} PTS (${before.totalProj} → ${after.totalProj})${lockSuffix}`, "pos");
      else if (diff === 0) setBanner(`Optimal: ${after.totalProj} PTS${lockSuffix}`, "pos");
      else setBanner(`${after.totalProj} PTS (${diff} vs unlocked)${lockSuffix}`, "warn");
      renderCourt();
      return;
    }

    if (e.target.closest("#courtClearLocksBtn")) {
      state.court.lockedBenchIds = {};
      window.SCHOOPS.savePrefs();
      setBanner("Cleared bench locks.", "info");
      renderCourt();
      return;
    }

    const capBtn = e.target.closest("[data-set-cap]");
    if (capBtn) {
      e.stopPropagation();
      const pid = capBtn.dataset.setCap;
      if (state.court.viceCaptainId === pid) state.court.viceCaptainId = state.court.captainId;
      state.court.captainId = pid;
      window.SCHOOPS.savePrefs();
      ui.selectedSource = null;
      renderCourt();
      return;
    }

    const vcBtn = e.target.closest("[data-set-vc]");
    if (vcBtn) {
      e.stopPropagation();
      const pid = vcBtn.dataset.setVc;
      if (state.court.captainId === pid) state.court.captainId = state.court.viceCaptainId;
      state.court.viceCaptainId = pid;
      window.SCHOOPS.savePrefs();
      ui.selectedSource = null;
      renderCourt();
      return;
    }

    const lockBtn = e.target.closest("[data-toggle-lock]");
    if (lockBtn) {
      e.stopPropagation();
      const pid = lockBtn.dataset.toggleLock;
      if (state.court.lockedBenchIds[pid]) {
        delete state.court.lockedBenchIds[pid];
        setBanner(`Unlocked ${byId[pid] ? byId[pid].name : "player"}.`, "info");
      } else {
        state.court.lockedBenchIds[pid] = true;
        setBanner(`${byId[pid] ? byId[pid].name : "player"} locked to Bench.`, "warn");
      }
      window.SCHOOPS.savePrefs();
      renderCourt();
      return;
    }

    const ovCard = e.target.closest("[data-overflow-id]");
    if (ovCard) {
      const pid = ovCard.dataset.overflowId;
      if (ui.selectedSource && ui.selectedSource.type === "overflow" && ui.selectedSource.playerId === pid) {
        ui.selectedSource = null;
      } else {
        ui.selectedSource = { type: "overflow", playerId: pid };
      }
      renderCourt();
      return;
    }

    const slotEl = e.target.closest("[data-slot-key]");
    if (slotEl) {
      const targetKey = slotEl.dataset.slotKey;
      const slots = state.court.slots;

      if (!ui.selectedSource) {
        if (!slots[targetKey]) return;
        ui.selectedSource = { type: "slot", key: targetKey };
        renderCourt();
        return;
      }

      if (ui.selectedSource.type === "slot" && ui.selectedSource.key === targetKey) {
        ui.selectedSource = null;
        renderCourt();
        return;
      }

      if (!isValidSwap(ui.selectedSource, targetKey, slots, byId)) {
        const srcId = ui.selectedSource.type === "slot" ? slots[ui.selectedSource.key] : ui.selectedSource.playerId;
        const pA = srcId ? byId[srcId] : null;
        const targetDef = SLOT_BY_KEY[targetKey];
        setBanner(pA ? `${pA.name} (${pA.pos}) cannot play ${targetDef.label}.` : "Invalid swap.", "neg");
        ui.selectedSource = null;
        renderCourt();
        return;
      }

      if (ui.selectedSource.type === "slot") {
        const srcKey = ui.selectedSource.key;
        const tmp = slots[srcKey];
        if (slots[targetKey]) slots[srcKey] = slots[targetKey];
        else delete slots[srcKey];
        if (tmp) slots[targetKey] = tmp;
        else delete slots[targetKey];
      } else if (ui.selectedSource.type === "overflow") {
        slots[targetKey] = ui.selectedSource.playerId;
      }

      const starterIds = new Set(STARTER_SLOTS.map((s) => slots[s.key]).filter(Boolean));
      if (state.court.captainId && !starterIds.has(state.court.captainId)) state.court.captainId = null;
      if (state.court.viceCaptainId && (!starterIds.has(state.court.viceCaptainId) || state.court.viceCaptainId === state.court.captainId)) {
        state.court.viceCaptainId = null;
      }

      window.SCHOOPS.savePrefs();
      ui.selectedSource = null;
      renderCourt();
    }
  }

  function init() {
    if (!window.SCHOOPS) return;
    injectStyles();
    const root = document.getElementById("courtViewRoot");
    if (root) root.addEventListener("click", handleCourtClick);
    window.SCHOOPS.onRender(renderCourt);
    renderCourt();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
