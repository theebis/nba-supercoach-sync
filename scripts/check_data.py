#!/usr/bin/env python3
"""
Sanity checks for the scraped data (supercoach_data.json + history/round_N.json).
Data bugs are silent, so this fails loudly. Run: npm run check:data  (or python scripts/check_data.py)

Checks:
- every file parses, has the right round number and 500+ players with the required fields
- prices are positive whole $10k amounts in a plausible range
- round chaining: a player's price during round N equals his price after round N-1,
  and round N's "last round" score/games equal what he actually did in round N-1
- the live file matches the newest snapshot
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REQUIRED = ("id", "name", "team", "pos", "price", "r_minus_1", "r_minus_2", "proj", "games")
CHAINED = ("price_after", "actual_points", "games_played", "r_minus_1_games")

errors, warnings = [], []


def load(path):
    with open(os.path.join(ROOT, path), encoding="utf-8") as f:
        return json.load(f)


def check_file(path, data, expect_round=None):
    rnd = data.get("round")
    if expect_round is not None and rnd != expect_round:
        errors.append(f"{path}: round field is {rnd}, expected {expect_round}")
    players = data.get("players") or []
    if len(players) < 500:
        errors.append(f"{path}: only {len(players)} players")
    ids = set()
    for p in players:
        missing = [k for k in REQUIRED if k not in p]
        if missing:
            errors.append(f"{path}: {p.get('name')} missing {missing}")
            continue
        if p["id"] in ids:
            errors.append(f"{path}: duplicate id {p['id']} ({p['name']})")
        ids.add(p["id"])
        price = p["price"]
        if not isinstance(price, int) or price % 10000 or not (1_000_000 <= price <= 40_000_000):
            errors.append(f"{path}: {p['name']} has odd price {price}")
        # Scores can be slightly negative (missed shots and turnovers subtract points)
        for k in ("r_minus_1", "r_minus_2", "proj"):
            if not isinstance(p[k], int) or not (-50 <= p[k] <= 500):
                errors.append(f"{path}: {p['name']} {k}={p[k]!r}")
        if not isinstance(p["games"], int) or not (0 <= p["games"] <= 5):
            errors.append(f"{path}: {p['name']} games={p['games']!r}")
    return {p["id"]: p for p in players}


def main():
    hist_dir = os.path.join(ROOT, "history")
    rounds = sorted(
        int(f[6:-5]) for f in os.listdir(hist_dir) if f.startswith("round_") and f.endswith(".json")
    )
    snaps = {}
    for r in rounds:
        path = f"history/round_{r}.json"
        snaps[r] = (load(path), check_file(path, load(path), r))

    live = load("supercoach_data.json")
    check_file("supercoach_data.json", live)
    newest = rounds[-1]
    if live.get("round") != newest:
        errors.append(f"live round {live.get('round')} != newest snapshot {newest}")
    if live.get("availableRounds") != rounds:
        errors.append(f"availableRounds {live.get('availableRounds')} != snapshot files {rounds}")

    # Round chaining (only for snapshots built with the newer fields)
    for r in rounds[1:]:
        prev_data, prev = snaps[r - 1] if (r - 1) in snaps else (None, None)
        cur_data, cur = snaps[r]
        if not prev:
            continue
        if not all(k in next(iter(prev.values())) for k in CHAINED):
            warnings.append(f"round_{r - 1}.json predates the chained fields; skipping chain check")
            continue
        bad_price = bad_score = bad_games = 0
        examples = []
        for pid, p in cur.items():
            q = prev.get(pid)
            if not q:
                continue
            if p["price"] != q["price_after"]:
                bad_price += 1
                if len(examples) < 3:
                    examples.append(f"{p['name']}: R{r} price {p['price']} vs R{r - 1} after {q['price_after']}")
            if p["r_minus_1"] != q["actual_points"]:
                bad_score += 1
            if p.get("r_minus_1_games") is not None and p["r_minus_1_games"] != q["games_played"]:
                bad_games += 1
        for label, n in (("price", bad_price), ("last-round score", bad_score), ("last-round games", bad_games)):
            if n:
                errors.append(f"R{r - 1}->R{r}: {n} players' {label} does not chain. {'; '.join(examples)}")

    for w in warnings:
        print(f"WARN  {w}")
    if errors:
        print(f"\n{len(errors)} data problem(s):")
        for e in errors[:40]:
            print(f"  - {e}")
        sys.exit(1)
    print(f"Data check passed: live Round {newest}, snapshots {rounds}, {len(live['players'])} players.")


if __name__ == "__main__":
    main()
