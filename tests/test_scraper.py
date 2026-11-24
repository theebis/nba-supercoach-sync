"""Unit tests for update_supercoach.py helpers. Run: python -m pytest tests"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import update_supercoach as sc  # noqa: E402


def test_name_keys_match_across_feeds():
    assert sc.normalize_name_key("Nikola Jokić") == sc.normalize_name_key("Nikola Jokic")
    assert sc.normalize_name_key("Jaren Jackson Jr.") == "jaren jackson"
    assert sc.normalize_compact_key("P.J. Washington") == sc.normalize_compact_key("PJ Washington")
    assert sc.normalize_name_key("Shai Gilgeous-Alexander") == "shai gilgeous alexander"


def test_injury_values():
    assert sc.describe_injury_value(None) is None
    assert sc.describe_injury_value("Available") is None
    assert sc.describe_injury_value("Out") == "Out"
    assert sc.describe_injury_value({"status_text": "Hamstring"}) == "Hamstring"
    assert sc.short_injury_label({"status": "Out", "type": "Ankle"}) == "Out · Ankle"


def test_first_present_keeps_zero():
    # A breakeven of 0 is a real value and must not be skipped
    assert sc.first_present([{"be": 0}], ("be",)) == 0
    assert sc.first_present([{"be": None}, {"breakeven": 12}], sc.BE_KEYS) == 12


def test_round_price_is_price_before_this_rounds_change():
    row = {"round": 5, "price": 27880000, "price_change": 190000, "points": 163, "games": 4}
    p = {"id": 1, "first_name": "Nikola", "last_name": "Jokic", "player_stats": [row], "team": {"abbrev": "DEN"}}
    out = sc.parse_player(p, {}, {}, {}, {}, {}, {}, {}, {}, {})
    assert out["price"] == 27690000
    assert out["price_after"] == 27880000
    assert out["actual_points"] == 163 and out["games_played"] == 4
