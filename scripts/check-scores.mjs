// Score check: every player's "so far" (Live page, My Squad, profile) vs the sum of his ESPN box-score games
// this round. Fails if any differ by more than 3 (our formula matches SuperCoach within 3 on every tested game).
//   npm run check:scores            -> local site and local data
//   npm run check:scores -- <url>   -> any copy, e.g. the live site
import { chromium } from "playwright";
import { startServer } from "./serve.mjs";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0";
const SQUAD = ["Brayden Burries", "Devin Booker", "Cedric Coward", "Darryn Peterson", "Nikola Jokic", "Franz Wagner", "Yaxel Lendeborg",
  "Victor Wembanyama", "Karl-Anthony Towns", "Taylor Hendricks", "Darius Acuff Jr.", "Tyrese Proctor", "Mo Bamba", "Sidy Cissoko", "Cameron Boozer"];
const url = process.argv[2] || null;
const server = url ? null : await startServer(8795);
const browser = await chromium.launch({ channel: "msedge" });
const page = await (await browser.newContext({ userAgent: UA })).newPage();
await page.goto(url || "http://localhost:8795/");
await page.waitForFunction(() => window.SCHOOPS && Object.keys(window.SCHOOPS.getState().computedById || {}).length > 100, null, { timeout: 30000 });
await page.evaluate(() => window.SCHOOPS.setActiveNav("live"));
await page.waitForFunction(() => window.SchoopsLive && window.SchoopsLive.ready(), null, { timeout: 60000 });
await page.waitForTimeout(1500);
const res = await page.evaluate((squad) => {
  const S = window.SCHOOPS.getState();
  const L = window.SchoopsLive;
  const out = { saved: S.lastUpdated, squad: [], mismatches: [], officialUsed: 0, checked: 0 };
  Object.values(S.computedById).forEach((p) => {
    const lv = L.player(p.id);
    if (!lv) return;
    const games = (L.games && L.games(p.id)) || [];
    const espn = games.filter((g) => g.played).reduce((s, g) => s + g.sc, 0);
    const row = { name: p.name, soFar: lv.sc, espnGames: espn, official: lv.official, scFeed: `${p.scRoundPoints} in ${p.scRoundGames}g`, perGame: games.map((g) => `${g.state}:${g.played ? g.sc : g.dnp ? "dnp" : "-"}`).join(" ") };
    if (lv.played || lv.sc) out.checked++;
    if (lv.official) out.officialUsed++;
    if (squad.includes(p.name)) out.squad.push(row);
    if (Math.abs(lv.sc - espn) > 3) out.mismatches.push(row);
  });
  return out;
}, SQUAD);
console.log("data saved:", res.saved, "| players with scores:", res.checked, "| using SuperCoach official:", res.officialUsed);
console.log("\nYour squad:");
res.squad.forEach((r) => console.log(`  ${r.name.padEnd(20)} so far ${String(r.soFar).padStart(4)}  ESPN games ${String(r.espnGames).padStart(4)}  ${r.official ? "official" : "live    "}  SC feed ${r.scFeed.padEnd(10)} ${r.perGame}`));
console.log(`\nPlayers where so far differs from ESPN by more than 3: ${res.mismatches.length}`);
res.mismatches.slice(0, 20).forEach((r) => console.log(`  ${r.name.padEnd(22)} so far ${r.soFar}  ESPN ${r.espnGames}  ${r.official ? "official" : "live"}  SC feed ${r.scFeed}  ${r.perGame}`));
await browser.close(); if (server) server.close();
if (res.mismatches.length) { console.log("\nScore check FAILED"); process.exit(1); }
console.log("\nScore check passed: every so-far score matches the ESPN box scores (within 3).");
