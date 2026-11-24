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

      /* Trade advisor */
      .tl-adv { margin: 18px 18px 0; border: 1px solid rgba(110, 123, 242, 0.28); border-radius: 12px;
        background: linear-gradient(180deg, rgba(110, 123, 242, 0.07), rgba(110, 123, 242, 0.015)); }
      .tl-adv-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px 20px; flex-wrap: wrap; padding: 14px 16px 10px; }
      .tl-adv-title { font-size: 14px; font-weight: 600; }
      .tl-adv-sub { font-size: 12px; color: var(--text-secondary); margin-top: 2px; }
      .tl-adv-ctrls { display: flex; align-items: center; gap: 4px; flex-wrap: wrap; }
      .tl-adv-lbl { font-size: 11.5px; color: var(--text-tertiary); margin-right: 2px; }
      .tl-lock { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin: 14px 18px 0; padding: 10px 14px; border-radius: 10px;
        border: 1px solid var(--border-subtle); background: var(--bg-elevated); font-size: 13px; color: var(--text-secondary); }
      .tl-lock strong { color: var(--text-primary); font-size: 15px; }
      .tl-lock-pill { padding: 3px 9px; border-radius: 999px; font-size: 11.5px; font-weight: 600; white-space: nowrap; background: var(--bg-active); color: var(--text-secondary); }
      .tl-lock.open { border-color: rgba(52, 211, 153, 0.3); background: linear-gradient(180deg in oklab, rgba(52, 211, 153, 0.08), rgba(52, 211, 153, 0.02)), var(--bg-elevated); }
      .tl-lock.open .tl-lock-pill { background: var(--pos-bg); color: var(--pos-bright); }
      .tl-lock-txt { min-width: 0; text-wrap: pretty; }
      @media (max-width: 760px) { .tl-lock { margin: 10px 10px 0; } }
      .tl-adv-list { transition: opacity 160ms ease; }
      .tl-adv-list.is-stale { opacity: 0.55; }
      /* Suggestions: cards in a responsive grid */
      .tl-adv-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 420px), 1fr)); gap: 10px; padding: 4px 14px 14px; }
      .tl-adv-list > .tl-adv-empty { grid-column: 1 / -1; }
      .tl-sug { display: flex; flex-direction: column; border: 1px solid var(--border-subtle); border-radius: 10px; background: #111115; min-width: 0; }
      .tl-sug-top { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 12px; padding: 11px 12px 9px; font-family: var(--mono); font-size: 12px; }
      .tl-sug-rank { width: 20px; height: 20px; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; background: var(--bg-active); color: var(--text-tertiary); font-size: 11px; }
      .tl-sug-pts { font-size: 20px; font-weight: 700; letter-spacing: -0.02em; }
      .tl-sug-pts small { font-size: 11px; font-weight: 500; margin-left: 3px; }
      .tl-sug-cash { font-weight: 600; }
      .tl-sug-bank { margin-left: auto; font-size: 11px; }
      .tl-sug-swaps { display: flex; flex-direction: column; border-top: 1px solid rgba(255, 255, 255, 0.05); }
      .tl-sw { display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "who add" "meta add"; column-gap: 10px; row-gap: 1px; align-items: center; padding: 8px 12px; }
      .tl-sw + .tl-sw { border-top: 1px dashed rgba(255, 255, 255, 0.06); }
      .tl-sw-who { grid-area: who; display: flex; align-items: center; gap: 7px; min-width: 0; font-size: 13px; font-weight: 500; }
      .tl-sw-out { color: var(--neg-soft); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .tl-sw-in { color: var(--pos-bright); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .tl-sw-arrow { color: var(--text-tertiary); flex-shrink: 0; }
      .tl-sw-meta { grid-area: meta; font-family: var(--mono); font-size: 11px; color: var(--text-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .tl-sw-add { grid-area: add; height: 28px; padding: 0 11px; border-radius: 7px; border: 1px solid var(--border-default); background: transparent; color: var(--text-secondary);
        font-size: 12px; font-weight: 500; cursor: pointer; white-space: nowrap; transition: color 120ms ease, background-color 120ms ease, border-color 120ms ease, transform 160ms var(--ease-press); }
      .tl-sw-add:active { transform: scale(0.97); }
      @media (hover: hover) { .tl-sw-add:not(:disabled):hover { color: var(--text-primary); border-color: var(--border-strong); background: var(--bg-hover); } }
      .tl-sw-add.done { border-color: transparent; color: var(--pos-bright); cursor: default; }
      .tl-sw-add:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
      .tl-sug-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: auto; padding: 10px 12px 12px; border-top: 1px solid rgba(255, 255, 255, 0.05); }
      .tl-sug-actions .primary-btn:disabled { opacity: 0.6; cursor: default; }
      .tl-adv-flash { margin: 0 14px 8px; padding: 8px 12px; border-radius: 8px; background: var(--pos-bg); color: var(--pos-bright); font-size: 12.5px; }
      .tl-adv-conf { font-family: var(--sans); font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 99px; }
      .tl-adv-conf.strong { background: var(--pos-bg); color: var(--pos-bright); }
      .tl-adv-conf.lean { background: rgba(255, 196, 0, 0.1); color: #e8c25a; }
      .tl-adv-conf.flip { background: rgba(255, 255, 255, 0.06); color: var(--text-tertiary); }
      .tl-adv-empty { padding: 14px 8px 16px; font-size: 12.5px; color: var(--text-tertiary); }
      .tl-adv-foot { padding: 8px 16px 12px; font-size: 11.5px; color: var(--text-tertiary); border-top: 1px solid rgba(255, 255, 255, 0.05); }

      @media (max-width: 760px) {
        .tl-adv { margin: 10px 10px 0; }
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

  // ---------- trade advisor ----------
  // Ranks this round's trades for your squad. Scores use the exact best-9-of-10 + 2x captain solver.
  // "Chance it helps" = P(trade scores more), from how far projections typically miss (likely ranges).
  const CASH_PER_POINT = 50000; // Balanced goal: $50K of projected price rise counts as 1 point
  const advisor = { goal: "balanced", n: 1, results: null, key: "", busy: false, flash: "", flashTimer: null };

  function sigmaOf(p) {
    if (window.SCHOOPS.projSigma) return window.SCHOOPS.projSigma(p);
    if (p.projIsOurs && p.projLo !== null && p.projHi !== null) return Math.max(4, (p.projHi - p.projLo) / 1.35);
    return Math.max(6, (p.proj || 0) * 0.3);
  }
  function normCdf(z) {
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989423 * Math.exp((-z * z) / 2);
    const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return z > 0 ? 1 - p : p;
  }
  const goalValue = (dPts, dCash) => (advisor.goal === "points" ? dPts : advisor.goal === "cash" ? dCash / CASH_PER_POINT : dPts + dCash / CASH_PER_POINT);

  // Same squad, same answer: the advisor scores many overlapping squads, so remember each one
  let metricsMemo = { key: "", map: new Map() };
  function memoMetrics(players, state) {
    const ctx = [state.projSource, state.round, JSON.stringify(state.court.lockedBenchIds || {})].join("|");
    if (metricsMemo.key !== ctx) metricsMemo = { key: ctx, map: new Map() };
    const k = players.map((p) => p.id).sort().join(",");
    let m = metricsMemo.map.get(k);
    if (!m) { m = evaluateSquadMetrics(players, state.court.lockedBenchIds); metricsMemo.map.set(k, m); }
    return m;
  }

  function bestSingles(state, squad, bank, used, limit = 60) {
    const base = memoMetrics(squad, state);
    const pool = Object.values(state.computedById).filter((p) => !p.inSquad && !used.has(p.id) && !p.isInactive
      && !p.isLikelyDnp && !p.isFringeDnp && p.games > 0 && !isOut(p) && !squad.some((s) => s.id === p.id));
    const pairs = [];
    squad.forEach((o) => {
      if (used.has(o.id)) return;
      pool.forEach((i) => {
        if (!sharesPosition(i, o) || i.price > bank + o.price) return;
        pairs.push({ o, i, proxy: goalValue(i.proj - o.proj, i.priceChange - o.priceChange) });
      });
    });
    pairs.sort((a, b) => b.proxy - a.proxy);
    return pairs.slice(0, limit).map(({ o, i }) => {
      const sim = squad.filter((p) => p.id !== o.id).concat([i]);
      const m = memoMetrics(sim, state);
      const dPts = m.optScore - base.optScore;
      const dCash = m.cashGen - base.cashGen;
      return { trades: [{ o, i }], dPts, dCash, sd: Math.hypot(sigmaOf(i), sigmaOf(o)), bankAfter: bank + o.price - i.price, value: goalValue(dPts, dCash) };
    }).sort((a, b) => b.value - a.value);
  }

  async function runAdvisor(state, squad) {
    const bank = Math.round((Number(state.tradeLab.bankM) || 0) * 1000000);
    const singles = bestSingles(state, squad, bank, new Set(), advisor.n >= 3 ? 36 : 60);
    let results;
    if (advisor.n === 1) {
      // Variety: at most two ideas per player going out, so one obvious sell doesn't fill the list
      const perOut = {};
      results = singles.filter((r) => {
        const id = r.trades[0].o.id;
        perOut[id] = (perOut[id] || 0) + 1;
        return perOut[id] <= 2;
      }).slice(0, 10);
    } else {
      // 2-4 trades: start from each of the best singles, then keep adding the best follow-up
      // with the updated squad and bank (each step scored with the exact lineup solver)
      const starts = singles.slice(0, advisor.n >= 3 ? 5 : 8);
      const follow = advisor.n >= 3 ? 8 : 12;
      const seen = new Set();
      results = [];
      for (const first of starts) {
        await new Promise((r) => setTimeout(r, 0)); // keep the page responsive between chains
        let combo = first;
        let squadNow = squad.filter((p) => p.id !== first.trades[0].o.id).concat([first.trades[0].i]);
        const used = new Set([first.trades[0].o.id, first.trades[0].i.id]);
        for (let k = 1; k < advisor.n; k++) {
          const next = bestSingles(state, squadNow, combo.bankAfter, used, follow)[0];
          if (!next || next.value <= 0) break;
          const t = next.trades[0];
          combo = {
            trades: combo.trades.concat([t]),
            dPts: combo.dPts + next.dPts, dCash: combo.dCash + next.dCash,
            sd: Math.hypot(combo.sd, next.sd), bankAfter: next.bankAfter, value: combo.value + next.value
          };
          squadNow = squadNow.filter((p) => p.id !== t.o.id).concat([t.i]);
          used.add(t.o.id); used.add(t.i.id);
        }
        const key = combo.trades.map(({ o, i }) => `${o.id}>${i.id}`).sort().join("|");
        if (!seen.has(key)) { seen.add(key); results.push(combo); }
      }
      results.sort((a, b) => b.value - a.value);
      results = results.slice(0, 8);
    }
    results.forEach((r) => { r.pBetter = normCdf(r.dPts / r.sd); });
    return results;
  }

  // Put suggested swaps into the plan you're working on (replacing a swap for the same player going out)
  function addSwapsToPlan(swaps) {
    const state = window.SCHOOPS.getState();
    ensureTradeState(state);
    const plan = state.tradeLab.plans.find((p) => p.id === state.tradeLab.activePlanId) || state.tradeLab.plans[0];
    let added = 0, full = false;
    swaps.forEach(({ outId, inId }) => {
      if (plan.trades.some((t) => t.outId === outId && t.inId === inId)) return;
      if (plan.trades.some((t) => t.inId === inId)) return;
      const same = plan.trades.find((t) => t.outId === outId);
      const empty = plan.trades.find((t) => !t.outId && !t.inId);
      if (same) { same.inId = inId; added++; }
      else if (empty) { empty.outId = outId; empty.inId = inId; added++; }
      else if (plan.trades.length < MAX_TRADES) { plan.trades.push({ outId, inId }); added++; }
      else full = true;
    });
    advisor.flash = full
      ? `${plan.name} already has ${MAX_TRADES} trades. Remove one to add more.`
      : added ? `Added ${added} swap${added === 1 ? "" : "s"} to ${plan.name}.` : `Already in ${plan.name}.`;
    clearTimeout(advisor.flashTimer);
    advisor.flashTimer = setTimeout(() => { advisor.flash = ""; renderTradeLab(); }, 3500);
    save();
  }

  function advisorKey(state, squad) {
    return [state.projSource, state.tradeLab.bankM, squad.map((p) => p.id).sort().join(","), advisor.goal, advisor.n, state.round].join("|");
  }

  // Trade window banner: open (counting down to lockout) or closed (when it reopens)
  function renderLockout() {
    const S = window.SCHOOPS;
    if (!S.tradeWindow) return "";
    const w = S.tradeWindow();
    if (!w.lockMs) return "";
    const when = (ms) => new Date(ms).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
    if (w.open) {
      return `<div class="tl-lock open" role="status">
        <span class="tl-lock-pill">Trades open</span>
        <span class="tl-lock-txt">Round ${w.round} locks in <strong class="mono" data-countdown="${w.lockMs}">${S.formatCountdown(w.lockMs)}</strong> <span class="dim-text">· ${when(w.lockMs)}</span></span>
      </div>`;
    }
    return `<div class="tl-lock" role="status">
      <span class="tl-lock-pill">Trades closed</span>
      <span class="tl-lock-txt">Trading reopens after this round ends${w.roundEndMs ? ` (around ${when(w.roundEndMs)})` : ""}. Round ${w.round} locks in <strong class="mono" data-countdown="${w.lockMs}">${S.formatCountdown(w.lockMs)}</strong> <span class="dim-text">· ${when(w.lockMs)}</span></span>
    </div>`;
  }

  function renderAdvisor(state, squad) {
    const { escapeHtml, formatMoney } = window.SCHOOPS;
    const key = advisorKey(state, squad);
    if (advisor.key !== key && !advisor.busy) {
      advisor.busy = true;
      advisor.key = key;
      setTimeout(async () => {
        let res;
        try { res = await runAdvisor(window.SCHOOPS.getState(), window.SCHOOPS.getSquadPlayers()); }
        catch (err) { res = []; console.error("Trade advisor:", err); }
        advisor.busy = false;
        // Settings changed while we were working: run again for the new ones
        const nowKey = advisorKey(window.SCHOOPS.getState(), window.SCHOOPS.getSquadPlayers());
        if (nowKey === key) advisor.results = res;
        else advisor.key = "";
        renderTradeLab();
      }, 30);
    }
    const chip = (attr, val, label, on) => `<button type="button" class="chip-btn ${on ? "active" : ""}" ${attr}="${val}">${label}</button>`;
    const conf = (p) => (p >= 0.75 ? ["strong", "Strong"] : p >= 0.6 ? ["lean", "Lean"] : ["flip", "Coin flip"]);
    const plan = state.tradeLab.plans.find((p) => p.id === state.tradeLab.activePlanId) || state.tradeLab.plans[0];
    const planName = plan ? plan.name : "your plan";
    const inPlan = (o, i) => plan && plan.trades.some((t) => t.outId === o.id && t.inId === i.id);
    const money = (v) => `$${(v / 1e6).toFixed(2)}M`;
    const rows = !advisor.results
      ? `<div class="tl-adv-empty">Checking every trade for your squad…</div>`
      : !advisor.results.length
        ? `<div class="tl-adv-empty">No affordable trades improve your squad on this goal. Try another goal, or add bank.</div>`
        : advisor.results.map((r, idx) => {
          const [cls, label] = conf(r.pBetter);
          const tip = `<div class="tip-h">${label}: ${Math.round(r.pBetter * 100)}% chance it helps</div><div class="tip-row"><span>Projected gain</span><b class="${r.dPts >= 0 ? "tip-pos" : "tip-neg"}">${r.dPts > 0 ? "+" : ""}${r.dPts} pts</b></div><div class="tip-row"><span>Typical swing either way</span><b>±${Math.round(r.sd)} pts</b></div><div class="tip-dim" style="margin-top:4px">How often a trade like this scores more this round, allowing for how much projections usually miss. Strong is 75%+, Lean 60%+.</div>`;
          const swaps = r.trades.map(({ o, i }, k) => {
            const done = inPlan(o, i);
            return `<div class="tl-sw">
              <div class="tl-sw-who">
                <span class="tl-sw-out">${escapeHtml(o.name)}</span>
                <span class="tl-sw-arrow" aria-hidden="true">→</span>
                <span class="tl-sw-in">${escapeHtml(i.name)}</span>
              </div>
              <div class="tl-sw-meta">${escapeHtml(i.team)} · ${escapeHtml(i.pos)} · ${money(i.price)} · proj ${i.proj} vs ${o.proj}</div>
              ${r.trades.length > 1 ? `<button type="button" class="tl-sw-add ${done ? "done" : ""}" data-adv-swap="${idx}:${k}" ${done ? "disabled" : ""} aria-label="${done ? `Already in ${escapeHtml(planName)}` : `Add ${escapeHtml(o.name)} to ${escapeHtml(i.name)} to ${escapeHtml(planName)}`}">${done ? "✓ In plan" : "+ Add"}</button>` : ""}
            </div>`;
          }).join("");
          const allIn = r.trades.every(({ o, i }) => inPlan(o, i));
          return `
            <article class="tl-sug">
              <div class="tl-sug-top">
                <span class="tl-sug-rank">${idx + 1}</span>
                <span class="tl-sug-pts ${r.dPts > 0 ? "pos-text" : r.dPts < 0 ? "neg-text" : "muted-text"}">${r.dPts > 0 ? "+" : ""}${r.dPts}<small>pts</small></span>
                <span class="tl-adv-conf ${cls}" data-tip="${escapeHtml(tip)}">${label} · ${Math.round(r.pBetter * 100)}%</span>
                <span class="tl-sug-cash ${r.dCash > 0 ? "pos-text" : r.dCash < 0 ? "neg-text" : "muted-text"}">${formatMoney(r.dCash)} <span class="dim-text">price change</span></span>
                <span class="tl-sug-bank dim-text">bank after ${money(r.bankAfter)}</span>
              </div>
              <div class="tl-sug-swaps">${swaps}</div>
              <div class="tl-sug-actions">
                ${r.trades.length > 1 || !allIn ? `<button type="button" class="primary-btn tl-sug-main" data-adv-addall="${idx}" ${allIn ? "disabled" : ""}>${allIn ? `✓ All in ${escapeHtml(planName)}` : `Add ${r.trades.length > 1 ? `all ${r.trades.length} ` : ""}to ${escapeHtml(planName)}`}</button>` : ""}
                <button type="button" class="ghost-btn" data-adv-apply="${idx}">Start a new plan with ${r.trades.length > 1 ? "these" : "this"}</button>
              </div>
            </article>`;
        }).join("");
    const nChips = [1, 2, 3, 4].map((n) => chip("data-adv-n", String(n), String(n), advisor.n === n)).join("");
    return `
      <section class="tl-adv" aria-label="Trade advisor">
        <div class="tl-adv-head">
          <div>
            <div class="tl-adv-title">Trade advisor</div>
            <div class="tl-adv-sub">Best trades for your squad this round, using ${state.projSource === "sc" ? "SuperCoach's" : "SCHOOPS"} projections and your $${(Number(state.tradeLab.bankM) || 0).toFixed(2)}M bank. Mix and match: <strong>+ Add</strong> puts one swap into ${escapeHtml(planName)}.</div>
          </div>
          <div class="tl-adv-ctrls">
            <span class="tl-adv-lbl">Goal</span>
            ${chip("data-adv-goal", "points", "Most points", advisor.goal === "points")}
            ${chip("data-adv-goal", "balanced", "Balanced", advisor.goal === "balanced")}
            ${chip("data-adv-goal", "cash", "Most cash", advisor.goal === "cash")}
            <span class="tl-adv-lbl" style="margin-left:8px">Trades</span>
            ${nChips}
          </div>
        </div>
        ${advisor.flash ? `<div class="tl-adv-flash" role="status">${escapeHtml(advisor.flash)}</div>` : ""}
        <div class="tl-adv-list ${advisor.busy && advisor.results ? "is-stale" : ""}" aria-busy="${advisor.busy ? "true" : "false"}">${rows}</div>
        <div class="tl-adv-foot">"Chance" is how often a trade like this ends up scoring more, given how far projections usually miss. Balanced counts $50K of price rise as 1 point. 3–4 trade ideas are built one swap at a time, so they're strong but not guaranteed to be the very best combination.</div>
      </section>`;
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
    const active = document.activeElement;
    const bankTyped = active && active.id === "tlBankInput" ? active.value : null;
    const scrollTop = root.scrollTop;
    renderTradeLabInner(root, headerActions);
    if (root.scrollTop !== scrollTop) root.scrollTop = scrollTop;
    if (bankTyped !== null) {
      const inp = root.querySelector("#tlBankInput");
      if (inp) { inp.value = bankTyped; inp.focus({ preventScroll: true }); }
    }
  }

  function renderTradeLabInner(root, headerActions) {
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
          <button type="button" class="primary-btn" data-go-court="1">Add players in My Squad</button>
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
        ${renderLockout()}
        <div class="tl-plans" role="tablist" aria-label="Trade plans">
          ${tabs}
          <button type="button" class="tl-plan-tab tl-plan-new" id="tlNewPlanBtn" title="Start another plan to compare">${ICON_PLUS} New plan</button>
        </div>

        ${renderAdvisor(state, squad)}

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
              <span class="tl-bank-in"><span>$</span><input type="text" id="tlBankInput" inputmode="decimal" autocomplete="off" aria-label="Your bank in millions of dollars" value="${bankM.toFixed(2)}" /><span>M</span></span>
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
    const goalBtn = e.target.closest("[data-adv-goal]");
    if (goalBtn) { advisor.goal = goalBtn.dataset.advGoal; renderTradeLab(); return; }
    const nBtn = e.target.closest("[data-adv-n]");
    if (nBtn) { advisor.n = Number(nBtn.dataset.advN); renderTradeLab(); return; }
    const swapBtn = e.target.closest("[data-adv-swap]");
    if (swapBtn && advisor.results) {
      const [ri, ti] = swapBtn.dataset.advSwap.split(":").map(Number);
      const t = advisor.results[ri] && advisor.results[ri].trades[ti];
      if (t) addSwapsToPlan([{ outId: t.o.id, inId: t.i.id }]);
      return;
    }
    const addAll = e.target.closest("[data-adv-addall]");
    if (addAll && advisor.results) {
      const r = advisor.results[Number(addAll.dataset.advAddall)];
      if (r) addSwapsToPlan(r.trades.map(({ o, i }) => ({ outId: o.id, inId: i.id })));
      return;
    }
    const applyAdv = e.target.closest("[data-adv-apply]");
    if (applyAdv && advisor.results) {
      const r = advisor.results[Number(applyAdv.dataset.advApply)];
      if (r) createNewPlan({ trades: r.trades.map(({ o, i }) => ({ outId: o.id, inId: i.id })) });
      return;
    }
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

  let bankTimer = null;
  function commitBank(value) {
    clearTimeout(bankTimer);
    const state = window.SCHOOPS.getState();
    const v = Math.max(0, parseFloat(value) || 0);
    if (v === (Number(state.tradeLab.bankM) || 0)) return;
    state.tradeLab.bankM = v;
    save();
  }

  function handleChange(e) {
    if (e.target.id === "tlBankInput") commitBank(e.target.value);
  }

  function handleInput(e) {
    if (e.target.id === "tlBankInput") {
      const v = e.target.value;
      clearTimeout(bankTimer);
      bankTimer = setTimeout(() => commitBank(v), 350);
      return;
    }
    if (e.target.matches("[data-in-search]")) {
      tlUi.query = e.target.value;
      renderTradeLab();
    }
  }

  function handleKey(e) {
    // Bank box: Up/Down step by $50K (Shift: $500K), Enter applies straight away
    if (e.target.id === "tlBankInput") {
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        const step = (e.shiftKey ? 0.5 : 0.05) * (e.key === "ArrowUp" ? 1 : -1);
        const v = Math.max(0, Math.round(((parseFloat(e.target.value) || 0) + step) * 100) / 100);
        e.target.value = v.toFixed(2);
        clearTimeout(bankTimer);
        bankTimer = setTimeout(() => commitBank(e.target.value), 250);
      } else if (e.key === "Enter") {
        commitBank(e.target.value);
      }
      return;
    }
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
