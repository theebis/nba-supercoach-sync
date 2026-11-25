#!/usr/bin/env python3
"""
SCHOOPS projection model (v2): projected round score = expected points-per-game x expected games.

expected ppg  = a blend of
  - recent form: exponentially weighted points-per-game over finished rounds (recent rounds count more)
  - price-implied ppg: price / magic number (the market's long-run rating, includes last season)
  - SuperCoach's own projection, per scheduled game
  with recent form trusted more the more games it's based on (shrinkage: n / (n + k)).
expected games = scheduled games x availability, where availability is the player's smoothed share of
  scheduled games actually played so far; for the live round the ESPN injury report overrides it
  (Out for the round -> 0, Day-To-Day -> one game fewer).
range (likely, middle 80%: 1 in 10 above, 1 in 10 below) = projection x empirical quantiles of actual/projected from the backtest.

Run directly to fit + backtest:  python projection_model.py   (writes model/projection_params.json + prints report)
The scraper imports project_player() to add proj_v2 / proj_lo / proj_hi / exp_games to the live data.
Every backtest prediction only uses information from BEFORE that round.
"""
import math
import itertools
import json
import os
import statistics as st

ROOT = os.path.dirname(os.path.abspath(__file__))
HISTORY = os.path.join(ROOT, "history")
PARAMS_FILE = os.path.join(ROOT, "model", "projection_params.json")
MAGIC = 712000

DEFAULT_PARAMS = {"decay": 0.7, "k": 6.0, "w_sc": 0.35, "avail_prior": 0.85, "avail_strength": 3.0,
                  "range_q": [[0, 0.62, 1.30]]}


def load_history():
    """{round: {player_id: player_dict}} for every snapshot on disk."""
    out = {}
    for f in os.listdir(HISTORY):
        if f.startswith("round_") and f.endswith(".json"):
            with open(os.path.join(HISTORY, f), encoding="utf-8") as fh:
                out[int(f[6:-5])] = {p["id"]: p for p in json.load(fh)["players"]}
    return out


def features(pid, rnd, hist):
    """Pre-round information for player pid going into round rnd (only rounds < rnd are used)."""
    past = [hist[r][pid] for r in sorted(hist) if r < rnd and pid in hist[r] and "games_played" in hist[r][pid]]
    return {
        "past": [(p["actual_points"], p["games_played"], p["games"]) for p in past],
    }


def project(params, price, sc_proj, games_sched, past, injury_status=None, injury_return=None, round_end=None):
    """Returns (projection, expected_games, expected_ppg). `past` = [(points, games_played, games_scheduled), ...] oldest first."""
    if games_sched <= 0:
        return 0.0, 0.0, 0.0
    # recent form (EWMA of per-game averages, weighted by games in each round)
    num = den = 0.0
    n_games = 0
    w = 1.0
    for pts, gp, _ in reversed(past):
        if gp > 0:
            num += w * pts
            den += w * gp
            n_games += gp
        w *= params["decay"]
    form_ppg = num / den if den else None
    price_ppg = price / MAGIC
    sc_ppg = (sc_proj / games_sched) if sc_proj and sc_proj > 0 else None

    trust = n_games / (n_games + params["k"]) if form_ppg is not None else 0.0
    base = trust * form_ppg + (1 - trust) * price_ppg if form_ppg is not None else price_ppg
    ppg = (1 - params["w_sc"]) * base + params["w_sc"] * sc_ppg if sc_ppg is not None else base

    # availability: smoothed share of scheduled games actually played
    played = sum(gp for _, gp, _ in past)
    sched = sum(gs for _, _, gs in past)
    a0, s0 = params["avail_prior"], params["avail_strength"]
    avail = (played + a0 * s0) / (sched + s0)
    exp_games = games_sched * min(1.0, avail)

    status = str(injury_status or "").lower()
    if status.startswith("out"):
        exp_games = 0.0 if (not injury_return or not round_end or injury_return > round_end) else max(0.0, exp_games - 1.5)
    elif "day" in status:
        exp_games = max(0.0, exp_games - 1.0)
    return ppg * exp_games, exp_games, ppg


def backtest_rows(hist, rounds):
    rows = []
    for r in rounds:
        for pid, p in hist[r].items():
            if p.get("games", 0) <= 0 or p.get("proj", 0) <= 0 or "actual_points" not in p:
                continue
            f = features(pid, r, hist)
            rows.append({"r": r, "price": p["price"], "sc": p["proj"], "g": p["games"], "past": f["past"], "actual": p["actual_points"],
                         "gp": int(p.get("games_played") or 0)})
    return rows


