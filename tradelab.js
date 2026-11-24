/* SCHOOPS: Trade Lab
 * Loaded by index.html via <script src="tradelab.js?v=N"></script>
 *
 * Layout: trades on the left (OUT card -> IN card, with budget- and position-aware suggestions),
 * one sticky "Plan impact" summary on the right, and a plan comparison table that only appears once
 * there are two or more plans. Scores use window.SCHOOPS_SOLVER (court.js): exact best 9 of 10 + 2x captain.
 * Saved state shape (state.tradeLab) is unchanged: { bankM, activePlanId, plans: [{ id, name, trades: [{ outId, inId }] }] }.
 */
(function () {
  "use strict";

  const MAX_TRADES = 4;

  const tlUi = {
    openPicker: null,      // { idx, side: "out" | "in" }
    query: "",
    sortIn: "proj",        // "proj" | "cash" for IN suggestions
    anyPos: false,         // IN suggestions: any position instead of matching the OUT player
    confirmApply: false,
    confirmTimer: null
  };

  const ICON_ARROW = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`;
  const ICON_PLUS = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
  const ICON_X = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
  const ICON_COPY = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;

  function injectStyles() {
    if (document.getElementById("schoops-tradelab-styles")) return;
    const style = document.createElement("style");
    style.id = "schoops-tradelab-styles";
    style.textContent = `
      .tl-wrap { display: flex; flex-direction: column; min-height: 100%; }

      /* Plan tabs */
      .tl-plans {
        display: flex; align-items: center; gap: 4px; flex-wrap: wrap;
        padding: 8px 18px; border-bottom: 1px solid var(--border-subtle);
      }
      .tl-plan-tab {
        display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 10px;
        border-radius: 6px; border: 1px solid transparent; background: transparent;
        color: var(--text-secondary); font-size: 13px; font-weight: 500; cursor: pointer;
        transition: background-color 120ms ease, color 120ms ease;
      }
      .tl-plan-tab.active { background: var(--bg-active); color: var(--text-primary); border-color: var(--border-default); }
      .tl-plan-tab .tl-plan-n { font-family: var(--mono); font-size: 11px; color: var(--text-tertiary); }
      .tl-plan-del { display: inline-flex; padding: 2px; border-radius: 4px; color: var(--text-tertiary); }
      .tl-plan-new { color: var(--text-tertiary); }
      @media (hover: hover) {
        .tl-plan-tab:hover { background: var(--bg-hover); color: var(--text-primary); }
        .tl-plan-del:hover { color: var(--neg-soft); background: var(--neg-bg); }
      }

      .tl-layout {
        display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 18px; padding: 18px; align-items: start;
      }
      @media (max-width: 1100px) { .tl-layout { grid-template-columns: 1fr; } }

      .tl-section-title { font-size: 12.5px; font-weight: 600; color: var(--text-secondary); margin-bottom: 10px; display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
      .tl-section-title span { font-weight: 400; color: var(--text-tertiary); font-size: 11.5px; }

      /* One trade = OUT card -> IN card */
      .tl-trades { display: flex; flex-direction: column; gap: 10px; }
      .tl-trade {
        position: relative; display: grid; grid-template-columns: 26px minmax(0, 1fr) 28px minmax(0, 1fr) 28px;
        align-items: center; gap: 10px; padding: 12px; border-radius: 10px;
        background: #0D0D10; border: 1px solid var(--border-subtle);
      }
      .tl-num { font-family: var(--mono); font-size: 11px; color: var(--text-tertiary); text-align: center; }
      .tl-arrow { color: var(--text-tertiary); display: flex; justify-content: center; pointer-events: none; }
      .tl-trade-rm { width: 28px; height: 28px; border-radius: 6px; border: none; background: transparent; color: var(--text-tertiary); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; }
      @media (hover: hover) { .tl-trade-rm:hover { background: var(--neg-bg); color: var(--neg-soft); } }

      .tl-slot { position: relative; min-width: 0; }
      .tl-slot-btn {
        width: 100%; min-height: 58px; display: flex; align-items: center; gap: 10px; padding: 8px 10px;
        border-radius: 8px; text-align: left; cursor: pointer; color: var(--text-primary);
        background: #141418; border: 1px solid var(--border-default);
        transition: border-color 120ms ease, background-color 120ms ease, transform 160ms var(--ease-out);
      }
      .tl-slot-btn:active { transform: scale(0.99); }
      .tl-slot-btn.empty { border-style: dashed; background: transparent; color: var(--text-secondary); justify-content: center; font-size: 13px; }
      .tl-slot-btn.out-side { box-shadow: inset 3px 0 0 var(--neg-soft); }
      .tl-slot-btn.in-side { box-shadow: inset 3px 0 0 var(--pos-bright); }
      .tl-slot-btn.empty.out-side, .tl-slot-btn.empty.in-side { box-shadow: none; }
      @media (hover: hover) { .tl-slot-btn:hover { border-color: var(--border-strong); background: #18181D; } }
      .tl-slot-tag { font-size: 10.5px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; }
      .tl-slot-tag.out { color: var(--neg-soft); }
      .tl-slot-tag.in { color: var(--pos-bright); }
      .tl-p-main { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 2px; }
      .tl-p-name { font-size: 13.5px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .tl-p-sub { font-family: var(--mono); font-size: 11px; color: var(--text-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .tl-p-right { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; font-family: var(--mono); font-size: 11px; color: var(--text-secondary); flex-shrink: 0; }
      .tl-p-right strong { font-size: 13px; color: var(--text-primary); }

      .tl-trade-deltas { grid-column: 2 / 5; display: flex; flex-wrap: wrap; gap: 6px; }
      .tl-chip { font-family: var(--mono); font-size: 11px; padding: 2px 8px; border-radius: 99px; background: rgba(255, 255, 255, 0.04); color: var(--text-secondary); }
      .tl-chip.pos { background: var(--pos-bg); color: var(--pos-bright); }
      .tl-chip.neg { background: var(--neg-bg); color: var(--neg-soft); }

      .tl-add-trade {
        height: 44px; border-radius: 10px; border: 1px dashed var(--border-default); background: transparent;
        color: var(--text-secondary); font-size: 13px; font-weight: 500; cursor: pointer;
        display: inline-flex; align-items: center; justify-content: center; gap: 8px;
        transition: border-color 120ms ease, color 120ms ease;
      }
      @media (hover: hover) { .tl-add-trade:hover { border-color: var(--border-strong); color: var(--text-primary); } }

      /* Player picker popover (OUT: your squad, IN: suggestions + search) */
      .tl-pop {
        position: absolute; top: calc(100% + 6px); left: 0; right: 0; z-index: 40; min-width: 300px;
        background: var(--bg-elevated); border-radius: 10px; box-shadow: var(--shadow-popover); overflow: hidden;
        transform-origin: top center; animation: tlPopIn 160ms var(--ease-out) both;
      }
      .tl-slot.in .tl-pop { left: auto; }
      @keyframes tlPopIn { from { opacity: 0; transform: translateY(-4px) scale(0.98); } }
      .tl-pop-bar { padding: 8px; border-bottom: 1px solid var(--border-subtle); display: flex; flex-direction: column; gap: 8px; }
      .tl-pop-input {
        width: 100%; height: 32px; padding: 0 10px; border-radius: 6px; outline: none;
        background: var(--bg-input); border: 1px solid var(--border-default); color: var(--text-primary); font-size: 13px;
      }
      .tl-pop-input:focus { border-color: var(--border-strong); }
      .tl-pop-opts { display: flex; gap: 4px; flex-wrap: wrap; align-items: center; font-size: 11.5px; color: var(--text-tertiary); }
      .tl-pop-list { max-height: 320px; overflow-y: auto; padding: 4px; overscroll-behavior: contain; }
      .tl-pop-label { padding: 6px 8px 4px; font-size: 11px; color: var(--text-tertiary); }
      .tl-opt {
        width: 100%; display: flex; align-items: center; gap: 9px; padding: 7px 8px; border: none; border-radius: 6px;
        background: transparent; color: var(--text-primary); text-align: left; cursor: pointer;
      }
      .tl-opt:disabled { opacity: 0.4; cursor: not-allowed; }
      @media (hover: hover) { .tl-opt:not(:disabled):hover { background: var(--bg-active); } }
      .tl-opt .tl-p-name { font-size: 13px; }
      .tl-tag-over { font-family: var(--mono); font-size: 10px; color: var(--neg-soft); }
      .tl-empty-note { padding: 16px; text-align: center; color: var(--text-tertiary); font-size: 12px; }

      /* Plan impact summary */
      .tl-summary {
        position: sticky; top: 12px; background: #0D0D10; border: 1px solid var(--border-subtle); border-radius: 12px; padding: 16px;
        display: flex; flex-direction: column; gap: 14px;
      }
      .tl-bank { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
      .tl-bank label { font-size: 12px; color: var(--text-secondary); }
      .tl-bank-in { display: inline-flex; align-items: center; height: 32px; border-radius: 6px; background: var(--bg-input); border: 1px solid var(--border-default); padding: 0 8px; gap: 2px; }
      .tl-bank-in:focus-within { border-color: var(--border-strong); }
      .tl-bank-in span { font-family: var(--mono); font-size: 12px; color: var(--text-tertiary); }
      .tl-bank-in input { width: 64px; background: transparent; border: none; outline: none; color: var(--text-primary); font-family: var(--mono); font-size: 13px; text-align: right; }
      .tl-metric { display: flex; flex-direction: column; gap: 3px; padding-top: 12px; border-top: 1px solid var(--border-subtle); }
      .tl-metric-lbl { font-size: 11.5px; color: var(--text-tertiary); }
      .tl-metric-row { display: flex; align-items: baseline; gap: 8px; font-family: var(--mono); font-variant-numeric: tabular-nums; }
      .tl-metric-from { font-size: 13px; color: var(--text-tertiary); }
      .tl-metric-to { font-size: 22px; font-weight: 700; color: var(--text-primary); letter-spacing: -0.01em; }
      .tl-metric-delta { font-size: 12.5px; font-weight: 600; }
      .tl-metric-note { font-size: 11.5px; color: var(--text-tertiary); }
      .tl-cap-bad { color: var(--neg-soft); }
      .tl-actions { display: flex; flex-direction: column; gap: 8px; }
      .tl-apply {
        height: 40px; border-radius: 8px; border: 1px solid #4ADEA8; background: var(--pos); color: #04140D;
        font-size: 14px; font-weight: 700; cursor: pointer; transition: transform 160ms var(--ease-out), filter 150ms ease;
      }
      .tl-apply:active { transform: scale(0.98); }
      .tl-apply.confirm { background: var(--warn); border-color: #FBBF24; color: #161004; }
      .tl-apply:disabled { background: rgba(255, 255, 255, 0.05); border-color: var(--border-default); color: var(--text-tertiary); cursor: not-allowed; }
      @media (hover: hover) { .tl-apply:not(:disabled):hover { filter: brightness(1.07); } }
      .tl-secondary { display: flex; gap: 8px; }
      .tl-secondary .ghost-btn { flex: 1; justify-content: center; }

      /* Plan comparison (2+ plans) */
      .tl-compare { margin: 0 18px 18px; border: 1px solid var(--border-subtle); border-radius: 10px; overflow-x: auto; background: #0D0D10; }
      .tl-compare-head { padding: 12px 14px; font-size: 12.5px; font-weight: 600; color: var(--text-secondary); border-bottom: 1px solid var(--border-subtle); }
      .tl-cmp { width: 100%; border-collapse: collapse; font-size: 12.5px; }
      .tl-cmp th { text-align: left; font-weight: 500; font-size: 11.5px; color: var(--text-tertiary); padding: 8px 14px; border-bottom: 1px solid var(--border-subtle); white-space: nowrap; }
      .tl-cmp td { padding: 10px 14px; border-bottom: 1px solid rgba(255, 255, 255, 0.04); white-space: nowrap; }
      .tl-cmp .num { text-align: right; font-family: var(--mono); font-variant-numeric: tabular-nums; }
      .tl-cmp tr.active-plan td { background: rgba(255, 255, 255, 0.03); }
      .tl-cmp tbody tr[data-select-plan] { cursor: pointer; }
      @media (hover: hover) { .tl-cmp tbody tr[data-select-plan]:hover td { background: var(--bg-hover); } }
      .tl-best { margin-left: 6px; font-size: 9.5px; font-weight: 700; padding: 1px 5px; border-radius: 3px; background: var(--pos-bg); color: var(--pos-bright); }

      @media (max-width: 760px) {
        .tl-plans { padding: 8px 12px; }
        .tl-layout { padding: 10px; gap: 12px; }
        .tl-trade { grid-template-columns: minmax(0, 1fr) 28px; gap: 8px; padding: 10px; }
        .tl-num { display: none; }
        .tl-trade .tl-slot.out { grid-column: 1; grid-row: 1; }
        .tl-trade .tl-trade-rm { grid-column: 2; grid-row: 1; }
        .tl-trade .tl-arrow { grid-column: 1; grid-row: 2; }
        .tl-trade .tl-arrow svg { transform: rotate(90deg); }
        .tl-trade .tl-slot.in { grid-column: 1; grid-row: 3; }
        .tl-trade-deltas { grid-column: 1 / 3; grid-row: 4; }
        /* Phone: the picker becomes a bottom sheet */
        .tl-pop {
          position: fixed; left: 8px; right: 8px; bottom: 8px; top: auto; min-width: 0; z-index: 150;
          max-height: 72dvh; display: flex; flex-direction: column; transform-origin: bottom center;
          animation: tlSheetIn 220ms var(--ease-out) both;
          box-shadow: var(--shadow-popover), 0 0 0 100vmax rgba(0, 0, 0, 0.55);
        }
        .tl-slot.in .tl-pop { left: 8px; }
        .tl-pop-list { max-height: none; flex: 1; min-height: 0; }
        @keyframes tlSheetIn { from { opacity: 0; transform: translateY(24px); } }
        .tl-pop-input, .tl-bank-in input { font-size: 16px; }
        .tl-compare { margin: 0 10px 10px; }
      }
    `;
    document.head.appendChild(style);
  }

  // ---------- state + evaluation ----------

  function ensureTradeState(state) {
    if (!state.tradeLab || !Array.isArray(state.tradeLab.plans) || !state.tradeLab.plans.length) {
      state.tradeLab = { bankM: 0, activePlanId: "A", plans: [{ id: "A", name: "Plan A", trades: [{ outId: "", inId: "" }] }] };
    }
    if (!state.tradeLab.plans.some((p) => p.id === state.tradeLab.activePlanId)) {
      state.tradeLab.activePlanId = state.tradeLab.plans[0].id;
    }
    state.tradeLab.plans.forEach((p) => { if (!Array.isArray(p.trades) || !p.trades.length) p.trades = [{ outId: "", inId: "" }]; });
  }

  const positionsOf = (p) => String(p.pos || "").split("/").map((s) => s.trim()).filter(Boolean);
  const sharesPosition = (a, b) => positionsOf(a).some((x) => positionsOf(b).includes(x));
  const isOut = (p) => !!p.injuryStatus && String(p.injuryStatus).toLowerCase().startsWith("out");

  function evaluateSquadMetrics(players, lockedBenchIds) {
    const byId = {};
    players.forEach((p) => { byId[p.id] = p; });
    let optScore = 0, starterGames = 0, captainName = "—";
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
    const threeRdGames = players.reduce((s, p) => s + (p.games || 0) + (p.gamesNext || 0) + (p.gamesAfter || 0), 0);
    return { optScore, starterGames, captainName, cashGen, threeRdGames };
  }

  function evaluatePlan(plan, baselineSquad, baseline, state) {
    const byId = state.computedById;
    const bankDollars = Math.round((Number(state.tradeLab.bankM) || 0) * 1000000);
    const validPairs = plan.trades.filter((t) => t.outId && t.inId && byId[t.outId] && byId[t.inId]);
    const outIds = new Set(validPairs.map((t) => t.outId));
    const cashOut = validPairs.reduce((s, t) => s + byId[t.outId].price, 0);
    const cashIn = validPairs.reduce((s, t) => s + byId[t.inId].price, 0);
    const remainingBank = bankDollars + cashOut - cashIn;

    const sim = baselineSquad.filter((p) => !outIds.has(p.id));
    const simIds = new Set(sim.map((p) => p.id));
    validPairs.forEach((t) => { if (!simIds.has(t.inId)) { sim.push(byId[t.inId]); simIds.add(t.inId); } });
    const post = evaluateSquadMetrics(sim, state.court.lockedBenchIds);

    return {
      plan, validPairs, validCount: validPairs.length, remainingBank, isLegalCap: remainingBank >= 0,
      optScore: post.optScore, ptsDelta: post.optScore - baseline.optScore,
      cashGen: post.cashGen, cashGenDelta: post.cashGen - baseline.cashGen,
      gamesDelta: post.threeRdGames - baseline.threeRdGames, captainName: post.captainName
    };
  }

  // Money available for trade idx: bank + everything sold in this plan - everything bought in the OTHER trades
  function budgetFor(plan, idx, state) {
    const byId = state.computedById;
    let money = Math.round((Number(state.tradeLab.bankM) || 0) * 1000000);
    plan.trades.forEach((t, i) => {
      if (t.outId && byId[t.outId]) money += byId[t.outId].price;
      if (i !== idx && t.inId && byId[t.inId]) money -= byId[t.inId].price;
    });
    return money;
  }

  // ---------- rendering ----------

  function playerSummary(p, side) {
    const { escapeHtml, renderAvatar, formatMoney } = window.SCHOOPS;
    return `
      ${renderAvatar(p, 34)}
      <span class="tl-p-main">
        <span class="tl-slot-tag ${side}">${side === "out" ? "Out" : "In"}</span>
        <span class="tl-p-name">${escapeHtml(p.name)}</span>
        <span class="tl-p-sub">${escapeHtml(p.team)} · ${escapeHtml(p.pos)} · $${(p.price / 1000000).toFixed(2)}M</span>
      </span>
      <span class="tl-p-right">
        <strong>${p.proj} pts</strong>
        <span>BE ${p.be === null ? "—" : p.be}</span>
        <span class="${p.priceChange > 0 ? "pos-text" : p.priceChange < 0 ? "neg-text" : ""}">${formatMoney(p.priceChange)}</span>
      </span>`;
  }

  function optionRow(p, attrs, extra) {
    const { escapeHtml, renderAvatar, formatMoney } = window.SCHOOPS;
    return `
      <button type="button" class="tl-opt" ${attrs}>
        ${renderAvatar(p, 26)}
        <span class="tl-p-main">
          <span class="tl-p-name">${escapeHtml(p.name)}${extra || ""}</span>
          <span class="tl-p-sub">${escapeHtml(p.team)} · ${escapeHtml(p.pos)} · $${(p.price / 1000000).toFixed(2)}M · ${p.games}G</span>
        </span>
        <span class="tl-p-right">
          <strong>${p.proj}</strong>
          <span class="${p.priceChange > 0 ? "pos-text" : p.priceChange < 0 ? "neg-text" : ""}">${formatMoney(p.priceChange)}</span>
        </span>
      </button>`;
  }

  function renderOutPicker(plan, idx, squad) {
    const used = new Set(plan.trades.map((t, i) => (i !== idx ? t.outId : null)).filter(Boolean));
    // Worst value first: players about to lose the most money are the usual trade-out candidates
    const list = [...squad].sort((a, b) => a.priceChange - b.priceChange);
    return `
      <div class="tl-pop" role="listbox" aria-label="Choose a player to trade out">
        <div class="tl-pop-label">Your squad · biggest projected price drops first</div>
        <div class="tl-pop-list">
          ${list.map((p) => optionRow(p, `data-pick-out="${idx}" data-player-id="${window.SCHOOPS.escapeHtml(p.id)}" ${used.has(p.id) ? "disabled" : ""}`)).join("")}
        </div>
      </div>`;
  }

  function renderInPicker(plan, idx, state) {
    const { escapeHtml } = window.SCHOOPS;
    const byId = state.computedById;
    const out = plan.trades[idx].outId ? byId[plan.trades[idx].outId] : null;
    const budget = budgetFor(plan, idx, state);
    const taken = new Set(plan.trades.map((t, i) => (i !== idx ? t.inId : null)).filter(Boolean));
    const q = tlUi.query.trim().toLowerCase();

    let list = Object.values(byId).filter((p) => !p.inSquad && !taken.has(p.id));
    if (q) {
      list = list.filter((p) => p.name.toLowerCase().includes(q) || p.team.toLowerCase().includes(q));
      list.sort((a, b) => (a.name.toLowerCase().startsWith(q) ? 0 : 1) - (b.name.toLowerCase().startsWith(q) ? 0 : 1) || b.proj - a.proj);
    } else {
      list = list.filter((p) => !p.isInactive && !p.isLikelyDnp && !p.isFringeDnp && !isOut(p) && p.games > 0);
      if (out && !tlUi.anyPos) list = list.filter((p) => sharesPosition(p, out));
      list = list.filter((p) => p.price <= budget);
      list.sort(tlUi.sortIn === "cash" ? (a, b) => b.priceChange - a.priceChange : (a, b) => b.proj - a.proj);
    }
    list = list.slice(0, 25);

    const label = q
      ? `Search results`
      : `${tlUi.sortIn === "cash" ? "Biggest projected price rises" : "Highest projected scores"}${out && !tlUi.anyPos ? ` at ${escapeHtml(out.pos)}` : ""} you can afford ($${(budget / 1000000).toFixed(2)}M)`;

    return `
      <div class="tl-pop" role="listbox" aria-label="Choose a player to trade in">
        <div class="tl-pop-bar">
          <input type="text" class="tl-pop-input" data-in-search="${idx}" value="${escapeHtml(tlUi.query)}" placeholder="Search any player or team…" autocomplete="off" />
          <div class="tl-pop-opts">
            <button type="button" class="chip-btn ${tlUi.sortIn === "proj" ? "active" : ""}" data-in-sort="proj">Best score</button>
            <button type="button" class="chip-btn ${tlUi.sortIn === "cash" ? "active" : ""}" data-in-sort="cash">Best cash</button>
            ${out ? `<button type="button" class="chip-btn ${tlUi.anyPos ? "active" : ""}" data-in-anypos="1">Any position</button>` : ""}
          </div>
        </div>
        <div class="tl-pop-label">${label}</div>
        <div class="tl-pop-list">
          ${list.length ? list.map((p) => optionRow(p, `data-pick-in="${idx}" data-player-id="${escapeHtml(p.id)}"`,
              p.price > budget ? ` <span class="tl-tag-over">over budget</span>` : "")).join("")
            : `<div class="tl-empty-note">No one fits. Try "Any position", "Best cash" or search by name.</div>`}
        </div>
      </div>`;
  }

  function renderTrade(plan, idx, squad, state) {
    const { formatMoney } = window.SCHOOPS;
    const byId = state.computedById;
    const t = plan.trades[idx];
    const pOut = t.outId ? byId[t.outId] : null;
    const pIn = t.inId ? byId[t.inId] : null;
    const openOut = tlUi.openPicker && tlUi.openPicker.idx === idx && tlUi.openPicker.side === "out";
    const openIn = tlUi.openPicker && tlUi.openPicker.idx === idx && tlUi.openPicker.side === "in";

    let deltas = "";
    if (pOut && pIn) {
      const cash = pOut.price - pIn.price;
      const pts = Math.round(pIn.proj - pOut.proj);
      const gen = pIn.priceChange - pOut.priceChange;
      const chip = (v, txt) => `<span class="tl-chip ${v > 0 ? "pos" : v < 0 ? "neg" : ""}">${txt}</span>`;
      deltas = `<div class="tl-trade-deltas">
        ${chip(pts, `${pts > 0 ? "+" : ""}${pts} pts this round`)}
        ${chip(gen, `${formatMoney(gen)} price change`)}
        ${chip(cash, cash >= 0 ? `frees ${formatMoney(cash).replace("+", "")}` : `costs ${formatMoney(-cash).replace("+", "")}`)}
      </div>`;
    }

    return `
      <div class="tl-trade">
        <span class="tl-num">${idx + 1}</span>
        <div class="tl-slot out">
          <button type="button" class="tl-slot-btn out-side ${pOut ? "" : "empty"}" data-open-picker="out" data-idx="${idx}" aria-expanded="${openOut}">
            ${pOut ? playerSummary(pOut, "out") : `<span class="tl-slot-tag out">Out</span>&nbsp; Choose who leaves`}
          </button>
          ${openOut ? renderOutPicker(plan, idx, squad) : ""}
        </div>
        <span class="tl-arrow" aria-hidden="true">${ICON_ARROW}</span>
        <div class="tl-slot in">
          <button type="button" class="tl-slot-btn in-side ${pIn ? "" : "empty"}" data-open-picker="in" data-idx="${idx}" aria-expanded="${openIn}">
            ${pIn ? playerSummary(pIn, "in") : `<span class="tl-slot-tag in">In</span>&nbsp; ${pOut ? "Choose a replacement" : "Choose who comes in"}`}
          </button>
          ${openIn ? renderInPicker(plan, idx, state) : ""}
        </div>
        <button type="button" class="tl-trade-rm" data-rem-trade="${idx}" title="Remove this trade" aria-label="Remove trade ${idx + 1}">${ICON_X}</button>
        ${deltas}
      </div>`;
  }

  function metricBlock(label, from, to, delta, deltaTxt, note) {
    const cls = delta > 0 ? "pos-text" : delta < 0 ? "neg-text" : "muted-text";
    return `
      <div class="tl-metric">
        <span class="tl-metric-lbl">${label}</span>
        <span class="tl-metric-row">
          ${from !== null ? `<span class="tl-metric-from">${from} →</span>` : ""}
          <span class="tl-metric-to">${to}</span>
          ${deltaTxt ? `<span class="tl-metric-delta ${cls}">${deltaTxt}</span>` : ""}
        </span>
        ${note ? `<span class="tl-metric-note">${note}</span>` : ""}
      </div>`;
  }

  function renderTradeLab() {
    const root = document.getElementById("tradeLabViewRoot");
    const headerActions = document.getElementById("moduleHeaderActions");
    if (!root || !window.SCHOOPS) return;
    const state = window.SCHOOPS.getState();
    if (state.activeNav !== "tradelab") return;

    ensureTradeState(state);
    const { escapeHtml, formatMoney } = window.SCHOOPS;
    const squad = window.SCHOOPS.getSquadPlayers().sort((a, b) => b.price - a.price);
    if (headerActions) headerActions.innerHTML = "";

    if (!squad.length) {
      root.innerHTML = `
        <div class="lc-empty-page">
          <h3>Add your squad first</h3>
          <p style="margin-bottom:14px;">Trade Lab tests trades against your real squad: score change, price changes and whether you can afford it.</p>
          <button type="button" class="primary-btn" data-go-court="1">Add players in My Court</button>
        </div>`;
      return;
    }

    const baseline = evaluateSquadMetrics(squad, state.court.lockedBenchIds);
    const evals = state.tradeLab.plans.map((pl) => evaluatePlan(pl, squad, baseline, state));
    const ev = evals.find((e) => e.plan.id === state.tradeLab.activePlanId) || evals[0];
    const plan = ev.plan;

    const tabs = state.tradeLab.plans.map((pl) => {
      const n = evals.find((e) => e.plan.id === pl.id).validCount;
      return `
        <span class="tl-plan-tab ${pl.id === plan.id ? "active" : ""}" data-select-plan="${escapeHtml(pl.id)}" role="tab" tabindex="0" aria-selected="${pl.id === plan.id}">
          ${escapeHtml(pl.name)} <span class="tl-plan-n">${n}</span>
          ${state.tradeLab.plans.length > 1 ? `<span class="tl-plan-del" data-del-plan="${escapeHtml(pl.id)}" role="button" title="Delete ${escapeHtml(pl.name)}" aria-label="Delete ${escapeHtml(pl.name)}">${ICON_X}</span>` : ""}
        </span>`;
    }).join("");

    const bankM = Number(state.tradeLab.bankM) || 0;
    const bankNote = ev.isLegalCap
      ? `${formatMoney(ev.remainingBank).replace("+", "")} left after these trades`
      : `<span class="tl-cap-bad">You're ${formatMoney(-ev.remainingBank).replace("+", "")} short. Pick cheaper players or add bank.</span>`;

    const applyLabel = tlUi.confirmApply
      ? `Confirm: apply ${ev.validCount} trade${ev.validCount === 1 ? "" : "s"}`
      : `Apply to my squad`;
    const canApply = ev.validCount > 0 && ev.isLegalCap;

    const compareHtml = evals.length > 1 ? (() => {
      const legal = evals.filter((e) => e.validCount && e.isLegalCap);
      const bestPts = legal.length ? Math.max(...legal.map((e) => e.optScore)) : null;
      const bestCash = legal.length ? Math.max(...legal.map((e) => e.cashGen)) : null;
      const sign = (v) => (v > 0 ? "+" : "");
      return `
        <div class="tl-compare">
          <div class="tl-compare-head">Compare plans</div>
          <table class="tl-cmp">
            <thead><tr><th>Plan</th><th class="num">Trades</th><th class="num">Round score</th><th class="num">vs now</th><th class="num">Price change</th><th class="num">Bank left</th><th class="num">Games (3 rds)</th></tr></thead>
            <tbody>
              <tr><td class="muted-text">Current squad</td><td class="num muted-text">0</td><td class="num">${baseline.optScore}</td><td class="num muted-text">—</td><td class="num">${formatMoney(baseline.cashGen)}</td><td class="num muted-text">$${bankM.toFixed(2)}M</td><td class="num muted-text">—</td></tr>
              ${evals.map((e) => `
                <tr class="${e.plan.id === plan.id ? "active-plan" : ""}" data-select-plan="${escapeHtml(e.plan.id)}">
                  <td><strong style="font-weight:600">${escapeHtml(e.plan.name)}</strong>${!e.isLegalCap ? ` <span class="tl-tag-over">over cap</span>` : ""}</td>
                  <td class="num">${e.validCount}</td>
                  <td class="num">${e.optScore}${e.validCount && e.isLegalCap && e.optScore === bestPts ? `<span class="tl-best">BEST</span>` : ""}</td>
                  <td class="num ${e.ptsDelta > 0 ? "pos-text" : e.ptsDelta < 0 ? "neg-text" : "muted-text"}">${sign(e.ptsDelta)}${e.ptsDelta}</td>
                  <td class="num">${formatMoney(e.cashGen)}${e.validCount && e.isLegalCap && e.cashGen === bestCash ? `<span class="tl-best">BEST</span>` : ""}</td>
                  <td class="num ${e.isLegalCap ? "" : "neg-text"}">${formatMoney(e.remainingBank)}</td>
                  <td class="num ${e.gamesDelta > 0 ? "pos-text" : e.gamesDelta < 0 ? "neg-text" : "muted-text"}">${sign(e.gamesDelta)}${e.gamesDelta}</td>
                </tr>`).join("")}
            </tbody>
          </table>
        </div>`;
    })() : "";

    root.innerHTML = `
      <div class="tl-wrap">
        <div class="tl-plans" role="tablist" aria-label="Trade plans">
          ${tabs}
          <button type="button" class="tl-plan-tab tl-plan-new" id="tlNewPlanBtn" title="Start another plan to compare">${ICON_PLUS} New plan</button>
        </div>

        <div class="tl-layout">
          <div>
            <div class="tl-section-title">Trades <span>Pick who leaves, then a replacement. Up to ${MAX_TRADES}.</span></div>
            <div class="tl-trades">
              ${plan.trades.map((_, i) => renderTrade(plan, i, squad, state)).join("")}
              ${plan.trades.length < MAX_TRADES ? `<button type="button" class="tl-add-trade" id="tlAddTradeBtn">${ICON_PLUS} Add another trade</button>` : ""}
            </div>
          </div>

          <aside class="tl-summary" aria-label="Plan impact">
            <div class="tl-bank">
              <label for="tlBankInput">Your bank (unspent cash)</label>
              <span class="tl-bank-in"><span>$</span><input type="number" id="tlBankInput" inputmode="decimal" step="0.01" min="0" value="${bankM.toFixed(2)}" /><span>M</span></span>
            </div>
            ${metricBlock(`Round ${state.round} score (best 9 + 2× C)`, ev.validCount ? baseline.optScore : null, ev.optScore,
              ev.ptsDelta, ev.validCount ? `${ev.ptsDelta > 0 ? "+" : ""}${ev.ptsDelta}` : "", `Captain: ${escapeHtml(ev.captainName)}`)}
            ${metricBlock("Squad price change this round", ev.validCount ? formatMoney(baseline.cashGen) : null, formatMoney(ev.cashGen),
              ev.cashGenDelta, ev.validCount ? formatMoney(ev.cashGenDelta) : "", "")}
            ${metricBlock("Bank after trades", null, `<span class="${ev.isLegalCap ? "" : "tl-cap-bad"}">${formatMoney(ev.remainingBank).replace("+", "")}</span>`, 0, "", bankNote)}
            ${ev.validCount ? metricBlock("Games over the next 3 rounds", null, `${ev.gamesDelta > 0 ? "+" : ""}${ev.gamesDelta}`, ev.gamesDelta, "", "Compared with your current squad") : ""}
            <div class="tl-actions">
              <button type="button" class="tl-apply ${tlUi.confirmApply ? "confirm" : ""}" id="tlApplyPlanBtn" ${canApply ? "" : "disabled"}
                title="${canApply ? "Swap these players in your saved squad" : (ev.validCount ? "This plan is over your bank" : "Complete a trade first")}">${applyLabel}</button>
              <div class="tl-secondary">
                <button type="button" class="ghost-btn" id="tlClonePlanBtn">${ICON_COPY} Duplicate to compare</button>
                <button type="button" class="ghost-btn" id="tlClearPlanBtn">Clear</button>
              </div>
            </div>
          </aside>
        </div>
        ${compareHtml}
      </div>`;

    if (tlUi.openPicker && tlUi.openPicker.side === "in") {
      const inp = root.querySelector("[data-in-search]");
      if (inp && document.activeElement !== inp) {
        inp.focus();
        try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch (err) {}
      }
    }
  }

  // ---------- actions ----------

  function closePicker() {
    tlUi.openPicker = null;
    tlUi.query = "";
  }

  function createNewPlan(cloneFrom) {
    const state = window.SCHOOPS.getState();
    ensureTradeState(state);
    const letter = String.fromCharCode(65 + state.tradeLab.plans.length);
    const id = `${letter}_${Date.now().toString(36).slice(-3)}`;
    state.tradeLab.plans.push({
      id,
      name: `Plan ${letter}`,
      trades: cloneFrom ? cloneFrom.trades.map((t) => ({ outId: t.outId, inId: t.inId })) : [{ outId: "", inId: "" }]
    });
    state.tradeLab.activePlanId = id;
    closePicker();
    save();
  }

  function getActivePlan(state) {
    ensureTradeState(state);
    return state.tradeLab.plans.find((p) => p.id === state.tradeLab.activePlanId) || state.tradeLab.plans[0];
  }

  // Full app render so the header and sidebar plan counts stay in sync (it re-runs renderTradeLab too)
  function save() {
    window.SCHOOPS.savePrefs();
    window.SCHOOPS.render();
  }

  function handleClick(e) {
    const state = window.SCHOOPS.getState();
    if (e.target.closest("[data-go-court]")) { window.SCHOOPS.setActiveNav("court"); return; }
    const plan = getActivePlan(state);

    const del = e.target.closest("[data-del-plan]");
    if (del) {
      e.stopPropagation();
      if (state.tradeLab.plans.length <= 1) return;
      state.tradeLab.plans = state.tradeLab.plans.filter((p) => p.id !== del.dataset.delPlan);
      if (!state.tradeLab.plans.some((p) => p.id === state.tradeLab.activePlanId)) state.tradeLab.activePlanId = state.tradeLab.plans[0].id;
      closePicker();
      save();
      return;
    }
    if (e.target.closest("#tlNewPlanBtn")) { createNewPlan(null); return; }
    const sel = e.target.closest("[data-select-plan]");
    if (sel) { state.tradeLab.activePlanId = sel.dataset.selectPlan; closePicker(); tlUi.confirmApply = false; save(); return; }

    const opener = e.target.closest("[data-open-picker]");
    if (opener) {
      const idx = Number(opener.dataset.idx);
      const side = opener.dataset.openPicker;
      const same = tlUi.openPicker && tlUi.openPicker.idx === idx && tlUi.openPicker.side === side;
      closePicker();
      if (!same) tlUi.openPicker = { idx, side };
      renderTradeLab();
      return;
    }

    const pickOut = e.target.closest("[data-pick-out]");
    if (pickOut) {
      const idx = Number(pickOut.dataset.pickOut);
      plan.trades[idx].outId = pickOut.dataset.playerId;
      // Straight on to choosing the replacement
      closePicker();
      if (!plan.trades[idx].inId) tlUi.openPicker = { idx, side: "in" };
      save();
      return;
    }
    const pickIn = e.target.closest("[data-pick-in]");
    if (pickIn) {
      plan.trades[Number(pickIn.dataset.pickIn)].inId = pickIn.dataset.playerId;
      closePicker();
      save();
      return;
    }
    const sortBtn = e.target.closest("[data-in-sort]");
    if (sortBtn) { tlUi.sortIn = sortBtn.dataset.inSort; renderTradeLab(); return; }
    if (e.target.closest("[data-in-anypos]")) { tlUi.anyPos = !tlUi.anyPos; renderTradeLab(); return; }

    const rem = e.target.closest("[data-rem-trade]");
    if (rem) {
      plan.trades.splice(Number(rem.dataset.remTrade), 1);
      if (!plan.trades.length) plan.trades.push({ outId: "", inId: "" });
      closePicker();
      save();
      return;
    }
    if (e.target.closest("#tlAddTradeBtn")) {
      if (plan.trades.length < MAX_TRADES) {
        plan.trades.push({ outId: "", inId: "" });
        closePicker();
        tlUi.openPicker = { idx: plan.trades.length - 1, side: "out" };
        save();
      }
      return;
    }
    if (e.target.closest("#tlClonePlanBtn")) { createNewPlan(plan); return; }
    if (e.target.closest("#tlClearPlanBtn")) { plan.trades = [{ outId: "", inId: "" }]; closePicker(); save(); return; }

    if (e.target.closest("#tlApplyPlanBtn")) {
      const pairs = plan.trades.filter((t) => t.outId && t.inId && state.computedById[t.outId] && state.computedById[t.inId]);
      if (!pairs.length) return;
      // Two-step confirm in place (no browser dialog): first click arms it for a few seconds
      if (!tlUi.confirmApply) {
        tlUi.confirmApply = true;
        clearTimeout(tlUi.confirmTimer);
        tlUi.confirmTimer = setTimeout(() => { tlUi.confirmApply = false; renderTradeLab(); }, 4000);
        renderTradeLab();
        return;
      }
      clearTimeout(tlUi.confirmTimer);
      tlUi.confirmApply = false;
      let net = 0;
      pairs.forEach((t) => {
        net += state.computedById[t.outId].price - state.computedById[t.inId].price;
        delete state.squadIds[t.outId];
        state.squadIds[t.inId] = true;
      });
      state.tradeLab.bankM = Math.max(0, Number((((Number(state.tradeLab.bankM) || 0) * 1000000 + net) / 1000000).toFixed(2)));
      plan.trades = [{ outId: "", inId: "" }];
      window.SCHOOPS.savePrefs();
      window.SCHOOPS.setActiveNav("court");
      return;
    }

    // Click outside an open picker closes it
    if (tlUi.openPicker && !e.target.closest(".tl-pop")) { closePicker(); renderTradeLab(); }
  }

  function handleChange(e) {
    if (e.target.id === "tlBankInput") {
      const state = window.SCHOOPS.getState();
      state.tradeLab.bankM = Math.max(0, parseFloat(e.target.value) || 0);
      save();
    }
  }

  function handleInput(e) {
    if (e.target.matches("[data-in-search]")) {
      tlUi.query = e.target.value;
      renderTradeLab();
    }
  }

  function handleKey(e) {
    if (e.key === "Escape" && tlUi.openPicker) { closePicker(); renderTradeLab(); }
    // Plan tabs are spans with role="tab": make Enter/Space work like a click
    if ((e.key === "Enter" || e.key === " ") && e.target.matches("[data-select-plan][role='tab']")) {
      e.preventDefault();
      e.target.click();
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
      root.addEventListener("keydown", handleKey);
    }
    window.SCHOOPS.onRender(renderTradeLab);
    renderTradeLab();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
