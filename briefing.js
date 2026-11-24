/* SCHOOPS: Round briefing panel
 * Docks on the right of the Market on wide screens when no player is being inspected:
 * news about your squad first, then the league injury report and the best cash cows.
 * Clicking a player opens the Player Inspector in the same spot. Whether it fits is decided by
 * SCHOOPS.marketExtras() in index.html; people can hide it (remembered in this browser).
 */
(function () {
  "use strict";

  const HIDE_KEY = "schoops_briefing_hidden";
  const readHidden = () => { try { return localStorage.getItem(HIDE_KEY) === "1"; } catch (err) { return false; } };
  const writeHidden = (v) => { try { v ? localStorage.setItem(HIDE_KEY, "1") : localStorage.removeItem(HIDE_KEY); } catch (err) {} };

  function injectStyles() {
    const style = document.createElement("style");
    style.textContent = `
      .briefing {
        width: 380px; flex-shrink: 0; border-left: 1px solid var(--border-subtle); background: #0F0F12;
        display: none; flex-direction: column; overflow: hidden;
      }
      .briefing.show { display: flex; }
      .bf-head { padding: 14px 16px 12px; border-bottom: 1px solid var(--border-subtle); }
      .bf-title { font-size: 14px; font-weight: 600; color: var(--text-primary); }
      .bf-sub { font-size: 11.5px; color: var(--text-tertiary); margin-top: 2px; }
      .bf-body { flex: 1; overflow-y: auto; overscroll-behavior: contain; padding: 6px 8px 16px; }
      .bf-sec { padding: 10px 8px 4px; }
      .bf-sec-title { display: flex; align-items: center; justify-content: space-between; font-size: 11.5px; font-weight: 600; color: var(--text-secondary); margin-bottom: 6px; }
      .bf-sec-title span { font-weight: 400; color: var(--text-tertiary); }
      .bf-item {
        width: 100%; display: grid; grid-template-columns: 30px minmax(0, 1fr) auto; gap: 10px; align-items: start;
        padding: 8px; border: none; border-radius: 8px; background: transparent; color: var(--text-primary);
        text-align: left; cursor: pointer; transition: background-color 100ms ease;
      }
      @media (hover: hover) { .bf-item:hover { background: var(--bg-hover); } }
      .bf-name { font-size: 13px; font-weight: 500; display: flex; align-items: center; gap: 6px; min-width: 0; }
      .bf-name > span:first-child { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .bf-note { font-size: 12px; line-height: 1.45; color: var(--text-secondary); margin-top: 2px;
        display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
      .bf-meta { font-family: var(--mono); font-size: 11px; color: var(--text-tertiary); margin-top: 3px; }
      .bf-right { font-family: var(--mono); font-size: 12px; font-weight: 600; text-align: right; white-space: nowrap; }
      .bf-empty { padding: 10px 8px; font-size: 12px; color: var(--text-tertiary); line-height: 1.5; }
      .bf-hide { height: 24px; padding: 0 8px; border-radius: 5px; border: 1px solid transparent; background: transparent;
        color: var(--text-tertiary); font-size: 11.5px; cursor: pointer; transition: color 120ms ease, background-color 120ms ease; }
      @media (hover: hover) { .bf-hide:hover { color: var(--text-primary); background: var(--bg-hover); } }
      .bf-start { margin: 2px 0 6px; padding: 14px; border-radius: 10px; border: 1px solid rgba(110, 123, 242, 0.3);
        background: linear-gradient(180deg, rgba(110, 123, 242, 0.1), rgba(110, 123, 242, 0.03)); }
      .bf-start-title { font-size: 13.5px; font-weight: 600; color: var(--text-primary); }
      .bf-start-text { font-size: 12px; line-height: 1.5; color: var(--text-secondary); margin: 4px 0 12px; text-wrap: pretty; }
      .bf-start-actions { display: flex; gap: 8px; flex-wrap: wrap; }
      .bf-start-actions .ghost-btn:disabled { opacity: 0.55; cursor: default; }
      .bf-sev { width: 3px; border-radius: 2px; align-self: stretch; }
      .bf-item.sev-bad { box-shadow: inset 3px 0 0 var(--neg-soft); }
      .bf-item.sev-warn { box-shadow: inset 3px 0 0 var(--warn-bright); }
      .bf-item.sev-good { box-shadow: inset 3px 0 0 var(--pos-bright); }
    `;
    document.head.appendChild(style);
  }

  const isOut = (p) => !!p.injuryStatus && String(p.injuryStatus).toLowerCase().startsWith("out");

  function item(p, note, right, sev) {
    const { escapeHtml, renderAvatar } = window.SCHOOPS;
    const tag = p.injuryStatus ? `<span class="micro-tag ${isOut(p) ? "out" : "dtd"}">${isOut(p) ? "OUT" : "DTD"}</span>` : "";
    return `
      <button type="button" class="bf-item ${sev ? `sev-${sev}` : ""}" data-bf-player="${escapeHtml(p.id)}">
        ${renderAvatar(p, 30)}
        <span style="min-width:0">
          <span class="bf-name"><span>${escapeHtml(p.name)}</span>${tag}</span>
          ${note ? `<span class="bf-note">${note}</span>` : ""}
          <span class="bf-meta">${escapeHtml(p.team)} · $${(p.price / 1000000).toFixed(2)}M · BE ${p.be === null ? "—" : p.be} · proj ${p.proj}</span>
        </span>
        <span class="bf-right">${right || ""}</span>
      </button>`;
  }

  function money(v) {
    const { formatMoney } = window.SCHOOPS;
    return `<span class="${v > 0 ? "pos-text" : v < 0 ? "neg-text" : "muted-text"}">${formatMoney(v)}</span>`;
  }

  function returnTxt(p) {
    if (!p.injuryReturn) return "";
    const d = new Date(`${p.injuryReturn}T00:00:00`);
    return Number.isNaN(d.getTime()) ? "" : ` Est. return ${d.toLocaleDateString(undefined, { day: "numeric", month: "short" })}.`;
  }

  function render() {
    const panel = document.getElementById("briefingPanel");
    if (!panel || !window.SCHOOPS) return;
    const state = window.SCHOOPS.getState();
    const onMarket = state.activeNav === "market";
    const show = onMarket && !state.inspectorId && window.SCHOOPS.marketExtras().briefing;
    panel.classList.toggle("show", show);
    // "Briefing" button in the Market header brings it back after hiding (only if it would fit)
    const reopen = document.getElementById("bfShowBtn");
    if (reopen) {
      let fits = false;
      if (state.briefingHidden) { state.briefingHidden = false; fits = window.SCHOOPS.marketExtras().briefing; state.briefingHidden = true; }
      reopen.style.display = onMarket && state.briefingHidden && fits ? "inline-flex" : "none";
    }
    if (!show) return;

    const { escapeHtml } = window.SCHOOPS;
    const all = Object.values(state.computedById || {});
    const squad = all.filter((p) => p.inSquad);

    // 1. Your squad: injuries first, then big projected moves, then players well below breakeven
    const alerts = [];
    squad.forEach((p) => {
      if (p.injuryStatus) {
        alerts.push({ p, sev: isOut(p) ? "bad" : "warn", rank: isOut(p) ? 0 : 1,
          note: `${escapeHtml(p.injuryDetail || p.injury || "Injury")}${returnTxt(p)}${isOut(p) ? " Holds price if he sits all round." : ""}`,
          right: money(p.priceChange) });
      } else if (p.priceChange <= -300000) {
        alerts.push({ p, sev: "bad", rank: 2, note: `Projected to drop: needs ${p.be} over ${p.games} games, projected ${p.proj}.`, right: money(p.priceChange) });
      } else if (p.priceChange >= 300000) {
        alerts.push({ p, sev: "good", rank: 3, note: `Projected to rise: needs ${p.be}, projected ${p.proj}.`, right: money(p.priceChange) });
      }
    });
    alerts.sort((a, b) => a.rank - b.rank || Math.abs(b.p.priceChange) - Math.abs(a.p.priceChange));

    // 2. League injury report: players people actually own or might buy
    const injuries = all
      .filter((p) => p.injuryStatus && !p.inSquad && (p.owned >= 2 || p.price >= 9000000))
      .sort((a, b) => b.owned - a.owned)
      .slice(0, 8);

    // 3. Cash cows you don't own (fit, playing, biggest projected rise)
    const cows = all
      .filter((p) => !p.inSquad && !p.injuryStatus && !p.isLikelyDnp && !p.isInactive && p.games > 0)
      .sort((a, b) => b.priceChange - a.priceChange)
      .slice(0, 5);

    const squadHtml = squad.length
      ? (alerts.length ? alerts.map((a) => item(a.p, a.note, a.right, a.sev)).join("")
        : `<div class="bf-empty">Nothing to flag in your squad this round. No injuries and no big projected price moves.</div>`)
      : `<div class="bf-start">
          <div class="bf-start-title">Make this briefing about your team</div>
          <div class="bf-start-text">Add your 15 players and this panel tracks their injuries, breakevens and price moves every round. Your squad is saved in this browser only.</div>
          <div class="bf-start-actions">
            <button type="button" class="primary-btn" data-bf-go="court">Add my players</button>
            <button type="button" class="ghost-btn" disabled title="Coming next: upload a screenshot of your SuperCoach team">Import from screenshot · soon</button>
          </div>
        </div>`;

    // New users (no squad): the popular players most likely to lose value, useful to anyone
    const fallers = squad.length ? [] : all
      .filter((p) => p.owned >= 10 && !p.isInactive)
      .sort((a, b) => a.priceChange - b.priceChange)
      .slice(0, 5);

    panel.innerHTML = `
      <div class="bf-head">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
          <div class="bf-title">Round ${state.round} briefing</div>
          <button type="button" class="bf-hide" id="bfHideBtn" title="Hide the briefing (bring it back with the Briefing button)" aria-label="Hide briefing">Hide</button>
        </div>
        <div class="bf-sub">What matters for your team right now. Click a player for details.</div>
      </div>
      <div class="bf-body">
        <div class="bf-sec">
          <div class="bf-sec-title">Your squad <span>${squad.length ? `${alerts.length} alert${alerts.length === 1 ? "" : "s"}` : ""}</span></div>
          ${squadHtml}
        </div>
        ${fallers.length ? `
        <div class="bf-sec">
          <div class="bf-sec-title">Popular players about to drop <span>owned 10%+</span></div>
          ${fallers.map((p) => item(p, p.injuryStatus ? escapeHtml(p.injury) : `Needs ${p.be} over ${p.games} games, projected ${p.proj}.`, money(p.priceChange), "bad")).join("")}
        </div>` : ""}
        <div class="bf-sec">
          <div class="bf-sec-title">Injury report <span>owned 2%+ or $9M+</span></div>
          ${injuries.map((p) => item(p, `${escapeHtml(p.injuryDetail || p.injury)}${returnTxt(p)}`, `<span class="muted-text">${p.owned.toFixed(1)}%</span>`)).join("") || `<div class="bf-empty">No injuries to note.</div>`}
        </div>
        <div class="bf-sec">
          <div class="bf-sec-title">Cash cows to watch <span>biggest projected rises</span></div>
          ${cows.map((p) => item(p, "", money(p.priceChange))).join("")}
        </div>
      </div>`;
  }

  function setHidden(v) {
    window.SCHOOPS.getState().briefingHidden = v;
    writeHidden(v);
    window.SCHOOPS.render();
  }

  function init() {
    if (!window.SCHOOPS) return;
    injectStyles();
    window.SCHOOPS.getState().briefingHidden = readHidden();

    const ctrls = document.getElementById("marketHeaderControls");
    if (ctrls) {
      ctrls.insertAdjacentHTML("afterbegin", `<button type="button" class="ghost-btn" id="bfShowBtn" style="display:none" title="Show the round briefing"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><line x1="15" y1="4" x2="15" y2="20"/></svg><span>Briefing</span></button>`);
      document.getElementById("bfShowBtn").addEventListener("click", () => setHidden(false));
    }
    const frame = document.querySelector(".workspace-frame");
    const insp = document.getElementById("playerInspector");
    const panel = document.createElement("aside");
    panel.className = "briefing";
    panel.id = "briefingPanel";
    panel.setAttribute("aria-label", "Round briefing");
    frame.insertBefore(panel, insp);
    panel.addEventListener("click", (e) => {
      if (e.target.closest("#bfHideBtn")) { setHidden(true); return; }
      const b = e.target.closest("[data-bf-player]");
      if (b) window.SCHOOPS.openInspector(b.dataset.bfPlayer);
      if (e.target.closest('[data-bf-go="court"]')) window.SCHOOPS.setActiveNav("court");
    });
    // Screen size decides what fits (briefing, Form column), so re-render the whole Market on resize
    let resizeTimer = null;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => window.SCHOOPS.render(), 120);
    });
    // Opening/closing the Inspector doesn't trigger a full render, so watch it directly
    new MutationObserver(render).observe(insp, { attributes: true, attributeFilter: ["class"] });
    window.SCHOOPS.onRender(render);
    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