def mae(params, rows):
    return st.mean(abs(project(params, x["price"], x["sc"], x["g"], x["past"])[0] - x["actual"]) for x in rows)


GRID = {
    "decay": [0.5, 0.7, 0.85, 1.0],
    "k": [2.0, 6.0, 12.0, 24.0],
    "w_sc": [0.0, 0.2, 0.35, 0.5, 0.7],
    "avail_prior": [0.8, 0.9],
    "avail_strength": [2.0, 4.0, 8.0],
}


def fit(rows):
    best, best_err = None, None
    keys = list(GRID)
    for combo in itertools.product(*(GRID[k] for k in keys)):
        params = dict(zip(keys, combo))
        err = mae(params, rows)
        if best_err is None or err < best_err:
            best, best_err = params, err
    return best, best_err


RANGE_LO_Q, RANGE_HI_Q = 0.10, 0.90   # likely range = middle 80% of outcomes


def range_quantiles(params, rows):
    """Middle-80% ratios of actual/projected, by projection size bucket."""
    buckets = [(0, 40), (40, 80), (80, 10_000)]
    out = []
    for lo, hi in buckets:
        ratios = sorted(x["actual"] / p for x in rows for p in [project(params, x["price"], x["sc"], x["g"], x["past"])[0]] if lo <= p < hi and p > 5)
        if len(ratios) >= 30:
            q = lambda f: ratios[int(f * (len(ratios) - 1))]
            out.append([lo, round(q(RANGE_LO_Q), 3), round(q(RANGE_HI_Q), 3)])
    return out or DEFAULT_PARAMS["range_q"]


# Per-game range "if he plays": middle 80% of his per-game average, from a league-wide spread blended with
# the player's own round-to-round consistency (more weight on his own as his history grows).
PPG_Z = 1.2816          # middle 80%
PPG_OWN_K = 3.0         # rounds of league-wide spread blended in


PPG_BUCKETS = [0, 15, 25]   # per-game scoring bands: low scorers swing far more (relatively) than stars


def ppg_log_sd(params, rows):
    """League spread (log scale) of actual vs projected per-game average, per scoring band: [[from_ppg, sd], ...]."""
    vals = {b: [] for b in PPG_BUCKETS}
    for x in rows:
        if x.get("gp", 0) > 0 and x["actual"] > 0:
            ppg = project(params, x["price"], x["sc"], x["g"], x["past"])[2]
            if ppg > 0:
                b = max(v for v in PPG_BUCKETS if ppg >= v)
                vals[b].append(math.log((x["actual"] / x["gp"]) / ppg))
    return [[b, round(st.pstdev(v), 4) if len(v) > 20 else 0.45] for b, v in vals.items()]


def band_sd(table, ppg):
    if isinstance(table, (int, float)):
        return float(table)
    sd = table[0][1]
    for b, v in table:
        if ppg >= b:
            sd = v
    return sd


def ppg_range(ppg, past, league_table):
    """(low, high) per-game average he usually lands in when he plays."""
    if ppg <= 0:
        return 0.0, 0.0
    league_sd = band_sd(league_table, ppg)
    own = [math.log((pts / gp) / ppg) for pts, gp, _ in past if gp > 0 and pts > 0]
    n = len(own)
    own_var = st.pvariance(own) if n >= 2 else league_sd ** 2
    sd = math.sqrt((n * own_var + PPG_OWN_K * league_sd ** 2) / (n + PPG_OWN_K))
    return ppg * math.exp(-PPG_Z * sd), ppg * math.exp(PPG_Z * sd)


def load_params():
    try:
        with open(PARAMS_FILE, encoding="utf-8") as f:
            return json.load(f)["params"]
    except Exception:
        return DEFAULT_PARAMS


def project_player(params, live_player, pid, live_round, hist, round_end=None):
    """Projection for the live round, as dict fields to add to the player."""
    f = features(pid, live_round, hist)
    proj, eg, ppg = project(params, live_player["price"], live_player.get("proj", 0), live_player.get("games", 0), f["past"],
                            live_player.get("injury_status"), live_player.get("injury_return"), round_end)
    lo_r, hi_r = 0.62, 1.30
    for b_lo, q25, q75 in params.get("range_q", DEFAULT_PARAMS["range_q"]):
        if proj >= b_lo:
            lo_r, hi_r = q25, q75
    g_lo, g_hi = ppg_range(ppg, f["past"], params.get("ppg_sd", 0.45))
    return {"proj_v2": round(proj), "proj_lo": round(proj * lo_r), "proj_hi": round(proj * hi_r),
            "exp_games": round(eg, 1), "exp_ppg": round(ppg, 1), "ppg_lo": round(g_lo), "ppg_hi": round(g_hi)}


