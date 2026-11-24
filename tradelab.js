/* SCHOOPS — Linear Edition: Phase 3 Trade Lab & Side-by-Side Scenario Comparator
 * Loaded by index.html via <script src="tradelab.js?v=12"></script>
 * Uses window.SCHOOPS_SOLVER for exact Best-9-of-10 + 2x Captain trade impact scoring.
 */
(function () {
  "use strict";

  const tlUi = {
    openSearchIdx: null,
    searchQueries: {}
  };

  function injectStyles() {
    if (document.getElementById("schoops-tradelab-styles")) return;
    const style = document.createElement("style");
    style.id = "schoops-tradelab-styles";
    style.textContent = `
      .tl-wrap {
        display: flex;
        flex-direction: column;
        min-height: 100%;
      }

      .tl-topbar {
        min-height: 40px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
        padding: 6px 16px;
        border-bottom: 1px solid var(--border-subtle);
        background: rgba(255, 255, 255, 0.012);
      }

      .tl-plan-tabs {
        display: flex;
        align-items: center;
        gap: 4px;
        flex-wrap: wrap;
      }

      .tl-plan-tab {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        height: 26px;
        padding: 0 10px;
        background: transparent;
        border: 1px solid transparent;
        border-radius: 5px;
        color: var(--text-secondary);
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: background-color 120ms var(--ease-out), color 120ms var(--ease-out), border-color 120ms var(--ease-out);
      }

      .tl-plan-tab:hover { background: var(--bg-hover); color: var(--text-primary); }
      .tl-plan-tab.active {
        background: var(--bg-active);
        border-color: var(--border-default);
        color: var(--text-primary);
        font-weight: 600;
      }

      .tl-tab-del {
        background: none;
        border: none;
        color: var(--text-tertiary);
        font-size: 12px;
        cursor: pointer;
        line-height: 1;
        padding: 0 1px;
      }
      .tl-tab-del:hover { color: var(--neg-soft); }

      .tl-bank-box {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        font-size: 11.5px;
        color: var(--text-secondary);
      }

      .tl-bank-input {
        width: 74px;
        height: 26px;
        padding: 0 7px;
        background: var(--bg-input);
        border: 1px solid var(--border-default);
        border-radius: 5px;
        color: var(--text-primary);
        font-family: var(--mono);
        font-size: 12px;
        font-weight: 600;
        text-align: right;
        outline: none;
      }
      .tl-bank-input:focus { border-color: var(--border-strong); }

      .tl-content {
        padding: 18px;
        display: flex;
        flex-direction: column;
        gap: 16px;
        max-width: 1280px;
      }

      /* Dual Impact KPI Strip */
      .tl-kpi-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 10px;
      }

      @media (max-width: 820px) {
        .tl-kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }

      .tl-kpi {
        background: #141417;
        border: 1px solid var(--border-subtle);
        border-radius: 8px;
        padding: 12px 14px;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .tl-kpi-lbl {
        font-size: 11.5px;
        color: var(--text-tertiary);
      }

      .tl-kpi-main {
        display: flex;
        align-items: baseline;
        gap: 8px;
      }

      .tl-kpi-val {
        font-family: var(--mono);
        font-size: 19px;
        font-weight: 700;
        color: var(--text-primary);
      }

      .tl-kpi-delta {
        font-family: var(--mono);
        font-size: 11.5px;
        font-weight: 600;
      }

      .tl-kpi-sub {
        font-family: var(--mono);
        font-size: 10.5px;
        color: var(--text-tertiary);
      }

      /* Trade Builder Card */
      .tl-card {
        background: #0D0D0F;
        border: 1px solid var(--border-subtle);
        border-radius: 9px;
        overflow: visible;
      }

      .tl-card-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 10px 14px;
        border-bottom: 1px solid var(--border-subtle);
      }

      .tl-card-title {
        font-size: 12px;
        font-weight: 600;
        color: var(--text-primary);
      }

      .tl-trade-rows {
        display: flex;
        flex-direction: column;
      }

      .tl-trade-row {
        display: grid;
        grid-template-columns: 28px minmax(0, 1fr) 24px minmax(0, 1fr) auto;
        align-items: center;
        gap: 10px;
        padding: 10px 14px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.042);
      }

      .tl-trade-row:last-child { border-bottom: none; }

      @media (max-width: 860px) {
        .tl-trade-row {
          grid-template-columns: 1fr;
          gap: 8px;
        }
        .tl-arrow { display: none; }
      }

      .tl-idx {
        font-family: var(--mono);
        font-size: 11px;
        color: var(--text-tertiary);
        text-align: center;
      }

      .tl-arrow {
        color: var(--text-tertiary);
        text-align: center;
        font-family: var(--mono);
      }

      .tl-select {
        width: 100%;
        height: 38px;
        padding: 0 10px;
        background: #141417;
        border: 1px solid var(--border-default);
        border-radius: 6px;
        color: var(--text-primary);
        font-size: 12px;
        outline: none;
        cursor: pointer;
      }
      .tl-select:focus { border-color: var(--border-strong); }

      .tl-picker {
        position: relative;
        width: 100%;
      }

      .tl-picked-chip {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        height: 38px;
        padding: 0 10px;
        background: #141417;
        border: 1px solid var(--border-default);
        border-radius: 6px;
      }

      .tl-picked-left {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
      }

      .tl-picked-name {
        font-size: 12px;
        font-weight: 500;
        color: var(--text-primary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .tl-picked-meta {
        font-family: var(--mono);
        font-size: 10.5px;
        color: var(--text-secondary);
        white-space: nowrap;
      }

      .tl-search-in {
        width: 100%;
        height: 38px;
        padding: 0 11px;
        background: #141417;
        border: 1px solid var(--border-default);
        border-radius: 6px;
        color: var(--text-primary);
        font-size: 12px;
        outline: none;
      }
      .tl-search-in:focus { border-color: var(--border-strong); }
      .tl-search-in::placeholder { color: var(--text-tertiary); }

      .tl-ac-menu {
        position: absolute;
        top: calc(100% + 4px);
        left: 0;
        right: 0;
        max-height: 240px;
        overflow-y: auto;
        background: var(--bg-elevated);
        border-radius: 7px;
        padding: 4px;
        box-shadow: var(--shadow-popover);
        z-index: 75;
        display: flex;
        flex-direction: column;
        gap: 2px;
        overscroll-behavior: contain;
      }

      .tl-ac-opt {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        width: 100%;
        padding: 6px 8px;
        background: transparent;
        border: none;
        border-radius: 5px;
        color: var(--text-primary);
        font-size: 12px;
        cursor: pointer;
        text-align: left;
      }
      .tl-ac-opt:hover { background: var(--bg-active); }

      .tl-row-delta {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        font-family: var(--mono);
        font-size: 11px;
        white-space: nowrap;
      }

      .tl-card-foot {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        flex-wrap: wrap;
        padding: 10px 14px;
        border-top: 1px solid var(--border-subtle);
      }

      /* Side-by-Side Scenario Comparison Matrix */
      .tl-cmp-table {
        width: 100%;
        border-collapse: collapse;
        text-align: left;
      }

      .tl-cmp-table th {
        padding: 8px 14px;
        font-size: 11px;
        font-weight: 500;
        color: var(--text-tertiary);
        border-bottom: 1px solid var(--border-subtle);
        white-space: nowrap;
      }

      .tl-cmp-table td {
        padding: 11px 15px;
        font-size: 13.5px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.045);
        white-space: nowrap;
      }

      .tl-cmp-table tr:last-child td { border-bottom: none; }
      .tl-cmp-table th.num, .tl-cmp-table td.num { text-align: right; }
      .tl-cmp-table tbody tr.is-active-plan { background: rgba(255, 255, 255, 0.032); }

      .tl-best-badge {
        font-family: var(--mono);
        font-size: 9px;
        font-weight: 700;
        padding: 1px 5px;
        border-radius: 3px;
        background: var(--pos-bg);
        color: var(--pos-bright);
        margin-left: 5px;
      }

      .tl-overcap {
        color: var(--neg-soft);
        font-family: var(--mono);
        font-size: 10px;
        font-weight: 600;
      }

      @media (max-width: 768px) {
        .tl-bank-input, .tl-select, .tl-search-in { font-size: 16px; }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureTradeState(state) {
    if (!state.tradeLab || !Array.isArray(state.tradeLab.plans) || !state.tradeLab.plans.length) {
      state.tradeLab = {
        bankM: 0,
        activePlanId: "A",
        plans: [{ id: "A", name: "Plan A", trades: [{ outId: "", inId: "" }] }]
      };
    }
    if (!state.tradeLab.plans.some((p) => p.id === state.tradeLab.activePlanId)) {
      state.tradeLab.activePlanId = state.tradeLab.plans[0].id;
    }
  }

  function evaluateSquadMetrics(players, lockedBenchIds) {
    const byId = {};
    players.forEach((p) => { byId[p.id] = p; });

    let optScore = 0;
    let starterGames = 0;
    let captainName = "—";

    if (window.SCHOOPS_SOLVER && players.length) {
      const solved = window.SCHOOPS_SOLVER.solveOptimalLineup(players, lockedBenchIds || {});
      if (solved) {
        const res = window.SCHOOPS_SOLVER.evaluateLineup(solved.slots, byId, solved.captainId, solved.viceCaptainId);
        optScore = res.totalProj;
        starterGames = res.starterGames;
        captainName = res.captain ? res.captain.name : "—";
      }
    } else {
      optScore = Math.round(players.reduce((s, p) => s + (p.proj || 0), 0));
    }

    const cashGen = players.reduce((s, p) => s + (p.priceChange || 0), 0);
    const totalPrice = players.reduce((s, p) => s + (p.price || 0), 0);
    const threeRdGames = players.reduce((s, p) => {
      return s + (p.games || 0) + (p.gamesNext || 0) + (p.gamesAfter || 0);
    }, 0);

    return { optScore, starterGames, captainName, cashGen, totalPrice, threeRdGames };
  }

  function evaluatePlan(plan, baselineSquad, baselineMetrics, state) {
    const byId = state.computedById;
    const bankDollars = Math.round((Number(state.tradeLab.bankM) || 0) * 1000000);

    const validPairs = (plan.trades || []).filter((t) => t.outId && t.inId && byId[t.outId] && byId[t.inId]);
    const outIds = new Set(validPairs.map((t) => t.outId));
    const inPlayers = validPairs.map((t) => byId[t.inId]);

    const cashOut = validPairs.reduce((s, t) => s + byId[t.outId].price, 0);
    const cashIn = validPairs.reduce((s, t) => s + byId[t.inId].price, 0);
    const remainingBank = bankDollars + cashOut - cashIn;

    // Build simulated post-trade squad
    const simSquad = baselineSquad.filter((p) => !outIds.has(p.id));
    const simIds = new Set(simSquad.map((p) => p.id));
    inPlayers.forEach((p) => {
      if (!simIds.has(p.id)) {
        simSquad.push(p);
        simIds.add(p.id);
      }
    });

    const postMetrics = evaluateSquadMetrics(simSquad, state.court.lockedBenchIds);

    return {
      plan,
      validCount: validPairs.length,
      validPairs,
      remainingBank,
      isLegalCap: remainingBank >= 0,
      optScore: postMetrics.optScore,
      ptsDelta: postMetrics.optScore - baselineMetrics.optScore,
      cashGen: postMetrics.cashGen,
      cashGenDelta: postMetrics.cashGen - baselineMetrics.cashGen,
      gamesDelta: postMetrics.threeRdGames - baselineMetrics.threeRdGames,
      starterGamesDelta: postMetrics.starterGames - baselineMetrics.starterGames,
      captainName: postMetrics.captainName,
      simSquadIds: simIds
    };
  }

  function renderInPicker(trade, idx, state) {
    const { escapeHtml, renderAvatar, formatMoney } = window.SCHOOPS;
    const picked = trade.inId ? state.computedById[trade.inId] : null;
    if (picked && tlUi.openSearchIdx !== idx) {
      return `
        <div class="tl-picker">
          <div class="tl-picked-chip">
            <span class="tl-picked-left">
              ${renderAvatar(picked, 22)}
              <span class="tl-picked-name">${escapeHtml(picked.name)}</span>
              <span class="tl-picked-meta">${escapeHtml(picked.team)} · $${(picked.price / 1000000).toFixed(2)}M · BE ${picked.be === null ? "—" : picked.be}</span>
            </span>
            <button type="button" class="tl-tab-del" data-clear-in="${idx}" title="Change incoming player">×</button>
          </div>
        </div>
      `;
    }

    const q = (tlUi.searchQueries[idx] || "").trim().toLowerCase();
    let dropdownHtml = "";
    if (tlUi.openSearchIdx === idx) {
      const candidates = Object.values(state.computedById)
        .filter((p) => !p.inSquad)
        .filter((p) => !q || p.name.toLowerCase().includes(q) || p.team.toLowerCase().includes(q))
        .sort((a, b) => {
          if (q) {
            const as = a.name.toLowerCase().startsWith(q) ? 0 : 1;
            const bs = b.name.toLowerCase().startsWith(q) ? 0 : 1;
            if (as !== bs) return as - bs;
          }
          return (b.priceChange - a.priceChange) || (b.proj - a.proj);
        })
        .slice(0, 10);

      dropdownHtml = `
        <div class="tl-ac-menu">
          ${candidates.length ? candidates.map((p) => `
            <button type="button" class="tl-ac-opt" data-pick-in="${idx}" data-player-id="${escapeHtml(p.id)}">
              <span class="tl-picked-left">
                ${renderAvatar(p, 20)}
                <span>${escapeHtml(p.name)}</span>
                <span class="muted-text mono" style="font-size:10px;">${escapeHtml(p.team)} · ${escapeHtml(p.pos)}</span>
              </span>
              <span class="mono" style="font-size:10.5px;">
                $${(p.price / 1000000).toFixed(2)}M · <span class="${p.priceChange >= 0 ? "pos-text" : "neg-text"}">${formatMoney(p.priceChange)}</span> · ${p.games}G
              </span>
            </button>
          `).join("") : `<div style="padding:8px; font-size:11px; color:var(--text-tertiary);">No matching players</div>`}
        </div>
      `;
    }

    return `
      <div class="tl-picker">
        <input type="text" class="tl-search-in" data-in-search="${idx}" value="${escapeHtml(tlUi.searchQueries[idx] || "")}" placeholder="Search player IN (e.g. Dybantsa, Bamba)..." autocomplete="off" />
        ${dropdownHtml}
      </div>
    `;
  }

  function renderTradeLab() {
    const root = document.getElementById("tradeLabViewRoot");
    const headerActions = document.getElementById("moduleHeaderActions");
    if (!root || !window.SCHOOPS) return;

    const state = window.SCHOOPS.getState();
    if (state.activeNav !== "tradelab") return;

    ensureTradeState(state);
    const { escapeHtml, formatMoney, formatPriceM } = window.SCHOOPS;
    const squad = window.SCHOOPS.getSquadPlayers().sort((a, b) => b.price - a.price);

    if (headerActions) {
      headerActions.innerHTML = `
        <button type="button" class="ghost-btn" id="tlNewPlanBtn">+ New Plan</button>
      `;
    }

    if (!squad.length) {
      root.innerHTML = `
        <div class="lc-empty-page">
          <h3>Build your squad first</h3>
          <p style="margin-bottom:14px;">Tag your players in Market so Trade Lab can test real OUT → IN moves, calculate Best-9-of-10 score swings, and track your salary bank.</p>
          <button type="button" class="primary-btn" data-go-market="1">Open Market</button>
        </div>
      `;
      return;
    }

    const baselineMetrics = evaluateSquadMetrics(squad, state.court.lockedBenchIds);
    const evaluatedPlans = state.tradeLab.plans.map((pl) => evaluatePlan(pl, squad, baselineMetrics, state));
    const activeEval = evaluatedPlans.find((e) => e.plan.id === state.tradeLab.activePlanId) || evaluatedPlans[0];
    const activePlan = activeEval.plan;

    const bestPtsVal = Math.max(...evaluatedPlans.filter((e) => e.validCount > 0 && e.isLegalCap).map((e) => e.optScore), -1);
    const bestCashVal = Math.max(...evaluatedPlans.filter((e) => e.validCount > 0 && e.isLegalCap).map((e) => e.cashGen), -999999999);

    const tabsHtml = state.tradeLab.plans.map((pl) => `
      <div class="tl-plan-tab ${pl.id === activePlan.id ? "active" : ""}" data-select-plan="${escapeHtml(pl.id)}">
        <span>${escapeHtml(pl.name)}</span>
        ${state.tradeLab.plans.length > 1 ? `<button type="button" class="tl-tab-del" data-del-plan="${escapeHtml(pl.id)}" title="Delete plan">×</button>` : ""}
      </div>
    `).join("");

    const usedOutIds = new Set(activePlan.trades.map((t) => t.outId).filter(Boolean));

    const tradeRowsHtml = activePlan.trades.map((tr, idx) => {
      const pOut = tr.outId ? state.computedById[tr.outId] : null;
      const pIn = tr.inId ? state.computedById[tr.inId] : null;

      const optionsHtml = `<option value="">Select squad player OUT...</option>` + squad.map((p) => {
        const disabled = usedOutIds.has(p.id) && tr.outId !== p.id;
        const selected = tr.outId === p.id ? "selected" : "";
        return `<option value="${escapeHtml(p.id)}" ${selected} ${disabled ? "disabled" : ""}>${escapeHtml(p.name)} (${escapeHtml(p.pos)} · $${(p.price / 1000000).toFixed(2)}M · BE ${p.be === null ? "—" : p.be} · ${formatMoney(p.priceChange)})</option>`;
      }).join("");

      let deltaHtml = `<span class="dim-text">Select pair</span>`;
      if (pOut && pIn) {
        const cashDiff = pOut.price - pIn.price;
        const projDiff = Math.round(pIn.proj - pOut.proj);
        const cgDiff = pIn.priceChange - pOut.priceChange;
        deltaHtml = `
          <span title="Salary freed/spent" class="${cashDiff >= 0 ? "pos-text" : "neg-text"}">${formatMoney(cashDiff)}</span>
          <span title="Raw proj delta" class="${projDiff >= 0 ? "pos-text" : "neg-text"}">${projDiff >= 0 ? "+" : ""}${projDiff}p</span>
          <span title="Cash gen delta" class="${cgDiff >= 0 ? "pos-text" : "neg-text"}">${formatMoney(cgDiff)} gen</span>
        `;
      }

      return `
        <div class="tl-trade-row">
          <span class="tl-idx">#${idx + 1}</span>
          <select class="tl-select" data-out-select="${idx}">${optionsHtml}</select>
          <span class="tl-arrow">→</span>
          ${renderInPicker(tr, idx, state)}
          <div class="tl-row-delta">
            ${deltaHtml}
            ${activePlan.trades.length > 1 ? `<button type="button" class="tl-tab-del" data-rem-trade="${idx}" title="Remove trade row">×</button>` : ""}
          </div>
        </div>
      `;
    }).join("");

    const ptsDeltaSign = activeEval.ptsDelta > 0 ? "+" : "";
    const gamesDeltaSign = activeEval.gamesDelta > 0 ? "+" : "";

    root.innerHTML = `
      <div class="tl-wrap">
        <div class="tl-topbar">
          <div class="tl-plan-tabs">${tabsHtml}</div>
          <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
            ${window.SCHOOPS.renderDismissibleTip("tradelab")}
            <div class="tl-bank-box">
            <label for="tlBankInput">Available Bank ($M)</label>
            <input type="number" id="tlBankInput" class="tl-bank-input" step="0.01" value="${(Number(state.tradeLab.bankM) || 0).toFixed(2)}" />
            </div>
          </div>
        </div>

        <div class="tl-content">
          <!-- Dual Impact Summary -->
          <div class="tl-kpi-grid">
            <div class="tl-kpi">
              <span class="tl-kpi-lbl">Optimised Rd ${state.round} Score (Best 9 + 2× C)</span>
              <div class="tl-kpi-main">
                <span class="tl-kpi-val">${activeEval.optScore.toLocaleString()}</span>
                <span class="tl-kpi-delta ${activeEval.ptsDelta > 0 ? "pos-text" : activeEval.ptsDelta < 0 ? "neg-text" : "muted-text"}">${ptsDeltaSign}${activeEval.ptsDelta} pts</span>
              </div>
              <span class="tl-kpi-sub">Baseline: ${baselineMetrics.optScore.toLocaleString()} · C: ${escapeHtml(activeEval.captainName)}</span>
            </div>

            <div class="tl-kpi">
              <span class="tl-kpi-lbl">Projected Squad Cash Gen</span>
              <div class="tl-kpi-main">
                <span class="tl-kpi-val ${activeEval.cashGen >= 0 ? "pos-text" : "neg-text"}">${formatMoney(activeEval.cashGen)}</span>
                <span class="tl-kpi-delta ${activeEval.cashGenDelta > 0 ? "pos-text" : activeEval.cashGenDelta < 0 ? "neg-text" : "muted-text"}">${formatMoney(activeEval.cashGenDelta)}</span>
              </div>
              <span class="tl-kpi-sub">Baseline: ${formatMoney(baselineMetrics.cashGen)}</span>
            </div>

            <div class="tl-kpi">
              <span class="tl-kpi-lbl">Remaining Salary Bank</span>
              <div class="tl-kpi-main">
                <span class="tl-kpi-val ${activeEval.isLegalCap ? "pos-text" : "neg-text"}">${formatMoney(activeEval.remainingBank)}</span>
              </div>
              <span class="tl-kpi-sub">${activeEval.isLegalCap ? "Salary cap legal" : "Over salary cap!"}</span>
            </div>

            <div class="tl-kpi">
              <span class="tl-kpi-lbl">Upcoming Games Impact</span>
              <div class="tl-kpi-main">
                <span class="tl-kpi-val ${activeEval.gamesDelta > 0 ? "pos-text" : activeEval.gamesDelta < 0 ? "neg-text" : ""}">${gamesDeltaSign}${activeEval.gamesDelta} Gms</span>
              </div>
              <span class="tl-kpi-sub">Starter slate: ${activeEval.starterGamesDelta >= 0 ? "+" : ""}${activeEval.starterGamesDelta} this rd</span>
            </div>
          </div>

          <!-- Active Plan Trade Builder -->
          <div class="tl-card">
            <div class="tl-card-head">
              <span class="tl-card-title">${escapeHtml(activePlan.name)} · ${activeEval.validCount} active trade${activeEval.validCount === 1 ? "" : "s"}</span>
              <div style="display:flex; gap:6px;">
                ${activePlan.trades.length < 4 ? `<button type="button" class="ghost-btn" id="tlAddTradeBtn">+ Add Trade</button>` : ""}
                <button type="button" class="ghost-btn" id="tlClonePlanBtn">Duplicate to Compare</button>
              </div>
            </div>
            <div class="tl-trade-rows">${tradeRowsHtml}</div>
            <div class="tl-card-foot">
              <span class="muted-text" style="font-size:11.5px;">Supports up to 4 trades (including Trade Boost weeks).</span>
              <div style="display:flex; gap:8px;">
                <button type="button" class="ghost-btn" id="tlClearPlanBtn">Clear</button>
                ${activeEval.validCount > 0 ? `<button type="button" class="primary-btn" id="tlApplyPlanBtn">Apply ${escapeHtml(activePlan.name)} to Squad</button>` : ""}
              </div>
            </div>
          </div>

          <!-- Side-by-Side Scenario Comparison Matrix -->
          <div class="tl-card" style="overflow-x:auto;">
            <div class="tl-card-head">
              <span class="tl-card-title">Scenario Comparison</span>
              <span class="muted-text" style="font-size:11px;">Baseline vs. all trade plans (exact Best-9-of-10 + 2× C solver)</span>
            </div>
            <table class="tl-cmp-table">
              <thead>
                <tr>
                  <th>Scenario</th>
                  <th class="num">Trades</th>
                  <th class="num">Opt Score</th>
                  <th class="num">Pts Δ</th>
                  <th class="num">Cash Gen</th>
                  <th class="num">Cash Gen Δ</th>
                  <th class="num">Bank Left</th>
                  <th class="num">3-Rd Gms Δ</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong style="font-weight:500; color:var(--text-secondary);">Current Squad (Baseline)</strong></td>
                  <td class="num mono muted-text">0</td>
                  <td class="num mono">${baselineMetrics.optScore.toLocaleString()}</td>
                  <td class="num mono muted-text">—</td>
                  <td class="num mono">${formatMoney(baselineMetrics.cashGen)}</td>
                  <td class="num mono muted-text">—</td>
                  <td class="num mono muted-text">${formatPriceM(Math.round((Number(state.tradeLab.bankM) || 0) * 1000000))}</td>
                  <td class="num mono muted-text">—</td>
                </tr>
                ${evaluatedPlans.map((ev) => {
                  const isBestPts = ev.validCount > 0 && ev.isLegalCap && ev.optScore === bestPtsVal && evaluatedPlans.length > 1;
                  const isBestCash = ev.validCount > 0 && ev.isLegalCap && ev.cashGen === bestCashVal && evaluatedPlans.length > 1;
                  return `
                    <tr class="${ev.plan.id === activePlan.id ? "is-active-plan" : ""}" data-select-plan="${escapeHtml(ev.plan.id)}" style="cursor:pointer;">
                      <td>
                        <strong>${escapeHtml(ev.plan.name)}</strong>
                        ${!ev.isLegalCap ? `<span class="tl-overcap"> · OVER CAP</span>` : ""}
                      </td>
                      <td class="num mono">${ev.validCount}</td>
                      <td class="num mono">${ev.optScore.toLocaleString()}${isBestPts ? `<span class="tl-best-badge">MAX PTS</span>` : ""}</td>
                      <td class="num mono ${ev.ptsDelta > 0 ? "pos-text" : ev.ptsDelta < 0 ? "neg-text" : "muted-text"}">${ev.ptsDelta > 0 ? "+" : ""}${ev.ptsDelta}</td>
                      <td class="num mono">${formatMoney(ev.cashGen)}${isBestCash ? `<span class="tl-best-badge">MAX CASH</span>` : ""}</td>
                      <td class="num mono ${ev.cashGenDelta > 0 ? "pos-text" : ev.cashGenDelta < 0 ? "neg-text" : "muted-text"}">${formatMoney(ev.cashGenDelta)}</td>
                      <td class="num mono ${ev.isLegalCap ? "pos-text" : "neg-text"}">${formatMoney(ev.remainingBank)}</td>
                      <td class="num mono ${ev.gamesDelta > 0 ? "pos-text" : ev.gamesDelta < 0 ? "neg-text" : "muted-text"}">${ev.gamesDelta > 0 ? "+" : ""}${ev.gamesDelta}</td>
                    </tr>
                  `;
                }).join("")}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  function createNewPlan(cloneFrom) {
    const state = window.SCHOOPS.getState();
    ensureTradeState(state);
    const nextLetter = String.fromCharCode(65 + state.tradeLab.plans.length);
    const newId = `${nextLetter}_${Date.now().toString(36).slice(-3)}`;
    const newPlan = {
      id: newId,
      name: `Plan ${nextLetter}`,
      trades: cloneFrom
        ? cloneFrom.trades.map((t) => ({ outId: t.outId, inId: t.inId }))
        : [{ outId: "", inId: "" }]
    };
    state.tradeLab.plans.push(newPlan);
    state.tradeLab.activePlanId = newId;
    tlUi.openSearchIdx = null;
    tlUi.searchQueries = {};
    window.SCHOOPS.savePrefs();
    window.SCHOOPS.render();
  }

  function getActivePlan(state) {
    ensureTradeState(state);
    return state.tradeLab.plans.find((p) => p.id === state.tradeLab.activePlanId) || state.tradeLab.plans[0];
  }

  function handleHeaderClick(e) {
    if (e.target.closest("#tlNewPlanBtn")) {
      createNewPlan(null);
    }
  }

  function handleClick(e) {
    if (e.target.closest("[data-go-market]")) { window.SCHOOPS.setActiveNav("market", "all"); return; }

    const state = window.SCHOOPS.getState();
    const plan = getActivePlan(state);

    const delPlanBtn = e.target.closest("[data-del-plan]");
    if (delPlanBtn) {
      e.stopPropagation();
      const pid = delPlanBtn.dataset.delPlan;
      if (state.tradeLab.plans.length <= 1) return;
      state.tradeLab.plans = state.tradeLab.plans.filter((p) => p.id !== pid);
      if (state.tradeLab.activePlanId === pid) state.tradeLab.activePlanId = state.tradeLab.plans[0].id;
      tlUi.openSearchIdx = null;
      tlUi.searchQueries = {};
      window.SCHOOPS.savePrefs();
      window.SCHOOPS.render();
      return;
    }

    const selPlan = e.target.closest("[data-select-plan]");
    if (selPlan) {
      state.tradeLab.activePlanId = selPlan.dataset.selectPlan;
      tlUi.openSearchIdx = null;
      tlUi.searchQueries = {};
      window.SCHOOPS.savePrefs();
      renderTradeLab();
      return;
    }

    const pickIn = e.target.closest("[data-pick-in]");
    if (pickIn) {
      const idx = Number(pickIn.dataset.pickIn);
      plan.trades[idx].inId = pickIn.dataset.playerId;
      tlUi.openSearchIdx = null;
      tlUi.searchQueries[idx] = "";
      window.SCHOOPS.savePrefs();
      renderTradeLab();
      return;
    }

    const clearIn = e.target.closest("[data-clear-in]");
    if (clearIn) {
      const idx = Number(clearIn.dataset.clearIn);
      plan.trades[idx].inId = "";
      tlUi.openSearchIdx = idx;
      tlUi.searchQueries[idx] = "";
      window.SCHOOPS.savePrefs();
      renderTradeLab();
      const inp = document.querySelector(`[data-in-search="${idx}"]`);
      if (inp) inp.focus();
      return;
    }

    const remTrade = e.target.closest("[data-rem-trade]");
    if (remTrade) {
      const idx = Number(remTrade.dataset.remTrade);
      plan.trades.splice(idx, 1);
      if (!plan.trades.length) plan.trades.push({ outId: "", inId: "" });
      tlUi.openSearchIdx = null;
      window.SCHOOPS.savePrefs();
      renderTradeLab();
      return;
    }

    if (e.target.closest("#tlAddTradeBtn")) {
      if (plan.trades.length < 4) {
        plan.trades.push({ outId: "", inId: "" });
        window.SCHOOPS.savePrefs();
        renderTradeLab();
      }
      return;
    }

    if (e.target.closest("#tlClonePlanBtn")) {
      createNewPlan(plan);
      return;
    }

    if (e.target.closest("#tlClearPlanBtn")) {
      plan.trades = [{ outId: "", inId: "" }];
      tlUi.openSearchIdx = null;
      tlUi.searchQueries = {};
      window.SCHOOPS.savePrefs();
      renderTradeLab();
      return;
    }

    if (e.target.closest("#tlApplyPlanBtn")) {
      const validPairs = plan.trades.filter((t) => t.outId && t.inId && state.computedById[t.outId] && state.computedById[t.inId]);
      if (!validPairs.length) return;
      const summary = validPairs.map((t) => `${state.computedById[t.outId].name} → ${state.computedById[t.inId].name}`).join("\n");
      if (!confirm(`Apply ${plan.name} to your saved Squad?\n\n${summary}`)) return;

      let cashNet = 0;
      validPairs.forEach((t) => {
        cashNet += (state.computedById[t.outId].price - state.computedById[t.inId].price);
        delete state.squadIds[t.outId];
        state.squadIds[t.inId] = true;
      });
      state.tradeLab.bankM = Math.max(0, Number((((Number(state.tradeLab.bankM) || 0) * 1000000 + cashNet) / 1000000).toFixed(2)));
      plan.trades = [{ outId: "", inId: "" }];
      window.SCHOOPS.savePrefs();
      window.SCHOOPS.setActiveNav("court");
      return;
    }

    if (!e.target.closest(".tl-picker") && tlUi.openSearchIdx !== null) {
      tlUi.openSearchIdx = null;
      renderTradeLab();
    }
  }

  function handleChange(e) {
    const state = window.SCHOOPS.getState();
    const plan = getActivePlan(state);

    if (e.target.matches("[data-out-select]")) {
      const idx = Number(e.target.dataset.outSelect);
      plan.trades[idx].outId = e.target.value;
      window.SCHOOPS.savePrefs();
      renderTradeLab();
    } else if (e.target.id === "tlBankInput") {
      state.tradeLab.bankM = parseFloat(e.target.value) || 0;
      window.SCHOOPS.savePrefs();
      renderTradeLab();
    }
  }

  function handleInput(e) {
    if (e.target.matches("[data-in-search]")) {
      const idx = Number(e.target.dataset.inSearch);
      tlUi.openSearchIdx = idx;
      tlUi.searchQueries[idx] = e.target.value;
      const pos = e.target.selectionStart;
      renderTradeLab();
      const inp = document.querySelector(`[data-in-search="${idx}"]`);
      if (inp) {
        inp.focus();
        try { inp.setSelectionRange(pos, pos); } catch (err) {}
      }
    }
  }

  function handleFocusIn(e) {
    if (e.target.matches("[data-in-search]")) {
      const idx = Number(e.target.dataset.inSearch);
      if (tlUi.openSearchIdx !== idx) {
        tlUi.openSearchIdx = idx;
        renderTradeLab();
        const inp = document.querySelector(`[data-in-search="${idx}"]`);
        if (inp) inp.focus();
      }
    }
  }

  function init() {
    if (!window.SCHOOPS) return;
    injectStyles();
    const root = document.getElementById("tradeLabViewRoot");
    if (root) {
      root.addEventListener("click", handleClick);
      root.addEventListener("change", handleChange);
      root.addEventListener("input", handleInput);
      root.addEventListener("focusin", handleFocusIn);
    }
    const hdr = document.getElementById("moduleHeaderActions");
    if (hdr) hdr.addEventListener("click", handleHeaderClick);
    window.SCHOOPS.onRender(renderTradeLab);
    renderTradeLab();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
