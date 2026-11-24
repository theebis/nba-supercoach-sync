// UI check: serves the site locally, opens each main view at desktop and phone width,
// saves screenshots to .checks/ and fails on console errors or broken requests.
//   npm run check:ui            -> all views
//   npm run check:ui -- court   -> only views whose name contains "court"
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { startServer } from "./serve.mjs";

const OUT = resolve(import.meta.dirname, "..", ".checks");
const PORT = 8799;
const BASE = `http://localhost:${PORT}/`;
const filter = process.argv[2] || "";

// Third-party noise that can't work from localhost (Cloudflare analytics beacon on GitHub Pages)
const IGNORE = [/cloudflareinsights\.com/, /cdn-cgi\/rum/];
const ignored = (text) => IGNORE.some((re) => re.test(text));

const VIEWPORTS = {
  xwide: { width: 2560, height: 1300 },
  wide: { width: 2000, height: 1050 },
  desktop: { width: 1440, height: 900 },
  phone: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};

// Each view: how to get there from a fresh load (runs in the page)
const VIEWS = {
  market: async (page) => {},
  // Captain picks opened (phones start with them shrunk to one line)
  "market-captains": async (page) => {
    const line = page.locator(".cp-line");
    if (await line.count()) await line.click();
    await page.waitForTimeout(300);
  },
  inspector: async (page) => {
    await page.locator("#tableBody tr").first().click();
    await page.waitForTimeout(400);
  },
  court: async (page) => openNav(page, "court"),
  // Court with a deliberately worse captain, so the green "Optimise lineup" button shows
  "court-optimise": async (page) => {
    await openNav(page, "court");
    await page.evaluate(() => {
      const s = window.SCHOOPS.getState();
      const starters = Object.entries(s.court.slots).filter(([k]) => !k.startsWith("B_")).map(([, id]) => s.computedById[id]).filter(Boolean);
      starters.sort((a, b) => a.proj - b.proj);
      s.court.captainId = starters[0]?.id;
      window.SCHOOPS.render();
    });
    await page.waitForTimeout(300);
  },
  tradelab: async (page) => openNav(page, "tradelab"),
  // Live round tracker: waits for ESPN scores to load
  live: async (page) => {
    await openNav(page, "live");
    await page.waitForSelector(".lv-grid", { timeout: 30000 }).catch(() => {});
    // Then the opened game's play-by-play
    await page.waitForSelector(".lv-plays, .lv-feed .lv-pre:not(:empty)", { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500);
  },
  // Trade Lab after clicking "Choose who leaves" and picking the first player: the IN suggestions open
  "tradelab-picker": async (page) => {
    await openNav(page, "tradelab");
    await page.locator('[data-open-picker="out"]').first().click();
    await page.waitForTimeout(200);
    await page.locator("[data-pick-out]:not([disabled])").first().click();
    await page.waitForTimeout(300);
  },
  // Trade Lab with one complete trade and a second plan, so the summary and comparison show
  "tradelab-plan": async (page) => {
    await openNav(page, "tradelab");
    await page.locator('[data-open-picker="out"]').first().click();
    await page.locator("[data-pick-out]:not([disabled])").first().click();
    await page.waitForTimeout(200);
    await page.locator("[data-pick-in]").nth(1).click();
    await page.waitForTimeout(200);
    await page.locator("#tlClonePlanBtn").click();
    await page.waitForTimeout(300);
  },
  import: async (page) => {
    await page.evaluate(() => window.SchoopsImporter.open());
    await page.waitForTimeout(300);
  },
  // Type-ahead: "wemb" + Enter, "jok" + Enter, then leave "max" typed so the suggestions show
  "import-search": async (page) => {
    await page.evaluate(() => window.SchoopsImporter.open());
    const q = page.locator("#imQuery");
    for (const term of ["wemb", "jok"]) {
      await q.click();
      await q.pressSequentially(term, { delay: 20 });
      await page.keyboard.press("Enter");
    }
    await q.click();
    await q.pressSequentially("max", { delay: 20 });
    await page.waitForTimeout(200);
  },
  settings: async (page) => {
    await page.evaluate(() => openSettingsModal());
    await page.waitForTimeout(300);
  },
};

async function openNav(page, key) {
  // phone: the sidebar is a drawer, so open it the way a person would, then tap the item
  const toggle = page.locator("#mobileMenuBtn");
  if (await toggle.isVisible()) {
    await toggle.click();
    await page.waitForTimeout(450);
  }
  await page.locator(`[data-nav="${key}"]`).click();
  await page.waitForTimeout(500);
}

const server = await startServer(PORT);
await mkdir(OUT, { recursive: true });
// Use the system Edge (Chromium) so no browser download is needed; fall back to Playwright's Chromium
const browser = await chromium.launch({ channel: "msedge" }).catch(() => chromium.launch());
const problems = [];

try {
  for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
    for (const [viewName, go] of Object.entries(VIEWS)) {
      if (filter && !viewName.includes(filter)) continue;
      // ESPN (live scores) refuses the "HeadlessChrome" browser name, so present as a normal Edge
      const userAgent = vp.isMobile
        ? "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36"
        : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0";
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, ...vp, userAgent });
      // Seed a small demo squad so My Court / Trade Lab render with content
      await context.addInitScript(() => {
        if (!localStorage.getItem("schoops_terminal_v3") && window.__seedDemo !== false) {
          localStorage.setItem("schoops_check_seed", "1");
        }
      });
      const page = await context.newPage();
      const tag = `${viewName}@${vpName}`;
      page.on("console", (m) => {
        const where = m.location()?.url || "";
        if (m.type() === "error" && !ignored(m.text()) && !ignored(where)) problems.push(`${tag} console: ${m.text()} ${where}`);
      });
      page.on("pageerror", (e) => problems.push(`${tag} page error: ${e.message}`));
      page.on("requestfailed", (r) => { if (!ignored(r.url())) problems.push(`${tag} request failed: ${r.url()} (${r.failure()?.errorText})`); });
      page.on("response", (r) => { if (r.status() >= 400 && !ignored(r.url())) problems.push(`${tag} HTTP ${r.status()}: ${r.url()}`); });

      await page.goto(BASE, { waitUntil: "networkidle" });
      await page.waitForSelector("#tableBody tr", { timeout: 15000 });
      await seedSquad(page);
      try {
        await go(page);
      } catch (err) {
        problems.push(`${tag} could not open view: ${err.message.split("\n")[0]}`);
      }
      // horizontal overflow check (page itself must not scroll sideways)
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (overflow > 1) problems.push(`${tag} page scrolls sideways by ${overflow}px`);
      const file = resolve(OUT, `${tag}.png`);
      await page.screenshot({ path: file });
      console.log(`saved ${file}`);
      await context.close();
    }
  }
} finally {
  await browser.close();
  server.close();
}

// Put 10 sensible players in the squad (cheapest-first mix) the first time, so court/trade views have content
async function seedSquad(page) {
  await page.evaluate(() => {
    if (!localStorage.getItem("schoops_check_seed") || typeof state === "undefined") return;
    localStorage.removeItem("schoops_check_seed");
    const rows = Object.values(state.computedById || {}).filter((p) => !p.isInactive && p.games > 0);
    rows.sort((a, b) => b.proj - a.proj);
    const pick = [...rows.slice(0, 4), ...rows.slice(40, 48)];
    state.squadIds = {};
    pick.forEach((p) => { state.squadIds[p.id] = true; });
    if (typeof savePrefs === "function") savePrefs();
    if (typeof render === "function") render();
  });
  await page.waitForTimeout(300);
}

if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log("\nUI check passed: no console errors, failed requests or sideways scrolling.");
