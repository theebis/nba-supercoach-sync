/* SCHOOPS: in-app notifications
 * A bell (sidebar top on desktop, header on phones) with an unread count and a panel of alerts.
 * Two sources, both worked out in this browser (no accounts, no server):
 *  1. Since your last visit: compares your squad + watchlist against what you saw last time
 *     (injury changes, big projection moves), and notices when a new round has started.
 *  2. Live, while the site is open: big games, notable final scores and DNPs for your squad,
 *     from the Live tracker. Live alerts also pop up briefly in the corner.
 * No spam: only your players (watchlist too for injuries), one alert per player per game per kind,
 * only clearly notable results, at most 40 kept, and live alerts can be switched off.
 */
(function () {
  "use strict";

  const KEY = "schoops_notify_v1";
  const MAX_ITEMS = 40;
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || "null"); } catch (err) { return null; } };
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (err) {} };

  // items: newest first. snap: what each tracked player looked like last time. sent: one-off keys already used.
  let store = load() || { items: [], snap: null, round: null, sent: {}, live: true, lastOpen: 0 };
  let open = false;
  let liveRuns = 0;          // first live check of a visit: catch up quietly (panel only, no pop-ups)
  let firstEver = !store.snap; // brand-new visitor: start with a clean slate

  const isOut = (s) => !!s && String(s).toLowerCase().startsWith("out");
  const injLabel = (s) => (!s ? "" : isOut(s) ? "OUT" : String(s).toLowerCase().includes("day") ? "day-to-day" : String(s));

  function injectStyles() {
    const st = document.createElement("style");
    st.textContent = `
      .nt-bell { position: relative; width: 30px; height: 30px; display: inline-flex; align-items: center; justify-content: center; border-radius: 8px;
        border: 1px solid var(--border-subtle); background: transparent; color: var(--text-secondary); cursor: pointer; flex-shrink: 0;
        transition: color 120ms ease, background-color 120ms ease, border-color 120ms ease, transform 160ms var(--ease-press); }
      .nt-bell svg { width: 15px; height: 15px; }
      .nt-bell:active { transform: scale(0.95); }
      @media (hover: hover) { .nt-bell:hover { color: var(--text-primary); background: var(--bg-hover); border-color: var(--border-default); } }
      .nt-bell:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
      .nt-bell.has-new { color: var(--text-primary); }
      .nt-count { position: absolute; top: -5px; right: -6px; min-width: 17px; height: 17px; padding: 0 4px; border-radius: 999px; background: var(--neg);
        color: #fff; font-size: 10px; font-weight: 700; line-height: 17px; text-align: center; font-family: var(--mono); box-shadow: 0 0 0 2px var(--bg-shell); }
      .nt-count[hidden] { display: none; }
      .nt-bell-m { display: none; }
      @media (max-width: 760px) { .nt-bell-m { display: inline-flex; margin-left: auto; } }

      .nt-panel { position: fixed; z-index: 400; top: 12px; left: 12px; width: min(400px, calc(100vw - 24px)); max-height: min(640px, calc(100vh - 24px));
        display: flex; flex-direction: column; border-radius: 12px; background: #16161A; box-shadow: var(--shadow-popover); overflow: hidden;
        opacity: 0; transform: translateY(-4px) scale(0.98); transform-origin: top left; pointer-events: none;
        transition: opacity 140ms ease, transform 180ms var(--ease-out); }
      .nt-panel.open { opacity: 1; transform: none; pointer-events: auto; }
      @media (prefers-reduced-motion: reduce) { .nt-panel { transition: opacity 120ms ease; transform: none; } }
      .nt-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 12px 14px; border-bottom: 1px solid var(--border-subtle); }
      .nt-title { font-size: 13.5px; font-weight: 600; color: var(--text-primary); }
      .nt-head-btns { display: flex; align-items: center; gap: 4px; }
      .nt-link { height: 26px; padding: 0 8px; border: none; border-radius: 6px; background: transparent; color: var(--text-secondary); font-size: 11.5px; cursor: pointer; white-space: nowrap; transition: color 120ms ease, background-color 120ms ease; }
      @media (hover: hover) { .nt-link:hover { color: var(--text-primary); background: var(--bg-hover); } }
      .nt-link:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
      .nt-body { overflow-y: auto; overscroll-behavior: contain; padding: 4px 0 8px; }
      .nt-sec { padding: 10px 14px 4px; font-size: 11px; font-weight: 600; color: var(--text-tertiary); }
      .nt-item { width: 100%; display: grid; grid-template-columns: 30px minmax(0, 1fr); gap: 10px; align-items: start; padding: 9px 14px; border: none;
        background: transparent; color: var(--text-primary); text-align: left; cursor: pointer; transition: background-color 100ms ease; }
      @media (hover: hover) { .nt-item:hover { background: var(--bg-hover); } }
      .nt-item:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
      .nt-item.unread { background: rgba(110, 123, 242, 0.06); }
      .nt-ico { width: 30px; height: 30px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 13px; flex-shrink: 0; position: relative; }
      .nt-ico .sc-avatar { width: 30px !important; height: 30px !important; }
      .nt-ico i { position: absolute; right: -3px; bottom: -3px; width: 14px; height: 14px; border-radius: 50%; border: 2px solid #16161A; }
      .nt-k-injury i, .nt-k-dnp i { background: var(--warn-bright); }
      .nt-k-cleared i, .nt-k-hot i, .nt-k-good i, .nt-k-up i { background: var(--pos-bright); }
      .nt-k-down i, .nt-k-bad i { background: var(--neg-soft); }
      .nt-k-round { background: var(--accent-soft); color: #A5AEFF; font-weight: 700; font-size: 11px; }
      .nt-k-round i { display: none; }
      .nt-text { font-size: 12.5px; line-height: 1.45; color: var(--text-primary); text-wrap: pretty; }
      .nt-text b { font-weight: 600; }
      .nt-sub { font-size: 11.5px; line-height: 1.4; color: var(--text-secondary); margin-top: 2px; text-wrap: pretty; }
      .nt-time { font-size: 10.5px; color: var(--text-tertiary); margin-top: 3px; font-family: var(--mono); }
      .nt-empty { padding: 22px 16px; font-size: 12.5px; line-height: 1.5; color: var(--text-tertiary); text-align: center; }
      .nt-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 14px; border-top: 1px solid var(--border-subtle); font-size: 11.5px; color: var(--text-secondary); }
      .nt-sw { width: 30px; height: 18px; border-radius: 999px; border: none; background: rgba(255, 255, 255, 0.14); position: relative; cursor: pointer; flex-shrink: 0; transition: background-color 150ms ease; }
      .nt-sw::after { content: ""; position: absolute; top: 2px; left: 2px; width: 14px; height: 14px; border-radius: 50%; background: #fff; transition: transform 160ms var(--ease-out); }
      .nt-sw.on { background: var(--pos); }
      .nt-sw.on::after { transform: translateX(12px); }
      .nt-sw:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

      .nt-toasts { position: fixed; z-index: 450; right: 16px; bottom: 16px; display: flex; flex-direction: column; gap: 8px; pointer-events: none; }
      .nt-toast { width: min(340px, calc(100vw - 32px)); display: grid; grid-template-columns: 30px minmax(0, 1fr); gap: 10px; align-items: start; padding: 11px 12px;
        border-radius: 10px; background: #1C1C22; box-shadow: var(--shadow-popover); pointer-events: auto; cursor: pointer;
        opacity: 0; transform: translateY(8px); transition: opacity 180ms ease, transform 220ms var(--ease-out); }
      .nt-toast.show { opacity: 1; transform: none; }
      @media (prefers-reduced-motion: reduce) { .nt-toast { transform: none; } }
    `;
    document.head.appendChild(st);
  }

  const BELL = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>`;

  // ---------- making notifications ----------
  function add(item, toast) {
    if (item.key) {
      if (store.sent[item.key]) return;
      store.sent[item.key] = Date.now();
    }
    store.items.unshift({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, t: Date.now(), read: false, ...item });
    store.items = store.items.slice(0, MAX_ITEMS);
    if (toast) showToast(store.items[0]);
  }

  // Players worth tracking: your squad (everything) and watchlist (injuries only)
  function tracked(state) {
    const out = {};
    Object.values(state.computedById || {}).forEach((p) => {
      if (p.inSquad || p.inWatchlist) out[p.id] = { name: p.name, inj: p.injuryStatus || "", det: p.injuryDetail || p.injury || "", proj: p.proj || 0, squad: !!p.inSquad };
    });
    return out;
  }

  // 1. Since your last visit (runs once the live round's data has loaded)
  function diffSinceLastVisit(state) {
    if (state.isHistorical || state.round !== state.liveRound) return;
    const now = tracked(state);
    const S = window.SCHOOPS;

    // New round
    if (store.round && state.round > store.round) {
      const w = S.tradeWindow ? S.tradeWindow() : null;
      const lock = w && w.open && w.lockMs ? ` Trades lock ${new Date(w.lockMs).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}.` : "";
      const squad = Object.values(state.computedById).filter((p) => p.inSquad);
      add({ kind: "round", key: `round-${state.round}`, label: `R${state.round}`,
        text: `<b>Round ${state.round}</b> has started. Prices from Round ${state.round - 1} are in.`,
        sub: squad.length ? `Your squad is now worth ${S.formatPriceM(squad.reduce((s, p) => s + p.price, 0))}.${lock}` : lock.trim() });
    }

    if (store.snap) {
      Object.entries(now).forEach(([id, cur]) => {
        const was = store.snap[id];
        if (!was) return;
        // Injury changes
        if (cur.inj !== was.inj) {
          if (cur.inj && !was.inj) add({ kind: "injury", pid: id, key: `inj-${id}-${cur.inj}-${state.round}`, text: `<b>${esc(cur.name)}</b> is ${esc(injLabel(cur.inj))}.`, sub: esc(cur.det) });
          else if (!cur.inj && was.inj) add({ kind: "cleared", pid: id, key: `clr-${id}-${Math.floor(Date.now() / 864e5)}`, text: `<b>${esc(cur.name)}</b> is off the injury report.` });
          else add({ kind: isOut(cur.inj) ? "injury" : "cleared", pid: id, key: `inj-${id}-${cur.inj}-${state.round}`,
            text: `<b>${esc(cur.name)}</b> ${isOut(cur.inj) ? "downgraded to" : "upgraded to"} ${esc(injLabel(cur.inj))}.`, sub: esc(cur.det) });
        }
        // Big projection moves for your squad (same round only)
        if (cur.squad && store.round === state.round && was.proj > 0) {
          const d = cur.proj - was.proj;
          if (Math.abs(d) >= Math.max(10, was.proj * 0.2)) {
            add({ kind: d > 0 ? "up" : "down", pid: id, key: `proj-${id}-${state.round}-${cur.proj}`,
              text: `<b>${esc(cur.name)}</b>'s projection ${d > 0 ? "jumped" : "dropped"} to ${cur.proj} (was ${was.proj}).`,
              sub: d < 0 && cur.inj ? "Fewer games expected with his injury." : "" });
          }
        }
      });
    }
    store.snap = now;
    store.round = state.round;
    persist();
    paint();
  }

  // 2. Live, from the Live tracker
  function checkLive() {
    const L = window.SchoopsLive;
    const S = window.SCHOOPS;
    if (!L || !L.ready() || !S) return;
    const state = S.getState();
    const squad = Object.values(state.computedById || {}).filter((p) => p.inSquad);
    let changed = false;
    const pop = liveRuns > 0 && store.live;
    const silent = firstEver && liveRuns === 0;
    liveRuns++;
    squad.forEach((p) => {
      const ppg = p.proj && (p.expGames || p.games) ? p.proj / (p.expGames || p.games) : 0;
      (L.games(p.id) || []).forEach((g) => {
        const base = `${g.eventId}-${p.id}`;
        if (g.state === "in" && g.played && ppg > 0 && g.sc >= ppg + 12 && g.sc >= ppg * 1.35) {
          if (silent) { store.sent[`hot-${base}`] = Date.now(); }
          else if (!store.sent[`hot-${base}`] && store.live) {
            add({ kind: "hot", pid: p.id, key: `hot-${base}`, text: `<b>${esc(p.name)}</b> is on fire: ${g.sc} SC already vs ${esc(g.vs)}.`, sub: `${esc(g.detail)} · he averages about ${Math.round(ppg)} a game.` }, pop);
            changed = true;
          }
        }
        if (g.state === "post" && !store.sent[`fin-${base}`]) {
          if (silent) { store.sent[`fin-${base}`] = Date.now(); }
          else if (g.dnp) {
            add({ kind: "dnp", pid: p.id, key: `fin-${base}`, text: `<b>${esc(p.name)}</b> didn't play vs ${esc(g.vs)}.`, sub: g.reason ? esc(g.reason) : "" }, pop);
            changed = true;
          } else if (g.played && ppg > 0 && Math.abs(g.sc - ppg) >= Math.max(15, ppg * 0.4)) {
            const good = g.sc > ppg;
            add({ kind: good ? "good" : "bad", pid: p.id, key: `fin-${base}`, text: `<b>${esc(p.name)}</b> finished with ${g.sc} SC vs ${esc(g.vs)}.`, sub: `${good ? "Well above" : "Well below"} the ${Math.round(ppg)} he was projected per game.` }, pop);
            changed = true;
          } else {
            store.sent[`fin-${base}`] = Date.now(); // ordinary game: nothing to say, but don't check again
          }
        }
      });
    });
    // Forget one-off keys older than three weeks
    const cutoff = Date.now() - 21 * 864e5;
    Object.keys(store.sent).forEach((k) => { if (store.sent[k] < cutoff) delete store.sent[k]; });
    if (changed) { persist(); paint(); } else persist();
  }

  // ---------- drawing ----------
  const esc = (s) => (window.SCHOOPS ? window.SCHOOPS.escapeHtml(String(s ?? "")) : String(s ?? ""));
  function ago(t) {
    const m = Math.round((Date.now() - t) / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.round(h / 24)}d ago`;
  }
  function icon(it) {
    const S = window.SCHOOPS;
    const p = it.pid && S ? S.getState().computedById[it.pid] : null;
    if (it.kind === "round") return `<span class="nt-ico nt-k-round">${esc(it.label || "R")}</span>`;
    return `<span class="nt-ico nt-k-${esc(it.kind)}">${p ? S.renderAvatar(p, 30) : ""}<i></i></span>`;
  }
  function itemHtml(it) {
    return `<button type="button" class="nt-item ${it.read ? "" : "unread"}" data-nt-id="${esc(it.id)}">
      ${icon(it)}
      <span><span class="nt-text">${it.text}</span>${it.sub ? `<span class="nt-sub" style="display:block">${it.sub}</span>` : ""}<span class="nt-time" style="display:block">${ago(it.t)}</span></span>
    </button>`;
  }

  function paint() {
    const unread = store.items.filter((i) => !i.read).length;
    document.querySelectorAll(".nt-count").forEach((el) => { el.hidden = !unread; el.textContent = unread > 9 ? "9+" : String(unread); });
    document.querySelectorAll(".nt-bell").forEach((b) => {
      b.classList.toggle("has-new", unread > 0);
      b.setAttribute("aria-label", unread ? `Notifications, ${unread} new` : "Notifications");
    });
    const panel = document.getElementById("ntPanel");
    if (!panel || !open) return;
    const fresh = store.items.filter((i) => i.t > store.lastOpen);
    const older = store.items.filter((i) => i.t <= store.lastOpen);
    const hasSquad = Object.values(window.SCHOOPS.getState().computedById || {}).some((p) => p.inSquad);
    panel.innerHTML = `
      <div class="nt-head">
        <span class="nt-title">Notifications</span>
        <span class="nt-head-btns">
          ${store.items.length ? `<button type="button" class="nt-link" data-nt-clear>Clear all</button>` : ""}
          <button type="button" class="nt-link" data-nt-close aria-label="Close notifications">Close</button>
        </span>
      </div>
      <div class="nt-body">
        ${!store.items.length ? `<div class="nt-empty">${hasSquad
          ? "Nothing yet. You'll see injury news for your players, big games while they're on, and what changed since your last visit."
          : "Add your squad in My Squad and this is where injury news, big games and round updates for your players will show up."}</div>` : ""}
        ${fresh.length ? `<div class="nt-sec">New since you last looked</div>${fresh.map(itemHtml).join("")}` : ""}
        ${older.length ? `<div class="nt-sec">Earlier</div>${older.map(itemHtml).join("")}` : ""}
      </div>
      <div class="nt-foot">
        <span>Live game alerts (big games, DNPs)</span>
        <button type="button" class="nt-sw ${store.live ? "on" : ""}" data-nt-live role="switch" aria-checked="${store.live}" aria-label="Live game alerts"></button>
      </div>`;
  }

  function placePanel(trigger) {
    const panel = document.getElementById("ntPanel");
    const r = trigger.getBoundingClientRect();
    const w = panel.offsetWidth || 400;
    let left = Math.min(window.innerWidth - w - 12, Math.max(12, r.left));
    if (r.left > window.innerWidth / 2) left = Math.max(12, r.right - w);
    panel.style.left = `${left}px`;
    panel.style.top = `${Math.min(window.innerHeight - 120, r.bottom + 8)}px`;
    panel.style.transformOrigin = r.left > window.innerWidth / 2 ? "top right" : "top left";
  }

  function toggle(trigger) {
    open = !open;
    const panel = document.getElementById("ntPanel");
    if (open) {
      paint();
      placePanel(trigger);
      panel.classList.add("open");
      // Opening marks everything read; "new since you last looked" stays until next time
      setTimeout(() => { store.items.forEach((i) => { i.read = true; }); persist(); const u = document.querySelectorAll(".nt-count"); u.forEach((el) => { el.hidden = true; }); }, 600);
    } else {
      panel.classList.remove("open");
      store.lastOpen = Date.now();
      persist();
    }
  }

  function showToast(it) {
    const wrap = document.getElementById("ntToasts");
    if (!wrap) return;
    const el = document.createElement("div");
    el.className = "nt-toast";
    el.setAttribute("role", "status");
    el.dataset.ntId = it.id;
    el.innerHTML = `${icon(it)}<span><span class="nt-text">${it.text}</span>${it.sub ? `<span class="nt-sub" style="display:block">${it.sub}</span>` : ""}</span>`;
    wrap.appendChild(el);
    while (wrap.children.length > 3) wrap.firstChild.remove();
    requestAnimationFrame(() => el.classList.add("show"));
    setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.remove(), 260); }, 7000);
  }

  function openItem(id) {
    const it = store.items.find((i) => i.id === id);
    if (!it) return;
    it.read = true;
    persist();
    if (open) toggle(document.querySelector(".nt-bell"));
    if (it.pid && window.SCHOOPS.getState().computedById[it.pid]) window.SCHOOPS.openInspector(it.pid);
    paint();
  }

  // ---------- setup ----------
  function init() {
    if (!window.SCHOOPS) return;
    injectStyles();
    // Desktop: in the sidebar, where the brand row has room. Phone: in the page header.
    const top = document.querySelector(".sb-top");
    if (top) top.insertAdjacentHTML("beforeend", `<button type="button" class="nt-bell" id="ntBell" aria-label="Notifications" aria-haspopup="dialog">${BELL}<span class="nt-count" hidden></span></button>`);
    const vhLeft = document.querySelector(".vh-left");
    if (vhLeft) vhLeft.insertAdjacentHTML("beforeend", `<button type="button" class="nt-bell nt-bell-m" aria-label="Notifications" aria-haspopup="dialog">${BELL}<span class="nt-count" hidden></span></button>`);
    document.body.insertAdjacentHTML("beforeend", `<div class="nt-panel" id="ntPanel" role="dialog" aria-label="Notifications"></div><div class="nt-toasts" id="ntToasts" aria-live="polite"></div>`);

    document.addEventListener("click", (e) => {
      const bell = e.target.closest(".nt-bell");
      if (bell) { toggle(bell); return; }
      const t = e.target.closest(".nt-toast");
      if (t) { openItem(t.dataset.ntId); t.remove(); return; }
      const panel = document.getElementById("ntPanel");
      if (!open || !panel) return;
      if (!panel.contains(e.target)) { toggle(document.querySelector(".nt-bell")); return; }
      if (e.target.closest("[data-nt-close]")) { toggle(document.querySelector(".nt-bell")); return; }
      if (e.target.closest("[data-nt-clear]")) { store.items = []; persist(); paint(); return; }
      if (e.target.closest("[data-nt-live]")) { store.live = !store.live; persist(); paint(); return; }
      const item = e.target.closest("[data-nt-id]");
      if (item) openItem(item.dataset.ntId);
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && open) toggle(document.querySelector(".nt-bell")); });

    // Diff once the live round's players are loaded, then follow the Live tracker
    let diffed = false;
    let snapTimer = null;
    window.SCHOOPS.onRender(() => {
      const st = window.SCHOOPS.getState();
      if (!st.computedById || !Object.keys(st.computedById).length || st.round !== st.liveRound || st.isHistorical) return;
      if (!diffed) { diffed = true; diffSinceLastVisit(st); return; }
      // Keep "what you last saw" current (e.g. players added to your squad this visit)
      clearTimeout(snapTimer);
      snapTimer = setTimeout(() => { store.snap = tracked(window.SCHOOPS.getState()); persist(); }, 1000);
    });
    document.addEventListener("schoops:live", checkLive);
    paint();
  }

  window.SchoopsNotify = { add: (it, toast) => { add(it, toast); persist(); paint(); }, _store: () => store };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
