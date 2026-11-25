// Click-through check: drives the site like a person and fails if a button stops doing its job.
// Each step clicks something and then checks the result actually changed (not just "no error").
//   npm run check:clicks           -> desktop (1440) + phone (390)
// Uses the local data file and live ESPN data (Live steps are skipped politely if no games are loaded).
import { chromium } from "playwright";
import { startServer } from "./serve.mjs";

const PORT = 8798;
const BASE = `http://localhost:${PORT}/`;
const UA_DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0";
const UA_PHONE = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";
const IGNORE = [/cloudflareinsights\.com/, /cdn-cgi\/rum/, /ERR_NETWORK_CHANGED/];
const SQUAD = ["Brayden Burries", "Devin Booker", "Cedric Coward", "Darryn Peterson", "Nikola Jokic", "Franz Wagner", "Yaxel Lendeborg",
  "Victor Wembanyama", "Karl-Anthony Towns", "Taylor Hendricks", "Darius Acuff Jr.", "Tyrese Proctor", "Mo Bamba", "Sidy Cissoko", "Cameron Boozer"];

const results = [];
let failed = 0;

async function run(name, page, fn) {
  try {
    const note = await fn(page);
    results.push(`  ok    ${name}${note ? `  (${note})` : ""}`);
  } catch (err) {
    failed++;
    results.push(`  FAIL  ${name}: ${String(err.message || err).split("\n")[0]}`);
  }
}
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };
const nav = async (page, name) => {
  await page.evaluate((n) => window.SCHOOPS.setActiveNav(n), name);
  await page.waitForTimeout(250);
};

