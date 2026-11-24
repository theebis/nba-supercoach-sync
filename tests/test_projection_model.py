"""SCHOOPS projection model: behaviour and no peeking at the round being predicted."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import projection_model as pm  # noqa: E402

P = {"decay": 0.7, "k": 6.0, "w_sc": 0.35, "avail_prior": 0.85, "avail_strength": 3.0}


def test_no_games_scheduled_means_zero():
    assert pm.project(P, 20_000_000, 100, 0, [(120, 3, 3)])[0] == 0


def test_out_for_the_round_means_zero_and_day_to_day_means_fewer_games():
    past = [(120, 3, 3), (130, 3, 3)]
    full = pm.project(P, 20_000_000, 100, 3, past)
    out = pm.project(P, 20_000_000, 100, 3, past, "Out", "2026-12-20", "2026-11-30")
    dtd = pm.project(P, 20_000_000, 100, 3, past, "Day-To-Day")
    assert out[0] == 0
    assert dtd[1] < full[1] and dtd[0] < full[0]


def test_players_who_keep_missing_games_are_projected_fewer_games():
    reliable = pm.project(P, 10_000_000, 60, 3, [(60, 3, 3), (60, 3, 3)])
    patchy = pm.project(P, 10_000_000, 60, 3, [(20, 1, 3), (20, 1, 3)])
    assert patchy[1] < reliable[1]


def test_features_only_use_earlier_rounds():
    hist = {
        1: {"a": {"actual_points": 50, "games_played": 2, "games": 2}},
        2: {"a": {"actual_points": 90, "games_played": 3, "games": 3}},
        3: {"a": {"actual_points": 999, "games_played": 3, "games": 3}},
    }
    past = pm.features("a", 3, hist)["past"]
    assert past == [(50, 2, 2), (90, 3, 3)]  # round 3 itself is never used to predict round 3


def test_saved_model_beats_supercoach_in_honest_test():
    import json
    with open(pm.PARAMS_FILE, encoding="utf-8") as f:
        info = json.load(f)
    for c in info["honest_test"]:
        assert c["ours_mae"] < c["sc_mae"], c
