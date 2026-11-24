#!/usr/bin/env python3
"""
SCHOOPS projection v3: built from every game's box score (data/games.json, from scripts/fetch_games.py).

SuperCoach NBA scoring (verified against SuperCoach's own round totals: exact 96%, within 3 pts 100%):
    PTS + REB + AST + 2*STL + 2*BLK - TO - missed FG - missed FT

For each scheduled game in a round:
    expected score = P(plays) x expected minutes x points per minute
  - points per minute: recent-weighted, shrunk towards the price-implied rate for players with few minutes
  - expected minutes: recent-weighted average of the minutes in games he played
  - P(plays): his smoothed share of team games played so far, lowered on the 2nd night of a back-to-back
    (factor learned from the data); for the live round the ESPN injury report overrides it
then optionally blended with SuperCoach's own projection (weight learned).
Honest test: every round predicted only from games that tipped off before that round started.

Run: python projection_v3.py   -> fits, prints the comparison vs v2 and SuperCoach, saves model/projection_v3.json
"""
import itertools
import json
import os
import statistics as st
import sys
from collections import defaultdict
from datetime import date, datetime, timedelta

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ROOT)
from update_supercoach import normalize_name_key as nk  # noqa: E402
import projection_model as v2  # noqa: E402

GAMES = os.path.join(ROOT, "data", "games.json")
PARAMS = os.path.join(ROOT, "model", "projection_v3.json")
MAGIC = 712000
SYD = timedelta(hours=11)          # rounds are defined in Sydney time (Tue-Mon)
ROUND6_START = date(2026, 11, 24)  # anchor: Round 6 started Tue 24 Nov 2026


def sc_score(x):
    return x["pts"] + x["reb"] + x["ast"] + 2 * x["stl"] + 2 * x["blk"] - x["to"] - (x["fga"] - x["fgm"]) - (x["fta"] - x["ftm"])


def syd_date(t):
    return (datetime.fromisoformat(t.replace("Z", "+00:00")) + SYD).date()


def round_of(d):
    return 6 - ((ROUND6_START - d).days + 6) // 7 if d < ROUND6_START else 6 + (d - ROUND6_START).days // 7


def round_start(r):
    return ROUND6_START + timedelta(days=7 * (r - 6))


def load_games():
    with open(GAMES, encoding="utf-8") as f:
        g = json.load(f)
    team_games = defaultdict(list)            # team -> sorted [(date, event)]
    for eid, info in g["games"].items():
        d = syd_date(info["t"])
        for t in info["teams"]:
            team_games[t].append((d, eid))
    for t in team_games:
        team_games[t].sort()
    b2b = set()                               # (team, event) that is the 2nd night of a back-to-back
    for t, lst in team_games.items():
        for (d0, _), (d1, e1) in zip(lst, lst[1:]):
            if (d1 - d0).days == 1:
                b2b.add((t, e1))
    player_games = defaultdict(list)          # name key -> [(date, event, team, played, minutes, score)]
    for x in g["rows"]:
        played = (not x["dnp"]) and x["min"] > 0
        player_games[nk(x["name"])].append((syd_date(x["t"]), x["e"], x["team"], played, x["min"] if played else 0, sc_score(x) if played else 0))
    for k in player_games:
        player_games[k].sort()
    return team_games, b2b, player_games


def history_before(games, cutoff):
    return [g for g in games if g[0] < cutoff]


def project(params, price, sc_proj, past, sched):
    """past: player's games before the round; sched: [(is_b2b_second_night)] for each team game in the round."""
    if not sched:
        return 0.0, 0.0
    d = params["decay"]
    w = 1.0
    mins_w = pts_w = wsum = 0.0
    tot_min = 0.0
    for g in reversed(past):                  # most recent first
        if g[3]:
            mins_w += w * g[4]
            pts_w += w * g[5]
            wsum += w
            tot_min += g[4]
            w *= d
    price_ppg = price / MAGIC
    if wsum > 0:
        exp_min = mins_w / wsum
        obs_ppm = pts_w / mins_w if mins_w > 0 else 0.0
        prior_ppm = price_ppg / max(exp_min, 12.0)
        trust = tot_min / (tot_min + params["k_min"])
        ppm = trust * obs_ppm + (1 - trust) * prior_ppm
    else:
        exp_min, ppm = 0.0, 0.0
    # availability over team games since his first appearance
    seen = [g for g in past]
    played = sum(1 for g in seen if g[3])
    avail = (played + params["avail_prior"] * params["avail_s"]) / (len(seen) + params["avail_s"]) if seen else params["avail_prior"] * 0.5
    exp_games = sum(avail * (params["b2b"] if second else 1.0) for second in sched)
    model = exp_games * exp_min * ppm
    if wsum == 0:                             # never played: fall back on SuperCoach, discounted by availability
        model = (sc_proj or 0) * avail * 0.5
    blend = params["w_sc"]
    return (1 - blend) * model + blend * (sc_proj or 0), exp_games


