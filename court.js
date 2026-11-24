/* SCHOOPS — Linear Edition: My Court & Shared Exact Lineup Solver
 * Loaded by index.html via <script src="court.js?v=11"></script>
 * Exposes window.SCHOOPS_SOLVER for tradelab.js exact Best-9-of-10 + 2x C scoring.
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

  const ICON_LOCK_CLOSED = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
  const ICON_LOCK_OPEN = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>`;
  const ICON_INFO = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
  const ICON_BOLT = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`;

  const ui = {
    selectedSource: null,
    bannerMsg: null,
    bannerTimer: null,
    movedIds: new Set(),
    movedTimer: null
  };

  function injectStyles() {
    if (document.getElementById("schoops-court-styles")) return;
    const style = document.createElement("style");
    style.id = "schoops-court-styles";
    style.textContent = `
      @keyframes lcBannerIn {
        from { opacity: 0; transform: translateY(-2px); }
        to { opacity: 1; transform: translateY(0); }
      }

      @keyframes lcMovedRing {
        0% { box-shadow: 0 0 0 1.5px var(--pos-bright), 0 6px 20px rgba(34, 197, 139, 0.18); }
        100% { box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.065), 0 2px 8px rgba(0, 0, 0, 0.25); }
      }

      .lc-wrap {
        display: flex;
        flex-direction: column;
        min-height: 100%;
      }

      /* Calm Single-Line Telemetry Bar matching Market's context-strip */
      .lc-strip {
        min-height: 36px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        flex-wrap: wrap;
        padding: 6px 16px;
        border-bottom: 1px solid var(--border-subtle);
        background: rgba(255, 255, 255, 0.012);
        font-size: 11.5px;
      }

      .lc-metrics {
        display: flex;
        align-items: center;
        gap: 18px;
        flex-wrap: wrap;
      }

      .lc-m {
        display: inline-flex;
        align-items: baseline;
        gap: 5px;
        color: var(--text-tertiary);
      }

      .lc-m strong {
        font-family: var(--mono);
        font-weight: 600;
        color: var(--text-primary);
      }

      .lc-banner {
        font-family: var(--mono);
        font-size: 11px;
        padding: 3px 8px;
        border-radius: 5px;
        background: var(--bg-active);
        color: var(--text-primary);
        animation: lcBannerIn 150ms var(--ease-out) both;
      }

      .lc-banner.pos { background: var(--pos-bg); color: var(--pos-bright); }
      .lc-banner.warn { background: var(--warn-bg); color: var(--warn-bright); }
      .lc-banner.neg { background: var(--neg-bg); color: var(--neg-soft); }

      /* Main 2-Column Linear Board */
      .lc-grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 316px;
        gap: 16px;
        padding: 16px;
        align-items: start;
      }

      @media (max-width: 1020px) {
        .lc-grid { grid-template-columns: 1fr; }
      }

      .lc-board-card {
        background: #0D0D0F;
        border: 1px solid var(--border-subtle);
        border-radius: 9px;
        padding: 14px 16px 18px;
        position: relative;
        overflow: hidden;
      }

      .lc-section-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 14px;
        position: relative;
        z-index: 2;
      }

      .lc-section-title {
        font-size: 11.5px;
        font-weight: 500;
        color: var(--text-secondary);
      }

      .lc-section-hint {
        font-size: 11px;
        color: var(--text-tertiary);
      }

      .lc-svg {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        opacity: 0.085;
        z-index: 0;
      }

      /* Centered Symmetrical Formation */
      .lc-formation {
        position: relative;
        z-index: 1;
        max-width: 580px;
        margin: 0 auto;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .lc-pair-row {
        display: grid;
        grid-template-columns: 28px minmax(0, 1fr) minmax(0, 1fr);
        align-items: center;
        gap: 10px;
      }

      .lc-center-row {
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .lc-center-wrap {
        width: calc(50% - 19px);
        min-width: 248px;
        position: relative;
      }

      .lc-pos-lbl {
        font-family: var(--mono);
        font-size: 10px;
        font-weight: 600;
        color: var(--text-tertiary);
        text-align: right;
      }

      .lc-center-wrap .lc-pos-lbl {
        position: absolute;
        right: calc(100% + 10px);
        top: 50%;
        transform: translateY(-50%);
      }

      @media (max-width: 680px) {
        .lc-pair-row { grid-template-columns: 1fr; gap: 7px; }
        .lc-pos-lbl { text-align: left; }
        .lc-center-wrap { width: 100%; min-width: 0; }
        .lc-center-wrap .lc-pos-lbl { position: static; transform: none; display: block; margin-bottom: 4px; }
      }

      .lc-bench-panel {
        background: #0D0D0F;
        border: 1px solid var(--border-subtle);
        border-radius: 9px;
        padding: 14px;
      }

      .lc-bench-stack {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      /* Calm Linear Player Tile */
      .lc-tile {
        background: #141417;
        border: 1px solid var(--border-subtle);
        border-radius: 7px;
        padding: 8px 10px 7px 11px;
        cursor: pointer;
        user-select: none;
        display: flex;
        flex-direction: column;
        gap: 6px;
        min-height: 70px;
        position: relative;
        overflow: hidden;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.24);
        transition: background-color 120ms var(--ease-out), border-color 120ms var(--ease-out), transform 110ms var(--ease-press), opacity 130ms var(--ease-out);
      }

      .lc-tile::before {
        content: "";
        position: absolute;
        left: 0;
        top: 6px;
        bottom: 6px;
        width: 2.5px;
        border-radius: 2px;
        background: var(--team-accent, rgba(255, 255, 255, 0.14));
      }

      .lc-tile:active { transform: scale(0.985); }

      @media (hover: hover) and (pointer: fine) {
        .lc-tile:hover {
          background: #1A1A1E;
          border-color: var(--border-strong);
        }
      }

      .lc-tile.is-empty {
        background: rgba(255, 255, 255, 0.015);
        border-style: dashed;
        align-items: center;
        justify-content: center;
        color: var(--text-tertiary);
        font-family: var(--mono);
        font-size: 10.5px;
        box-shadow: none;
      }
      .lc-tile.is-empty::before { display: none; }

      .lc-tile.is-cap { border-color: rgba(229, 160, 50, 0.5); }
      .lc-tile.is-vc { border-color: rgba(110, 123, 242, 0.45); }
      .lc-tile.is-drop { opacity: 0.62; }
      .lc-tile.is-locked { border-color: rgba(229, 160, 50, 0.36); }
      .lc-tile.selected { border-color: var(--text-primary); background: #1E1E23; }
      .lc-tile.valid-target { border-color: var(--pos-bright); border-style: dashed; background: rgba(34, 197, 139, 0.07); }
      .lc-tile.just-moved { animation: lcMovedRing 300ms var(--ease-out) both; }

      .lc-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }

      .lc-id {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }

      .lc-name-col { min-width: 0; display: flex; flex-direction: column; }

      .lc-name {
        font-size: 12.5px;
        font-weight: 600;
        color: var(--text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .lc-sub {
        font-family: var(--mono);
        font-size: 10px;
        color: var(--text-tertiary);
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .lc-score-col {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        flex-shrink: 0;
        gap: 2px;
      }

      .lc-pts {
        font-family: var(--mono);
        font-size: 14px;
        font-weight: 700;
        color: var(--text-primary);
        line-height: 1.1;
      }

      .lc-pts.cap { color: var(--warn-bright); }
      .lc-pts.struck { color: var(--text-tertiary); text-decoration: line-through; }

      .lc-g {
        font-family: var(--mono);
        font-size: 9.5px;
        font-weight: 600;
        color: var(--text-tertiary);
      }
      .lc-g.g4 { color: var(--pos-bright); }
      .lc-g.g2 { color: var(--warn-bright); }
      .lc-g.g0 { color: var(--neg-soft); }

      .lc-foot {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        padding-top: 5px;
        border-top: 1px solid rgba(255, 255, 255, 0.042);
        min-height: 21px;
      }

      .lc-badges {
        display: inline-flex;
        align-items: center;
        gap: 3px;
      }

      .lc-pill {
        font-family: var(--mono);
        font-size: 9px;
        font-weight: 700;
        padding: 1px 4px;
        border-radius: 3px;
      }
      .lc-pill.c { background: var(--warn); color: #0A0A0B; }
      .lc-pill.vc { background: var(--accent-soft); color: #A5AEFF; }
      .lc-pill.drop { background: rgba(255, 255, 255, 0.05); color: var(--text-tertiary); }

      .lc-acts {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        opacity: 0;
        transition: opacity 110ms var(--ease-out);
      }

      .lc-tile:hover .lc-acts,
      .lc-tile.selected .lc-acts,
      .lc-acts.always { opacity: 1; }

      .lc-act-btn {
        height: 18px;
        min-width: 20px;
        padding: 0 4px;
        border-radius: 3px;
        background: transparent;
        border: 1px solid var(--border-subtle);
        color: var(--text-secondary);
        font-family: var(--mono);
        font-size: 9px;
        font-weight: 600;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transition: background-color 110ms var(--ease-out), color 110ms var(--ease-out), border-color 110ms var(--ease-out);
      }

      .lc-act-btn:hover { background: var(--bg-active); color: var(--text-primary); border-color: var(--border-default); }
      .lc-act-btn.on-c { background: var(--warn); color: #0A0A0B; border-color: var(--warn); }
      .lc-act-btn.on-vc { background: var(--accent); color: #FFFFFF; border-color: var(--accent); }
      .lc-act-btn.on-lock { background: var(--warn-bg); color: var(--warn-bright); border-color: rgba(229, 160, 50, 0.45); }

      .lc-fin {
        font-family: var(--mono);
        font-size: 10px;
        color: var(--text-tertiary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .lc-empty-page {
        padding: 56px 24px;
        text-align: center;
        color: var(--text-secondary);
        max-width: 420px;
        margin: 0 auto;
      }

      .lc-empty-page h3 {
        color: var(--text-primary);
        font-size: 14px;
        font-weight: 600;
        margin-bottom: 6px;
      }

      .lc-overflow {
        margin-top: 12px;
        padding-top: 10px;
        border-top: 1px dashed var(--border-default);
      }

      @media (hover: none), (pointer: coarse) {
        .lc-acts { opacity: 0.92; }
        .lc-act-btn { height: 22px; min-width: 23px; }
      }
    `;
    document.head.appendChild(style);
  }

  function renderCourtSvg() {
    return `
      <svg class="lc-svg" viewBox="0 0 900 540" preserveAspectRatio="none" aria-hidden="true">
        <rect x="20" y="18" width="860" height="504" rx="8" fill="none" stroke="#FFFFFF" stroke-width="1.5"/>
        <line x1="450" y1="18" x2="450" y2="522" stroke="#FFFFFF" stroke-width="1.5"/>
        <circle cx="450" cy="270" r="72" fill="none" stroke="#FFFFFF" stroke-width="1.5"/>
        <rect x="20" y="170" width="150" height="200" fill="none" stroke="#FFFFFF" stroke-width="1.5"/>
        <circle cx="170" cy="270" r="58" fill="none" stroke="#FFFFFF" stroke-width="1.5"/>
        <path d="M 20 68 L 106 68 A 226 226 0 0 1 106 472 L 20 472" fill="none" stroke="#FFFFFF" stroke-width="1.5"/>
        <rect x="730" y="170" width="150" height="200" fill="none" stroke="#FFFFFF" stroke-width="1.5"/>
        <circle cx="730" cy="270" r="58" fill="none" stroke="#FFFFFF" stroke-width="1.5"/>
        <path d="M 880 68 L 794 68 A 226 226 0 0 0 794 472 L 880 472" fill="none" stroke="#FFFFFF" stroke-width="1.5"/>
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
        if (slotDefs[j].req === "ANY" || getPositions(p).includes(slotDefs[j].req)) edges.push(j);
      }
      return edges;
    });

    const slotOwner = new Array(nSlots).fill(-1);
    function dfs(u, vis) {
      for (let i = 0; i < adj[u].length; i++) {
        const v = adj[u][i];
        if (vis[v]) continue;
        vis[v] = true;
        if (slotOwner[v] === -1 || dfs(slotOwner[v], vis)) {
          slotOwner[v] = u;
          return true;
        }
      }
      return false;
    }

    let matched = 0;
    for (let u = 0; u < players.length; u++) {
      if (dfs(u, new Array(nSlots).fill(false))) matched++;
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
    STARTER_SLOTS.forEach((s) => { const pid = slots[s.key]; if (pid && byId[pid]) starters.push(byId[pid]); });
    BENCH_SLOTS.forEach((s) => { const pid = slots[s.key]; if (pid && byId[pid]) bench.push(byId[pid]); });

    const starterIds = new Set(starters.map((p) => p.id));
    let cap = (captainId && starterIds.has(captainId)) ? byId[captainId] : null;
    if (!cap && starters.length) cap = [...starters].sort((a, b) => (b.proj - a.proj) || (b.games - a.games))[0];

    let vc = (viceCaptainId && starterIds.has(viceCaptainId) && (!cap || viceCaptainId !== cap.id)) ? byId[viceCaptainId] : null;
    if (!vc && starters.length > 1) {
      vc = [...starters].filter((p) => !cap || p.id !== cap.id).sort((a, b) => (b.proj - a.proj) || (b.games - a.games))[0];
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

    return {
      starters,
      bench,
      captain: cap,
      viceCaptain: vc,
      droppedPlayer,
      totalProj: Math.round(totalProj),
      starterGames: starters.reduce((sum, p) => sum + (p.games || 0), 0),
      benchProj: Math.round(bench.reduce((sum, p) => sum + (p.proj || 0), 0))
    };
  }

  function solveOptimalLineup(squadPlayers, lockedBenchIds) {
    if (!squadPlayers.length) return null;
    const lockedSet = new Set(Object.keys(lockedBenchIds || {}).filter((id) => lockedBenchIds[id]));
    const unlocked = squadPlayers.filter((p) => !lockedSet.has(p.id));
    unlocked.sort((a, b) => (b.proj - a.proj) || (b.games - a.games) || (b.avg3 - a.avg3));

    const pool = unlocked.length > 18 ? unlocked.slice(0, 18) : unlocked;
    const pLen = pool.length;
    const k = Math.min(10, pLen);

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
      return [main, dropScore, starters.reduce((s, p) => s + (p.games || 0), 0)];
    }

    function isBetter(a, b) {
      if (!b) return true;
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i];
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
          benchCandidates.sort((a, b) => ((lockedSet.has(a.id) ? 0 : 1) - (lockedSet.has(b.id) ? 0 : 1)) || (b.proj - a.proj));
          const bMatch = matchPlayersToSlots(benchCandidates.slice(0, 5), BENCH_SLOTS);
          if (requireFullBench && bMatch.matched < Math.min(5, benchCandidates.length)) return;
          bestScore = candScore;
          bestResult = { slots: { ...stMatch.assignment, ...bMatch.assignment }, starters: [...chosen] };
          return;
        }
        if (pLen - startIdx < remNeeded) return;
        if (bestScore) {
          const optScore = scoreStarterSet(chosen.concat(pool.slice(startIdx, startIdx + remNeeded)));
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

    let result = runSearch(true) || runSearch(false);
    if (!result) {
      const stMatch = matchPlayersToSlots(pool, STARTER_SLOTS);
      const rest = squadPlayers.filter((p) => !stMatch.assignedIds.has(p.id));
      const bMatch = matchPlayersToSlots(rest, BENCH_SLOTS);
      result = {
        slots: { ...stMatch.assignment, ...bMatch.assignment },
        starters: pool.filter((p) => stMatch.assignedIds.has(p.id))
      };
    }

    const sortedStarters = [...result.starters].sort((a, b) => (b.proj - a.proj) || (b.games - a.games));
    return {
      slots: result.slots,
      captainId: sortedStarters[0] ? sortedStarters[0].id : null,
      viceCaptainId: sortedStarters[1] ? sortedStarters[1].id : null
    };
  }

  /* Export exact solver for Trade Lab */
  window.SCHOOPS_SOLVER = {
    STARTER_SLOTS,
    BENCH_SLOTS,
    solveOptimalLineup,
    evaluateLineup
  };

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
      if (!byId[pid]) { delete court.lockedBenchIds[pid]; changed = true; }
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
      const unassigned = squadPlayers.filter((p) => !seen.has(p.id)).sort((a, b) => b.proj - a.proj);
      unassigned.forEach((p) => {
        const order = court.lockedBenchIds[p.id] ? [...BENCH_SLOTS, ...STARTER_SLOTS] : [...STARTER_SLOTS, ...BENCH_SLOTS];
        const open = order.find((s) => !court.slots[s.key] && canFillSlot(p, s.key));
        if (open) { court.slots[open.key] = p.id; seen.add(p.id); changed = true; }
      });
    }

    const starterIds = new Set(STARTER_SLOTS.map((s) => court.slots[s.key]).filter(Boolean));
    if (court.captainId && !starterIds.has(court.captainId)) { court.captainId = null; changed = true; }
    if (court.viceCaptainId && (!starterIds.has(court.viceCaptainId) || court.viceCaptainId === court.captainId)) {
      court.viceCaptainId = null; changed = true;
    }

    if (changed) window.SCHOOPS.savePrefs();
  }

  function setBanner(text, tone) {
    ui.bannerMsg = { text, tone: tone || "info" };
    if (ui.bannerTimer) clearTimeout(ui.bannerTimer);
    ui.bannerTimer = setTimeout(() => { ui.bannerMsg = null; renderCourt(); }, 6000);
  }

  function flashMoved(ids) {
    ui.movedIds = new Set(ids.filter(Boolean));
    if (ui.movedTimer) clearTimeout(ui.movedTimer);
    ui.movedTimer = setTimeout(() => { ui.movedIds = new Set(); }, 340);
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

  function renderTile(slotDef, player, ctx) {
    const { escapeHtml, formatMoney, getTeamColor, renderAvatar } = window.SCHOOPS;
    const isSel = ui.selectedSource && ui.selectedSource.type === "slot" && ui.selectedSource.key === slotDef.key;
    const isTarget = ui.selectedSource && isValidSwap(ui.selectedSource, slotDef.key, ctx.slots, ctx.byId);

    if (!player) {
      const cls = ["lc-tile", "is-empty"];
      if (isSel) cls.push("selected");
      if (isTarget) cls.push("valid-target");
      return `<div class="${cls.join(" ")}" data-slot-key="${slotDef.key}">+ ${slotDef.label}</div>`;
    }

    const isStarter = STARTER_KEYS.has(slotDef.key);
    const isCap = isStarter && ctx.evalRes.captain && ctx.evalRes.captain.id === player.id;
    const isVc = isStarter && ctx.evalRes.viceCaptain && ctx.evalRes.viceCaptain.id === player.id;
    const isDrop = isStarter && ctx.evalRes.droppedPlayer && ctx.evalRes.droppedPlayer.id === player.id;
    const isLocked = !!ctx.lockedBenchIds[player.id];
    const accent = getTeamColor(player.team);

    const cls = ["lc-tile"];
    if (isCap) cls.push("is-cap");
    else if (isVc) cls.push("is-vc");
    if (isDrop) cls.push("is-drop");
    if (isLocked) cls.push("is-locked");
    if (isSel) cls.push("selected");
    if (isTarget) cls.push("valid-target");
    if (ui.movedIds.has(player.id)) cls.push("just-moved");

    const gCls = player.games >= 4 ? "g4" : (player.games === 0 ? "g0" : (player.games <= 2 ? "g2" : ""));
    const displayPts = isCap ? Math.round(player.proj * 2) : Math.round(player.proj);

    const badges = [];
    if (isCap) badges.push(`<span class="lc-pill c">C</span>`);
    else if (isVc) badges.push(`<span class="lc-pill vc">VC</span>`);
    if (isDrop) badges.push(`<span class="lc-pill drop">DROP</span>`);

    return `
      <div class="${cls.join(" ")}" data-slot-key="${slotDef.key}" style="--team-accent:${accent};">
        <div class="lc-top">
          <div class="lc-id">
            ${renderAvatar(player, 32)}
            <div class="lc-name-col">
              <div class="lc-name" title="${escapeHtml(player.name)}">${escapeHtml(player.name)}</div>
              <div class="lc-sub">
                <span>${escapeHtml(player.team)}</span>
                <span>·</span>
                <span>${escapeHtml(player.pos)}</span>
              </div>
            </div>
          </div>
          <div class="lc-score-col">
            <span class="lc-pts ${isCap ? "cap" : (isDrop ? "struck" : "")}">${displayPts}</span>
            <span class="lc-g ${gCls}">${player.games}G</span>
          </div>
        </div>
        <div class="lc-foot">
          <div class="lc-badges">
            ${badges.join("")}
            <div class="lc-acts ${!isStarter || isLocked ? "always" : ""}">
              ${isStarter ? `
                <button type="button" class="lc-act-btn ${isCap ? "on-c" : ""}" data-set-cap="${escapeHtml(player.id)}" title="Set Captain (2×)">C</button>
                <button type="button" class="lc-act-btn ${isVc ? "on-vc" : ""}" data-set-vc="${escapeHtml(player.id)}" title="Set Vice-Captain">VC</button>
              ` : ""}
              <button type="button" class="lc-act-btn ${isLocked ? "on-lock" : ""}" data-toggle-lock="${escapeHtml(player.id)}" title="${isLocked ? "Unlock from Bench" : "Pin to Bench"}">${isLocked ? ICON_LOCK_CLOSED : ICON_LOCK_OPEN}</button>
              <button type="button" class="lc-act-btn" data-inspect-player="${escapeHtml(player.id)}" title="Inspect stats & Live BE simulator">${ICON_INFO}</button>
            </div>
          </div>
          <div class="lc-fin">BE ${player.be === null ? "—" : player.be} · <span class="${player.priceChange >= 0 ? "pos-text" : "neg-text"}">${formatMoney(player.priceChange)}</span></div>
        </div>
      </div>
    `;
  }

  function renderOverflowTile(player, ctx) {
    const { escapeHtml, getTeamColor, renderAvatar } = window.SCHOOPS;
    const isSel = ui.selectedSource && ui.selectedSource.type === "overflow" && ui.selectedSource.playerId === player.id;
    const isLocked = !!ctx.lockedBenchIds[player.id];

    return `
      <div class="lc-tile ${isSel ? "selected" : ""}" data-overflow-id="${escapeHtml(player.id)}" style="--team-accent:${getTeamColor(player.team)};">
        <div class="lc-top">
          <div class="lc-id">
            ${renderAvatar(player, 30)}
            <div class="lc-name-col">
              <div class="lc-name">${escapeHtml(player.name)}</div>
              <div class="lc-sub">${escapeHtml(player.team)} · ${escapeHtml(player.pos)}</div>
            </div>
          </div>
          <div class="lc-score-col">
            <span class="lc-pts">${Math.round(player.proj)}</span>
            <span class="lc-g">${player.games}G</span>
          </div>
        </div>
        <div class="lc-foot">
          <div class="lc-acts always">
            <button type="button" class="lc-act-btn ${isLocked ? "on-lock" : ""}" data-toggle-lock="${escapeHtml(player.id)}">${isLocked ? ICON_LOCK_CLOSED : ICON_LOCK_OPEN}</button>
            <button type="button" class="lc-act-btn" data-inspect-player="${escapeHtml(player.id)}">${ICON_INFO}</button>
          </div>
          <div class="lc-fin">$${(player.price / 1000000).toFixed(2)}M</div>
        </div>
      </div>
    `;
  }

  function renderCourt() {
    const root = document.getElementById("courtViewRoot");
    const headerActions = document.getElementById("moduleHeaderActions");
    if (!root || !window.SCHOOPS) return;

    const state = window.SCHOOPS.getState();
    if (state.activeNav !== "court") return;

    const squadPlayers = window.SCHOOPS.getSquadPlayers();
    const lockCount = Object.keys(state.court.lockedBenchIds || {}).filter((k) => state.court.lockedBenchIds[k]).length;

    if (headerActions) {
      headerActions.innerHTML = `
        ${lockCount > 0 ? `<button type="button" class="ghost-btn" id="courtClearLocksBtn">Clear Locks (${lockCount})</button>` : ""}
        <button type="button" class="primary-btn" id="courtOptimiseBtn">${ICON_BOLT}<span>Optimise</span></button>
      `;
    }

    if (!squadPlayers.length) {
      root.innerHTML = `
        <div class="lc-empty-page">
          <h3>No squad tracked yet</h3>
          <p style="margin-bottom:14px;">Tag your 15 players in Market with the <strong>+</strong> button to unlock the tactical court and exact Best-9-of-10 optimiser.</p>
          <button type="button" class="primary-btn" data-go-market="1">Open Market</button>
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
    const ctx = { slots, byId, lockedBenchIds, evalRes };
    const card = (key) => renderTile(SLOT_BY_KEY[key], slots[key] ? byId[slots[key]] : null, ctx);

    const bannerHtml = ui.bannerMsg
      ? `<span class="lc-banner ${ui.bannerMsg.tone}">${window.SCHOOPS.escapeHtml(ui.bannerMsg.text)}</span>`
      : (ui.selectedSource
        ? `<span class="lc-banner">Select a green dashed slot to swap · Esc to cancel</span>`
        : "");

    root.innerHTML = `
      <div class="lc-wrap">
        <div class="lc-strip">
          <div class="lc-metrics">
            <span class="lc-m">Rd ${state.round} Proj <strong class="pos-text">${evalRes.totalProj.toLocaleString()} pts</strong> ${evalRes.droppedPlayer ? `<span class="mono">· Drop ${window.SCHOOPS.escapeHtml(evalRes.droppedPlayer.name)} (${Math.round(evalRes.droppedPlayer.proj)})</span>` : ""}</span>
            <span class="lc-m">Games <strong>${evalRes.starterGames}</strong></span>
            <span class="lc-m">Captain <strong>${evalRes.captain ? window.SCHOOPS.escapeHtml(evalRes.captain.name) : "—"}</strong></span>
            <span class="lc-m">Bench <strong>${evalRes.bench.length}/5</strong> <span class="mono">(${evalRes.benchProj} pts)</span></span>
          </div>
          <div>${bannerHtml}</div>
        </div>

        <div class="lc-grid">
          <div class="lc-board-card">
            ${renderCourtSvg()}
            <div class="lc-section-head">
              <span class="lc-section-title">On-Court Starters (${evalRes.starters.length}/10)</span>
              <span class="lc-section-hint">Click two cards to swap · Hover for C / VC / Lock / Inspect</span>
            </div>
            <div class="lc-formation">
              <div class="lc-pair-row"><div class="lc-pos-lbl">PG</div>${card("PG1")}${card("PG2")}</div>
              <div class="lc-pair-row"><div class="lc-pos-lbl">SG</div>${card("SG1")}${card("SG2")}</div>
              <div class="lc-center-row"><div class="lc-center-wrap"><div class="lc-pos-lbl">C</div>${card("C1")}</div></div>
              <div class="lc-pair-row"><div class="lc-pos-lbl">SF</div>${card("SF1")}${card("SF2")}</div>
              <div class="lc-pair-row"><div class="lc-pos-lbl">PF</div>${card("PF1")}${card("PF2")}</div>
              <div class="lc-center-row"><div class="lc-center-wrap"><div class="lc-pos-lbl">FLX</div>${card("FLX")}</div></div>
            </div>
          </div>

          <div class="lc-bench-panel">
            <div class="lc-section-head">
              <span class="lc-section-title">Bench (${evalRes.bench.length}/5)</span>
              <span class="lc-section-hint">Pin injured players</span>
            </div>
            <div class="lc-bench-stack">
              ${BENCH_SLOTS.map((s) => renderTile(s, slots[s.key] ? byId[slots[s.key]] : null, ctx)).join("")}
            </div>
            ${overflow.length ? `
              <div class="lc-overflow">
                <div class="lc-section-title" style="margin-bottom:8px; color:var(--warn-bright);">Overflow (${overflow.length})</div>
                <div class="lc-bench-stack">${overflow.map((p) => renderOverflowTile(p, ctx)).join("")}</div>
              </div>
            ` : ""}
          </div>
        </div>
      </div>
    `;
  }

  function runOptimise() {
    const state = window.SCHOOPS.getState();
    const squadPlayers = window.SCHOOPS.getSquadPlayers();
    const byId = {};
    squadPlayers.forEach((p) => { byId[p.id] = p; });
    ui.selectedSource = null;

    const before = evaluateLineup(state.court.slots, byId, state.court.captainId, state.court.viceCaptainId);
    const solved = solveOptimalLineup(squadPlayers, state.court.lockedBenchIds);
    if (!solved) { setBanner("Add players to Squad first.", "neg"); renderCourt(); return; }

    const prev = { ...state.court.slots };
    const moved = [];
    ALL_SLOTS.forEach((s) => { if (solved.slots[s.key] && solved.slots[s.key] !== prev[s.key]) moved.push(solved.slots[s.key]); });
    if (solved.captainId && solved.captainId !== state.court.captainId) moved.push(solved.captainId);

    state.court.slots = solved.slots;
    state.court.captainId = solved.captainId;
    state.court.viceCaptainId = solved.viceCaptainId;
    window.SCHOOPS.savePrefs();
    flashMoved(moved);

    const after = evaluateLineup(state.court.slots, byId, state.court.captainId, state.court.viceCaptainId);
    const diff = after.totalProj - before.totalProj;
    const locks = Object.keys(state.court.lockedBenchIds).filter((k) => state.court.lockedBenchIds[k]).length;
    const suffix = locks ? ` · ${locks} lock${locks > 1 ? "s" : ""}` : "";

    if (diff > 0) setBanner(`+${diff} pts (${before.totalProj} → ${after.totalProj})${suffix}`, "pos");
    else if (diff === 0) setBanner(`Already optimal (${after.totalProj} pts)${suffix}`, "pos");
    else setBanner(`${after.totalProj} pts (${diff} vs unlocked)${suffix}`, "warn");
    renderCourt();
  }

  function handleActionClick(e) {
    if (e.target.closest("#courtOptimiseBtn")) { runOptimise(); return; }
    if (e.target.closest("#courtClearLocksBtn")) {
      window.SCHOOPS.getState().court.lockedBenchIds = {};
      window.SCHOOPS.savePrefs();
      setBanner("Cleared bench locks", "info");
      renderCourt();
      return;
    }
  }

  function handleCourtClick(e) {
    if (e.target.closest("[data-go-market]")) { window.SCHOOPS.setActiveNav("market", "all"); return; }

    const inspBtn = e.target.closest("[data-inspect-player]");
    if (inspBtn) {
      e.stopPropagation();
      window.SCHOOPS.openInspector(inspBtn.dataset.inspectPlayer);
      return;
    }

    const state = window.SCHOOPS.getState();
    const squadPlayers = window.SCHOOPS.getSquadPlayers();
    const byId = {};
    squadPlayers.forEach((p) => { byId[p.id] = p; });

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
        setBanner(`Unlocked ${byId[pid] ? byId[pid].name : "player"}`, "info");
      } else {
        state.court.lockedBenchIds[pid] = true;
        setBanner(`Locked ${byId[pid] ? byId[pid].name : "player"} to Bench`, "warn");
      }
      window.SCHOOPS.savePrefs();
      renderCourt();
      return;
    }

    const ov = e.target.closest("[data-overflow-id]");
    if (ov) {
      const pid = ov.dataset.overflowId;
      ui.selectedSource = (ui.selectedSource && ui.selectedSource.type === "overflow" && ui.selectedSource.playerId === pid)
        ? null : { type: "overflow", playerId: pid };
      renderCourt();
      return;
    }

    const slotEl = e.target.closest("[data-slot-key]");
    if (!slotEl) return;
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
      setBanner(pA ? `${pA.name} (${pA.pos}) cannot play ${SLOT_BY_KEY[targetKey].label}` : "Invalid swap", "neg");
      ui.selectedSource = null;
      renderCourt();
      return;
    }

    const moved = [];
    if (ui.selectedSource.type === "slot") {
      const srcKey = ui.selectedSource.key;
      const tmp = slots[srcKey];
      if (slots[targetKey]) { slots[srcKey] = slots[targetKey]; moved.push(slots[srcKey]); }
      else delete slots[srcKey];
      if (tmp) { slots[targetKey] = tmp; moved.push(tmp); }
      else delete slots[targetKey];
    } else {
      slots[targetKey] = ui.selectedSource.playerId;
      moved.push(ui.selectedSource.playerId);
    }
    flashMoved(moved);

    const starterIds = new Set(STARTER_SLOTS.map((s) => slots[s.key]).filter(Boolean));
    if (state.court.captainId && !starterIds.has(state.court.captainId)) state.court.captainId = null;
    if (state.court.viceCaptainId && (!starterIds.has(state.court.viceCaptainId) || state.court.viceCaptainId === state.court.captainId)) {
      state.court.viceCaptainId = null;
    }

    window.SCHOOPS.savePrefs();
    ui.selectedSource = null;
    renderCourt();
  }

  function init() {
    if (!window.SCHOOPS) return;
    injectStyles();
    const root = document.getElementById("courtViewRoot");
    if (root) root.addEventListener("click", handleCourtClick);
    const hdr = document.getElementById("moduleHeaderActions");
    if (hdr) hdr.addEventListener("click", handleActionClick);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && ui.selectedSource) { ui.selectedSource = null; renderCourt(); }
    });
    window.SCHOOPS.onRender(renderCourt);
    renderCourt();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
