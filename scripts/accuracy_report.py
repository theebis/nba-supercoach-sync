#!/usr/bin/env python3
"""
Accuracy report: how close were projections, our price model and our breakevens, round by round?
Reads history/round_N.json (completed rounds have actual_points / games_played / price_after) and
writes a Markdown report (default: ACCURACY.md, or the path given as the first argument).

The data sync publishes it to a PRIVATE GitHub repo when the ACCURACY_TOKEN secret is set,
so only the owner can see it until they choose to publish it on the site.
"""
import json
import os
import statistics as st
import sys
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HISTORY = os.path.join(ROOT, "history")

# Same model as pricing.js (keep in sync)
MAGIC = 712000
RATE = 0.0415


def project_price(price, prev_pts, prev_games, pts, games):
    if games <= 0:
        return price
    avg = (prev_pts + pts) / ((prev_games if prev_games is not None else (3 if prev_pts > 0 else 0)) + games)
    return max(0, round((price + RATE * games * (MAGIC * avg - price)) / 10000) * 10000)


def breakeven(price, prev_pts, prev_games, games):
    if games <= 0:
        return None
    g_prev = prev_games if prev_games is not None else (3 if prev_pts > 0 else 0)
    return round((price / MAGIC) * (g_prev + games) - prev_pts)


def pct(x):
    return f"{x * 100:.0f}%"


def money(v):
    return f"{'+' if v > 0 else ('-' if v < 0 else '')}${abs(v) / 1e6:.2f}M" if abs(v) >= 1e6 else f"{'+' if v > 0 else ('-' if v < 0 else '')}${abs(v) / 1e3:.0f}K"


def round_stats(snap):
    played = [p for p in snap["players"] if p.get("games_played", 0) > 0 and "price_after" in p]
    if len(played) < 50:
        return None
    proj = [p for p in played if p["proj"] > 0]
    miss = [abs(p["actual_points"] - p["proj"]) for p in proj]
    bias = [p["actual_points"] - p["proj"] for p in proj]
    # Fair baseline: only uses what was known before the round (last round's per-game average x scheduled games)
    naive = [abs(p["actual_points"] - (p["r_minus_1"] / max(p.get("r_minus_1_games") or 3, 1)) * p["games"]) for p in proj]
    prices_moved = sum(1 for p in played if p["price_after"] != p["price"]) >= 0.1 * len(played)

    price_err, dir_ok, dir_n, be_ok, be_n = [], 0, 0, 0, 0
    for p in played:
        pred = project_price(p["price"], p["r_minus_1"], p.get("r_minus_1_games"), p["actual_points"], p["games_played"])
        price_err.append(abs(pred - p["price_after"]))
        actual = p["price_after"] - p["price"]
        if abs(actual) >= 50000:
            dir_n += 1
            dir_ok += (pred - p["price"] > 0) == (actual > 0)
        be = breakeven(p["price"], p["r_minus_1"], p.get("r_minus_1_games"), p["games_played"])
        if be is not None and abs(p["actual_points"] - be) >= 10 and abs(actual) >= 50000:
            be_n += 1
            be_ok += (p["actual_points"] > be) == (actual > 0)

    worst = sorted(proj, key=lambda p: -abs(p["actual_points"] - p["proj"]))[:5]
    return {
        "n": len(proj),
        "proj_median": st.median(miss) if miss else None,
        "proj_within10": sum(m <= 10 for m in miss) / len(miss) if miss else None,
        "proj_bias": st.mean(bias) if bias else None,
        "naive_median": st.median(naive) if naive else None,
        # Round 1 had no price changes at all, so there's nothing to test the price model against
        "price_median": st.median(price_err) if prices_moved else None,
        "price_within50k": sum(e <= 50000 for e in price_err) / len(price_err) if prices_moved else None,
        "price_dir": dir_ok / dir_n if dir_n and prices_moved else None,
        "be_right": be_ok / be_n if be_n and prices_moved else None,
        "worst": [(p["name"], p["proj"], p["actual_points"], p["games_played"]) for p in worst],
    }


def main(out_path):
    rounds = sorted(int(f[6:-5]) for f in os.listdir(HISTORY) if f.startswith("round_") and f.endswith(".json"))
    # The live round is still being played, so only score finished rounds
    with open(os.path.join(ROOT, "supercoach_data.json"), encoding="utf-8") as f:
        live_round = int(json.load(f).get("round") or 0)
    rows = []
    for r in [x for x in rounds if x < live_round]:
        with open(os.path.join(HISTORY, f"round_{r}.json"), encoding="utf-8") as f:
            s = round_stats(json.load(f))
        if s:
            rows.append((r, s))

    lines = [
        "# SCHOOPS accuracy report",
        "",
        f"_Updated {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')} · private: only you can see this._",
        "",
        "How close our numbers were to what actually happened, for every finished round.",
        "",
        "- **Projection miss**: typical gap between SuperCoach's projection and the actual round score (smaller is better).",
        "  \"Simple guess\" is last round's points-per-game × games played, for comparison.",
        "- **Price model**: our formula's predicted new price vs the real one, using the real scores.",
        "  Rounds 3–5 were used to fit the formula, so later rounds are the honest test.",
        "- **Breakeven right**: when a player beat (or missed) his breakeven by 10+ points, how often his price moved the way it said.",
        "",
        "| Round | Players | Projection miss (median) | Within 10 pts | Projection bias | Simple guess miss | Price model miss | Price within $50K | Price direction right | Breakeven right |",
        "|---|---|---|---|---|---|---|---|---|---|",
    ]
    for r, s in rows:
        fit = " (fitting round)" if 3 <= r <= 5 else (" (opening round, no form yet)" if r == 1 else "")
        lines.append(
            f"| R{r}{fit} | {s['n']} | {s['proj_median']:.0f} pts | {pct(s['proj_within10'])} | {s['proj_bias']:+.1f} | "
            f"{s['naive_median']:.0f} pts | {money(s['price_median']).lstrip('+') if s['price_median'] is not None else 'no price changes'} | "
            f"{pct(s['price_within50k']) if s['price_within50k'] is not None else '—'} | "
            f"{pct(s['price_dir']) if s['price_dir'] is not None else '—'} | {pct(s['be_right']) if s['be_right'] is not None else '—'} |"
        )
    if rows:
        r, s = rows[-1]
        lines += ["", f"## Biggest projection misses, Round {r}", "", "| Player | Projected | Actual | Games |", "|---|---|---|---|"]
        lines += [f"| {n} | {pj} | {a} | {g} |" for n, pj, a, g in s["worst"]]
    lines += ["", "_Projection v2 (our own projections, with ranges) will be added as a second set of columns once it exists._", ""]

    with open(out_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"Wrote {out_path} ({len(rows)} rounds)")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "ACCURACY.md"))
