/* SCHOOPS Modular Plugin — Phase 2: Squad Court View & Exact Lineup Optimiser
 * Loaded by index.html via <script src="court.js?v=8"></script>
 * Reads/writes strictly through window.SCHOOPS and persists inside schoops_terminal_v3.
 */
(function () {
  "use strict";

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

  const ui = {
    selectedSource: null, // { type: "slot", key } | { type: "overflow", playerId }
    bannerMsg: null,      // { text, tone: "pos" | "warn" | "neg" | "info" }
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
        gap: 12px;
      }

      .court-topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        flex-wrap: wrap;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 6px;
        padding: 12px 16px;
      }

      .court-metrics {
        display: flex;
        align-items: center;
        gap: 22px;
        flex-wrap: wrap;
      }

      .court-metric {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .court-metric-label {
        font-size: 9.5px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--text-dim);
      }

      .court-metric-val {
        font-family: var(--mono);
        font-size: 18px;
        font-weight: 700;
        color: var(--text);
        line-height: 1.15;
      }

      .court-metric-sub {
        font-family: var(--mono);
        font-size: 10.5px;
        color: var(--text-muted);
      }

      .court-actions {
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
        border-radius: 4px;
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
        padding: 7px 14px;
        border-radius: 4px;
        font-family: var(--mono);
        font-size: 11.5px;
        font-weight: 700;
        letter-spacing: 0.05em;
        cursor: pointer;
        transition: filter 0.12s, transform 0.08s;
      }

      .court-opt-btn:hover {
        filter: brightness(1.08);
      }

      .court-opt-btn:active {
        transform: translateY(1px);
      }

      .court-grid {
        display: grid;
        grid-template-columns: minmax(0, 1.65fr) minmax(300px, 1fr);
        gap: 14px;
        align-items: start;
      }

      @media (max-width: 980px) {
        .court-grid {
          grid-template-columns: 1fr;
        }
      }

      .court-panel {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 16px;
        position: relative;
        overflow: hidden;
      }

      .court-floor {
        background:
          radial-gradient(circle at 50% 48%, rgba(16, 185, 129, 0.045) 0%, transparent 52%),
          linear-gradient(180deg, #111116 0%, #0D0D11 100%);
      }

      .court-panel-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding-bottom: 10px;
        margin-bottom: 12px;
        border-bottom: 1px solid var(--border);
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

      .court-section {
        margin-bottom: 14px;
      }

      .court-section:last-child {
        margin-bottom: 0;
      }

      .court-section-label {
        font-family: var(--mono);
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--text-dim);
        text-align: center;
        margin-bottom: 7px;
      }

      .court-row-2 {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }

      .court-row-1 {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        max-width: 50%;
        margin: 0 auto;
      }

      @media (max-width: 640px) {
        .court-row-2 { grid-template-columns: 1fr; }
        .court-row-1 { max-width: 100%; }
      }

      .bench-stack {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      /* Player Card / Slot */
      .court-slot {
        background: #141419;
        border: 1px solid var(--border-strong);
        border-radius: 6px;
        padding: 9px 11px;
        cursor: pointer;
        transition: border-color 0.12s, background 0.12s, box-shadow 0.12s;
        display: flex;
        flex-direction: column;
        gap: 6px;
        min-height: 76px;
        position: relative;
        user-select: none;
      }

      .court-slot:hover {
        background: #191920;
        border-color: #464654;
      }

      .court-slot.is-empty {
        background: rgba(10, 10, 12, 0.55);
        border-style: dashed;
        border-color: #2A2A34;
        align-items: center;
        justify-content: center;
        color: var(--text-dim);
        font-family: var(--mono);
        font-size: 11px;
      }

      .court-slot.is-captain {
        border-color: rgba(245, 158, 11, 0.7);
        box-shadow: inset 3px 0 0 var(--warn);
      }

      .court-slot.is-vc {
        border-color: rgba(59, 130, 246, 0.65);
        box-shadow: inset 3px 0 0 #3B82F6;
      }

      .court-slot.is-drop {
        border-color: #2B2B35;
        background: #111115;
      }

      .court-slot.is-locked-bench {
        border-color: rgba(245, 158, 11, 0.5);
      }

      .court-slot.selected {
        border-color: #FFFFFF;
        background: #1E1E28;
        box-shadow: 0 0 0 2px rgba(244, 244, 246, 0.25);
      }

      .court-slot.valid-target {
        border-color: var(--pos);
        border-style: dashed;
        background: rgba(16, 185, 129, 0.06);
      }

      .card-top {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 8px;
      }

      .card-name-wrap {
        display: flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
        flex-wrap: wrap;
      }

      .slot-pos-tag {
        font-family: var(--mono);
        font-size: 9px;
        font-weight: 700;
        padding: 1px 4px;
        border-radius: 3px;
        background: #202029;
        color: var(--text-muted);
        border: 1px solid var(--border);
        flex-shrink: 0;
      }

      .card-name {
        font-size: 12.5px;
        font-weight: 600;
        color: var(--text);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .card-pill {
        font-family: var(--mono);
        font-size: 8.5px;
        font-weight: 700;
        padding: 1px 4px;
        border-radius: 2px;
        letter-spacing: 0.04em;
        flex-shrink: 0;
      }

      .card-pill.drop {
        background: #23232D;
        color: var(--text-muted);
        border: 1px solid var(--border-strong);
      }

      .card-pill.lock {
        background: var(--warn-bg);
        color: var(--warn);
      }

      .card-pill.out {
        background: var(--neg-bg);
        color: var(--neg);
      }

      .card-controls {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        flex-shrink: 0;
      }

      .gms-chip {
        font-family: var(--mono);
        font-size: 10px;
        font-weight: 700;
        padding: 1px 5px;
        border-radius: 3px;
        background: #1C1C23;
        color: var(--text-muted);
        border: 1px solid var(--border);
      }

      .gms-chip.g4 {
        background: var(--pos-bg);
        color: var(--pos);
        border-color: rgba(16, 185, 129, 0.3);
      }

      .gms-chip.g2 {
        background: var(--warn-bg);
        color: var(--warn);
        border-color: rgba(245, 158, 11, 0.3);
      }

      .gms-chip.g0 {
        background: var(--neg-bg);
        color: var(--neg);
        border-color: rgba(239, 68, 68, 0.3);
      }

      .mini-btn {
        background: #1A1A22;
        border: 1px solid var(--border);
        color: var(--text-dim);
        font-family: var(--mono);
        font-size: 9.5px;
        font-weight: 700;
        height: 20px;
        min-width: 22px;
        padding: 0 4px;
        border-radius: 3px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transition: all 0.1s;
      }

      .mini-btn:hover {
        color: var(--text);
        border-color: #52525E;
      }

      .mini-btn.cap-on {
        background: var(--warn);
        color: #0A0A0C;
        border-color: var(--warn);
      }

      .mini-btn.vc-on {
        background: #3B82F6;
        color: #FFFFFF;
        border-color: #3B82F6;
      }

      .mini-btn.lock-on {
        background: var(--warn-bg);
        color: var(--warn);
        border-color: rgba(245, 158, 11, 0.55);
      }

      .card-bottom {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 8px;
      }

      .card-meta {
        font-family: var(--mono);
        font-size: 10.5px;
        color: var(--text-muted);
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
      }

      .card-score {
        font-family: var(--mono);
        font-size: 14px;
        font-weight: 700;
        color: var(--text);
        white-space: nowrap;
      }

      .card-score.is-drop-score {
        color: var(--text-dim);
        text-decoration: line-through;
      }

      .card-score-mult {
        font-size: 10px;
        color: var(--warn);
        margin-left: 3px;
      }

      .overflow-box {
        margin-top: 14px;
        padding-top: 12px;
        border-top: 1px dashed var(--border-strong);
      }

      .overflow-title {
        font-family: var(--mono);
        font-size: 10px;
        font-weight: 700;
        color: var(--warn);
        text-transform: uppercase;
        letter-spacing: 0.06em;
        margin-bottom: 8px;
      }

      .court-empty-state {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 8px;
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

  /* Maximum Bipartite Matching (Kuhn's algorithm) for assigning players -> slots */
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

  /* Evaluate SuperCoach Classic Best-9-of-10 + 2x Captain score */
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
      // Captain always counts; lowest projected non-captain starter is dropped
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

  /* Exact Branch-and-Bound / Combinatorial Optimiser */
  function solveOptimalLineup(squadPlayers, lockedBenchIds) {
    if (!squadPlayers.length) return null;

    const lockedSet = new Set(Object.keys(lockedBenchIds || {}).filter((id) => lockedBenchIds[id]));
    const unlocked = squadPlayers.filter((p) => !lockedSet.has(p.id));
    const locked = squadPlayers.filter((p) => lockedSet.has(p.id));

    // Sort unlocked by proj descending so highest-scoring subsets are explored first
    unlocked.sort((a, b) => (b.proj - a.proj) || (b.games - a.games) || (b.avg3 - a.avg3));

    const targetStarters = Math.min(10, unlocked.length);
    const n = unlocked.length;

    // Score a candidate starter set (exact Best 9 of 10 + 2x Captain)
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

    // Generate all combinations of `k` items from `unlocked` (max C(15,10) = 3,003)
    // If user accidentally tagged > 18 players, cap pool to top 18 by proj to stay instant
    const pool = n > 18 ? unlocked.slice(0, 18) : unlocked;
    const pLen = pool.length;
    const k = Math.min(targetStarters, pLen);

    function runSearch(requireFullBench) {
      let bestScore = null;
      let bestResult = null;
      const chosen = [];

      function comb(startIdx) {
        const remNeeded = k - chosen.length;
        if (remNeeded === 0) {
          const candScore = scoreStarterSet(chosen);
          if (!isBetter(candScore, bestScore)) return;

          // Check starter positional legality
          const stMatch = matchPlayersToSlots(chosen, STARTER_SLOTS);
          if (stMatch.matched < k) return;

          // Remaining players go to bench
          const chosenSet = new Set(chosen.map((p) => p.id));
          const benchCandidates = squadPlayers.filter((p) => !chosenSet.has(p.id));
          // Prioritize locked bench players first when matching bench slots
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

        // Upper-bound pruning: even taking the next `remNeeded` highest-proj players
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

    // Tier 1: Strict official rules (10 legal starters + all bench in legal bench slots)
    let result = runSearch(true);
    let strictMode = true;

    // Tier 2: Relaxed bench (if incomplete squad or mid-trade positional imbalance)
    if (!result) {
      strictMode = false;
      result = runSearch(false);
    }

    // Tier 3: Greedy partial fill (if even k starters can't legally fit, e.g., 5 Centers)
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

    // Pick optimal Captain (#1 starter proj) and Vice-Captain (#2 starter proj)
    const sortedStarters = [...result.starters].sort(
      (a, b) => (b.proj - a.proj) || (b.games - a.games) || (b.avg3 - a.avg3)
    );
    const captainId = sortedStarters[0] ? sortedStarters[0].id : null;
    const viceCaptainId = sortedStarters[1] ? sortedStarters[1].id : null;

    return {
      slots: result.slots,
      captainId,
      viceCaptainId,
      strictMode
    };
  }

  /* Keep saved court slots synced cleanly when user adds/removes SQ players in table */
  function reconcileCourtState(state, squadPlayers) {
    const byId = {};
    squadPlayers.forEach((p) => { byId[p.id] = p; });

    const court = state.court;
    if (!court.slots) court.slots = {};
    if (!court.lockedBenchIds) court.lockedBenchIds = {};

    let changed = false;

    // 1. Prune removed players or duplicates or illegal slot placements
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

    // Clean stale lock/captain IDs
    Object.keys(court.lockedBenchIds).forEach((pid) => {
      if (!byId[pid]) {
        delete court.lockedBenchIds[pid];
        changed = true;
      }
    });

    // 2. If court is completely empty and we have squad players, auto-seed cleanly via solver
    const assignedCount = Object.keys(court.slots).length;
    if (assignedCount === 0 && squadPlayers.length > 0) {
      const solved = solveOptimalLineup(squadPlayers, court.lockedBenchIds);
      if (solved) {
        court.slots = solved.slots;
        court.captainId = solved.captainId;
        court.viceCaptainId = solved.viceCaptainId;
        changed = true;
      }
    } else {
      // 3. Auto-place any newly added SQ players into open legal slots
      const unassigned = squadPlayers
        .filter((p) => !seen.has(p.id))
        .sort((a, b) => b.proj - a.proj);

      if (unassigned.length > 0) {
        const openStarters = STARTER_SLOTS.filter((s) => !court.slots[s.key]);
        const openBench = BENCH_SLOTS.filter((s) => !court.slots[s.key]);

        unassigned.forEach((p) => {
          const isLocked = !!court.lockedBenchIds[p.id];
          const searchOrder = isLocked
            ? [...openBench, ...openStarters]
            : [...openStarters, ...openBench];
          const matchSlot = searchOrder.find((s) => !court.slots[s.key] && canFillSlot(p, s.key));
          if (matchSlot) {
            court.slots[matchSlot.key] = p.id;
            seen.add(p.id);
            changed = true;
          }
        });
      }
    }

    // Ensure captain & VC are valid starters
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
      const okA = !pA || canFillSlot(pA, targetSlotKey);
      const okB = !pB || canFillSlot(pB, source.key);
      return okA && okB;
    }
    if (source.type === "overflow") {
      const pA = byId[source.playerId];
      return !!pA && canFillSlot(pA, targetSlotKey);
    }
    return false;
  }

  function renderSlotCard(slotDef, player, ctx) {
    const { escapeHtml, formatMoney } = window.SCHOOPS;
    const isSelected = ui.selectedSource && ui.selectedSource.type === "slot" && ui.selectedSource.key === slotDef.key;
    const isTarget = ui.selectedSource && isValidSwap(ui.selectedSource, slotDef.key, ctx.slots, ctx.byId);

    if (!player) {
      const classes = ["court-slot", "is-empty"];
      if (isSelected) classes.push("selected");
      if (isTarget) classes.push("valid-target");
      return `
        <div class="${classes.join(" ")}" data-slot-key="${slotDef.key}">
          <span>+ EMPTY ${slotDef.label} SLOT</span>
        </div>
      `;
    }

    const isStarter = STARTER_KEYS.has(slotDef.key);
    const isCap = isStarter && ctx.evalRes.captain && ctx.evalRes.captain.id === player.id;
    const isVc = isStarter && ctx.evalRes.viceCaptain && ctx.evalRes.viceCaptain.id === player.id;
    const isDrop = isStarter && ctx.evalRes.droppedPlayer && ctx.evalRes.droppedPlayer.id === player.id;
    const isLockedBench = !!ctx.lockedBenchIds[player.id];

    const classes = ["court-slot"];
    if (isCap) classes.push("is-captain");
    else if (isVc) classes.push("is-vc");
    else if (isDrop) classes.push("is-drop");
    if (isLockedBench) classes.push("is-locked-bench");
    if (isSelected) classes.push("selected");
    if (isTarget) classes.push("valid-target");

    const gClass = player.games >= 4 ? "g4" : (player.games === 0 ? "g0" : (player.games <= 2 ? "g2" : ""));
    const beTxt = player.be === null ? "BE —" : `BE ${player.be}`;
    const beColor = (player.be !== null && player.dist !== null)
      ? (player.dist >= 0 ? "pos-text" : "neg-text")
      : "dim-text";

    const pills = [];
    if (isDrop) pills.push(`<span class="card-pill drop" title="Lowest projected non-Captain starter (dropped under Best 9 of 10)">DROP</span>`);
    if (isLockedBench) pills.push(`<span class="card-pill lock" title="Locked to Bench for OPTIMISE">BENCH LOCK</span>`);
    if (player.isRelevantOut || player.isFringeDnp) pills.push(`<span class="card-pill out">${player.injury ? "INJ" : "OUT"}</span>`);

    const scoreDisplay = isCap
      ? `${Math.round(player.proj * 2)}<span class="card-score-mult">(2×)</span>`
      : `${Math.round(player.proj)}`;

    return `
      <div class="${classes.join(" ")}" data-slot-key="${slotDef.key}">
        <div class="card-top">
          <div class="card-name-wrap">
            <span class="slot-pos-tag">${slotDef.label}</span>
            <span class="card-name">${escapeHtml(player.name)}</span>
            ${pills.join("")}
          </div>
          <div class="card-controls">
            <span class="gms-chip ${gClass}" title="Round ${ctx.round} scheduled games">${player.games}G</span>
            ${isStarter ? `
              <button type="button" class="mini-btn ${isCap ? "cap-on" : ""}" data-set-cap="${escapeHtml(player.id)}" title="Set as Captain (2× score)">C</button>
              <button type="button" class="mini-btn ${isVc ? "vc-on" : ""}" data-set-vc="${escapeHtml(player.id)}" title="Set as Vice-Captain">VC</button>
            ` : ""}
            <button type="button" class="mini-btn ${isLockedBench ? "lock-on" : ""}" data-toggle-lock="${escapeHtml(player.id)}" title="${isLockedBench ? "Unlock from Bench" : "Lock to Bench (OPTIMISE keeps on bench)"}">${isLockedBench ? "🔒" : "🔓"}</button>
          </div>
        </div>
        <div class="card-bottom">
          <div class="card-meta">
            <span>${escapeHtml(player.team)}</span>
            <span>·</span>
            <span>${escapeHtml(player.pos)}</span>
            <span>·</span>
            <span>$${(player.price / 1000000).toFixed(2)}M</span>
            <span>·</span>
            <span class="${beColor}">${beTxt}</span>
            <span class="${player.priceChange >= 0 ? "pos-text" : "neg-text"}">${formatMoney(player.priceChange)}</span>
          </div>
          <div class="card-score ${isDrop ? "is-drop-score" : ""}" title="Round ${ctx.round} projected points">${scoreDisplay}</div>
        </div>
      </div>
    `;
  }

  function renderOverflowCard(player, ctx) {
    const { escapeHtml } = window.SCHOOPS;
    const isSelected = ui.selectedSource && ui.selectedSource.type === "overflow" && ui.selectedSource.playerId === player.id;
    const isLockedBench = !!ctx.lockedBenchIds[player.id];
    const gClass = player.games >= 4 ? "g4" : (player.games === 0 ? "g0" : (player.games <= 2 ? "g2" : ""));

    return `
      <div class="court-slot ${isSelected ? "selected" : ""}" data-overflow-id="${escapeHtml(player.id)}">
        <div class="card-top">
          <div class="card-name-wrap">
            <span class="slot-pos-tag">RES</span>
            <span class="card-name">${escapeHtml(player.name)}</span>
            ${isLockedBench ? `<span class="card-pill lock">BENCH LOCK</span>` : ""}
          </div>
          <div class="card-controls">
            <span class="gms-chip ${gClass}">${player.games}G</span>
            <button type="button" class="mini-btn ${isLockedBench ? "lock-on" : ""}" data-toggle-lock="${escapeHtml(player.id)}" title="Lock to Bench">${isLockedBench ? "🔒" : "🔓"}</button>
          </div>
        </div>
        <div class="card-bottom">
          <div class="card-meta">
            <span>${escapeHtml(player.team)}</span>
            <span>·</span>
            <span>${escapeHtml(player.pos)}</span>
            <span>·</span>
            <span>$${(player.price / 1000000).toFixed(2)}M</span>
          </div>
          <div class="card-score">${Math.round(player.proj)}</div>
        </div>
      </div>
    `;
  }

  function renderCourt() {
    const root = document.getElementById("courtViewRoot");
    if (!root || !window.SCHOOPS) return;

    const state = window.SCHOOPS.getState();
    if (state.activeTab !== "squad" || state.squadViewMode !== "court") return;

    const squadPlayers = window.SCHOOPS.getSquadPlayers();
    if (squadPlayers.length === 0) {
      root.innerHTML = `
        <div class="court-empty-state">
          <h3>No Squad Tracked Yet</h3>
          <p>Switch back to <strong>All</strong> and click the <strong>+</strong> button on your 15 players to tag them into your Squad, then open Court View to visualise and optimise your lineup.</p>
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

    const groups = [
      { title: "Point Guards", keys: ["PG1", "PG2"], single: false },
      { title: "Shooting Guards", keys: ["SG1", "SG2"], single: false },
      { title: "Centre", keys: ["C1"], single: true },
      { title: "Small Forwards", keys: ["SF1", "SF2"], single: false },
      { title: "Power Forwards", keys: ["PF1", "PF2"], single: false },
      { title: "Flex", keys: ["FLX"], single: true }
    ];

    const startersHtml = groups.map((g) => `
      <div class="court-section">
        <div class="court-section-label">${g.title}</div>
        <div class="${g.single ? "court-row-1" : "court-row-2"}">
          ${g.keys.map((k) => renderSlotCard(SLOT_BY_KEY[k], slots[k] ? byId[slots[k]] : null, ctx)).join("")}
        </div>
      </div>
    `).join("");

    const benchHtml = BENCH_SLOTS.map((s) => renderSlotCard(s, slots[s.key] ? byId[slots[s.key]] : null, ctx)).join("");

    const overflowHtml = overflow.length > 0 ? `
      <div class="overflow-box">
        <div class="overflow-title">Unassigned / Overflow (${overflow.length}) — Click a player then a legal slot to swap</div>
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
      bannerHtml = `<span class="court-banner">Swapping ${window.SCHOOPS.escapeHtml(selName)} — click a highlighted green slot (or click again to cancel)</span>`;
    }

    const dropSub = evalRes.droppedPlayer
      ? `Drop: ${window.SCHOOPS.escapeHtml(evalRes.droppedPlayer.name)} (${Math.round(evalRes.droppedPlayer.proj)})`
      : `${evalRes.starters.length}/10 starters filled`;

    root.innerHTML = `
      <div class="court-shell">
        <div class="court-topbar">
          <div class="court-metrics">
            <div class="court-metric">
              <span class="court-metric-label">Rd ${state.round} Proj (Best 9 + 2× C)</span>
              <span class="court-metric-val pos-text">${evalRes.totalProj.toLocaleString()} PTS</span>
              <span class="court-metric-sub">${dropSub}</span>
            </div>
            <div class="court-metric">
              <span class="court-metric-label">Starter Games</span>
              <span class="court-metric-val">${evalRes.starterGames} Gms</span>
              <span class="court-metric-sub">${evalRes.captain ? `C: ${window.SCHOOPS.escapeHtml(evalRes.captain.name)}` : "No Captain"}</span>
            </div>
            <div class="court-metric">
              <span class="court-metric-label">Bench Depth</span>
              <span class="court-metric-val muted-text">${evalRes.benchProj.toLocaleString()} pts</span>
              <span class="court-metric-sub">0 counted · ${evalRes.bench.length}/5 filled</span>
            </div>
          </div>

          <div class="court-actions">
            ${bannerHtml}
            ${lockCount > 0 ? `<button type="button" class="btn" id="courtClearLocksBtn">Clear Locks (${lockCount})</button>` : ""}
            <button type="button" class="court-opt-btn" id="courtOptimiseBtn" title="Find the mathematically highest-scoring legal lineup (Best 9 of 10 + 2× Captain) respecting Bench Locks">⚡ OPTIMISE</button>
          </div>
        </div>

        <div class="court-grid">
          <div class="court-panel court-floor">
            <div class="court-panel-head">
              <span class="court-panel-title">On-Court Starters (${evalRes.starters.length}/10)</span>
              <span class="court-panel-hint">Click any two cards to swap · Best 9 of 10 + 2× C count</span>
            </div>
            ${startersHtml}
          </div>

          <div class="court-panel">
            <div class="court-panel-head">
              <span class="court-panel-title">Bench (${evalRes.bench.length}/5)</span>
              <span class="court-panel-hint">Use 🔓 to pin injured players to Bench</span>
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
    const state = window.SCHOOPS.getState();
    const squadPlayers = window.SCHOOPS.getSquadPlayers();
    const byId = {};
    squadPlayers.forEach((p) => { byId[p.id] = p; });

    // 1. OPTIMISE button
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
      const lockSuffix = lockCount > 0 ? ` (${lockCount} bench lock${lockCount > 1 ? "s" : ""} respected)` : "";

      if (diff > 0) {
        setBanner(`OPTIMISED: +${diff} PTS (${before.totalProj} → ${after.totalProj})${lockSuffix}`, "pos");
      } else if (diff === 0) {
        setBanner(`ALREADY OPTIMAL: ${after.totalProj} PTS${lockSuffix}`, "pos");
      } else {
        setBanner(`OPTIMISED AROUND LOCKS: ${after.totalProj} PTS (${diff} vs unlocked)${lockSuffix}`, "warn");
      }
      renderCourt();
      return;
    }

    // 2. Clear Locks button
    if (e.target.closest("#courtClearLocksBtn")) {
      state.court.lockedBenchIds = {};
      window.SCHOOPS.savePrefs();
      setBanner("Cleared all Bench Locks.", "info");
      renderCourt();
      return;
    }

    // 3. Set Captain
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

    // 4. Set Vice-Captain
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

    // 5. Toggle Force Bench Lock
    const lockBtn = e.target.closest("[data-toggle-lock]");
    if (lockBtn) {
      e.stopPropagation();
      const pid = lockBtn.dataset.toggleLock;
      if (state.court.lockedBenchIds[pid]) {
        delete state.court.lockedBenchIds[pid];
        setBanner(`Unlocked ${byId[pid] ? byId[pid].name : "player"} — eligible to start on OPTIMISE.`, "info");
      } else {
        state.court.lockedBenchIds[pid] = true;
        setBanner(`Locked ${byId[pid] ? byId[pid].name : "player"} to Bench — hit OPTIMISE to adjust lineup.`, "warn");
      }
      window.SCHOOPS.savePrefs();
      renderCourt();
      return;
    }

    // 6. Click Overflow card
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

    // 7. Click Court/Bench Slot (select or execute swap)
    const slotEl = e.target.closest("[data-slot-key]");
    if (slotEl) {
      const targetKey = slotEl.dataset.slotKey;
      const slots = state.court.slots;

      if (!ui.selectedSource) {
        if (!slots[targetKey]) return; // Nothing in empty slot to pick up
        ui.selectedSource = { type: "slot", key: targetKey };
        renderCourt();
        return;
      }

      // Clicking same slot cancels
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
          pA ? `Invalid swap: ${pA.name} (${pA.pos}) cannot swap into ${targetDef.label}.` : "Invalid positional swap.",
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

      // If captain or VC moved to bench, clear so evaluateLineup auto-selects valid starter
      const starterIds = new Set(STARTER_SLOTS.map((s) => slots[s.key]).filter(Boolean));
      if (state.court.captainId && !starterIds.has(state.court.captainId)) state.court.captainId = null;
      if (state.court.viceCaptainId && !starterIds.has(state.court.viceCaptainId)) state.court.viceCaptainId = null;

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
