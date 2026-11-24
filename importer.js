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
      /* Build-your-15: compact screenshot row, type-ahead search and a 15-slot roster tray */
      .im-drop.compact { display: flex; align-items: center; gap: 12px; padding: 12px 14px; text-align: left; }
      .im-drop.compact .im-drop-title { display: block; margin: 0; font-size: 13.5px; }
      .im-drop.compact .im-drop-text { display: block; margin-top: 2px; font-size: 12px; }
      .im-search-wrap { position: relative; }
      .im-search-wrap .im-search { height: 40px; font-size: 14px; padding: 0 12px; }
      .im-search:focus { border-color: var(--border-strong); }
      /* Suggestions sit in the flow (not over the tray) so you always see who you've picked */
      .im-results-pop { margin-top: 6px; background: #1B1B21; border: 1px solid var(--border-subtle);
        border-radius: 10px; padding: 4px; max-height: 260px; overflow-y: auto; }
      .im-results-pop .im-result { width: 100%; }
      .im-result.hi { background: var(--bg-active); }
      .im-result mark { background: rgba(110, 123, 242, 0.32); color: #fff; border-radius: 2px; padding: 0 1px; }
      .im-add-hint { margin-left: auto; font-family: var(--mono); font-size: 11px; color: var(--text-tertiary); white-space: nowrap; }
      .im-tray { border: 1px solid var(--border-subtle); border-radius: 12px; padding: 12px; background: #121216; }
      .im-tray-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 12.5px; color: var(--text-secondary); margin-bottom: 10px; }
      .im-tray-head strong { color: var(--text-primary); font-family: var(--mono); }
      .im-pos { display: flex; gap: 4px; }
      .im-pos span { font-family: var(--mono); font-size: 10.5px; padding: 2px 6px; border-radius: 4px; background: rgba(255, 255, 255, 0.04); color: var(--text-tertiary); }
      .im-pos span.on { background: var(--pos-bg); color: var(--pos-bright); }
      .im-slots { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
      .im-slot { position: relative; display: flex; align-items: center; gap: 8px; min-height: 44px; padding: 6px 26px 6px 10px; border-radius: 8px;
        background: #18181D; border: 1px solid var(--border-subtle); box-shadow: inset 3px 0 0 var(--team-accent, transparent);
        animation: imSlotIn 180ms var(--ease-out) both; }
      @keyframes imSlotIn { from { opacity: 0; transform: scale(0.96); } }
      .im-slot.empty { border-style: dashed; background: transparent; box-shadow: none; justify-content: center; animation: none; padding: 6px; }
      .im-slot-n { font-family: var(--mono); font-size: 11px; color: var(--text-tertiary); opacity: 0.6; }
      .im-slot-main { min-width: 0; display: flex; flex-direction: column; }
      .im-slot-name { font-size: 12.5px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .im-slot-x { position: absolute; top: 4px; right: 4px; width: 20px; height: 20px; border-radius: 5px; border: none; background: transparent;
        color: var(--text-tertiary); cursor: pointer; font-size: 14px; line-height: 1; }
      @media (hover: hover) { .im-slot-x:hover { background: var(--neg-bg); color: var(--neg-soft); } }
      .im-paste summary { cursor: pointer; font-size: 12px; color: var(--text-tertiary); list-style: none; }
      .im-paste summary::before { content: "+ "; }
      .im-paste[open] summary::before { content: "− "; }
      .im-paste[open] .im-text { margin-top: 8px; }
      @media (prefers-reduced-motion: reduce) { .im-slot { animation: none; } }

      @media (max-width: 760px) {
        .im-slots { grid-template-columns: repeat(2, minmax(0, 1fr)); }
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

  // ---------- type-ahead search ----------
  // "wemb" -> Wembanyama, "jok" -> Jokic, "PHI" -> 76ers players; small typos fall back to fuzzy matching
  function searchPlayers(q, state, exclude) {
    const { norm, matchText } = window.SchoopsImportMatch;
    const nq = norm(q);
    if (nq.length < 2) return [];
    const all = Object.values(state.computedById || {}).filter((p) => !exclude.has(p.id));
    const team = /^[a-z]{3}$/i.test(q.trim()) ? q.trim().toUpperCase() : null;
    const scored = [];
    all.forEach((p) => {
      const n = norm(p.name);
      const toks = n.split(" ");
      let s = 0;
      // First name or surname starting with what you typed rank equally; ownership breaks ties
      if (n.startsWith(nq) || toks.some((t) => t.startsWith(nq))) s = 3;
      else if (n.replace(/ /g, "").includes(nq.replace(/ /g, ""))) s = 1.5;
      if (team && String(p.team).toUpperCase() === team) s = Math.max(s, 2);
      if (s) scored.push({ p, s });
    });
    if (!scored.length) {
      matchText(q, all).matches.forEach((m) => scored.push({ p: m.player, s: 1 }));
    }
    scored.sort((a, b) => b.s - a.s || (b.p.owned || 0) - (a.p.owned || 0) || b.p.proj - a.p.proj);
    return scored.slice(0, 8).map((x) => x.p);
  }

  function highlight(name, q) {
    const esc = window.SCHOOPS.escapeHtml;
    const needle = String(q || "").trim().toLowerCase();
    const i = needle ? name.toLowerCase().indexOf(needle) : -1;
    if (i < 0) return esc(name); // fuzzy/team matches: no highlight
    return `${esc(name.slice(0, i))}<mark>${esc(name.slice(i, i + needle.length))}</mark>${esc(name.slice(i + needle.length))}`;
  }

  function pick(id) {
    const p = window.SCHOOPS.getState().computedById[id];
    if (!p || ui.picked.some((x) => x.id === id) || ui.picked.length >= SQUAD_SIZE) return;
    ui.picked.push(p);
    ui.query = "";
    ui.hi = 0;
    render();
  }

  function savePicked(replace) {
    ui.rows = ui.picked.map((p) => ({ player: p, confidence: "high", checked: true, alternatives: [], line: "" }));
    save(replace);
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
      root.addEventListener("keydown", onKeyDown);
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
      const picked = ui.picked;
      const value = picked.reduce((s, p) => s + p.price, 0);
      const posCount = { PG: 0, SG: 0, SF: 0, PF: 0, C: 0 };
      picked.forEach((p) => String(p.pos).split("/").forEach((x) => { if (posCount[x] !== undefined) posCount[x] += 1; }));
      const results = searchPlayers(ui.query, state, new Set(picked.map((p) => p.id)));
      ui.results = results;
      const slots = Array.from({ length: SQUAD_SIZE }, (_, i) => {
        const p = picked[i];
        if (!p) return `<div class="im-slot empty"><span class="im-slot-n">${i + 1}</span></div>`;
        return `
          <div class="im-slot" style="--team-accent:${window.SCHOOPS.getTeamColor(p.team)}">
            ${renderAvatar(p, 26)}
            <span class="im-slot-main"><span class="im-slot-name">${escapeHtml(p.name)}</span><span class="im-meta">${escapeHtml(p.pos)} · $${(p.price / 1e6).toFixed(2)}M</span></span>
            <button type="button" class="im-slot-x" data-im-unpick="${escapeHtml(p.id)}" aria-label="Remove ${escapeHtml(p.name)}">×</button>
          </div>`;
      }).join("");
      body = `
        <div class="im-drop compact" data-im-pick="1" role="button" tabindex="0" aria-label="Choose a screenshot">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" style="color:var(--text-secondary); flex-shrink:0"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.8"/><path d="M21 15l-5-5L5 21"/></svg>
          <span style="text-align:left">
            <span class="im-drop-title">${window.matchMedia("(pointer: coarse)").matches ? "Import a screenshot of your team" : "Drop, paste (Ctrl+V) or choose a screenshot"}</span>
            <span class="im-drop-text">Fills all 15 in one go. Read on this device, never uploaded.</span>
          </span>
        </div>
        <input type="file" accept="image/*" id="imFile" hidden />
        <div class="im-or">or add players yourself</div>
        <div class="im-search-wrap">
          <input class="im-search" id="imQuery" value="${escapeHtml(ui.query)}" placeholder="Start typing a name or team… e.g. wemb, jok, PHI" autocomplete="off"
            role="combobox" aria-expanded="${results.length > 0}" aria-controls="imResults" aria-autocomplete="list" ${picked.length >= SQUAD_SIZE ? "disabled" : ""} />
          ${results.length ? `<div class="im-results-pop" id="imResults" role="listbox">${results.map((p, i) => `
            <button type="button" class="im-result ${i === ui.hi ? "hi" : ""}" role="option" aria-selected="${i === ui.hi}" data-im-pickp="${escapeHtml(p.id)}">
              ${renderAvatar(p, 24)}
              <span class="im-slot-main"><span class="im-slot-name">${highlight(p.name, ui.query)}</span><span class="im-meta">${escapeHtml(p.team)} · ${escapeHtml(p.pos)} · $${(p.price / 1e6).toFixed(2)}M</span></span>
              <span class="im-add-hint">${i === ui.hi ? "Enter ↵" : "+"}</span>
            </button>`).join("")}</div>` : (ui.query.trim().length >= 2 ? `<div class="im-results-pop"><div class="im-note" style="padding:10px">No player matches "${escapeHtml(ui.query)}".</div></div>` : "")}
        </div>
        <div class="im-tray">
          <div class="im-tray-head">
            <span><strong>${picked.length}/${SQUAD_SIZE}</strong> selected · <span class="mono">$${(value / 1e6).toFixed(2)}M</span></span>
            <span class="im-pos">${Object.entries(posCount).map(([k, v]) => `<span class="${v ? "on" : ""}" title="${v} player${v === 1 ? "" : "s"} who can play ${k}">${k} ${v}</span>`).join("")}</span>
          </div>
          <div class="im-slots">${slots}</div>
        </div>
        <details class="im-paste" ${ui.pasteOpen ? "open" : ""}>
          <summary>Paste a list of names instead</summary>
          <textarea class="im-text" id="imText" placeholder="One per line, or separated by commas. e.g.&#10;Nikola Jokic&#10;V. Wembanyama&#10;Maxey">${escapeHtml(ui.text)}</textarea>
          <button type="button" class="ghost-btn" id="imFindBtn" style="margin-top:8px">Find these players</button>
        </details>
        ${ui.error ? `<div class="im-err" role="alert">${escapeHtml(ui.error)}</div>` : ""}`;
      const ok = picked.length > 0 && picked.length <= SQUAD_SIZE;
      foot = `
        <span class="im-note">${current ? `Your saved squad has ${current} player${current === 1 ? "" : "s"}.` : "Nothing is saved until you press Save."}</span>
        <span style="display:flex; gap:8px; flex-wrap:wrap">
          ${current ? `<button type="button" class="ghost-btn" id="imPickAddBtn" ${ok && current + picked.length <= SQUAD_SIZE ? "" : "disabled"}>Add to my squad</button>` : ""}
          <button type="button" class="primary-btn" id="imPickSaveBtn" ${ok ? "" : "disabled"}>${current ? "Replace my squad" : "Save as my squad"}</button>
        </span>`;
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
    const focusQuery = document.activeElement && document.activeElement.id === "imQuery";
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
    const qEl = document.getElementById("imQuery");
    if (qEl && (focusQuery || ui.focusQuery) && !qEl.disabled) { qEl.focus(); qEl.setSelectionRange(qEl.value.length, qEl.value.length); ui.focusQuery = false; }
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
    if (t.closest("#imPickSaveBtn")) { savePicked(true); return; }
    if (t.closest("#imPickAddBtn")) { savePicked(false); return; }
    const pk = t.closest("[data-im-pickp]");
    if (pk) { ui.focusQuery = true; pick(pk.dataset.imPickp); return; }
    const un = t.closest("[data-im-unpick]");
    if (un) { ui.picked = ui.picked.filter((p) => p.id !== un.dataset.imUnpick); render(); return; }
    if (t.closest(".im-paste summary")) { ui.pasteOpen = !ui.pasteOpen; return; }
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

  function onKeyDown(e) {
    if (e.target.id !== "imQuery") return;
    const n = (ui.results || []).length;
    if (e.key === "ArrowDown" && n) { e.preventDefault(); ui.hi = (ui.hi + 1) % n; render(); }
    else if (e.key === "ArrowUp" && n) { e.preventDefault(); ui.hi = (ui.hi - 1 + n) % n; render(); }
    else if (e.key === "Enter" && n) { e.preventDefault(); pick(ui.results[ui.hi].id); }
    else if (e.key === "Escape" && ui.query) { e.preventDefault(); e.stopPropagation(); ui.query = ""; render(); }
  }

  function onInput(e) {
    if (e.target.id === "imQuery") { ui.query = e.target.value; ui.hi = 0; render(); return; }
    if (e.target.id === "imText") ui.text = e.target.value;
    if (e.target.id === "imAdd") { ui.addQuery = e.target.value; render(); }
  }

  function onPaste(e) {
    if (!ui.open || ui.step !== "choose") return;
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
    if (item) { e.preventDefault(); readScreenshot(item.getAsFile()); }
  }

  function open() {
    Object.assign(ui, { open: true, step: "choose", progress: 0, rows: [], unmatched: [], error: "", addQuery: "",
      picked: [], query: "", hi: 0, results: [], pasteOpen: false, focusQuery: !window.matchMedia("(pointer: coarse)").matches });
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