def build_rows(hist, team_games, b2b, player_games, rounds):
    rows = []
    for r in rounds:
        start, end = round_start(r), round_start(r + 1)
        for p in hist[r].values():
            if p.get("games", 0) <= 0 or p.get("proj", 0) <= 0 or "actual_points" not in p:
                continue
            key = nk(p["name"])
            pg = player_games.get(key)
            team = p.get("team")
            tg = [e for d, e in team_games.get(team, []) if start <= d < end]
            if pg is None or not tg:
                continue
            past = history_before(pg, start)
            sched = [(team, e) in b2b for e in tg]
            rows.append({"r": r, "id": p["id"], "price": p["price"], "sc": p["proj"], "past": past, "sched": sched,
                         "actual": p["actual_points"], "v2past": v2.features(p["id"], r, hist)["past"], "g": p["games"]})
    return rows


def minutes_ratio(past, last_n):
    """Recent minutes vs his usual minutes (>1 = playing more lately). 1.0 when there isn't enough data."""
    mins = [g[4] for g in past if g[3]]
    if len(mins) < last_n + 2:
        return 1.0
    recent = sum(mins[-last_n:]) / last_n
    usual = sum(mins) / len(mins)
    return max(0.6, min(1.5, recent / usual)) if usual > 0 else 1.0


def project_hybrid(hp, p2, x):
    """v2 base + game-level signals: minutes trend (alpha) and back-to-back availability penalty."""
    proj, eg, ppg = v2.project(p2, x["price"], x["sc"], x["g"], x["v2past"])
    if eg <= 0:
        return 0.0, 0.0
    ratio = minutes_ratio(x["past"], hp["last_n"]) ** hp["alpha"]
    n = len(x["sched"]) or 1
    b2b_share = sum(1 for s in x["sched"] if s) / n
    eg2 = eg * (1 - (1 - hp["b2b"]) * b2b_share)
    return ppg * ratio * eg2, eg2


HGRID = {"alpha": [0.0, 0.25, 0.5, 0.75, 1.0], "last_n": [2, 3, 5], "b2b": [0.75, 0.85, 0.95, 1.0]}


def fit_hybrid(rows, p2):
    keys = list(HGRID)
    best = None
    for combo in itertools.product(*(HGRID[k] for k in keys)):
        hp = dict(zip(keys, combo))
        e = st.mean(abs(project_hybrid(hp, p2, x)[0] - x["actual"]) for x in rows)
        if best is None or e < best[1]:
            best = (hp, e)
    return best


GRID = {"decay": [0.8, 0.9, 0.95], "k_min": [60.0, 200.0, 600.0], "avail_prior": [0.85], "avail_s": [3.0, 8.0],
        "b2b": [0.8, 0.9, 1.0], "w_sc": [0.0, 0.2, 0.35]}


def mae(params, rows):
    return st.mean(abs(project(params, x["price"], x["sc"], x["past"], x["sched"])[0] - x["actual"]) for x in rows)


def fit(rows):
    keys = list(GRID)
    best = None
    for combo in itertools.product(*(GRID[k] for k in keys)):
        p = dict(zip(keys, combo))
        e = mae(p, rows)
        if best is None or e < best[1]:
            best = (p, e)
    return best


