// End-to-end check of screenshot import: draws fake team screenshots (light + dark, names written
// SuperCoach-style with initials, prices and scores), uploads them through the real import window,
// lets Tesseract read them in the browser, and reports how many of the 15 players were found.
//   npm run check:import
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { startServer } from "./serve.mjs";

const OUT = resolve(import.meta.dirname, "..", ".checks");
const PORT = 8796;
const SQUAD = [
  ["Nikola Jokic", "DEN", "C", "27.88"], ["Victor Wembanyama", "SAS", "PF/C", "27.19"], ["Tyrese Maxey", "PHI", "PG/SG", "18.96"],
  ["Devin Booker", "PHX", "SG/PG", "15.79"], ["Jaden McDaniels", "MIN", "PF/SF", "14.11"], ["Jalen Smith", "CHI", "PF/C", "12.51"],
  ["Darius Acuff Jr.", "SAC", "PG", "9.71"], ["Aday Mara", "OKC", "C", "8.75"], ["AJ Dybantsa", "WAS", "SF/PF", "7.83"],
  ["Jaylen Brown", "PHI", "SF/SG", "17.37"], ["Mike Conley", "BOS", "PG", "5.12"], ["Dyson Daniels", "ATL", "SG/PG", "15.31"],
  ["Karl-Anthony Towns", "NYK", "PF/C", "20.38"], ["Brayden Burries", "MIL", "SG/PG", "7.40"], ["Svi Mykhailiuk", "UTA", "SG/SF", "5.52"]
];
const short = (n) => { const [f, ...r] = n.split(" "); return `${f[0]}. ${r.join(" ")}`; };

function teamHtml(dark) {
  const bg = dark ? "#121417" : "#f4f5f7", fg = dark ? "#f2f2f2" : "#16181c", sub = dark ? "#8b9099" : "#6b7280", card = dark ? "#1c1f24" : "#ffffff";
  const rows = SQUAD.map(([n, t, p, $], i) => `
    <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:${card};border-radius:10px;margin-bottom:8px">
      <div style="width:34px;height:34px;border-radius:50%;background:${dark ? "#2a2e35" : "#dfe3ea"}"></div>
      <div style="flex:1"><div style="font-weight:700;font-size:15px">${i % 3 === 0 ? n : short(n)}</div>
      <div style="font-size:12px;color:${sub}">${t} · ${p}</div></div>
      <div style="text-align:right;font-size:13px">$${$}M<div style="color:${sub};font-size:12px">${40 + ((i * 17) % 70)} pts</div></div>
    </div>`).join("");
  return `<html><body style="margin:0;background:${bg};color:${fg};font-family:Arial,Helvetica,sans-serif;width:430px;padding:16px">
    <div style="font-weight:800;font-size:20px;margin-bottom:4px">MY TEAM</div>
    <div style="color:${sub};font-size:13px;margin-bottom:12px">Round 6 · Bank $0.40M · Trades 2</div>${rows}</body></html>`;
}

await mkdir(OUT, { recursive: true });
const server = await startServer(PORT);
const browser = await chromium.launch({ channel: "msedge" }).catch(() => chromium.launch());
let failed = false;
try {
  for (const dark of [false, true]) {
    const label = dark ? "dark" : "light";
    const shot = resolve(OUT, `fake-team-${label}.png`);
    const drawer = await browser.newPage({ viewport: { width: 462, height: 900 }, deviceScaleFactor: 2 });
    await drawer.setContent(teamHtml(dark));
    await drawer.screenshot({ path: shot, fullPage: true });
    await drawer.close();

    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle" });
    await page.waitForSelector("#tableBody tr");
    await page.evaluate(() => window.SchoopsImporter.open());
    await page.setInputFiles("#imFile", shot);
    await page.waitForSelector(".im-section", { timeout: 120000 });
    const found = await page.$$eval(".im-row .im-name", (els) => els.map((e) => e.textContent.trim()));
    await page.screenshot({ path: resolve(OUT, `import-review-${label}.png`) });
    const want = SQUAD.map((s) => s[0].replace(" Jr.", ""));
    const hits = want.filter((n) => found.some((f) => f.replace(" Jr.", "") === n));
    const extra = found.filter((f) => !want.includes(f.replace(" Jr.", "")));
    console.log(`${label}: found ${hits.length}/15${extra.length ? `, wrong extras: ${extra.join(", ")}` : ""}${hits.length < 15 ? `, missed: ${want.filter((n) => !hits.includes(n)).join(", ")}` : ""}`);
    if (hits.length < 13 || extra.length > 1) failed = true;
    await page.close();
  }
} finally {
  await browser.close();
  server.close();
}
if (failed) { console.error("Import check FAILED (needs 13+/15 found and at most 1 wrong extra)"); process.exit(1); }
console.log("Import check passed.");