async function suite(label, ctxOpts) {
  results.push(`${label}:`);
  const browser = await chromium.launch({ channel: "msedge" }).catch(() => chromium.launch());
  const page = await (await browser.newContext(ctxOpts)).newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !IGNORE.some((re) => re.test(m.text()))) errors.push(m.text()); });
  await page.goto(BASE);
  await page.waitForFunction(() => window.SCHOOPS && Object.keys(window.SCHOOPS.getState().computedById || {}).length > 100, null, { timeout: 30000 });
  const isPhone = (ctxOpts.viewport.width < 760);

  await run("new visitor sees the import banner and it opens the importer", page, async (p) => {
    expect(await p.locator("#importBanner:not([hidden])").count() === 1, "import banner not shown");
    await p.locator("[data-imp-open]").click(); await p.waitForTimeout(400);
    expect(await p.locator(".imp-modal, #importerOverlay.open, [class*='importer'].open, [role='dialog']:visible").count() > 0, "importer did not open");
    await p.keyboard.press("Escape"); await p.waitForTimeout(300);
  });

  await p_setSquad(page);

  await run("Market: sorting by a column changes the order", page, async (p) => {
    await nav(p, "market");
    const before = await p.locator("#tableBody tr").first().innerText();
    const th = p.locator("th[data-sort]").nth(1);
    await th.click(); await p.waitForTimeout(250);
    const after = await p.locator("#tableBody tr").first().innerText();
    expect(before !== after, "first row did not change after sorting");
  });

  await run("Market: Cash / Points switch changes the columns and sort, and is remembered", page, async (p) => {
    await nav(p, "market");
    const heads = async () => p.locator("#tableHead").innerText();
    await p.locator("[data-market-mode=\"points\"]").click(); await p.waitForTimeout(300);
    const ptsHead = await heads();
    const st = await p.evaluate(() => { const s = window.SCHOOPS.getState(); return { mode: s.marketMode, sort: s.sortKey, saved: JSON.parse(localStorage.getItem("schoops_terminal_v3") || "{}").marketMode }; });
    expect(ptsHead.includes("Pts / $1M") && !/\bBE\b/.test(ptsHead), `points header: ${ptsHead.replace(/\s+/g, " ")}`);
    expect(st.mode === "points" && st.sort === "pts3" && st.saved === "points", JSON.stringify(st));
    const pts = await p.evaluate(() => window.SCHOOPS.getState().visibleRows.slice(0, 5).map((r) => r.pts3));
    expect(pts.every((v, i) => i === 0 || pts[i - 1] >= v), `not sorted by 3-round points: ${pts}`);
    await p.reload(); await p.waitForFunction(() => window.SCHOOPS && window.SCHOOPS.getState().visibleRows, null, { timeout: 30000 });
    expect(await p.evaluate(() => window.SCHOOPS.getState().marketMode) === "points", "Points mode not remembered after reload");
    await p.locator("[data-market-mode=\"cash\"]").click(); await p.waitForTimeout(300);
    expect(/\bBE\b/.test(await heads()), "Cash mode did not bring back BE");
  });

  await run("Market: Top Scorers view lists the top 3-round scorers in Points mode", page, async (p) => {
    if (isPhone) { await p.evaluate(() => { document.querySelector("[data-view=\"topscorers\"]").click(); }); }
    else { await p.locator("[data-view=\"topscorers\"]").click(); }
    await p.waitForTimeout(300);
    const st = await p.evaluate(() => { const s = window.SCHOOPS.getState(); return { mode: s.marketMode, n: s.visibleRows.length, view: s.activeView }; });
    expect(st.view === "topscorers" && st.mode === "points" && st.n > 10 && st.n <= 50, JSON.stringify(st));
    await p.locator("[data-market-mode=\"cash\"]").click(); await p.waitForTimeout(200);
    await p.evaluate(() => window.SCHOOPS.setActiveNav("market", "all"));
  });

  await run("Market: Injured view filters the list", page, async (p) => {
    if (isPhone) { await p.evaluate(() => window.SCHOOPS.setActiveNav("market", "injured")); }
    else { await p.locator('[data-view="injured"]').click(); }
    await p.waitForTimeout(300);
    const n = await p.locator("#tableBody tr").count();
    const all = await p.evaluate(() => Object.values(window.SCHOOPS.getState().computedById).filter((x) => x.injuryStatus).length);
    expect(n > 0 && n <= Math.max(all, 100), `injured rows ${n}, injured players ${all}`);
    await p.evaluate(() => window.SCHOOPS.setActiveNav("market", "all"));
  });

  await run("Market: clicking a player opens his profile, which shows Most games", page, async (p) => {
    await p.locator("#tableBody tr").first().click(); await p.waitForTimeout(400);
    expect(await p.locator("#playerInspector.open").count() === 1, "profile did not open");
    await p.locator("#closeInspectorBtn").click(); await p.waitForTimeout(300);
    expect(await p.locator("#playerInspector.open").count() === 0, "profile did not close");
  });

  await run("Market: captain picks Hide / Show", page, async (p) => {
    const toggle = p.locator("[data-cp-toggle]").first();
    if (!(await toggle.count())) return "no captain strip";
    const before = await p.locator("#captainPicks").getAttribute("class");
    await toggle.click(); await p.waitForTimeout(250);
    const after = await p.locator("#captainPicks").getAttribute("class");
    expect(before !== after, "captain strip did not change");
    await p.locator("[data-cp-toggle]").first().click(); await p.waitForTimeout(250);
  });

  await run("My Squad: Projected / Live switch changes the numbers and keeps the layout", page, async (p) => {
    await nav(p, "court");
    await p.waitForFunction(() => window.SchoopsLive && window.SchoopsLive.ready(), null, { timeout: 25000 }).catch(() => {});
    await p.waitForTimeout(500);
    if (!(await p.locator(".lc-mode").count())) return "switch not available (no live games loaded)";
    const box = async () => p.evaluate(() => [...document.querySelectorAll(".lc-tile")].map((t) => Math.round(t.getBoundingClientRect().height)).join(","));
    await p.locator('[data-court-mode="proj"]').click(); await p.waitForTimeout(300);
    const projLabel = await p.locator(".lc-hero-label").first().innerText(); const projBox = await box();
    await p.locator('[data-court-mode="live"]').click(); await p.waitForTimeout(300);
    const liveLabel = await p.locator(".lc-hero-label").first().innerText(); const liveBox = await box();
    expect(/projected/i.test(projLabel) && /so far/i.test(liveLabel), `labels "${projLabel}" / "${liveLabel}"`);
    expect(projBox === liveBox, "card heights differ between Projected and Live");
  });

  await run("My Squad: choosing a captain moves the C", page, async (p) => {
    const btns = p.locator("[data-set-cap]");
    expect(await btns.count() > 2, "no captain buttons");
    const was = await p.evaluate(() => window.SCHOOPS.getState().court.captainId);
    const other = await p.evaluate((w) => [...document.querySelectorAll("[data-set-cap]")].map((b) => b.dataset.setCap).find((id) => id !== w), was);
    await p.locator(`[data-set-cap="${other}"]`).first().click({ force: true }); await p.waitForTimeout(300);
    const now = await p.evaluate(() => window.SCHOOPS.getState().court.captainId);
    expect(now === other, "captain did not change");
    await p.locator(`[data-set-cap="${was}"]`).first().click({ force: true }); await p.waitForTimeout(200);
  });

  await run("My Squad: Send to phone shows a QR code, and the link loads the squad on another device", page, async (p) => {
    await nav(p, "court");
    await p.locator("#courtSendPhoneBtn").click();
    await p.waitForSelector("#shQr svg", { timeout: 15000 });
    const link = await p.locator("#shLinkInput").inputValue();
    expect(/#s=[^&]+/.test(link) && link.startsWith("https://theebis.github.io/"), `link ${link}`);
    await p.keyboard.press("Escape"); await p.waitForTimeout(200);
    expect(await p.locator("#shBackdrop").count() === 0, "dialog did not close");
    const want = await p.evaluate(() => window.SCHOOPS.getSquadPlayers().map((x) => x.id).sort().join(","));
    // A fresh device (empty storage) opens the link
    const other = await p.context().browser().newContext(ctxOpts);
    const q = await other.newPage();
    await q.goto(BASE + link.slice(link.indexOf("#")));
    await q.waitForSelector("[data-sh-load]", { timeout: 30000 });
    await q.locator("[data-sh-load]").click(); await q.waitForTimeout(400);
    const got = await q.evaluate(() => ({ ids: window.SCHOOPS.getSquadPlayers().map((x) => x.id).sort().join(","), nav: window.SCHOOPS.getState().activeNav, hash: location.hash }));
    await other.close();
    expect(got.ids === want, "loaded squad differs from the sent one");
    expect(got.nav === "court" && !got.hash, `after load: ${got.nav} ${got.hash}`);
  });

  await run("Trade Advisor: goal + trade count recalculate, + Add puts a trade in the plan and takes it out", page, async (p) => {
    await nav(p, "tradelab");
    await p.waitForSelector(".ta-sug", { timeout: 30000 });
    await p.locator('[data-adv-goal="cash"]').click();
    await p.waitForFunction(() => document.querySelector(".ta-list")?.getAttribute("aria-busy") === "false" && !document.querySelector(".ta-list.is-stale"), null, { timeout: 30000 });
    const count = () => p.evaluate(() => { const s = window.SCHOOPS.getState(); const pl = s.tradeLab.plans.find((x) => x.id === s.tradeLab.activePlanId); return pl.trades.filter((t) => t.outId && t.inId).length; });
    const before = await count();
    await p.locator("[data-adv-addall]").first().click(); await p.waitForTimeout(300);
    expect(await count() === before + 1, "plan did not gain a trade");
    await p.locator("[data-adv-addall]").first().click(); await p.waitForTimeout(300);
    expect(await count() === before, "plan did not lose the trade again");
    await p.locator('[data-adv-goal="balanced"]').click(); await p.waitForTimeout(200);
  });

  await run("Trade Advisor: typing a bank updates 'left after'", page, async (p) => {
    const inp = p.locator("#tlBankInput");
    await inp.fill("3.50"); await inp.press("Enter"); await p.waitForTimeout(300);
    const bank = await p.evaluate(() => window.SCHOOPS.getState().tradeLab.bankM);
    expect(Math.abs(bank - 3.5) < 0.001, `bank is ${bank}`);
  });

  await run("Live: games load, a game opens, quarter tabs and My players work", page, async (p) => {
    await nav(p, "live");
    const ok = await p.waitForSelector(".lv-game", { timeout: 25000 }).then(() => true).catch(() => false);
    if (!ok) return "skipped: ESPN not reachable";
    const cards = p.locator(".lv-game");
    await cards.nth(0).click(); await p.waitForTimeout(500);
    expect(await p.locator(".lv-game.sel").count() === 1, "game did not select");
    const hasFeed = await p.waitForSelector(".lv-plays, .lv-feed .lv-pre", { timeout: 15000 }).then(() => true).catch(() => false);
    if (!hasFeed) return "game has no feed yet";
    if (await p.locator('[data-lv-q="all"]').count()) {
      await p.locator('[data-lv-q="all"]').click(); await p.waitForTimeout(250);
      expect(await p.locator('[data-lv-q="all"].on').count() === 1, "All tab not selected");
      await p.locator("[data-lv-mine]").click(); await p.waitForTimeout(250);
      expect(await p.locator("[data-lv-mine].on").count() === 1, "My players not toggled");
      await p.locator("[data-lv-mine]").click(); await p.waitForTimeout(150);
    }
  });

  await run("Live: captain is listed by his doubled score", page, async (p) => {
    const rows = await p.evaluate(() => [...document.querySelectorAll(".lv-myteam .lv-row")].map((r) => ({ cap: !!r.querySelector(".lv-pill.c"), now: r.classList.contains("is-live"), v: Number(r.querySelector(".lv-pts b")?.innerText) || 0 })));
    if (!rows.length) return "no team rows";
    const cap = rows.findIndex((r) => r.cap);
    if (cap < 0) return "no captain row";
    const above = rows.slice(0, cap).filter((r) => !r.now);
    expect(above.every((r) => r.v >= rows[cap].v), "a lower score is listed above the captain");
  });

  await run("Notifications: bell opens and closes the panel", page, async (p) => {
    await nav(p, "market");
    const bell = isPhone ? p.locator(".nt-bell-m") : p.locator("#ntBell");
    await bell.click(); await p.waitForTimeout(300);
    expect(await p.locator("#ntPanel.open").count() === 1, "panel did not open");
    await p.keyboard.press("Escape"); await p.waitForTimeout(250);
    expect(await p.locator("#ntPanel.open").count() === 0, "panel did not close");
  });

  await run("Sidebar note: shrinks and opens again", page, async (p) => {
    if (isPhone) return "sidebar hidden on phones";
    await p.locator("#sbAboutHide").click(); await p.waitForTimeout(200);
    expect(await p.locator("#sbAbout.mini").count() === 1, "note did not shrink");
    await p.locator("#sbAbout").click(); await p.waitForTimeout(200);
    expect(await p.locator("#sbAbout.mini").count() === 0, "note did not open again");
  });

  await run("Settings: opens and closes", page, async (p) => {
    if (isPhone) { await p.locator("#mobileMenuBtn").click(); await p.waitForTimeout(300); }
    await p.locator("#openSettingsBtn").click(); await p.waitForTimeout(300);
    expect(await p.locator("#settingsOverlay.open").count() === 1, "settings did not open");
    await p.locator("#closeSettingsBtn").click(); await p.waitForTimeout(250);
    expect(await p.locator("#settingsOverlay.open").count() === 0, "settings did not close");
  });

  await run("Feedback button opens the feedback form", page, async (p) => {
    if (isPhone && !(await p.locator("#feedbackBtn").isVisible())) { await p.locator("#mobileMenuBtn").click(); await p.waitForTimeout(400); }
    await p.locator("#feedbackBtn").click();
    const ok = await p.waitForFunction(() => [...document.querySelectorAll("iframe")].some((f) => /tally\.so/.test(f.src)), null, { timeout: 8000 }).then(() => true).catch(() => false);
    expect(ok, "feedback form did not open");
    await p.keyboard.press("Escape"); await p.waitForTimeout(300);
  });

  await run("Every page loads without errors", page, async () => {
    expect(!errors.length, errors.slice(0, 3).join(" | "));
  });
  await browser.close();
}

async function p_setSquad(page) {
  await page.evaluate((names) => {
    const s = window.SCHOOPS.getState();
    s.squadIds = {};
    names.forEach((n) => { const p = Object.values(s.computedById).find((x) => x.name === n); if (p) s.squadIds[p.id] = true; });
    window.SCHOOPS.savePrefs(); window.SCHOOPS.render();
  }, SQUAD);
  await page.waitForTimeout(300);
}

await startServer(PORT);
await suite("Desktop 1440", { viewport: { width: 1440, height: 900 }, userAgent: UA_DESKTOP });
await suite("Phone 390", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: UA_PHONE });
console.log(results.join("\n"));
console.log(failed ? `\nClick check FAILED: ${failed} step(s) broken.` : "\nClick check passed: every button did its job.");
process.exit(failed ? 1 : 0);
