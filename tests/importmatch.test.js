// Squad import name matching. Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import "../importmatch.js";

const { matchText } = globalThis.SchoopsImportMatch;
const data = JSON.parse(await readFile(resolve(import.meta.dirname, "..", "supercoach_data.json"), "utf8"));
const players = data.players;
const names = (r) => r.matches.map((m) => m.player.name);

test("full names, one per line, incl. accents and suffixes", () => {
  const r = matchText("Nikola Jokić\nVictor Wembanyama\nJaren Jackson Jr.\nShai Gilgeous-Alexander", players);
  for (const n of ["Nikola Jokic", "Victor Wembanyama", "Shai Gilgeous-Alexander"]) assert.ok(names(r).includes(n), `missing ${n}`);
  assert.ok(r.matches.every((m) => m.confidence === "high"), JSON.stringify(r.matches.map((m) => [m.player.name, m.confidence])));
});

test("initials and SuperCoach-style lines with prices and scores", () => {
  const r = matchText("N. Jokic DEN C $27.88M 105\nV. Wembanyama SAS PF/C $27.19M\nT. Maxey PHI PG 81", players);
  assert.deepEqual(new Set(names(r)), new Set(["Nikola Jokic", "Victor Wembanyama", "Tyrese Maxey"]));
});

test("small OCR misreads still match", () => {
  const r = matchText("Nikola Jokie\nVictor Wembanyarna\nTyrese Maxcy", players);
  assert.deepEqual(new Set(names(r)), new Set(["Nikola Jokic", "Victor Wembanyama", "Tyrese Maxey"]));
});

test("two names on one line, and comma-separated paste", () => {
  const r = matchText("Nikola Jokic   Devin Booker\nTyrese Maxey, Jaylen Brown", players);
  assert.deepEqual(new Set(names(r)), new Set(["Nikola Jokic", "Devin Booker", "Tyrese Maxey", "Jaylen Brown"]));
});

test("shared surname alone is flagged to check, with alternatives", () => {
  const r = matchText("Thompson", players);
  assert.equal(r.matches.length, 1);
  assert.equal(r.matches[0].confidence, "check");
  assert.ok(r.matches[0].alternatives.length >= 1);
});

test("price or team on the same line picks between players who share a name", () => {
  const jalen = players.find((p) => p.name === "Jalen Smith");
  const r = matchText(`J. Smith $${(jalen.price / 1e6).toFixed(2)}M`, players);
  assert.equal(r.matches[0].player.name, "Jalen Smith");
  const r2 = matchText(`J. Smith ${jalen.team}`, players);
  assert.equal(r2.matches[0].player.name, "Jalen Smith");
});

test("noise lines are not matched as players", () => {
  const r = matchText("SUPERCOACH\nMY TEAM\nTrades 2\nBank $0.40M\nRound 6", players);
  assert.equal(r.matches.length, 0, JSON.stringify(names(r)));
});