def train(hist, live_round, verbose=True):
    """Fit on every finished round (R2+), with a leave-one-round-out honesty check. Saves the params file."""
    done = sorted(r for r in hist if 2 <= r < live_round)   # R1 has no form yet
    all_rows = backtest_rows(hist, done)
    if len(done) < 2 or len(all_rows) < 200:
        return None

    # Honest test: for each round, fit on the OTHER rounds and score this one
    cv = []
    for r in done:
        train_rows = [x for x in all_rows if x["r"] != r]
        test = [x for x in all_rows if x["r"] == r]
        params, _ = fit(train_rows)
        cv.append({"round": r, "n": len(test), "ours_mae": round(mae(params, test), 2),
                   "sc_mae": round(st.mean(abs(x["sc"] - x["actual"]) for x in test), 2)})
    if verbose:
        print("Round-by-round (fitted without the round being tested):")
        for c in cv:
            print(f"  R{c['round']}: n={c['n']}  ours {c['ours_mae']:.1f}  SuperCoach {c['sc_mae']:.1f}")
    return _finish(all_rows, done, cv, verbose)


def maybe_refit(hist, live_round):
    """Refit only when a newly finished round isn't in the saved model yet (the model learns each round)."""
    done = sorted(r for r in hist if 2 <= r < live_round)
    try:
        with open(PARAMS_FILE, encoding="utf-8") as f:
            saved = json.load(f)
        if saved.get("fit_rounds") == done:
            return saved["params"]
    except Exception:
        pass
    print(f"Projection model: refitting on rounds {done}...")
    train(hist, live_round, verbose=True)
    return load_params()


def main():
    hist = load_history()
    with open(os.path.join(ROOT, "supercoach_data.json"), encoding="utf-8") as f:
        live_round = int(json.load(f)["round"])
    train(hist, live_round)


def _finish(all_rows, done, cv, verbose):

    # Final model: fit on everything, then measure range coverage
    params, err = fit(all_rows)
    params["range_q"] = range_quantiles(params, all_rows)

    def inside_range(rq, x):
        p = project(params, x["price"], x["sc"], x["g"], x["past"])[0]
        lo_r, hi_r = rq[0][1], rq[0][2]
        for b_lo, q_lo, q_hi in rq:
            if p >= b_lo:
                lo_r, hi_r = q_lo, q_hi
        return p * lo_r <= x["actual"] <= p * hi_r

    inside = sum(inside_range(params["range_q"], x) for x in all_rows)
    # Honest check: each round's range built only from the OTHER rounds
    held = [inside_range(range_quantiles(params, [y for y in all_rows if y["r"] != r]), x)
            for r in done for x in all_rows if x["r"] == r]
    range_cv = round(sum(held) / len(held), 3) if held else None

    # Per-game range, tested the same honest way (spread from the other rounds only)
    params["ppg_sd"] = ppg_log_sd(params, all_rows)
    g_held = []
    for r in done:
        sd_r = ppg_log_sd(params, [y for y in all_rows if y["r"] != r])
        for x in all_rows:
            if x["r"] != r or x.get("gp", 0) <= 0:
                continue
            ppg = project(params, x["price"], x["sc"], x["g"], x["past"])[2]
            if ppg <= 0:
                continue
            lo, hi = ppg_range(ppg, x["past"], sd_r)
            g_held.append(lo <= x["actual"] / x["gp"] <= hi)
    ppg_cv = round(sum(g_held) / len(g_held), 3) if g_held else None
    os.makedirs(os.path.dirname(PARAMS_FILE), exist_ok=True)
    with open(PARAMS_FILE, "w", encoding="utf-8") as f:
        json.dump({"params": params, "fit_rounds": done, "rows": len(all_rows), "honest_test": cv,
                   "in_sample_mae": round(err, 2), "range_coverage": round(inside / len(all_rows), 3),
                   "range_coverage_cv": range_cv, "range_level": round(RANGE_HI_Q - RANGE_LO_Q, 2),
                   "ppg_range_coverage_cv": ppg_cv, "ppg_range_level": 0.8}, f, indent=2)
    if verbose:
        print(f"Final params: {params}")
        print(f"Likely range holds the actual score {inside / len(all_rows):.0%} of the time ({range_cv:.0%} on rounds it wasn't built from).")
        print(f"Per-game range (if he plays) held {ppg_cv:.0%} on rounds it wasn't built from.")
    return params


if __name__ == "__main__":
    main()
