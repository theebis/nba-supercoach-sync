// Price model tests: unit behaviour + a backtest against real SuperCoach price changes.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import "../pricing.js";

const { projectPrice, calcBreakeven, DEFAULT_MAGIC_NUMBER } = globalThis.SchoopsPricing;
const ROOT = resolve(import.meta.dirname, "..");

const jokic = { price: 27880000, r_minus_1: 163, prevGames: 4, games: 3 };

test("no games played means no price change", () => {
  assert.equal(projectPrice(jokic, 0, 0), jokic.price);
  assert.equal(projectPrice(jokic, 999, 0), jokic.price);
  assert.equal(calcBreakeven(jokic, DEFAULT_MAGIC_NUMBER, 0), null);
});

test("scoring the breakeven holds the price (within rounding)", () => {
  const be = calcBreakeven(jokic);
  assert.ok(Math.abs(projectPrice(jokic, be, jokic.games) - jokic.price) <= 10000);
});

test("more points never lowers the projected price", () => {
  let prev = -Infinity;
  for (let s = 0; s <= 300; s += 5) {
    const p = projectPrice(jokic, s, 3);
    assert.ok(p >= prev, `price fell at score ${s}`);
    prev = p;
  }
});

test("prices are whole $10k steps and never negative", () => {
  for (const s of [0, 17, 63, 141, 250]) {
    const p = projectPrice({ price: 3810000, r_minus_1: 0, prevGames: 0 }, s, 4);
    assert.equal(p % 10000, 0);
    assert.ok(p >= 0);
  }
});

test("Jokic Round 6: BE 111 over 3 games (worked example from the fit)", () => {
  assert.equal(calcBreakeven(jokic), 111);
});

test("backtest on real price changes, Rounds 3-5", async () => {
  const H = JSON.parse(await readFile(resolve(ROOT, "debug/price_history.json"), "utf8"));
  const F = H.fields;
  const by = {};
  for (const [r, o] of Object.entries(H.rounds)) {
    for (const row of o.rows) {
      const s = Object.fromEntries(F.map((f, i) => [f, row[i]]));
      if (Number(r) !== Number(o.stat_rounds_returned?.[0] ?? r)) continue; // skip padded future rounds
      (by[s.id] ||= {})[r] = s;
    }
  }
  const errs = [];
  let dirOk = 0, dirN = 0;
  for (const p of Object.values(by)) {
    for (let r = 3; r <= 5; r++) {
      const s = p[r], prev = p[r - 1];
      if (!s || !prev || !s.games) continue;
      const before = { price: s.price - s.price_change, r_minus_1: prev.points, prevGames: prev.games };
      const predicted = projectPrice(before, s.points, s.games);
      errs.push(Math.abs(predicted - s.price));
      if (Math.abs(s.price_change) >= 50000) {
        dirN++;
        if (Math.sign(predicted - before.price) === Math.sign(s.price_change)) dirOk++;
      }
    }
  }
  errs.sort((a, b) => a - b);
  const median = errs[errs.length >> 1];
  const direction = dirOk / dirN;
  console.log(`backtest: n=${errs.length} median error $${median} direction ${(direction * 100).toFixed(1)}%`);
  assert.ok(errs.length > 1000, "expected 1000+ price changes to test against");
  assert.ok(median <= 80000, `median error $${median} is above $80k`);
  assert.ok(direction >= 0.9, `direction ${direction} below 90%`);
});
