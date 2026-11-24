/* SCHOOPS: Captain picks (front page)
 * A strip above the Market table: the top 3 captain options for this round, which one to make
 * Captain (C) and Vice-Captain (VC), a one-line reason each, and each player's chance of being
 * the top scorer. "My team" uses your starters (or your squad if your court isn't set);
 * "Everyone" uses the whole league so it's useful before you've added a team.
 * Chances come from a simulation using each player's likely range (same spread the Trade Lab uses).
 */
(function () {
  "use strict";

  const HIDE_KEY = "schoops_captains_hidden";
  const MODE_KEY = "schoops_captains_mode";
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (err) { return null; } },
    set(k, v) { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (err) {} }
  };
  const isPhone = () => window.matchMedia("(max-width: 760px)").matches;
  const isOut = (p) => !!p.injuryStatus && String(p.injuryStatus).toLowerCase().startsWith("out");

  let collapsed = store.get(HIDE_KEY) === null ? null : store.get(HIDE_KEY) === "1"; // null = not chosen yet
  let mode = store.get(MODE_KEY) || "team";
  let simCache = { key: "", chances: {} };

  function injectStyles() {
    const style = document.createElement("style");
    style.textContent = `
      .cp { flex-shrink: 0; border-bottom: 1px solid var(--border-subtle); padding: 10px 18px 12px; background: rgba(255, 255, 255, 0.008); }
      .cp.hide { display: none; }
      .cp-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 8px; min-height: 26px; }
      .cp-title { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
      .cp-title b { font-size: 13px; font-weight: 600; color: var(--text-primary); white-space: nowrap; }
      .cp-title span { font-size: 11.5px; color: var(--text-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .cp-ctrls { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
      .cp-seg { display: inline-grid; grid-auto-flow: column; gap: 2px; padding: 2px; border-radius: 7px; background: var(--bg-input); border: 1px solid var(--border-subtle); }
      .cp-seg button { height: 22px; padding: 0 9px; border: none; border-radius: 5px; background: transparent; color: var(--text-tertiary);
        font-size: 11.5px; font-weight: 500; cursor: pointer; white-space: nowrap; transition: color 120ms ease, background-color 120ms ease; }
      .cp-seg button.on { background: var(--bg-active); color: var(--text-primary); }
      .cp-btn { height: 26px; padding: 0 10px; border-radius: 6px; border: 1px solid var(--border-default); background: transparent; color: var(--text-secondary);
        font-size: 11.5px; font-weight: 500; cursor: pointer; white-space: nowrap; transition: color 120ms ease, background-color 120ms ease, border-color 120ms ease, transform 160ms var(--ease-press); }
      .cp-btn.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
      .cp-btn.quiet { border-color: transparent; color: var(--text-tertiary); }
      .cp-btn:active { transform: scale(0.97); }
      .cp-btn:disabled { opacity: 0.5; cursor: default; transform: none; }
      @media (hover: hover) {
        .cp-btn:hover:not(:disabled) { color: var(--text-primary); background: var(--bg-hover); }
        .cp-btn.primary:hover:not(:disabled) { background: #7F8BF5; color: #fff; }
        .cp-seg button:hover:not(.on) { color: var(--text-secondary); }
      }
      .cp-btn:focus-visible, .cp-seg button:focus-visible, .cp-card:focus-visible, .cp-line:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }

      .cp-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
      .cp-card { position: relative; display: grid; grid-template-columns: auto auto minmax(0, 1fr) auto; gap: 10px; align-items: center;
        padding: 10px 12px 12px; border-radius: 10px; border: 1px solid var(--border-subtle); background: var(--bg-elevated);
        color: var(--text-primary); text-align: left; cursor: pointer; overflow: hidden; min-width: 0;
        transition: border-color 120ms ease, background-color 120ms ease, transform 160ms var(--ease-press); }
      .cp-card:active { transform: scale(0.985); }
      @media (hover: hover) { .cp-card:hover { border-color: var(--border-strong); } }
      .cp-card.c { border-color: rgba(110, 123, 242, 0.42); background: linear-gradient(180deg in oklab, rgba(110, 123, 242, 0.10), rgba(110, 123, 242, 0.02)), var(--bg-elevated); }
      .cp-role { width: 26px; height: 22px; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center;
        font-size: 11px; font-weight: 700; letter-spacing: 0.02em; background: var(--bg-active); color: var(--text-secondary); white-space: nowrap; }
      .cp-card.c .cp-role { background: var(--accent); color: #fff; }
      .cp-card.vc .cp-role { background: var(--accent-soft); color: #A5AEFF; }
      .cp-mid { min-width: 0; }
      .cp-name { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; min-width: 0; }
      .cp-name > span:first-child { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .cp-why { font-size: 11.5px; line-height: 1.4; color: var(--text-secondary); margin-top: 2px; text-wrap: pretty;
        display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
      .cp-num { text-align: right; font-family: var(--mono); white-space: nowrap; }
      .cp-num b { display: block; font-size: 15px; font-weight: 600; color: var(--text-primary); }
      .cp-num small { display: block; font-size: 10.5px; color: var(--text-tertiary); margin-top: 1px; }
      .cp-bar { position: absolute; left: 12px; right: 12px; bottom: 5px; height: 3px; border-radius: 2px; background: rgba(255, 255, 255, 0.06); overflow: hidden; }
      .cp-bar i { display: block; height: 100%; border-radius: 2px; background: var(--text-tertiary); transform-origin: left; }
      .cp-card.c .cp-bar i { background: var(--accent); }
      .cp-card.vc .cp-bar i { background: #8F99F5; }
      .cp-empty { font-size: 12px; color: var(--text-tertiary); padding: 6px 0; }

      /* Collapsed: one line with the picks, tap to open */
      .cp.min { padding: 0 18px; }
      .cp-line { width: 100%; min-height: 38px; display: flex; align-items: center; gap: 10px; border: none; background: transparent; color: var(--text-secondary);
        font-size: 12px; text-align: left; cursor: pointer; padding: 6px 0; min-width: 0; }
      .cp-line b { color: var(--text-primary); font-weight: 600; }
      .cp-line .cp-l-txt { min-width: 0; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .cp-line .cp-l-more { color: var(--text-tertiary); flex-shrink: 0; }
      @media (hover: hover) { .cp-line:hover .cp-l-more { color: var(--text-primary); } }

      @media (prefers-reduced-motion: no-preference) {
        .cp-bar i { transition: transform 320ms var(--ease-out); }
      }
      @media (max-width: 760px) {
        .cp { padding: 8px 12px 10px; }
        .cp.min { padding: 0 12px; }
        .cp-title span { display: none; }
        .cp-grid { display: flex; overflow-x: auto; scroll-snap-type: x mandatory; scroll-padding: 0 12px; gap: 8px; margin: 0 -12px; padding: 0 12px 2px; scrollbar-width: none; }
        .cp-grid::-webkit-scrollbar { display: none; }
        .cp-card { flex: 0 0 84%; scroll-snap-align: start; }
      }
    `;
    document.head.appendChild(style);
  }

  // Small seeded random generator so the chances don't wobble between renders
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // Spread of a projection: from the likely range (middle 50%) when we have it, else ~22% of the projection
  function sigmaOf(p) {
    if (p.projIsOurs && p.projLo !== null && p.projHi !== null) return Math.max(4, (p.projHi - p.projLo) / 1.35);
    return Math.max(6, (p.proj || 0) * 0.22);
  }
  // Chance each player is the pool's top scorer this round
  function topScorerChances(pool, key) {
    if (simCache.key === key) return simCache.chances;
    const N = 6000;
    const rand = rng(1234567);
    const wins = new Array(pool.length).fill(0);
    const sd = pool.map(sigmaOf);
    for (let s = 0; s < N; s++) {
      let best = -Infinity, bi = 0;
      for (let i = 0; i < pool.length; i++) {
        // Box-Muller normal draw
        const u = Math.max(rand(), 1e-9), v = rand();
        const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
        const x = (pool[i].proj || 0) + z * sd[i];
        if (x > best) { best = x; bi = i; }
      }
      wins[bi]++;
    }
    const chances = {};
    pool.forEach((p, i) => { chances[p.id] = wins[i] / N; });
    simCache = { key, chances };
    return chances;
  }

  function recentPpg(p) {
    const t = (p.formHistory || []).slice(-3);
    let pts = 0, g = 0;
    t.forEach(([, s, gp]) => { if (gp > 0) { pts += s; g += gp; } });
    return g ? pts / g : null;
  }

  // Which players can be captained in this mode, and a label explaining where they came from
  function getPool(state, all, mode) {
    if (mode === "team") {
      const squad = all.filter((p) => p.inSquad);
      if (!squad.length) return { players: [], source: "none" };
      const solver = window.SCHOOPS_SOLVER;
      const slots = (state.court && state.court.slots) || {};
      const starters = solver ? solver.STARTER_SLOTS.map((s) => slots[s.key]).filter(Boolean).map((id) => state.computedById[id]).filter(Boolean) : [];
      if (starters.length >= 5) return { players: starters, source: "starters" };
      return { players: squad, source: "squad" };
    }
    return { players: all, source: "all" };
  }

  // One-line reason, written from what actually sets this player apart from the other options
  function reasonFor(p, rank, top, chance, capPick) {
    const bits = [];
    const games = p.games || 0;
    const fewestOther = Math.min(...top.filter((q) => q.id !== p.id).map((q) => q.games || 0));
    const ppg = recentPpg(p);
    const bestPpg = Math.max(...top.map((q) => recentPpg(q) || 0));
    if (p.injuryStatus) bits.push(isOut(p) ? "Listed out: only if he's cleared" : "Day-to-day: check he's playing before lockout");
    else if (rank === "c") {
      const next = top.find((q) => q.id !== p.id);
      bits.push(next && p.proj - next.proj >= 5 ? `highest projection by ${p.proj - next.proj} pts` : "highest projection");
    }
    if (games > fewestOther && games >= 3) bits.push(`${games} games this round`);
    else if (games < 3 && games > 0) bits.push(`only ${games} game${games === 1 ? "" : "s"}`);
    if (ppg !== null && ppg >= bestPpg - 0.5 && bits.length < 2) bits.push(`best scorer a game lately (${Math.round(ppg)})`);
    else if (ppg !== null && bits.length < 2) bits.push(`${Math.round(ppg)} a game over 3 rounds`);
    if (bits.length < 2 && p.projIsOurs && p.projLo !== null && (p.projHi - p.projLo) <= p.proj * 0.3) bits.push("steady, tight range");
    let s = bits.slice(0, 2).join(", ");
    if (rank === "vc" && capPick) s = `Backup if ${capPick.name.split(" ").slice(-1)[0]} sits. ${s.charAt(0).toUpperCase()}${s.slice(1)}`;
    return s ? `${s.charAt(0).toUpperCase()}${s.slice(1)}.` : `Projected ${p.proj}.`;
  }

  // "My team" needs a squad; until there is one, show Everyone (the saved choice is kept)
  function effectiveMode(state) {
    const hasSquad = Object.values(state.computedById || {}).some((p) => p.inSquad);
    return hasSquad ? mode : "all";
  }

  function pickCaptains(state, mode) {
    const all = Object.values(state.computedById || {}).filter((p) => !p.isInactive && !p.isLikelyDnp && (p.proj || 0) > 0);
    const pool = getPool(state, all, mode);
    if (!pool.players.length) return { pool, top: [] };
    const ranked = [...pool.players].filter((p) => (p.proj || 0) > 0).sort((a, b) => (b.proj - a.proj) || (b.games - a.games));
    const simPool = ranked.slice(0, mode === "team" ? 15 : 25);
    const key = `${state.round}|${state.projSource}|${mode}|${simPool.map((p) => `${p.id}:${p.proj}`).join(",")}`;
    const chances = topScorerChances(simPool, key);
    const top = ranked.slice(0, 3);
    // Captain: highest projection. Vice-captain: next best who isn't on the injury report (he's the cover)
    const cap = top[0];
    const vc = ranked.slice(1).find((p) => !p.injuryStatus) || top[1];
    return { pool, top, cap, vc, chances };
  }

  function render() {
    const el = document.getElementById("captainPicks");
    if (!el || !window.SCHOOPS) return;
    const state = window.SCHOOPS.getState();
    const onMarket = state.activeNav === "market";
    el.classList.toggle("hide", !onMarket || !state.computedById || !Object.keys(state.computedById).length);
    if (!onMarket) return;
    const { escapeHtml, renderAvatar } = window.SCHOOPS;
    const hasSquad = Object.values(state.computedById).some((p) => p.inSquad);
    const mode = effectiveMode(state);
    const isMin = collapsed === null ? isPhone() : collapsed;
    const res = pickCaptains(state, mode);
    const { top, cap, vc, chances, pool } = res;
    const pct = (p) => `${Math.round((chances[p.id] || 0) * 100)}%`;
    const roleOf = (p) => (cap && p.id === cap.id ? "c" : vc && p.id === vc.id ? "vc" : "");
    // Show C, VC, then the best other option, in that order
    const cards = cap ? [cap, vc, ...top.filter((p) => p.id !== cap.id && (!vc || p.id !== vc.id))].filter(Boolean).slice(0, 3) : [];
    const where = pool.source === "starters" ? "from your starting 10" : pool.source === "squad" ? "from your squad" : "from every player";

    el.classList.toggle("min", isMin);
    if (isMin) {
      el.innerHTML = cap ? `
        <button type="button" class="cp-line" data-cp-toggle aria-expanded="false">
          <span class="cp-l-txt">Captain pick <b>${escapeHtml(cap.name)}</b> ${pct(cap)}${vc ? ` · VC <b>${escapeHtml(vc.name)}</b>` : ""}</span>
          <span class="cp-l-more">Show picks</span>
        </button>` : "";
      return;
    }

    // "Use these" sets C/VC in My Court; only offered when the picks are your starters and differ from what's set
    const court = state.court || {};
    const canApply = mode === "team" && pool.source === "starters" && cap;
    const alreadySet = canApply && court.captainId === cap.id && (!vc || court.viceCaptainId === vc.id);

    el.innerHTML = `
      <div class="cp-head">
        <div class="cp-title"><b>Round ${state.round} captain picks</b><span>Captain scores double · ${where} · % = chance he's the top scorer</span></div>
        <div class="cp-ctrls">
          ${hasSquad ? `<div class="cp-seg" role="group" aria-label="Pick from">
            <button type="button" class="${mode === "team" ? "on" : ""}" data-cp-mode="team" aria-pressed="${mode === "team"}">My team</button>
            <button type="button" class="${mode === "all" ? "on" : ""}" data-cp-mode="all" aria-pressed="${mode === "all"}">Everyone</button>
          </div>` : ""}
          ${canApply ? `<button type="button" class="cp-btn ${alreadySet ? "" : "primary"}" data-cp-apply ${alreadySet ? "disabled" : ""} title="Set these as Captain and Vice-Captain in My Court">${alreadySet ? "Set in My Court" : "Use C & VC"}</button>` : ""}
          <button type="button" class="cp-btn quiet" data-cp-toggle aria-expanded="true" title="Shrink to one line">Hide</button>
        </div>
      </div>
      ${cards.length ? `<div class="cp-grid">${cards.map((p) => {
        const role = roleOf(p);
        const chance = chances[p.id] || 0;
        const range = p.projIsOurs && p.projLo !== null ? `likely ${p.projLo}–${p.projHi}` : "SuperCoach proj";
        const tag = p.injuryStatus ? `<span class="micro-tag ${isOut(p) ? "out" : "dtd"}">${isOut(p) ? "OUT" : "DTD"}</span>` : "";
        return `
        <button type="button" class="cp-card ${role}" data-cp-player="${escapeHtml(p.id)}" title="${escapeHtml(`${p.name}: projected ${p.proj} (${range}), ${p.games} games. As captain: ${p.proj * 2}. Click for details.`)}">
          <span class="cp-role">${role ? role.toUpperCase() : "3rd"}</span>
          ${renderAvatar(p, 32)}
          <span class="cp-mid">
            <span class="cp-name"><span>${escapeHtml(p.name)}</span>${tag}</span>
            <span class="cp-why">${escapeHtml(reasonFor(p, role, top, chance, cap))}</span>
          </span>
          <span class="cp-num"><b>${pct(p)}</b><small>proj ${p.proj}</small></span>
          <span class="cp-bar" aria-hidden="true"><i style="transform:scaleX(${Math.min(1, chance).toFixed(3)})"></i></span>
        </button>`;
      }).join("")}</div>` : `<div class="cp-empty">No projections yet for this round.</div>`}`;
  }

  function init() {
    if (!window.SCHOOPS) return;
    injectStyles();
    const host = document.getElementById("marketViewSection");
    const strip = host && host.querySelector(".context-strip");
    if (!host || !strip) return;
    const el = document.createElement("section");
    el.className = "cp";
    el.id = "captainPicks";
    el.setAttribute("aria-label", "Captain picks");
    strip.insertAdjacentElement("afterend", el);
    el.addEventListener("click", (e) => {
      const state = window.SCHOOPS.getState();
      if (e.target.closest("[data-cp-toggle]")) {
        const isMin = collapsed === null ? isPhone() : collapsed;
        collapsed = !isMin;
        store.set(HIDE_KEY, collapsed ? "1" : "0");
        render();
        return;
      }
      const m = e.target.closest("[data-cp-mode]");
      if (m) { mode = m.dataset.cpMode; store.set(MODE_KEY, mode); render(); return; }
      if (e.target.closest("[data-cp-apply]")) {
        const { cap, vc } = pickCaptains(state, effectiveMode(state));
        if (cap) {
          state.court.captainId = cap.id;
          state.court.viceCaptainId = vc ? vc.id : null;
          window.SCHOOPS.savePrefs();
          render();
        }
        return;
      }
      const card = e.target.closest("[data-cp-player]");
      if (card) window.SCHOOPS.openInspector(card.dataset.cpPlayer);
    });
    window.SCHOOPS.onRender(render);
    render();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
