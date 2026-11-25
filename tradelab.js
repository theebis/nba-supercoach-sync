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
      /* ===== Trade Advisor (list + plan scoreboard; phones: cards + plan tray) ===== */
      .ta { max-width: 1900px; padding: 20px 22px 32px; display: flex; flex-direction: column; gap: 14px; min-width: 0; }
      .ta-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px 20px; flex-wrap: wrap; }
      .ta-title { margin: 0; font-size: 21px; font-weight: 650; letter-spacing: -0.015em; color: var(--text-primary); }
      .ta-sub { margin-top: 4px; font-size: 13px; color: var(--text-secondary); max-width: 72ch; text-wrap: pretty; }
      .ta-lock { display: inline-flex; align-items: center; gap: 7px; height: 32px; padding: 0 13px; border-radius: 999px; background: var(--bg-active); color: var(--text-secondary); font-size: 12px; font-weight: 600; white-space: nowrap; cursor: default; }
      .ta-lock i { width: 7px; height: 7px; border-radius: 50%; background: var(--text-tertiary); }
      .ta-lock b { color: var(--text-primary); }
      .ta-lock.open { background: var(--pos-bg); color: var(--pos-bright); }
      .ta-lock.open i { background: var(--pos-bright); }
      .ta-lock.open b { color: var(--pos-bright); }
      .ta-ctrls { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
      .ta-seg { display: inline-grid; grid-auto-flow: column; align-items: center; gap: 2px; padding: 3px; border-radius: 9px; background: var(--bg-input); border: 1px solid var(--border-subtle); }
      .ta-seg button { height: 30px; padding: 0 13px; border: none; border-radius: 6px; background: transparent; color: var(--text-tertiary); font-size: 12.5px; font-weight: 600; cursor: pointer; transition: color 120ms ease, background-color 120ms ease; }
      .ta-seg button.on { background: var(--bg-active); color: var(--text-primary); }
      @media (hover: hover) { .ta-seg button:not(.on):hover { color: var(--text-secondary); } }
      .ta-seg button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
      .ta-seg.sm button { min-width: 32px; padding: 0 9px; }
      .ta-seg-l { padding: 0 6px 0 8px; font-size: 11.5px; color: var(--text-tertiary); }
      .ta-flash { font-size: 12.5px; color: var(--pos-bright); }

      /* Sell first / Hot buys */
      .ta-pri { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
      .ta-pri-col { border-radius: 14px; border: 1px solid var(--border-subtle); background: #111115; overflow: hidden; min-width: 0; }
      .ta-pri-col.out { box-shadow: inset 0 2px 0 rgba(248, 113, 113, 0.55); }
      .ta-pri-col.in { box-shadow: inset 0 2px 0 rgba(52, 211, 153, 0.55); }
      .ta-pri-h { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; padding: 12px 14px 8px; font-size: 13.5px; font-weight: 650; }
      .ta-pri-sub { font-size: 11px; font-weight: 400; color: var(--text-tertiary); }
      .ta-pri-row { width: 100%; display: grid; grid-template-columns: 30px minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 9px 14px; border: none;
        border-top: 1px solid rgba(255, 255, 255, 0.04); background: transparent; color: var(--text-primary); text-align: left; cursor: pointer; transition: background-color 100ms ease; }
      @media (hover: hover) { .ta-pri-row:hover { background: var(--bg-hover); } .ta-pri-row:hover .ta-pri-go { color: var(--text-primary); } }
      .ta-pri-row.on { background: var(--accent-soft); }
      .ta-pri-row:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
      .ta-pri-txt { display: flex; flex-direction: column; min-width: 0; }
      .ta-pri-name { font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .ta-pri-why { font-size: 11.5px; color: var(--text-secondary); margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .ta-pri-tag { margin-left: 4px; padding: 1px 6px; border-radius: 4px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; vertical-align: 1px; }
      .ta-pri-tag.out { background: rgba(255, 255, 255, 0.06); color: var(--text-secondary); }
      .ta-pri-tag.t-injured { background: var(--neg-bg); color: var(--neg-soft); }
      .ta-pri-tag.t-daytoday { background: rgba(255, 196, 0, 0.12); color: #e8c25a; }
      .ta-pri-tag.t-pricefalling { background: var(--neg-bg); color: var(--neg-soft); }
      .ta-pri-tag.in { background: var(--pos-bg); color: var(--pos-bright); }
      .ta-pri-go { font-size: 11.5px; color: var(--text-tertiary); white-space: nowrap; transition: color 120ms ease; }
      .ta-pri-row.on .ta-pri-go { color: #C7CCFF; font-weight: 600; }
      .ta-pri-empty { padding: 12px 14px 14px; font-size: 12.5px; color: var(--text-tertiary); }
      /* Keep an eye on: day-to-day players, same rows as Sell first under their own amber heading */
      .ta-pri-h-watch { margin-top: 6px; padding-top: 12px; border-top: 1px solid var(--border-subtle); }
      .ta-pri-h-watch > span:first-child { color: #e8c25a; }
      .ta-pri-tag.t-watch { background: rgba(255, 196, 0, 0.12); color: #e8c25a; }
      .ta-focus { height: 32px; padding: 0 12px; border-radius: 999px; border: 1px solid rgba(110, 123, 242, 0.5); background: var(--accent-soft); color: #C7CCFF; font-size: 12.5px; font-weight: 600; cursor: pointer; }
      .ta-focus span { margin-left: 4px; }
      .ta-this { font-family: var(--mono); font-size: 10.5px; color: var(--text-tertiary); white-space: nowrap; }
      .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
      @media (max-width: 1000px) { .ta-pri { grid-template-columns: minmax(0, 1fr); } .ta-pri-go { display: none; } }
      .ta-grid { display: grid; grid-template-columns: minmax(0, 1fr) 400px; gap: 18px; align-items: start; }
      .ta-list { border: 1px solid var(--border-subtle); border-radius: 14px; background: #111115; overflow: hidden; transition: opacity 160ms ease; min-width: 0; }
      .ta-list.is-stale { opacity: 0.55; }
      .ta-list-h, .ta-sug { display: grid; grid-template-columns: minmax(0, 1fr) 64px 100px 150px 132px; gap: 14px; align-items: center; padding: 0 16px; }
      .ta-list-h { height: 34px; font-size: 11px; color: var(--text-tertiary); background: #0d0d11; border-bottom: 1px solid var(--border-subtle); }
      .ta-list-h > span:nth-child(2), .ta-list-h > span:nth-child(3) { text-align: right; }
      .ta-sug { padding-top: 12px; padding-bottom: 12px; border-top: 1px solid rgba(255, 255, 255, 0.05); transition: background-color 120ms ease; }
      .ta-list-h + .ta-sug { border-top: none; }
      .ta-sug.inplan { background: linear-gradient(90deg in oklab, rgba(52, 211, 153, 0.08), transparent 55%); box-shadow: inset 3px 0 0 var(--pos-bright); }
      .ta-swaps { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
      .ta-sw { display: flex; align-items: center; gap: 10px; min-width: 0; }
      .ta-faces { display: inline-flex; flex-shrink: 0; }
      .ta-faces .sc-avatar + .sc-avatar { margin-left: -10px; box-shadow: 0 0 0 2px #111115; }
      .ta-sw-txt { display: flex; flex-direction: column; min-width: 0; flex: 1; }
      .ta-sw-names { display: flex; align-items: center; gap: 6px; font-size: 13.5px; font-weight: 600; min-width: 0; }
      .ta-out { color: var(--neg-soft); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
      .ta-in { color: var(--pos-bright); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
      .ta-arrow { color: var(--text-tertiary); flex-shrink: 0; }
      .ta-sw-meta { font-family: var(--mono); font-size: 11px; color: var(--text-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 1px; }
      .ta-stat { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; min-width: 0; }
      .ta-chance { align-items: flex-start; cursor: default; }
      .ta-l { display: none; font-size: 10.5px; color: var(--text-tertiary); }
      .ta-v { font-family: var(--mono); font-size: 17px; font-weight: 700; letter-spacing: -0.02em; white-space: nowrap; }
      .ta-v.sm { font-size: 13.5px; }
      .ta-conf { font-size: 11px; font-weight: 600; white-space: nowrap; }
      .ta-conf.strong { color: var(--pos-bright); } .ta-conf.lean { color: #e8c25a; } .ta-conf.flip { color: var(--text-tertiary); }
      .ta-meter { width: 100%; max-width: 120px; height: 4px; border-radius: 2px; background: rgba(255, 255, 255, 0.07); overflow: hidden; }
      .ta-meter i { display: block; height: 100%; border-radius: 2px; transform-origin: left; background: var(--text-tertiary); }
      .ta-meter.strong i { background: var(--pos-bright); } .ta-meter.lean i { background: #e8c25a; }
      .ta-act { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
      .ta-bank { font-size: 10.5px; color: var(--text-tertiary); font-family: var(--mono); white-space: nowrap; }
      .ta-add { height: 32px; padding: 0 14px; border-radius: 8px; border: 1px solid rgba(110, 123, 242, 0.5); background: var(--accent-soft); color: #C7CCFF; font-size: 12.5px; font-weight: 600; cursor: pointer; white-space: nowrap;
        transition: background-color 120ms ease, color 120ms ease, border-color 120ms ease, transform 160ms var(--ease-press); }
      .ta-add:active { transform: scale(0.97); }
      @media (hover: hover) { .ta-add:hover { background: var(--accent); color: #fff; border-color: transparent; } .ta-add.done:hover { background: var(--neg-bg); color: var(--neg-soft); } }
      .ta-add.done { border-color: transparent; background: var(--pos-bg); color: var(--pos-bright); }
      .ta-add:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
      .ta-add.sm { height: 26px; width: 26px; padding: 0; font-size: 14px; flex-shrink: 0; }
      .ta-empty { padding: 18px 16px; font-size: 13px; color: var(--text-tertiary); }
      .ta-foot { padding: 10px 16px 12px; font-size: 11.5px; line-height: 1.5; color: var(--text-tertiary); border-top: 1px solid rgba(255, 255, 255, 0.05); }

      .ta-plan { position: sticky; top: 14px; border-radius: 14px; background: #15151b; box-shadow: 0 0 0 1px rgba(110, 123, 242, 0.35), 0 16px 40px rgba(0, 0, 0, 0.35); min-width: 0; }
      .ta-plan-h { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 14px 16px 10px; }
      .ta-plan-title { font-size: 14.5px; font-weight: 650; }
      .ta-tabs { display: flex; align-items: center; gap: 4px; }
      .ta-tab { height: 26px; min-width: 26px; padding: 0 9px; display: inline-flex; align-items: center; justify-content: center; gap: 4px; border-radius: 7px; border: 1px solid var(--border-subtle);
        background: transparent; color: var(--text-tertiary); font-size: 12px; font-weight: 600; cursor: pointer; }
      .ta-tab.on { background: var(--bg-active); color: var(--text-primary); border-color: var(--border-default); }
      .ta-tab.new { padding: 0; width: 26px; }
      .ta-tab svg { width: 11px; height: 11px; }
      .ta-tab-x { display: inline-flex; opacity: 0.5; } .ta-tab-x svg { width: 9px; height: 9px; }
      .ta-tab:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
      .ta-score { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: var(--border-subtle); border-top: 1px solid var(--border-subtle); border-bottom: 1px solid var(--border-subtle); }
      .ta-score > div { background: #15151b; padding: 12px 16px; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
      .ta-score .ta-l { display: block; }
      .ta-big { font-family: var(--mono); font-size: 26px; font-weight: 700; letter-spacing: -0.02em; color: var(--text-primary); }
      .ta-note { font-size: 11px; color: var(--text-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .ta-trades { display: flex; flex-direction: column; gap: 8px; padding: 12px; }
      .ta-plan .tl-trade { grid-template-columns: minmax(0, 1fr) 26px; gap: 6px; padding: 8px; border-radius: 10px; }
      .ta-plan .tl-num, .ta-plan .tl-arrow { display: none; }
      .ta-plan .tl-slot.out { grid-column: 1; grid-row: 1; }
      .ta-plan .tl-slot.in { grid-column: 1; grid-row: 2; }
      .ta-plan .tl-trade-rm { grid-column: 2; grid-row: 1 / span 2; align-self: center; }
      .ta-plan .tl-trade-deltas { grid-column: 1 / -1; }
      .ta-plan .tl-slot-btn { min-height: 46px; padding: 6px 8px; }
      .ta-plan .tl-p-right span:nth-child(2) { display: none; }
      .ta-own { height: 38px; border-radius: 10px; border: 1px dashed var(--border-default); background: transparent; color: var(--text-secondary); font-size: 12.5px; font-weight: 500; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 6px; transition: color 120ms ease, border-color 120ms ease; }
      @media (hover: hover) { .ta-own:hover { color: var(--text-primary); border-color: var(--border-strong); } }
      .ta-own svg { width: 12px; height: 12px; }
      .ta-bankrow { display: flex; align-items: center; gap: 10px; padding: 10px 16px; border-top: 1px solid var(--border-subtle); font-size: 12.5px; color: var(--text-secondary); }
      .ta-left { margin-left: auto; font-size: 12px; white-space: nowrap; }
      .ta-left b { font-family: var(--mono); }
      .ta-warn { margin: 0 16px 10px; padding: 8px 10px; border-radius: 8px; background: var(--neg-bg); font-size: 12px; }
      .ta-plan-f { display: flex; flex-direction: column; gap: 8px; padding: 12px 16px 16px; border-top: 1px solid var(--border-subtle); }
      .ta-plan-f .tl-apply { width: 100%; }
      .ta-sec { display: flex; gap: 8px; } .ta-sec .ghost-btn { flex: 1; justify-content: center; }
      .ta + .tl-compare, .ta .tl-compare { margin: 4px 0 0; }
      .ta-tray { display: none; }

      /* Mid-size screens (e.g. 1440): names on top, numbers on a line underneath, button on the right */
      @media (min-width: 1001px) and (max-width: 1700px) {
        .ta-list-h { display: none; }
        .ta-sug { grid-template-columns: auto auto minmax(0, 1fr) auto; grid-template-areas: "sw sw sw act" "pts cash ch act"; gap: 8px 22px; }
        .ta-swaps { grid-area: sw; } .ta-pts { grid-area: pts; } .ta-chance { grid-area: ch; } .ta-act { grid-area: act; }
        .ta-cash { grid-area: cash; }
        .ta-stat { flex-direction: row; align-items: baseline; gap: 6px; }
        .ta-chance { align-items: center; }
        .ta-l { display: inline; }
        .ta-v { font-size: 15px; } .ta-v.sm { font-size: 13px; }
        .ta-meter { width: 80px; }
      }
      /* Phones and narrow screens: suggestion cards, plan below, tray along the bottom */
      @media (max-width: 1000px) {
        .ta { padding: 12px 12px 90px; gap: 12px; }
        .ta-title { font-size: 19px; }
        .ta-sub { display: none; }
        .ta-top { align-items: center; }
        .ta-lock { height: 28px; font-size: 11px; padding: 0 10px; }
        .ta-ctrls { flex-wrap: nowrap; overflow-x: auto; margin: 0 -12px; padding: 0 12px 2px; scrollbar-width: none; }
        .ta-ctrls::-webkit-scrollbar { display: none; }
        .ta-seg { flex-shrink: 0; }
        .ta-seg button { height: 32px; padding: 0 11px; }
        .ta-grid { grid-template-columns: minmax(0, 1fr); }
        .ta-list { border: none; background: transparent; overflow: visible; display: flex; flex-direction: column; gap: 10px; }
        .ta-list-h { display: none; }
        .ta-sug { grid-template-columns: repeat(3, minmax(0, 1fr)); grid-template-areas: "sw sw sw" "pts cash ch" "act act act"; gap: 12px 10px; padding: 14px;
          border: 1px solid var(--border-subtle); border-radius: 14px; background: #121216; }
        .ta-list-h + .ta-sug, .ta-sug { border-top: 1px solid var(--border-subtle); }
        .ta-sug.inplan { border-color: rgba(52, 211, 153, 0.4); box-shadow: none; background: linear-gradient(180deg in oklab, rgba(52, 211, 153, 0.07), transparent 60%), #121216; }
        .ta-swaps { grid-area: sw; }
        .ta-pts { grid-area: pts; }
        .ta-stat { align-items: flex-start; padding: 8px 10px; border-radius: 9px; background: #18181e; }
        .ta-l { display: block; }
        .ta-chance { grid-area: ch; }
        .ta-v { font-size: 18px; } .ta-v.sm { font-size: 15px; }
        .ta-act { grid-area: act; flex-direction: row; align-items: center; justify-content: space-between; }
        .ta-act .ta-add { height: 40px; padding: 0 18px; font-size: 13.5px; }
        .ta-plan { position: static; }
        .ta-tray { position: sticky; bottom: 10px; z-index: 5; display: flex; align-items: center; gap: 10px; padding: 10px 10px 10px 14px; border-radius: 14px;
          background: rgba(28, 28, 36, 0.94); backdrop-filter: blur(12px); box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.08), 0 16px 36px rgba(0, 0, 0, 0.55); }
        .ta-tray-faces { display: inline-flex; flex-shrink: 0; }
        .ta-tray-faces .sc-avatar + .sc-avatar { margin-left: -8px; box-shadow: 0 0 0 2px #1c1c24; }
        .ta-tray-txt { display: flex; flex-direction: column; min-width: 0; flex: 1; font-size: 12px; color: var(--text-secondary); }
        .ta-tray-txt b { font-size: 13px; color: var(--text-primary); }
        .ta-tray-txt > span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-family: var(--mono); font-size: 11.5px; }
        .ta-tray-btn { height: 38px; padding: 0 16px; border-radius: 9px; border: none; background: var(--accent); color: #fff; font-size: 13px; font-weight: 600; cursor: pointer; flex-shrink: 0; }
      }

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
  const advisor = { goal: "balanced", n: 1, horizon: 3, focusOut: null, focusIn: null, results: null, key: "", busy: false, flash: "", flashTimer: null };

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

  // ---------- looking ahead: the next 3 rounds ----------
  // Points expected this round and the next two (per-game projection x games x injury availability).
  // Shared with the Market's Points mode: horizonOf() in index.html.
  const horizon = (p) => window.SCHOOPS.horizon(p);
  // Future rounds aren't solver-exact (lineups change), so count them a little below face value
  const AHEAD_WEIGHT = 0.85;

  function bestSingles(state, squad, bank, used, limit = 60) {
    const base = memoMetrics(squad, state);
    const pool = Object.values(state.computedById).filter((p) => !p.inSquad && !used.has(p.id) && !p.isInactive
      && !p.isLikelyDnp && !p.isFringeDnp && p.games > 0 && !isOut(p) && !squad.some((s) => s.id === p.id));
    const pairs = [];
    const ahead = advisor.horizon === 3;
    squad.forEach((o) => {
      if (used.has(o.id)) return;
      if (advisor.focusOut && o.id !== advisor.focusOut && !used.size) return;
      const ho = horizon(o, state);
      pool.forEach((i) => {
        if (!sharesPosition(i, o) || i.price > bank + o.price) return;
        if (advisor.focusIn && i.id !== advisor.focusIn && !used.size) return;
        const hi = horizon(i, state);
        const pts = (i.proj - o.proj) + (ahead ? (hi.ahead - ho.ahead) * AHEAD_WEIGHT : 0);
        const cash = (i.priceChange - o.priceChange) + (ahead ? hi.cashAhead - ho.cashAhead : 0);
        pairs.push({ o, i, proxy: goalValue(pts, cash) });
      });
    });
    pairs.sort((a, b) => b.proxy - a.proxy);
    return pairs.slice(0, limit).map(({ o, i }) => {
      const sim = squad.filter((p) => p.id !== o.id).concat([i]);
      const m = memoMetrics(sim, state);
      const dPts = m.optScore - base.optScore;
      const dCash = m.cashGen - base.cashGen;
      const hi = horizon(i, state), ho = horizon(o, state);
      const dAhead = Math.round((hi.ahead - ho.ahead) * AHEAD_WEIGHT);
      const dCashAhead = Math.round((hi.cashAhead - ho.cashAhead) / 10000) * 10000;
      const dPts3 = dPts + dAhead, dCash3 = dCash + dCashAhead;
      const sd = Math.hypot(sigmaOf(i), sigmaOf(o));
      const useAhead = advisor.horizon === 3;
      return { trades: [{ o, i }], dPts, dCash, dPts3, dCash3, sd, sd3: sd * 1.7, bankAfter: bank + o.price - i.price,
        value: useAhead ? goalValue(dPts3, dCash3) : goalValue(dPts, dCash) };
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
        return advisor.focusOut || advisor.focusIn || perOut[id] <= 2;
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
            dPts3: combo.dPts3 + next.dPts3, dCash3: combo.dCash3 + next.dCash3,
            sd: Math.hypot(combo.sd, next.sd), sd3: Math.hypot(combo.sd3, next.sd3), bankAfter: next.bankAfter, value: combo.value + next.value
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
    results.forEach((r) => { r.pBetter = advisor.horizon === 3 ? normCdf(r.dPts3 / r.sd3) : normCdf(r.dPts / r.sd); });
    return results;
  }

  // Put suggested swaps into the plan you're working on (replacing a swap for the same player going out)
  // Add these swaps to the current plan, or take them out again if they're all already in it
  function toggleSwaps(swaps) {
    const state = window.SCHOOPS.getState();
    ensureTradeState(state);
    const plan = state.tradeLab.plans.find((p) => p.id === state.tradeLab.activePlanId) || state.tradeLab.plans[0];
    const allIn = swaps.every(({ outId, inId }) => plan.trades.some((t) => t.outId === outId && t.inId === inId));
    if (!allIn) { addSwapsToPlan(swaps); return; }
    plan.trades = plan.trades.filter((t) => !swaps.some((x) => x.outId === t.outId && x.inId === t.inId));
    if (!plan.trades.length) plan.trades.push({ outId: "", inId: "" });
    advisor.flash = `Removed from ${plan.name}.`;
    clearTimeout(advisor.flashTimer);
    advisor.flashTimer = setTimeout(() => { advisor.flash = ""; renderTradeLab(); }, 2500);
    save();
  }

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
    return [state.projSource, state.tradeLab.bankM, squad.map((p) => p.id).sort().join(","), advisor.goal, advisor.n, advisor.horizon, advisor.focusOut, advisor.focusIn, state.round].join("|");
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

  // Starts the advisor (in the background) whenever its inputs change
  function ensureAdvisor(state, squad) {
    const key = advisorKey(state, squad);
    if (advisor.key === key || advisor.busy) return;
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

  const confOf = (p) => (p >= 0.75 ? ["strong", "Strong"] : p >= 0.6 ? ["lean", "Lean"] : ["flip", "Coin flip"]);

  // Suggestions: a scannable list on computers, cards on phones (same markup, CSS decides)
  function renderSuggestions(state, plan) {
    const { escapeHtml, formatMoney, renderAvatar } = window.SCHOOPS;
    const money = (v) => `$${(v / 1e6).toFixed(2)}M`;
    const inPlan = (o, i) => plan.trades.some((t) => t.outId === o.id && t.inId === i.id);
    if (!advisor.results) return `<div class="ta-empty">Checking every trade for your squad…</div>`;
    if (!advisor.results.length) return `<div class="ta-empty">No affordable trades improve your squad on this goal. Try another goal, or add bank.</div>`;
    return advisor.results.map((r, idx) => {
      const [cls, label] = confOf(r.pBetter);
      const pct = Math.min(99, Math.round(r.pBetter * 100)); // never claim certainty
      const tip = `<div class="tip-h">${label}: ${pct}% chance it helps</div><div class="tip-row"><span>Projected gain</span><b class="${r.dPts >= 0 ? "tip-pos" : "tip-neg"}">${r.dPts > 0 ? "+" : ""}${r.dPts} pts</b></div><div class="tip-row"><span>Typical swing either way</span><b>±${Math.round(r.sd)} pts</b></div><div class="tip-dim" style="margin-top:4px">How often a trade like this scores more this round, allowing for how much projections usually miss. Strong is 75%+, Lean 60%+.</div>`;
      const multi = r.trades.length > 1;
      const allIn = r.trades.every(({ o, i }) => inPlan(o, i));
      const swaps = r.trades.map(({ o, i }, k) => {
        const done = inPlan(o, i);
        return `<div class="ta-sw">
          <span class="ta-faces">${renderAvatar(o, 32)}${renderAvatar(i, 32)}</span>
          <span class="ta-sw-txt">
            <span class="ta-sw-names"><span class="ta-out">${escapeHtml(o.name)}</span><span class="ta-arrow" aria-hidden="true">→</span><span class="ta-in">${escapeHtml(i.name)}</span></span>
            <span class="ta-sw-meta">${escapeHtml(i.team)} · ${escapeHtml(i.pos)} · ${money(i.price)} · proj ${o.proj} → ${i.proj}</span>
          </span>
          ${multi ? `<button type="button" class="ta-add sm ${done ? "done" : ""}" data-adv-swap="${idx}:${k}" aria-label="${done ? `Remove ${escapeHtml(o.name)} to ${escapeHtml(i.name)} from ${escapeHtml(plan.name)}` : `Add ${escapeHtml(o.name)} to ${escapeHtml(i.name)} to ${escapeHtml(plan.name)}`}">${done ? "✓" : "+"}</button>` : ""}
        </div>`;
      }).join("");
      return `<article class="ta-sug ${allIn ? "inplan" : ""}">
        <div class="ta-swaps">${swaps}</div>
        ${(() => {
          const three = advisor.horizon === 3;
          const P = three ? r.dPts3 : r.dPts, C = three ? r.dCash3 : r.dCash;
          const cls = (v) => (v > 0 ? "pos-text" : v < 0 ? "neg-text" : "muted-text");
          return `<div class="ta-stat ta-pts"><span class="ta-l">Points${three ? " (3 rds)" : ""}</span><span class="ta-v ${cls(P)}">${P > 0 ? "+" : ""}${P}</span>${three ? `<span class="ta-this">${r.dPts > 0 ? "+" : ""}${r.dPts} this rd</span>` : ""}</div>
        <div class="ta-stat ta-cash"><span class="ta-l">Price change${three ? " (3 rds)" : ""}</span><span class="ta-v sm ${cls(C)}">${formatMoney(C)}</span>${three ? `<span class="ta-this">${formatMoney(r.dCash)} this rd</span>` : ""}</div>`;
        })()}
        <div class="ta-stat ta-chance" data-tip="${escapeHtml(tip)}"><span class="ta-l">Chance it helps</span><span class="ta-conf ${cls}">${label} · ${pct}%</span><span class="ta-meter ${cls}"><i style="transform:scaleX(${(pct / 100).toFixed(2)})"></i></span></div>
        <div class="ta-act">
          <span class="ta-bank">bank after ${money(r.bankAfter)}</span>
          <button type="button" class="ta-add ${allIn ? "done" : ""}" data-adv-addall="${idx}" ${allIn ? `data-tip="${escapeHtml(`<div>Click to take ${multi ? "these" : "it"} out of ${escapeHtml(plan.name)}.</div>`)}"` : ""}>${allIn ? `✓ In ${escapeHtml(plan.name)}` : `+ Add${multi ? ` all ${r.trades.length}` : ""}`}</button>
        </div>
      </article>`;
    }).join("");
  }

  // ---------- priorities: who to sell first, who's hot to buy ----------
  // Injuries first (how long he's out), then price falling, then form dropping. Buys: healthy, rising, in form, games ahead.
  function lastFormPpg(p) {
    const t = (p.formHistory || []).filter((r) => r[2] > 0);
    if (!t.length) return null;
    const last = t[t.length - 1];
    return last[1] / last[2];
  }
  function sellPriorities(squad, state) {
    const { formatMoney } = window.SCHOOPS;
    const fmtDate = (ms) => new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short" });
    return squad.map((p) => {
      const h = horizon(p, state);
      const st = String(p.injuryStatus || "").toLowerCase();
      const form = lastFormPpg(p);
      let score = 0, tag = "", why = "";
      // Day-to-day, or out but back within this round: usually a game or two at most. Not a sell, just watch it.
      if ((st && !st.startsWith("out")) || (st.startsWith("out") && h.roundsOut === 0 && h.ret)) {
        const out = st.startsWith("out");
        const status = out ? "Back soon" : st.charAt(0).toUpperCase() + st.slice(1);
        const games = p.expGames !== null && p.expGames !== undefined ? `likely ${p.expGames} of ${p.games} games` : `${p.games} games`;
        const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
        return { p, score: 0, watch: true, tag: status,
          why: out ? `Out, back about ${fmtDate(h.ret)}: ${games} · projected ${p.proj}` : `${cap(games)} this round · projected ${p.proj}` };
      }
      if (st.startsWith("out")) {
        score = 1000 + h.roundsOut * 100;
        tag = "Injured";
        why = h.ret ? `Out until about ${fmtDate(h.ret)}: ${h.roundsOut >= 3 ? "3+ rounds" : `${h.roundsOut} round${h.roundsOut === 1 ? "" : "s"}`} of 0 points and a frozen price`
          : "Out, no return date yet: 0 points and a frozen price";
      } else if ((p.priceChange || 0) <= -150000) {
        score = 400 + -p.priceChange / 10000;
        tag = "Price falling";
        why = `Projected ${formatMoney(p.priceChange)} this round: needs ${p.be} but projected ${p.proj}`;
      } else if (form !== null && h.ppg > 0 && form < h.ppg * 0.75) {
        score = 100 + (h.ppg - form);
        tag = "Form down";
        why = `${Math.round(form)} a game last round vs about ${Math.round(h.ppg)} usually`;
      }
      return { p, score, tag, why };
    });
  }
  const sellList = (rows) => rows.filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 5);
  const watchList = (rows) => rows.filter((x) => x.watch);
  function buyPriorities(state) {
    const { formatMoney } = window.SCHOOPS;
    return Object.values(state.computedById).filter((p) => !p.inSquad && !p.isInactive && !p.isLikelyDnp && !p.isFringeDnp && !p.injuryStatus && p.games > 0)
      .map((p) => {
        const h = horizon(p, state);
        const form = lastFormPpg(p);
        const g3 = (p.games || 0) + (p.gamesNext ?? 3) + (p.gamesAfter ?? 3);
        const surplus = (p.proj + h.ahead) - (p.price / 712000) * g3 * 0.95; // scoring above what his price implies
        const score = surplus + (p.priceChange || 0) / 40000 + (form !== null && h.ppg ? (form - h.ppg) : 0);
        const bits = [];
        if ((p.priceChange || 0) >= 200000) bits.push(`${formatMoney(p.priceChange)} rise this round`);
        if (form !== null && h.ppg && form >= h.ppg * 1.15) bits.push(`${Math.round(form)} a game last round`);
        if ((p.gamesNext ?? 0) >= 4) bits.push(`4 games next round`);
        else if (p.games >= 4) bits.push(`4 games this round`);
        if (!bits.length) bits.push(`projected ${p.proj} at ${(p.price / 1e6).toFixed(2)}M`);
        return { p, score, tag: "Hot", why: bits.slice(0, 2).join(" · ") };
      }).sort((a, b) => b.score - a.score).slice(0, 5);
  }
  function renderPriorities(state, squad) {
    const { escapeHtml, renderAvatar } = window.SCHOOPS;
    const rows = sellPriorities(squad, state);
    const sells = sellList(rows);
    const watch = watchList(rows);
    const buys = buyPriorities(state);
    const row = (x, side) => {
      const on = side === "out" ? advisor.focusOut === x.p.id : advisor.focusIn === x.p.id;
      return `<button type="button" class="ta-pri-row ${on ? "on" : ""}" data-ta-focus="${side}:${escapeHtml(x.p.id)}" aria-pressed="${on}">
        ${renderAvatar(x.p, 30)}
        <span class="ta-pri-txt"><span class="ta-pri-name">${escapeHtml(x.p.name)} <span class="ta-pri-tag ${side} t-${x.tag.toLowerCase().replace(/[^a-z]/g, "")}">${escapeHtml(x.tag)}</span></span>
        <span class="ta-pri-why">${escapeHtml(x.why)}</span></span>
        <span class="ta-pri-go">${on ? "Showing" : side === "out" ? "Find replacements" : "Find who to sell"}</span>
      </button>`;
    };
    return `<div class="ta-pri">
      <section class="ta-pri-col out" aria-label="Sell first">
        <div class="ta-pri-h"><span>Sell first</span><span class="ta-pri-sub">long injuries, then price and form</span></div>
        ${sells.length ? sells.map((x) => row(x, "out")).join("") : `<div class="ta-pri-empty">Nobody in your squad is injured long-term, falling hard or out of form. Nice.</div>`}
        ${watch.length ? `<div class="ta-pri-h ta-pri-h-watch"><span>Keep an eye on</span><span class="ta-pri-sub">no need to sell, check news before lockout</span></div>
        ${watch.map((x) => `<button type="button" class="ta-pri-row watch" data-ta-profile="${escapeHtml(x.p.id)}">
          ${renderAvatar(x.p, 30)}
          <span class="ta-pri-txt"><span class="ta-pri-name">${escapeHtml(x.p.name)} <span class="ta-pri-tag t-watch">${escapeHtml(x.tag)}</span></span>
          <span class="ta-pri-why">${escapeHtml(x.why)}</span></span>
          <span class="ta-pri-go">See news</span>
        </button>`).join("")}` : ""}
      </section>
      <section class="ta-pri-col in" aria-label="Hot buys">
        <div class="ta-pri-h"><span>Hot buys</span><span class="ta-pri-sub">healthy, rising, in form</span></div>
        ${buys.map((x) => row(x, "in")).join("")}
      </section>
    </div>`;
  }

  // Trade window as a compact pill (details in its hover box)
  function renderLockPill() {
    const S = window.SCHOOPS;
    if (!S.tradeWindow) return "";
    const w = S.tradeWindow();
    if (!w.lockMs) return "";
    const when = (ms) => new Date(ms).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
    const tip = w.open
      ? `<div class="tip-h">Trades are open</div><div>Round ${w.round} locks at the first tip-off: ${when(w.lockMs)}.</div>`
      : `<div class="tip-h">Trades are closed</div><div>They reopen after this round ends${w.roundEndMs ? ` (around ${when(w.roundEndMs)})` : ""}. Round ${w.round} then locks ${when(w.lockMs)}.</div>`;
    return `<span class="ta-lock ${w.open ? "open" : ""}" data-tip="${S.escapeHtml(tip)}"><i></i>${w.open ? "Trades open · locks in" : "Trades closed · next lockout in"} <b class="mono" data-countdown="${w.lockMs}">${S.formatCountdown(w.lockMs)}</b></span>`;
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
          <p style="margin-bottom:14px;">The Trade Advisor finds and tests trades against your real squad: score change, price changes and whether you can afford it.</p>
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

    ensureAdvisor(state, squad);
    const chip = (attr, val, label, on) => `<button type="button" class="${on ? "on" : ""}" ${attr}="${val}" aria-pressed="${on}">${label}</button>`;
    const sign = (v) => (v > 0 ? "+" : "");
    const filled = plan.trades.filter((t) => t.outId && t.inId);
    const faces = filled.map((t) => state.computedById[t.inId]).filter(Boolean).slice(0, 4).map((p) => window.SCHOOPS.renderAvatar(p, 28)).join("");

    root.innerHTML = `
      <div class="ta">
        <div class="ta-top">
          <div>
            <h2 class="ta-title">Trade Advisor</h2>
            <div class="ta-sub">The best trades for your squad, looking ${advisor.horizon === 3 ? "3 rounds ahead (injury return dates and upcoming games included)" : "at this round only"}, using ${state.projSource === "sc" ? "SuperCoach's" : "SCHOOPS"} projections. Add the ones you like; your plan adds them up and checks your bank.</div>
          </div>
          ${renderLockPill()}
        </div>
        <div class="ta-ctrls">
          <div class="ta-seg" role="group" aria-label="Goal">
            ${chip("data-adv-goal", "points", "Most points", advisor.goal === "points")}
            ${chip("data-adv-goal", "balanced", "Balanced", advisor.goal === "balanced")}
            ${chip("data-adv-goal", "cash", "Most cash", advisor.goal === "cash")}
          </div>
          <div class="ta-seg sm" role="group" aria-label="Number of trades"><span class="ta-seg-l">Trades</span>${[1, 2, 3, 4].map((n) => chip("data-adv-n", String(n), String(n), advisor.n === n)).join("")}</div>
          <div class="ta-seg" role="group" aria-label="Look ahead">${chip("data-adv-h", "1", "This round", advisor.horizon === 1)}${chip("data-adv-h", "3", "Next 3 rounds", advisor.horizon === 3)}</div>
          ${advisor.focusOut || advisor.focusIn ? (() => { const fp = state.computedById[advisor.focusOut || advisor.focusIn]; return fp ? `<button type="button" class="ta-focus" data-ta-unfocus>${advisor.focusOut ? "Selling" : "Buying"} ${escapeHtml(fp.name)} <span aria-hidden="true">×</span><span class="sr-only">Show all trades</span></button>` : ""; })() : ""}
          ${advisor.flash ? `<span class="ta-flash" role="status">${escapeHtml(advisor.flash)}</span>` : ""}
        </div>

        ${renderPriorities(state, squad)}
        <div class="ta-grid">
          <section class="ta-list ${advisor.busy && advisor.results ? "is-stale" : ""}" aria-label="Suggested trades" aria-busy="${advisor.busy ? "true" : "false"}">
            <div class="ta-list-h"><span>Suggested trade</span><span>Points${advisor.horizon === 3 ? " · 3 rds" : ""}</span><span>Price change</span><span>Chance it helps</span><span></span></div>
            ${renderSuggestions(state, plan)}
            <div class="ta-foot">"Chance it helps" allows for how far projections usually miss. Balanced counts $50K of price rise as 1 point. 3–4 trade ideas are built one swap at a time: strong, but not guaranteed to be the very best combination.</div>
          </section>

          <aside class="ta-plan" id="taPlan" aria-label="Your plan">
            <div class="ta-plan-h">
              <span class="ta-plan-title">Your plan</span>
              <div class="ta-tabs" role="tablist" aria-label="Plans">
                ${state.tradeLab.plans.map((pl) => `<span class="ta-tab ${pl.id === plan.id ? "on" : ""}" data-select-plan="${escapeHtml(pl.id)}" role="tab" tabindex="0" aria-selected="${pl.id === plan.id}">${escapeHtml(pl.name.replace("Plan ", ""))}${state.tradeLab.plans.length > 1 ? `<span class="ta-tab-x" data-del-plan="${escapeHtml(pl.id)}" role="button" aria-label="Delete ${escapeHtml(pl.name)}">${ICON_X}</span>` : ""}</span>`).join("")}
                <button type="button" class="ta-tab new" id="tlNewPlanBtn" aria-label="Start another plan to compare">${ICON_PLUS}</button>
              </div>
            </div>
            <div class="ta-score">
              <div><span class="ta-l">Round ${state.round} points</span><span class="ta-big ${ev.ptsDelta > 0 ? "pos-text" : ev.ptsDelta < 0 ? "neg-text" : ""}">${ev.validCount ? `${sign(ev.ptsDelta)}${ev.ptsDelta}` : "0"}</span><span class="ta-note">${ev.optScore} total · C ${escapeHtml(ev.captainName)}</span></div>
              <div><span class="ta-l">Price change</span><span class="ta-big ${ev.cashGenDelta > 0 ? "pos-text" : ev.cashGenDelta < 0 ? "neg-text" : ""}">${ev.validCount ? formatMoney(ev.cashGenDelta) : "$0"}</span><span class="ta-note">squad ${formatMoney(ev.cashGen)} this round</span></div>
            </div>
            <div class="ta-trades">
              ${plan.trades.map((_, i) => renderTrade(plan, i, squad, state)).join("")}
              ${plan.trades.length < MAX_TRADES ? `<button type="button" class="ta-own" id="tlAddTradeBtn">${ICON_PLUS} Add a trade yourself</button>` : ""}
            </div>
            <div class="ta-bankrow">
              <label for="tlBankInput">Your bank</label>
              <span class="tl-bank-in"><span>$</span><input type="text" id="tlBankInput" inputmode="decimal" autocomplete="off" aria-label="Your bank in millions of dollars" value="${bankM.toFixed(2)}" /><span>M</span></span>
              <span class="ta-left">left after <b class="${ev.isLegalCap ? "pos-text" : "neg-text"}">${formatMoney(ev.remainingBank).replace("+", "")}</b></span>
            </div>
            ${!ev.isLegalCap ? `<div class="ta-warn">${bankNote}</div>` : ""}
            <div class="ta-plan-f">
              <button type="button" class="tl-apply ${tlUi.confirmApply ? "confirm" : ""}" id="tlApplyPlanBtn" ${canApply ? "" : "disabled"}>${applyLabel}</button>
              <div class="ta-sec">
                <button type="button" class="ghost-btn" id="tlClonePlanBtn">${ICON_COPY} Copy to compare</button>
                <button type="button" class="ghost-btn" id="tlClearPlanBtn">Clear</button>
              </div>
            </div>
          </aside>
        </div>
        ${compareHtml}

        <!-- Phones: the plan as a tray along the bottom; Review jumps to the full plan -->
        <div class="ta-tray" aria-label="Plan summary">
          <span class="ta-tray-faces">${faces}</span>
          <span class="ta-tray-txt"><b>${escapeHtml(plan.name)} · ${ev.validCount} trade${ev.validCount === 1 ? "" : "s"}</b><span><span class="${ev.ptsDelta >= 0 ? "pos-text" : "neg-text"}">${sign(ev.ptsDelta)}${ev.ptsDelta} pts</span> · ${formatMoney(ev.cashGenDelta)} · bank ${formatMoney(ev.remainingBank).replace("+", "")}</span></span>
          <button type="button" class="ta-tray-btn" data-ta-review>Review</button>
        </div>
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
    const prof = e.target.closest("[data-ta-profile]");
    if (prof) { window.SCHOOPS.openInspector(prof.dataset.taProfile); return; }
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
    const hBtn = e.target.closest("[data-adv-h]");
    if (hBtn) { advisor.horizon = Number(hBtn.dataset.advH); renderTradeLab(); return; }
    const fBtn = e.target.closest("[data-ta-focus]");
    if (fBtn) {
      const [side, id] = fBtn.dataset.taFocus.split(":");
      const already = side === "out" ? advisor.focusOut === id : advisor.focusIn === id;
      advisor.focusOut = null; advisor.focusIn = null;
      if (!already) { if (side === "out") advisor.focusOut = id; else advisor.focusIn = id; }
      renderTradeLab();
      const list = document.querySelector(".ta-list"); if (list && !already) list.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (e.target.closest("[data-ta-unfocus]")) { advisor.focusOut = null; advisor.focusIn = null; renderTradeLab(); return; }
    const nBtn = e.target.closest("[data-adv-n]");
    if (nBtn) { advisor.n = Number(nBtn.dataset.advN); renderTradeLab(); return; }
    const swapBtn = e.target.closest("[data-adv-swap]");
    if (swapBtn && advisor.results) {
      const [ri, ti] = swapBtn.dataset.advSwap.split(":").map(Number);
      const t = advisor.results[ri] && advisor.results[ri].trades[ti];
      if (t) toggleSwaps([{ outId: t.o.id, inId: t.i.id }]);
      return;
    }
    const addAll = e.target.closest("[data-adv-addall]");
    if (addAll && advisor.results) {
      const r = advisor.results[Number(addAll.dataset.advAddall)];
      if (r) toggleSwaps(r.trades.map(({ o, i }) => ({ outId: o.id, inId: i.id })));
      return;
    }
    if (e.target.closest("[data-ta-review]")) { const pl = document.getElementById("taPlan"); if (pl) pl.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
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
