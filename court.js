/* SCHOOPS Modular Plugin — Phase 2 (Option A Tactical Board):
 * Squad Court View & Exact Lineup Optimiser
 * Loaded by index.html via <script src="court.js?v=8.1"></script>
 */
(function () {
  "use strict";

  const TEAM_COLORS = {
    ATL: "#E03A3E", BOS: "#007A33", BKN: "#9BA3B4", CHA: "#1D87B8",
    CHI: "#CE1141", CLE: "#860038", DAL: "#00538C", DEN: "#FEC524",
    DET: "#C8102E", GSW: "#1D428A", HOU: "#CE1141", IND: "#FDBB30",
    LAC: "#C8102E", LAL: "#552583", MEM: "#5D76A9", MIA: "#98002E",
    MIL: "#00471B", MIN: "#78BE20", NOP: "#85714D", NYK: "#F58426",
    OKC: "#007AC1", ORL: "#0077C0", PHI: "#006BB6", PHX: "#E56020",
    POR: "#E03A3E", SAC: "#5A2D81", SAS: "#C4CED4", TOR: "#CE1141",
    UTA: "#6E2639", WAS: "#E31837"
  };

  const STARTER_SLOTS = [
    { key: "PG1", label: "PG", group: "Point Guards", req: "PG" },
    { key: "PG2", label: "PG", group: "Point Guards", req: "PG" },
    { key: "SG1", label: "SG", group: "Shooting Guards", req: "SG" },
    { key: "SG2", label: "SG", group: "Shooting Guards", req: "SG" },
    { key: "C1",  label: "C",  group: "Centre", req: "C", single: true },
    { key: "SF1", label: "SF", group: "Small Forwards", req: "SF" },
    { key: "SF2", label: "SF", group: "Small Forwards", req: "SF" },
    { key: "PF1", label: "PF", group: "Power Forwards", req: "PF" },
    { key: "PF2", label: "PF", group: "Power Forwards", req: "PF" },
    { key: "FLX", label: "FLX", group: "Flex", req: "ANY", single: true }
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

  const ICON_LOCK_CLOSED = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
  const ICON_LOCK_OPEN = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>`;
  const ICON_OPTIMISE = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`;

  const ui = {
    selectedSource: null,
    bannerMsg: null,
    bannerTimer: null
  };

  function getTeamColor(team) {
    const code = String(team || "").toUpperCase();
    return TEAM_COLORS[code] || "#4B5563";
  }

  function injectStyles() {
    if (document.getElementById("schoops-court-styles")) return;
    const style = document.createElement("style");
    style.id = "schoops-court-styles";
    style.textContent = `
      .court-shell {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      /* Matches Market KPI bar & toolbar cadence smoothly */
      .court-summary-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        flex-wrap: wrap;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 6px;
        padding: 10px 14px;
      }

      .court-stats-group {
        display: flex;
        align-items: center;
        gap: 24px;
        flex-wrap: wrap;
      }

      .court-stat {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .court-stat-label {
        font-size: 10px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--text-dim);
      }

      .court-stat-row {
        display: flex;
        align-items: baseline;
        gap: 8px;
      }

      .court-stat-val {
        font-family: var(--mono);
        font-size: 15px;
        font-weight: 700;
        color: var(--text);
      }

      .court-stat-sub {
        font-family: var(--mono);
        font-size: 11px;
        color: var(--text-muted);
      }

      .court-controls-group {
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
        color: var(--pos);
        border-color: rgba(16, 185, 129, 0.35);
      }

      .court-banner.warn {
        background: var(--warn-bg);
        color: var(--warn);
        border-color: rgba(245, 158, 11, 0.35);
      }

      .court-banner.neg {
        background: var(--neg-bg);
        color: var(--neg);
        border-color: rgba(239, 68, 68, 0.35);
      }

      .court-opt-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: var(--pos);
        color: #061A12;
        border: 1px solid #34D399;
        padding: 6px 13px;
        border-radius: 5px;
        font-family: var(--mono);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.05em;
        cursor: pointer;
        transition: filter 0.12s, transform 0.08s;
      }

      .court-opt-btn:hover { filter: brightness(1.07); }
      .court-opt-btn:active { transform: translateY(1px); }

      .court-grid {
        display: grid;
        grid-template-columns: minmax(0, 1.72fr) minmax(300px, 1fr);
        gap: 12px;
        align-items: start;
      }

      @media (max-width: 980px) {
        .court-grid { grid-template-columns: 1fr; }
      }

      .court-panel {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 6px;
        padding: 14px 16px;
        position: relative;
        overflow: hidden;
      }

      /* Option A: Subtle Dark Tactical Court Markings */
      .court-board {
        background: linear-gradient(180deg, #13161E 0%, #0E1016 100%);
      }

      .court-lines-svg {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        opacity: 0.055;
        z-index: 0;
      }

      .court-panel-inner {
        position: relative;
        z-index: 1;
      }

      .court-panel-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding-bottom: 9px;
        margin-bottom: 12px;
        border-bottom: 1px solid var(--border);
      }

      .court-panel-title {
        font-family: var(--mono);
        font-size: 10.5px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--text-muted);
      }

      .court-panel-hint {
        font-size: 11px;
        color: var(--text-dim);
      }

      .court-lineup-row {
        display: grid;
        grid-template-columns: 44px minmax(0, 1fr);
        align-items: center;
        gap: 10px;
        margin-bottom: 10px;
      }

      .court-lineup-row:last-child {
        margin-bottom: 0;
      }

      .row-pos-label {
        font-family: var(--mono);
        font-size: 10px;
        font-weight: 700;
        color: var(--text-dim);
        text-align: center;
        letter-spacing: 0.05em;
      }

      .court-pair {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }

      .court-single {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        max-width: calc(50% - 5px);
      }

      @media (max-width: 640px) {
        .court-lineup-row {
          grid-template-columns: 1fr;
          gap: 5px;
        }
        .row-pos-label {
          text-align: left;
        }
        .court-pair { grid-template-columns: 1fr; }
        .court-single { max-width: 100%; }
      }

      .bench-stack {
        display: flex;
        flex-direction: column;
        gap: 9px;
      }

      /* Option A Clean Player Card (3px Team Accent + Quiet Hover/Active Controls) */
      .sc-card {
        background: rgba(18, 20, 27, 0.92);
        border: 1px solid var(--border);
        border-radius: 6px;
        padding: 8px 11px 8px 13px;
        cursor: pointer;
        transition: border-color 0.12s, background 0.12s, box-shadow 0.12s;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: 6px;
        min-height: 70px;
        position: relative;
        overflow: hidden;
        user-select: none;
      }

      .sc-card::before {
        content: "";
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 3px;
        background: var(--team-accent, #4B5563);
      }

      .sc-card:hover {
        background: #1B1F2A;
        border-color: var(--border-strong);
      }

      .sc-card.is-empty {
        background: rgba(11, 12, 16, 0.5);
        border-style: dashed;
        border-color: #252A38;
        align-items: center;
        justify-content: center;
        color: var(--text-dim);
        font-family: var(--mono);
        font-size: 10.5px;
      }

      .sc-card.is-empty::before {
        display: none;
      }

      .sc-card.is-captain {
        border-color: rgba(245, 158, 11, 0.65);
        background: rgba(245, 158, 11, 0.04);
      }

      .sc-card.is-vc {
        border-color: rgba(96, 165, 250, 0.55);
      }

      .sc-card.is-drop {
        opacity: 0.72;
      }

      .sc-card.is-locked-bench {
        border-color: rgba(245, 158, 11, 0.45);
      }

      .sc-card.selected {
        border-color: var(--text);
        background: #222736;
        box-shadow: 0 0 0 2px rgba(243, 244, 248, 0.18);
      }

      .sc-card.valid-target {
        border-color: var(--pos);
        border-style: dashed;
        background: rgba(16, 185, 129, 0.07);
      }

      .sc-top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }

      .sc-identity {
        display: flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
      }

      .sc-name {
        font-size: 12.5px;
        font-weight: 600;
        color: var(--text);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .sc-role-badge {
        font-family: var(--mono);
        font-size: 9px;
        font-weight: 700;
        padding: 1px 5px;
        border-radius: 3px;
        line-height: 1.3;
        flex-shrink: 0;
      }

      .sc-role-badge.c {
        background: var(--warn);
        color: #0B0C10;
      }

      .sc-role-badge.vc {
        background: rgba(96, 165, 250, 0.2);
        color: #93C5FD;
        border: 1px solid rgba(96, 165, 250, 0.35);
      }

      .sc-role-badge.drop {
        background: #1E222D;
        color: var(--text-dim);
        border: 1px solid var(--border);
      }

      .sc-role-badge.lock {
        background: var(--warn-bg);
        color: var(--warn);
      }

      .sc-right {
        display: flex;
        align-items: center;
        gap: 7px;
        flex-shrink: 0;
      }

      .sc-gms-mini {
        font-family: var(--mono);
        font-size: 10px;
        font-weight: 600;
        color: var(--text-muted);
      }

      .sc-gms-mini.g4 { color: var(--pos); font-weight: 700; }
      .sc-gms-mini.g2 { color: var(--warn); }
      .sc-gms-mini.g0 { color: var(--neg); }

      .sc-pts {
        font-family: var(--mono);
        font-size: 14px;
        font-weight: 700;
        color: var(--text);
        min-width: 28px;
        text-align: right;
      }

      .sc-pts.struck {
        color: var(--text-dim);
        text-decoration: line-through;
      }

      .sc-bottom {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        min-height: 18px;
      }

      .sc-submeta {
        font-family: var(--mono);
        font-size: 10.5px;
        color: var(--text-dim);
        display: flex;
        align-items: center;
        gap: 5px;
        white-space: nowrap;
        overflow: hidden;
      }

      /* Quiet action buttons: revealed cleanly on card hover or when active */
      .sc-hover-actions {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        opacity: 0;
        transition: opacity 0.12s;
      }

      .sc-card:hover .sc-hover-actions,
      .sc-card.selected .sc-hover-actions,
      .sc-hover-actions.has-active {
        opacity: 1;
      }

      .sc-act-btn {
        background: #181C26;
        border: 1px solid var(--border);
        color: var(--text-muted);
        font-family: var(--mono);
        font-size: 9px;
        font-weight: 700;
        height: 18px;
        padding: 0 5px;
        border-radius: 3px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transition: all 0.1s;
      }

      .sc-act-btn:hover {
        color: var(--text);
        border-color: #464E63;
      }

      .sc-act-btn.active-c {
        background: var(--warn);
        color: #0B0C10;
        border-color: var(--warn);
        opacity: 1;
      }

      .sc-act-btn.active-vc {
        background: #2563EB;
        color: #FFFFFF;
        border-color: #3B82F6;
        opacity: 1;
      }

      .sc-act-btn.active-lock {
        background: var(--warn-bg);
        color: var(--warn);
        border-color: rgba(245, 158, 11, 0.5);
        opacity: 1;
      }

      .overflow-box {
        margin-top: 12px;
        padding-top: 10px;
        border-top: 1px dashed var(--border-strong);
      }

      .overflow-title {
        font-family: var(--mono);
        font-size: 9.5px;
        font-weight: 700;
        color: var(--warn);
        text-transform: uppercase;
        letter-spacing: 0.06em;
        margin-bottom: 8px;
      }

      .court-empty-state {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 6px;
        padding: 36px 20px;
        text-align: center;
        color: var(--text-muted);
      }

      .court-empty-state h3 {
        color: var(--text);
        font-size: 14px;
        margin-bottom: 6px;
      }
    `;
    document.head.appendChild(style);
  }

  function renderCourtLinesSvg() {
    return `
      <svg class="court-lines-svg" viewBox="0 0 800 520" preserveAspectRatio="none" aria-hidden="true">
        <rect x="24" y="20" width="752" height="480" rx="8" fill="none" stroke="#F3F4F8" stroke-width="2"/>
        <line x1="400" y1="20" x2="400" y2="500" stroke="#F3F4F8" stroke-width="2"/>
        <circle cx="400" cy="260" r="68" fill="none" stroke="#F3F4F8" stroke-width="2"/>
        <!-- Left key & arc -->
        <rect x="24" y="165" width="135" height="190" fill="none" stroke="#F3F4F8" stroke-width="2"/>
        <circle cx="159" cy="260" r="56" fill="none" stroke="#F3F4F8" stroke-width="2"/>
        <path d="M 24 72 A 210 210 0 0 1 24 448" fill="none" stroke="#F3F4F8" stroke-width="2"/>
        <!-- Right key & arc -->
        <rect x="641" y="165" width="135" height="190" fill="none" stroke="#F3F4F8" stroke-width="2"/>
        <circle cx="641" cy="260" r="56" fill="none" stroke="#F3F4F8" stroke-width="2"/>
        <path d="M 776 72 A 210 210 0 0 0 776 448" fill="none" stroke="#F3F4F8" stroke-width="2"/>
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
    let strictMode = true;

    if (!result) {
      strictMode = false;
      result = runSearch(false);
    }

    if (!result) {
      strictMode = false;
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
      viceCaptainId: sortedStarters[1] ? sortedStarters[1].id : null,
      strictMode
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

    if (changed) {
      window.SCHOOPS.savePrefs();
    }
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

  function formatFutureTag(p, roundNum) {
    const r = Number(roundNum) || 6;
    if (p.gamesNext !== null && p.gamesAfter !== null) {
      return `· R${r + 1}:${p.gamesNext} R${r + 2}:${p.gamesAfter}`;
    }
    if (p.gamesNext !== null) {
      return `· R${r + 1}:${p.gamesNext}`;
    }
    return "";
  }

  function renderSlotCard(slotDef, player, ctx) {
    const { escapeHtml, formatMoney } = window.SCHOOPS;
    const isSelected = ui.selectedSource && ui.selectedSource.type === "slot" && ui.selectedSource.key === slotDef.key;
    const isTarget = ui.selectedSource && isValidSwap(ui.selectedSource, slotDef.key, ctx.slots, ctx.byId);

    if (!player) {
      const classes = ["sc-card", "is-empty"];
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

    const classes = ["sc-card"];
    if (isCap) classes.push("is-captain");
    else if (isVc) classes.push("is-vc");
    if (isDrop) classes.push("is-drop");
    if (isLockedBench) classes.push("is-locked-bench");
    if (isSelected) classes.push("selected");
    if (isTarget) classes.push("valid-target");

    const gClass = player.games >= 4 ? "g4" : (player.games === 0 ? "g0" : (player.games <= 2 ? "g2" : ""));
    const beTxt = player.be === null ? "BE —" : `BE ${player.be}`;
    const futTxt = formatFutureTag(player, ctx.round);

    const roleBadges = [];
    if (isCap) roleBadges.push(`<span class="sc-role-badge c">C</span>`);
    else if (isVc) roleBadges.push(`<span class="sc-role-badge vc">VC</span>`);
    if (isDrop) roleBadges.push(`<span class="sc-role-badge drop" title="Lowest starter score dropped under Best 9 of 10">DROP</span>`);
    if (isLockedBench) roleBadges.push(`<span class="sc-role-badge lock" title="Pinned to Bench for OPTIMISE">LOCKED</span>`);

    const hasActiveAction = isCap || isVc || isLockedBench;
    const displayPts = isCap ? Math.round(player.proj * 2) : Math.round(player.proj);

    return `
      <div class="${classes.join(" ")}" data-slot-key="${slotDef.key}" style="--team-accent:${getTeamColor(player.team)};">
        <div class="sc-top">
          <div class="sc-identity">
            <span class="sc-name">${escapeHtml(player.name)}</span>
            ${roleBadges.join("")}
          </div>
          <div class="sc-right">
            <span class="sc-gms-mini ${gClass}" title="Round ${ctx.round} games">${player.games}G</span>
            <span class="sc-pts ${isDrop ? "struck" : ""}" title="${isCap ? "Captain 2× projected points" : "Round projected points"}">${displayPts}</span>
          </div>
        </div>
        <div class="sc-bottom">
          <div class="sc-submeta">
            <span>${escapeHtml(player.team)}</span>
            <span>·</span>
            <span>${escapeHtml(player.pos)}</span>
            <span>·</span>
            <span>$${(player.price / 1000000).toFixed(2)}M</span>
            <span>·</span>
            <span>${beTxt}</span>
            <span class="${player.priceChange >= 0 ? "pos-text" : "neg-text"}">${formatMoney(player.priceChange)}</span>
            ${futTxt ? `<span>${escapeHtml(futTxt)}</span>` : ""}
          </div>
          <div class="sc-hover-actions ${hasActiveAction ? "has-active" : ""}">
            ${isStarter ? `
              <button type="button" class="sc-act-btn ${isCap ? "active-c" : ""}" data-set-cap="${escapeHtml(player.id)}" title="Set Captain (2×)">C</button>
              <button type="button" class="sc-act-btn ${isVc ? "active-vc" : ""}" data-set-vc="${escapeHtml(player.id)}" title="Set Vice-Captain">VC</button>
            ` : ""}
            <button type="button" class="sc-act-btn ${isLockedBench ? "active-lock" : ""}" data-toggle-lock="${escapeHtml(player.id)}" title="${isLockedBench ? "Unlock Bench pin" : "Pin to Bench for OPTIMISE"}">${isLockedBench ? ICON_LOCK_CLOSED : ICON_LOCK_OPEN}</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderOverflowCard(player, ctx) {
    const { escapeHtml } = window.SCHOOPS;
    const isSelected = ui.selectedSource && ui.selectedSource.type === "overflow" && ui.selectedSource.playerId === player.id;
    const isLockedBench = !!ctx.lockedBenchIds[player.id];

    return `
      <div class="sc-card ${isSelected ? "selected" : ""}" data-overflow-id="${escapeHtml(player.id)}" style="--team-accent:${getTeamColor(player.team)};">
        <div class="sc-top">
          <div class="sc-identity">
            <span class="sc-name">${escapeHtml(player.name)}</span>
            ${isLockedBench ? `<span class="sc-role-badge lock">LOCKED</span>` : ""}
          </div>
          <div class="sc-right">
            <span class="sc-gms-mini">${player.games}G</span>
            <span class="sc-pts">${Math.round(player.proj)}</span>
          </div>
        </div>
        <div class="sc-bottom">
          <div class="sc-submeta">
            <span>${escapeHtml(player.team)}</span>
            <span>·</span>
            <span>${escapeHtml(player.pos)}</span>
            <span>·</span>
            <span>$${(player.price / 1000000).toFixed(2)}M</span>
          </div>
          <div class="sc-hover-actions ${isLockedBench ? "has-active" : ""}">
            <button type="button" class="sc-act-btn ${isLockedBench ? "active-lock" : ""}" data-toggle-lock="${escapeHtml(player.id)}" title="Pin to Bench">${isLockedBench ? ICON_LOCK_CLOSED : ICON_LOCK_OPEN}</button>
          </div>
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

    const ctx = {
      slots,
      byId,
      lockedBenchIds,
      evalRes,
      round: state.round
    };

    const rows = [
      { label: "PG", keys: ["PG1", "PG2"], single: false },
      { label: "SG", keys: ["SG1", "SG2"], single: false },
      { label: "C",  keys: ["C1"], single: true },
      { label: "SF", keys: ["SF1", "SF2"], single: false },
      { label: "PF", keys: ["PF1", "PF2"], single: false },
      { label: "FLX", keys: ["FLX"], single: true }
    ];

    const startersHtml = rows.map((r) => `
      <div class="court-lineup-row">
        <div class="row-pos-label">${r.label}</div>
        <div class="${r.single ? "court-single" : "court-pair"}">
          ${r.keys.map((k) => renderSlotCard(SLOT_BY_KEY[k], slots[k] ? byId[slots[k]] : null, ctx)).join("")}
        </div>
      </div>
    `).join("");

    const benchHtml = BENCH_SLOTS.map((s) => renderSlotCard(s, slots[s.key] ? byId[slots[s.key]] : null, ctx)).join("");

    const overflowHtml = overflow.length > 0 ? `
      <div class="overflow-box">
        <div class="overflow-title">Overflow (${overflow.length}) — Select card then legal slot</div>
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
      bannerHtml = `<span class="court-banner">Swapping ${window.SCHOOPS.escapeHtml(selName)} · click green slot or card again to cancel</span>`;
    }

    const dropText = evalRes.droppedPlayer
      ? `Drop: ${window.SCHOOPS.escapeHtml(evalRes.droppedPlayer.name)} (${Math.round(evalRes.droppedPlayer.proj)})`
      : `${evalRes.starters.length}/10 starters`;

    const capText = evalRes.captain
      ? `C: ${window.SCHOOPS.escapeHtml(evalRes.captain.name)}`
      : "No Captain";

    root.innerHTML = `
      <div class="court-shell">
        <div class="court-summary-bar">
          <div class="court-stats-group">
            <div class="court-stat">
              <span class="court-stat-label">Rd ${state.round} Proj (Best 9 + 2× C)</span>
              <div class="court-stat-row">
                <span class="court-stat-val pos-text">${evalRes.totalProj.toLocaleString()} PTS</span>
                <span class="court-stat-sub">${dropText}</span>
              </div>
            </div>
            <div class="court-stat">
              <span class="court-stat-label">Starter Slate</span>
              <div class="court-stat-row">
                <span class="court-stat-val">${evalRes.starterGames} Gms</span>
                <span class="court-stat-sub">${capText}</span>
              </div>
            </div>
            <div class="court-stat">
              <span class="court-stat-label">Bench</span>
              <div class="court-stat-row">
                <span class="court-stat-val muted-text">${evalRes.bench.length}/5</span>
                <span class="court-stat-sub">${evalRes.benchProj.toLocaleString()} uncounted pts</span>
              </div>
            </div>
          </div>

          <div class="court-controls-group">
            ${bannerHtml}
            ${lockCount > 0 ? `<button type="button" class="btn" id="courtClearLocksBtn">Clear Locks (${lockCount})</button>` : ""}
            <button type="button" class="court-opt-btn" id="courtOptimiseBtn" title="Optimise Best 9 of 10 + 2× Captain while respecting Bench Locks">${ICON_OPTIMISE} OPTIMISE</button>
          </div>
        </div>

        <div class="court-grid">
          <div class="court-panel court-board">
            ${renderCourtLinesSvg()}
            <div class="court-panel-inner">
              <div class="court-panel-head">
                <span class="court-panel-title">On-Court Starters (${evalRes.starters.length}/10)</span>
                <span class="court-panel-hint">Click two cards to swap · Hover card for C / VC / Lock</span>
              </div>
              ${startersHtml}
            </div>
          </div>

          <div class="court-panel">
            <div class="court-panel-inner">
              <div class="court-panel-head">
                <span class="court-panel-title">Bench (${evalRes.bench.length}/5)</span>
                <span class="court-panel-hint">Pin injured players to Bench</span>
              </div>
              <div class="bench-stack">
                ${benchHtml}
              </div>
              ${overflowHtml}
            </div>
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
        setBanner("Could not compute lineup — add players to Squad first.", "neg");
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

      if (diff > 0) {
        setBanner(`+${diff} PTS (${before.totalProj} → ${after.totalProj})${lockSuffix}`, "pos");
      } else if (diff === 0) {
        setBanner(`Optimal: ${after.totalProj} PTS${lockSuffix}`, "pos");
      } else {
        setBanner(`${after.totalProj} PTS (${diff} vs unlocked)${lockSuffix}`, "warn");
      }
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
      if (state.court.viceCaptainId === pid) {
        state.court.viceCaptainId = state.court.captainId;
      }
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
      if (state.court.captainId === pid) {
        state.court.captainId = state.court.viceCaptainId;
      }
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
        setBanner(
          pA ? `${pA.name} (${pA.pos}) cannot play ${targetDef.label}.` : "Invalid swap.",
          "neg"
        );
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
    if (root) {
      root.addEventListener("click", handleCourtClick);
    }
    window.SCHOOPS.onRender(renderCourt);
    renderCourt();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
