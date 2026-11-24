/* SCHOOPS: Import your squad
 * Four ways in: upload a screenshot, drag it in, paste it (Ctrl+V), or paste/type names.
 * Screenshots are read in the browser with Tesseract.js (loaded on first use from jsDelivr);
 * the image never leaves the device. Names are matched by importmatch.js, then reviewed
 * before anything is saved. Opened with window.SchoopsImporter.open().
 */
(function () {
  "use strict";

  const SQUAD_SIZE = 15;
  const TESSERACT_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";

  const ui = {
    open: false,
    step: "choose",        // choose | reading | review
    progress: 0,
    status: "",
    preview: null,         // object URL of the screenshot
    text: "",
    rows: [],              // [{ player, confidence, checked, alternatives, line }]
    unmatched: [],
    addQuery: "",
    error: ""
  };

  // ---------- styles ----------
  function injectStyles() {
    const s = document.createElement("style");
    s.textContent = `
      .im-backdrop { position: fixed; inset: 0; z-index: 160; background: rgba(5, 5, 7, 0.72); backdrop-filter: blur(4px);
        display: flex; align-items: flex-start; justify-content: center; padding: min(8vh, 64px) 16px 24px; }
      .im-dialog { width: 100%; max-width: 620px; max-height: calc(100dvh - 48px); display: flex; flex-direction: column;
        background: var(--bg-elevated); border-radius: 12px; box-shadow: var(--shadow-popover); overflow: hidden;
        animation: imIn 200ms var(--ease-out) both; }
      @keyframes imIn { from { opacity: 0; transform: translateY(6px) scale(0.985); } }
      .im-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; border-bottom: 1px solid var(--border-subtle); }
      .im-title { font-size: 14.5px; font-weight: 600; }
      .im-sub { font-size: 12px; color: var(--text-tertiary); margin-top: 2px; }
      .im-body { padding: 16px; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; }
      .im-drop { border: 1.5px dashed var(--border-strong); border-radius: 10px; padding: 26px 16px; text-align: center; cursor: pointer;
        transition: border-color 120ms ease, background-color 120ms ease; }
      .im-drop.drag { border-color: var(--pos); background: rgba(34, 197, 139, 0.06); }
      @media (hover: hover) { .im-drop:hover { border-color: var(--pos); } }
      .im-drop-title { font-size: 14px; font-weight: 600; margin-top: 8px; }
      .im-drop-text { font-size: 12.5px; color: var(--text-secondary); margin-top: 4px; line-height: 1.5; }
      .im-or { display: flex; align-items: center; gap: 10px; font-size: 11.5px; color: var(--text-tertiary); }
      .im-or::before, .im-or::after { content: ""; flex: 1; height: 1px; background: var(--border-subtle); }
      .im-label { font-size: 12px; color: var(--text-secondary); margin-bottom: 6px; display: block; }
      .im-text { width: 100%; min-height: 96px; resize: vertical; padding: 10px; border-radius: 8px; background: var(--bg-input);
        border: 1px solid var(--border-default); color: var(--text-primary); font: 13px/1.5 var(--sans); outline: none; }
      .im-text:focus { border-color: var(--border-strong); }
      .im-note { font-size: 11.5px; color: var(--text-tertiary); line-height: 1.5; }
      .im-progress { height: 6px; border-radius: 99px; background: rgba(255, 255, 255, 0.08); overflow: hidden; }
      .im-progress > span { display: block; height: 100%; background: var(--pos); border-radius: 99px; transition: width 200ms ease; }
      .im-preview { max-height: 180px; border-radius: 8px; object-fit: contain; align-self: center; max-width: 100%;
        outline: 1px solid rgba(255, 255, 255, 0.08); outline-offset: -1px; }
      .im-row { display: grid; grid-template-columns: 22px 32px minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 7px 8px; border-radius: 8px; }
      .im-row:has(input:not(:checked)) { opacity: 0.5; }
      @media (hover: hover) { .im-row:hover { background: var(--bg-hover); } }
      .im-row input[type=checkbox] { width: 16px; height: 16px; accent-color: var(--pos); }
      .im-name { font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .im-meta { font-family: var(--mono); font-size: 11px; color: var(--text-tertiary); }
      .im-pill { font-size: 10.5px; font-weight: 600; padding: 2px 7px; border-radius: 99px; white-space: nowrap; }
      .im-pill.high { background: var(--pos-bg); color: var(--pos-bright); }
      .im-pill.check { background: var(--warn-bg); color: var(--warn-bright); }
      .im-alt { font-size: 11.5px; color: var(--warn-bright); margin-top: 2px; }
      .im-alt button { background: none; border: none; color: var(--text-secondary); text-decoration: underline; cursor: pointer; font-size: 11.5px; padding: 0 2px; }
      .im-section { font-size: 12px; font-weight: 600; color: var(--text-secondary); display: flex; justify-content: space-between; }
      .im-section span { font-weight: 400; color: var(--text-tertiary); }
      .im-chips { display: flex; flex-wrap: wrap; gap: 6px; }
      .im-chip { font-size: 11.5px; padding: 3px 8px; border-radius: 99px; background: rgba(255, 255, 255, 0.05); color: var(--text-secondary); }
      .im-search { width: 100%; height: 34px; padding: 0 10px; border-radius: 8px; background: var(--bg-input); border: 1px solid var(--border-default);
        color: var(--text-primary); font-size: 13px; outline: none; }
      .im-results { display: flex; flex-direction: column; }
      .im-result { display: flex; align-items: center; gap: 10px; padding: 6px 8px; border: none; border-radius: 6px; background: transparent;
        color: var(--text-primary); text-align: left; cursor: pointer; font-size: 13px; }
      @media (hover: hover) { .im-result:hover { background: var(--bg-active); } }
      .im-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 12px 16px; border-top: 1px solid var(--border-subtle); flex-wrap: wrap; }
      .im-count { font-size: 12.5px; color: var(--text-secondary); }
      .im-count strong { color: var(--text-primary); font-family: var(--mono); }
      .im-err { font-size: 12.5px; color: var(--neg-soft); }
      @media (max-width: 760px) {
        .im-backdrop { padding: 0; align-items: flex-end; }
        .im-dialog { max-height: 92dvh; border-radius: 14px 14px 0 0; }
        .im-text, .im-search { font-size: 16px; }
      }
    `;
    document.head.appendChild(s);
  }

  // ---------- OCR ----------
  let tesseractPromise = null;
  function loadTesseract() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    if (!tesseractPromise) {
      tesseractPromise = new Promise((ok, fail) => {
        const sc = document.createElement("script");
        sc.src = TESSERACT_URL;
        sc.onload = () => ok(window.Tesseract);
        sc.onerror = () => { tesseractPromise = null; fail(new Error("Couldn't load the text reader. Check your connection, or paste names instead.")); };
        document.head.appendChild(sc);
      });
    }
    return tesseractPromise;
  }

  // Scale up, greyscale, and flip dark screenshots to dark-on-light (what OCR reads best)
  async function prepareImage(file) {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(3, Math.max(1, 1800 / bmp.width));
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    const img = ctx.getImageData(0, 0, c.width, c.height);
    const d = img.data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const dark = sum / (d.length / 4) < 128;
    for (let i = 0; i < d.length; i += 4) {
      let g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      if (dark) g = 255 - g;
      g = Math.max(0, Math.min(255, (g - 128) * 1.35 + 128)); // a little extra contrast
      d[i] = d[i + 1] = d[i + 2] = g;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  async function readScreenshot(file) {
    if (!file || !/^image\//.test(file.type)) { ui.error = "That file isn't an image. Use a PNG or JPG screenshot."; render(); return; }
    ui.error = "";
    if (ui.preview) URL.revokeObjectURL(ui.preview);
    ui.preview = URL.createObjectURL(file);
    ui.step = "reading";
    ui.progress = 0.03;
    ui.status = "Loading the text reader (first time only)…";
    render();
    try {
      const T = await loadTesseract();
      const canvas = await prepareImage(file);
      ui.status = "Reading names from your screenshot…";
      render();
      const worker = await T.createWorker("eng", 1, {
        logger: (m) => {
          if (m.status === "recognizing text") { ui.progress = 0.25 + m.progress * 0.75; updateProgress(); }
          else if (typeof m.progress === "number") { ui.progress = Math.max(ui.progress, m.progress * 0.25); updateProgress(); }
        }
      });
      const { data } = await worker.recognize(canvas);
      await worker.terminate();
      runMatch(data.text);
    } catch (err) {
      ui.step = "choose";
      ui.error = err.message || "Couldn't read that screenshot. Try a clearer one, or paste names instead.";
      render();
    }
  }

  function runMatch(text) {
    const state = window.SCHOOPS.getState();
    const players = Object.values(state.computedById || {});
    const res = window.SchoopsImportMatch.matchText(text, players);
    ui.text = text;
    ui.rows = res.matches.map((m) => ({ ...m, checked: m.confidence === "high" || m.alternatives.length === 0 }));
    ui.unmatched = res.unmatched.slice(0, 12);
    ui.step = "review";
    ui.addQuery = "";
    render();
  }

  // ---------- rendering ----------
  function updateProgress() {
    const bar = document.querySelector(".im-progress > span");
    if (bar) bar.style.width = `${Math.round(ui.progress * 100)}%`;
  }

  function rowHtml(r, i) {
    const { escapeHtml, renderAvatar } = window.SCHOOPS;
    const p = r.player;
    const alts = r.alternatives.length
      ? `<div class="im-alt">Did you mean ${r.alternatives.map((a) => `<button type="button" data-im-swap="${i}" data-pid="${escapeHtml(a.id)}">${escapeHtml(a.name)}</button>`).join(" or ")}?</div>`
      : "";
    return `
      <label class="im-row">
        <input type="checkbox" data-im-check="${i}" ${r.checked ? "checked" : ""} aria-label="Include ${escapeHtml(p.name)}" />
        ${renderAvatar(p, 30)}
        <span style="min-width:0">
          <div class="im-name">${escapeHtml(p.name)}</div>
          <div class="im-meta">${escapeHtml(p.team)} · ${escapeHtml(p.pos)} · $${(p.price / 1000000).toFixed(2)}M</div>
          ${alts}
        </span>
        <span class="im-pill ${r.confidence}">${r.confidence === "high" ? "Matched" : "Check"}</span>
      </label>`;
  }

  function render() {
    let root = document.getElementById("imRoot");
    if (!ui.open) { if (root) root.remove(); return; }
    if (!root) {
      root = document.createElement("div");
      root.id = "imRoot";
      document.body.appendChild(root);
      root.addEventListener("click", onClick);
      root.addEventListener("change", onChange);
      root.addEventListener("input", onInput);
      root.addEventListener("dragover", (e) => { e.preventDefault(); root.querySelector(".im-drop")?.classList.add("drag"); });
      root.addEventListener("dragleave", () => root.querySelector(".im-drop")?.classList.remove("drag"));
      root.addEventListener("drop", (e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) readScreenshot(f); });
    }
    const { escapeHtml, renderAvatar } = window.SCHOOPS;
    const state = window.SCHOOPS.getState();
    const current = Object.values(state.computedById || {}).filter((p) => p.inSquad).length;
    let body = "";
    let foot = "";

    if (ui.step === "choose") {
      body = `
        <div class="im-drop" data-im-pick="1" role="button" tabindex="0" aria-label="Choose a screenshot">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" style="color:var(--text-secondary)"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.8"/><path d="M21 15l-5-5L5 21"/></svg>
          ${window.matchMedia("(pointer: coarse)").matches
            ? `<div class="im-drop-title">Choose a screenshot of your SuperCoach team</div>
               <div class="im-drop-text">Tap to pick it from your photos</div>`
            : `<div class="im-drop-title">Drop a screenshot of your SuperCoach team</div>
               <div class="im-drop-text">or click to choose one · or press <strong>Ctrl+V</strong> to paste it</div>`}
        </div>
        <input type="file" accept="image/*" id="imFile" hidden />
        <div class="im-note">Your screenshot is read on this device and never uploaded. Any view that shows your players' names works; the list view reads best.</div>
        <div class="im-or">or</div>
        <div>
          <label class="im-label" for="imText">Paste or type your players' names</label>
          <textarea class="im-text" id="imText" placeholder="One per line, or separated by commas. e.g.&#10;Nikola Jokic&#10;V. Wembanyama&#10;Maxey">${escapeHtml(ui.text)}</textarea>
        </div>
        ${ui.error ? `<div class="im-err" role="alert">${escapeHtml(ui.error)}</div>` : ""}`;
      foot = `<span class="im-note">${current ? `Your squad has ${current} player${current === 1 ? "" : "s"} now.` : "Your squad is empty."}</span>
        <button type="button" class="primary-btn" id="imFindBtn">Find players</button>`;
    } else if (ui.step === "reading") {
      body = `
        ${ui.preview ? `<img class="im-preview" src="${ui.preview}" alt="Your screenshot" />` : ""}
        <div class="im-sub" role="status">${escapeHtml(ui.status)}</div>
        <div class="im-progress"><span style="width:${Math.round(ui.progress * 100)}%"></span></div>
        <div class="im-note">This takes a few seconds. Nothing is uploaded.</div>`;
      foot = `<span></span><button type="button" class="ghost-btn" id="imCancelBtn">Cancel</button>`;
    } else {
      const chosen = ui.rows.filter((r) => r.checked);
      const q = ui.addQuery.trim().toLowerCase();
      const have = new Set(ui.rows.map((r) => r.player.id));
      const results = q.length >= 2 ? Object.values(state.computedById).filter((p) => !have.has(p.id) && p.name.toLowerCase().includes(q)).slice(0, 6) : [];
      body = `
        <div class="im-section">Found ${ui.rows.length} player${ui.rows.length === 1 ? "" : "s"} <span>Untick anything wrong · "Check" means confirm it</span></div>
        <div>${ui.rows.map(rowHtml).join("") || `<div class="im-note">No players found. Try a clearer screenshot or type the names.</div>`}</div>
        ${ui.unmatched.length ? `<div><div class="im-section" style="margin-bottom:6px">Couldn't match <span>add them below if they're players</span></div>
          <div class="im-chips">${ui.unmatched.map((l) => `<span class="im-chip">${escapeHtml(l.slice(0, 40))}</span>`).join("")}</div></div>` : ""}
        <div>
          <label class="im-label" for="imAdd">Add a missing player</label>
          <input class="im-search" id="imAdd" value="${escapeHtml(ui.addQuery)}" placeholder="Search by name…" autocomplete="off" />
          <div class="im-results">${results.map((p) => `<button type="button" class="im-result" data-im-add="${escapeHtml(p.id)}">${renderAvatar(p, 22)} ${escapeHtml(p.name)} <span class="im-meta">${escapeHtml(p.team)} · ${escapeHtml(p.pos)}</span></button>`).join("")}</div>
        </div>
        ${chosen.length > SQUAD_SIZE ? `<div class="im-err" role="alert">That's ${chosen.length} players. A squad holds ${SQUAD_SIZE}, so untick ${chosen.length - SQUAD_SIZE}.</div>` : ""}`;
      const value = chosen.reduce((s, r) => s + r.player.price, 0);
      const ok = chosen.length > 0 && chosen.length <= SQUAD_SIZE;
      foot = `
        <span class="im-count"><strong>${chosen.length}/${SQUAD_SIZE}</strong> selected · <strong>$${(value / 1000000).toFixed(2)}M</strong></span>
        <span style="display:flex; gap:8px; flex-wrap:wrap">
          <button type="button" class="ghost-btn" id="imBackBtn">Start over</button>
          ${current ? `<button type="button" class="ghost-btn" id="imAddToBtn" ${ok && current + chosen.length <= SQUAD_SIZE ? "" : "disabled"}>Add to my squad</button>` : ""}
          <button type="button" class="primary-btn" id="imReplaceBtn" ${ok ? "" : "disabled"}>${current ? "Replace my squad" : "Save as my squad"}</button>
        </span>`;
    }

    const focusAdd = document.activeElement && document.activeElement.id === "imAdd";
    root.innerHTML = `
      <div class="im-backdrop" id="imBackdrop">
        <div class="im-dialog" role="dialog" aria-modal="true" aria-labelledby="imTitle">
          <div class="im-head">
            <div><div class="im-title" id="imTitle">Import your squad</div><div class="im-sub">Screenshot or names. You'll check everything before it's saved.</div></div>
            <button type="button" class="insp-close" id="imCloseBtn" aria-label="Close">✕</button>
          </div>
          <div class="im-body">${body}</div>
          <div class="im-foot">${foot}</div>
        </div>
      </div>`;
    if (focusAdd) { const a = document.getElementById("imAdd"); a.focus(); a.setSelectionRange(a.value.length, a.value.length); }
  }

  // ---------- events ----------
  function save(replace) {
    const state = window.SCHOOPS.getState();
    const chosen = ui.rows.filter((r) => r.checked).map((r) => r.player.id);
    if (replace) {
      state.squadIds = {};
      if (state.court) { state.court.slots = {}; state.court.captainId = null; state.court.viceCaptainId = null; }
    }
    chosen.forEach((id) => { state.squadIds[id] = true; });
    window.SCHOOPS.savePrefs();
    close();
    window.SCHOOPS.setActiveNav("court");
  }

  function onClick(e) {
    const t = e.target;
    if (t.id === "imBackdrop" || t.closest("#imCloseBtn") || t.closest("#imCancelBtn")) { close(); return; }
    if (t.closest("[data-im-pick]")) { document.getElementById("imFile").click(); return; }
    if (t.closest("#imFindBtn")) {
      const txt = document.getElementById("imText").value;
      if (!txt.trim()) { ui.error = "Add a screenshot or type some names first."; render(); return; }
      runMatch(txt);
      return;
    }
    if (t.closest("#imBackBtn")) { ui.step = "choose"; ui.rows = []; ui.error = ""; render(); return; }
    if (t.closest("#imReplaceBtn")) { save(true); return; }
    if (t.closest("#imAddToBtn")) { save(false); return; }
    const swap = t.closest("[data-im-swap]");
    if (swap) {
      e.preventDefault();
      const r = ui.rows[Number(swap.dataset.imSwap)];
      const p = window.SCHOOPS.getState().computedById[swap.dataset.pid];
      if (r && p) { r.alternatives = [r.player, ...r.alternatives.filter((a) => a.id !== p.id)].slice(0, 3); r.player = p; r.checked = true; }
      render();
      return;
    }
    const add = t.closest("[data-im-add]");
    if (add) {
      const p = window.SCHOOPS.getState().computedById[add.dataset.imAdd];
      if (p) ui.rows.push({ player: p, confidence: "high", checked: true, alternatives: [], line: "" });
      ui.addQuery = "";
      render();
    }
  }

  function onChange(e) {
    if (e.target.id === "imFile" && e.target.files[0]) readScreenshot(e.target.files[0]);
    const chk = e.target.closest("[data-im-check]");
    if (chk) { ui.rows[Number(chk.dataset.imCheck)].checked = chk.checked; render(); }
  }

  function onInput(e) {
    if (e.target.id === "imText") ui.text = e.target.value;
    if (e.target.id === "imAdd") { ui.addQuery = e.target.value; render(); }
  }

  function onPaste(e) {
    if (!ui.open || ui.step !== "choose") return;
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
    if (item) { e.preventDefault(); readScreenshot(item.getAsFile()); }
  }

  function open() {
    Object.assign(ui, { open: true, step: "choose", progress: 0, rows: [], unmatched: [], error: "", addQuery: "" });
    render();
  }
  function close() {
    ui.open = false;
    if (ui.preview) { URL.revokeObjectURL(ui.preview); ui.preview = null; }
    render();
  }

  function init() {
    injectStyles();
    document.addEventListener("paste", onPaste);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && ui.open) close(); });
    window.SchoopsImporter = { open, close, matchAndReview: (text) => { open(); runMatch(text); }, readScreenshot };
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
