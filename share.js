/*
 * Send to my phone: a link (and QR code) that carries your squad to another device.
 * The squad lives in the link's #hash (player ids, captain, vice-captain, bank), so nothing is uploaded
 * anywhere and the hash never reaches a server. Opening the link asks before replacing that device's squad.
 * Opened with window.SchoopsShare.open(). QR codes are drawn from qrcode-generator (jsDelivr), loaded on first use.
 */
(function () {
  const QR_URL = "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js";
  const LIVE_URL = "https://theebis.github.io/nba-supercoach-sync/";
  let pendingImport = null; // squad from the link, waiting for the player data to load
  let qrLoading = null;

  function injectStyles() {
    if (document.getElementById("shareStyles")) return;
    const s = document.createElement("style");
    s.id = "shareStyles";
    s.textContent = `
      .sh-backdrop { position: fixed; inset: 0; z-index: 170; background: rgba(5, 5, 7, 0.72); backdrop-filter: blur(4px);
        display: flex; align-items: flex-start; justify-content: center; padding: min(10vh, 80px) 16px 24px; }
      .sh-dialog { width: 100%; max-width: 420px; background: var(--bg-elevated); border-radius: 14px; box-shadow: var(--shadow-popover);
        overflow: hidden; animation: shIn 200ms var(--ease-out) both; }
      @keyframes shIn { from { opacity: 0; transform: translateY(6px) scale(0.985); } }
      .sh-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 16px 18px 4px; }
      .sh-title { font-size: 15px; font-weight: 650; }
      .sh-sub { font-size: 12.5px; color: var(--text-secondary); margin-top: 4px; line-height: 1.5; text-wrap: pretty; }
      .sh-x { width: 28px; height: 28px; flex-shrink: 0; border: none; border-radius: 7px; background: transparent; color: var(--text-tertiary); cursor: pointer; font-size: 14px; }
      @media (hover: hover) { .sh-x:hover { background: var(--bg-hover); color: var(--text-primary); } }
      .sh-body { padding: 14px 18px 18px; display: flex; flex-direction: column; gap: 14px; }
      .sh-qr { align-self: center; width: 216px; height: 216px; padding: 12px; border-radius: 12px; background: #fff;
        display: flex; align-items: center; justify-content: center; color: #555; font-size: 12px; text-align: center; }
      .sh-qr svg { width: 100%; height: 100%; display: block; }
      .sh-faces { display: flex; justify-content: center; }
      .sh-faces .sc-avatar { margin-left: -6px; box-shadow: 0 0 0 2px var(--bg-elevated); }
      .sh-faces .sc-avatar:first-child { margin-left: 0; }
      .sh-meta { text-align: center; font-size: 12px; color: var(--text-tertiary); margin-top: -6px; }
      .sh-link { display: flex; gap: 6px; }
      .sh-link input { flex: 1; min-width: 0; height: 34px; padding: 0 10px; border-radius: 8px; border: 1px solid var(--border-default);
        background: var(--bg-input); color: var(--text-secondary); font: 12px var(--mono); outline: none; }
      .sh-btn { height: 34px; padding: 0 14px; border-radius: 8px; border: 1px solid var(--border-default); background: var(--bg-active);
        color: var(--text-primary); font-size: 12.5px; font-weight: 600; cursor: pointer; white-space: nowrap;
        transition: background-color 120ms ease, transform 160ms var(--ease-press); }
      .sh-btn:active { transform: scale(0.97); }
      .sh-btn.main { background: var(--accent); border-color: transparent; color: #fff; }
      @media (hover: hover) { .sh-btn.main:hover { background: #7C88F5; } }
      .sh-btn:focus-visible, .sh-x:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
      .sh-note { font-size: 11.5px; color: var(--text-tertiary); line-height: 1.5; text-wrap: pretty; }
      .sh-actions { display: flex; gap: 8px; justify-content: flex-end; }
      .sh-ok { color: var(--pos-bright); }
      @media (max-width: 760px) {
        .sh-backdrop { padding: 0; align-items: flex-end; }
        .sh-dialog { max-width: none; border-radius: 14px 14px 0 0; }
        .sh-link input { font-size: 16px; }
        .sh-btn { height: 42px; }
        .sh-actions .sh-btn { flex: 1; }
      }
      @media (prefers-reduced-motion: reduce) { .sh-dialog { animation: none; } }
    `;
    document.head.appendChild(s);
  }

  // ---------- the link ----------
  function buildLink() {
    const S = window.SCHOOPS;
    const state = S.getState();
    const ids = S.getSquadPlayers().map((p) => p.id);
    const parts = [`s=${ids.map(encodeURIComponent).join(".")}`];
    const c = state.court || {};
    if (c.captainId && ids.includes(c.captainId)) parts.push(`c=${encodeURIComponent(c.captainId)}`);
    if (c.viceCaptainId && ids.includes(c.viceCaptainId)) parts.push(`v=${encodeURIComponent(c.viceCaptainId)}`);
    const bank = Number(state.tradeLab && state.tradeLab.bankM) || 0;
    if (bank) parts.push(`b=${bank}`);
    // Always the public site: a localhost link would mean nothing on a phone
    return `${LIVE_URL}#${parts.join("&")}`;
  }

  function parseHash(hash) {
    const h = String(hash || "").replace(/^#/, "");
    if (!/(^|&)s=/.test(h)) return null;
    const q = {};
    h.split("&").forEach((kv) => { const i = kv.indexOf("="); if (i > 0) q[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1)); });
    const ids = (q.s || "").split(".").filter(Boolean).slice(0, 15);
    if (!ids.length) return null;
    return { ids, c: q.c || null, v: q.v || null, b: Number(q.b) || 0 };
  }

  // ---------- QR code ----------
  function loadQr() {
    if (window.qrcode) return Promise.resolve(window.qrcode);
    if (qrLoading) return qrLoading;
    qrLoading = new Promise((resolve, reject) => {
      const sc = document.createElement("script");
      sc.src = QR_URL;
      sc.async = true;
      sc.onload = () => (window.qrcode ? resolve(window.qrcode) : reject(new Error("QR library missing")));
      sc.onerror = () => { qrLoading = null; reject(new Error("QR library failed to load")); };
      document.head.appendChild(sc);
    });
    return qrLoading;
  }
  function qrSvg(qrcode, text) {
    const qr = qrcode(0, "M");
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    let d = "";
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    return `<svg viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges" role="img" aria-label="QR code for your squad link"><path d="${d}" fill="#000"/></svg>`;
  }

  // ---------- dialogs ----------
  let lastFocus = null;
  function showDialog(html) {
    injectStyles();
    close();
    lastFocus = document.activeElement;
    const wrap = document.createElement("div");
    wrap.className = "sh-backdrop";
    wrap.id = "shBackdrop";
    wrap.innerHTML = `<div class="sh-dialog" role="dialog" aria-modal="true" aria-labelledby="shTitle">${html}</div>`;
    document.body.appendChild(wrap);
    wrap.addEventListener("click", onClick);
    const first = wrap.querySelector("[data-sh-focus]") || wrap.querySelector("button");
    if (first) first.focus();
    return wrap;
  }
  function close() {
    const el = document.getElementById("shBackdrop");
    if (!el) return;
    el.remove();
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function faces(players) {
    const S = window.SCHOOPS;
    return `<div class="sh-faces">${players.slice(0, 8).map((p) => S.renderAvatar(p, 28)).join("")}</div>`;
  }

  function open() {
    const S = window.SCHOOPS;
    const squad = S.getSquadPlayers();
    if (!squad.length) return;
    const link = buildLink();
    const state = S.getState();
    const cap = state.court && state.court.captainId ? state.computedById[state.court.captainId] : null;
    const onPhone = window.matchMedia("(max-width: 760px)").matches;
    showDialog(`
      <div class="sh-head">
        <div><div class="sh-title" id="shTitle">${onPhone ? "Open your squad on another device" : "Send your squad to your phone"}</div>
        <div class="sh-sub">Scan this with ${onPhone ? "the other device's" : "your phone's"} camera. SCHOOPS opens with your squad ready, no sign-in needed.</div></div>
        <button type="button" class="sh-x" data-sh-close aria-label="Close">✕</button>
      </div>
      <div class="sh-body">
        <div class="sh-qr" id="shQr">Drawing QR code…</div>
        ${faces(squad)}
        <div class="sh-meta">${squad.length} player${squad.length === 1 ? "" : "s"}${cap ? ` · Captain ${S.escapeHtml(cap.name)}` : ""}</div>
        <div class="sh-link">
          <input type="text" id="shLinkInput" readonly value="${S.escapeHtml(link)}" aria-label="Squad link" />
          <button type="button" class="sh-btn" data-sh-copy data-sh-focus>Copy link</button>
        </div>
        <div class="sh-note">Or send yourself the link. Your squad is inside the link itself, so nothing is uploaded. Opening it on another device asks before replacing the squad saved there.</div>
      </div>`);
    loadQr().then((qrcode) => {
      const box = document.getElementById("shQr");
      if (box) box.innerHTML = qrSvg(qrcode, link);
    }).catch(() => {
      const box = document.getElementById("shQr");
      if (box) box.textContent = "Couldn't draw the QR code. Copy the link instead.";
    });
  }

  function showImportPrompt() {
    const S = window.SCHOOPS;
    const state = S.getState();
    const found = pendingImport.ids.map((id) => state.computedById[id]).filter(Boolean);
    if (!found.length) { pendingImport = null; clearHash(); return; }
    const cap = pendingImport.c ? state.computedById[pendingImport.c] : null;
    const have = S.getSquadPlayers().length;
    showDialog(`
      <div class="sh-head">
        <div><div class="sh-title" id="shTitle">Load this squad?</div>
        <div class="sh-sub">${found.length} player${found.length === 1 ? "" : "s"}${cap ? ` · Captain ${S.escapeHtml(cap.name)}` : ""}.
        ${have ? `This replaces the ${have} player${have === 1 ? "" : "s"} saved on this device.` : "It'll be saved on this device."}</div></div>
        <button type="button" class="sh-x" data-sh-close aria-label="Close">✕</button>
      </div>
      <div class="sh-body">
        ${faces(found)}
        <div class="sh-meta">${found.slice(0, 4).map((p) => S.escapeHtml(p.name.split(" ").slice(-1)[0])).join(", ")}${found.length > 4 ? ` and ${found.length - 4} more` : ""}</div>
        <div class="sh-actions">
          <button type="button" class="sh-btn" data-sh-close>Not now</button>
          <button type="button" class="sh-btn main" data-sh-load data-sh-focus>Load squad</button>
        </div>
      </div>`);
  }

  function applyImport() {
    const S = window.SCHOOPS;
    const state = S.getState();
    const imp = pendingImport;
    pendingImport = null;
    if (!imp) return;
    const ids = imp.ids.filter((id) => state.computedById[id]);
    state.squadIds = {};
    ids.forEach((id) => { state.squadIds[id] = true; });
    if (state.court) {
      state.court.slots = {};
      state.court.lockedBenchIds = {};
      state.court.captainId = imp.c && ids.includes(imp.c) ? imp.c : null;
      state.court.viceCaptainId = imp.v && ids.includes(imp.v) ? imp.v : null;
    }
    if (imp.b && state.tradeLab) state.tradeLab.bankM = imp.b;
    S.savePrefs();
    close();
    clearHash();
    S.setActiveNav("court");
  }

  function clearHash() {
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
  }

  function onClick(e) {
    if (e.target.id === "shBackdrop" || e.target.closest("[data-sh-close]")) {
      if (pendingImport) { pendingImport = null; clearHash(); }
      close();
      return;
    }
    if (e.target.closest("[data-sh-load]")) { applyImport(); return; }
    const copy = e.target.closest("[data-sh-copy]");
    if (copy) {
      const input = document.getElementById("shLinkInput");
      const done = () => { copy.innerHTML = `<span class="sh-ok">✓ Copied</span>`; setTimeout(() => { if (copy.isConnected) copy.textContent = "Copy link"; }, 1800); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(input.value).then(done, () => { input.select(); });
      else { input.select(); try { document.execCommand("copy"); done(); } catch (err) {} }
    }
  }

  // A squad link opened: wait until the player data is in, then ask
  function checkPending() {
    if (!pendingImport || document.getElementById("shBackdrop")) return;
    const state = window.SCHOOPS.getState();
    if (Object.keys(state.computedById || {}).length > 50) showImportPrompt();
  }

  function init() {
    if (!window.SCHOOPS) return;
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && document.getElementById("shBackdrop")) {
        if (pendingImport) { pendingImport = null; clearHash(); }
        close();
      }
    });
    pendingImport = parseHash(location.hash);
    window.addEventListener("hashchange", () => { const p = parseHash(location.hash); if (p) { pendingImport = p; checkPending(); } });
    window.SCHOOPS.onRender(checkPending);
    checkPending();
  }

  window.SchoopsShare = { open, close, buildLink, parseHash };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