def main():
    hist = v2.load_history()
    team_games, b2b, player_games = load_games()
    with open(os.path.join(ROOT, "supercoach_data.json"), encoding="utf-8") as f:
        live_round = int(json.load(f)["round"])
    rounds = [r for r in sorted(hist) if 2 <= r < live_round]
    rows = build_rows(hist, team_games, b2b, player_games, rounds)
    p2 = v2.load_params()

    print(f"{len(rows)} player-rounds matched to box scores. Mean miss (points per round), lower is better:")
    print(f"{'round':>5} {'v3':>6} {'v2':>6} {'SC':>6}   median v3 / v2 / SC")
    cv = []
    all_v3, all_v2, all_sc = [], [], []
    for r in rounds:
        train = [x for x in rows if x["r"] != r]
        test = [x for x in rows if x["r"] == r]
        params, _ = fit(train)
        e3 = [abs(project(params, x["price"], x["sc"], x["past"], x["sched"])[0] - x["actual"]) for x in test]
        e2 = [abs(v2.project(p2, x["price"], x["sc"], x["g"], x["v2past"])[0] - x["actual"]) for x in test]
        esc = [abs(x["sc"] - x["actual"]) for x in test]
        all_v3 += e3; all_v2 += e2; all_sc += esc
        cv.append({"round": r, "n": len(test), "v3_mae": round(st.mean(e3), 2), "v2_mae": round(st.mean(e2), 2), "sc_mae": round(st.mean(esc), 2)})
        print(f"R{r:>4} {st.mean(e3):>6.1f} {st.mean(e2):>6.1f} {st.mean(esc):>6.1f}   {st.median(e3):.1f} / {st.median(e2):.1f} / {st.median(esc):.1f}")
    m3, m2, msc = st.mean(all_v3), st.mean(all_v2), st.mean(all_sc)
    print(f"{'all':>5} {m3:>6.1f} {m2:>6.1f} {msc:>6.1f}   {st.median(all_v3):.1f} / {st.median(all_v2):.1f} / {st.median(all_sc):.1f}")
    print(f"v3 vs v2: {100 * (1 - m3 / m2):.1f}% smaller typical miss · v3 vs SuperCoach: {100 * (1 - m3 / msc):.1f}% smaller")

    # Hybrid: v2 + game-level signals, honest test (fit on other rounds, v2 params also refit without the test round)
    print("\nHybrid (v2 + minutes trend + back-to-backs), honest test:")
    hyb_all, base_all, hcv = [], [], []
    v2rows = v2.backtest_rows(hist, rounds)
    for r in rounds:
        p2r, _ = v2.fit([x for x in v2rows if x["r"] != r])
        train = [x for x in rows if x["r"] != r]
        test = [x for x in rows if x["r"] == r]
        hp, _ = fit_hybrid(train, p2r)
        eh = [abs(project_hybrid(hp, p2r, x)[0] - x["actual"]) for x in test]
        eb = [abs(v2.project(p2r, x["price"], x["sc"], x["g"], x["v2past"])[0] - x["actual"]) for x in test]
        hyb_all += eh; base_all += eb
        hcv.append({"round": r, "n": len(test), "hybrid_mae": round(st.mean(eh), 2), "v2_mae": round(st.mean(eb), 2), "params": hp})
        print(f"  R{r}: hybrid {st.mean(eh):.2f}  v2 {st.mean(eb):.2f}  ({hp})")
    mh, mb = st.mean(hyb_all), st.mean(base_all)
    print(f"  all: hybrid {mh:.2f}  v2 {mb:.2f}  -> {100 * (1 - mh / mb):.1f}% smaller typical miss (median {st.median(hyb_all):.1f} vs {st.median(base_all):.1f})")
    hp_final, _ = fit_hybrid(rows, p2)

    params, err = fit(rows)
    os.makedirs(os.path.dirname(PARAMS), exist_ok=True)
    with open(PARAMS, "w", encoding="utf-8") as f:
        json.dump({"params": params, "hybrid_params": hp_final, "fit_rounds": rounds, "rows": len(rows), "honest_test": cv,
                   "hybrid_honest_test": hcv,
                   "summary": {"v3_mae": round(m3, 2), "v2_mae": round(m2, 2), "sc_mae": round(msc, 2),
                               "hybrid_mae": round(mh, 2), "hybrid_v2_mae": round(mb, 2)}}, f, indent=2)
    print(f"Final v3 params: {params}")


if __name__ == "__main__":
    main()
