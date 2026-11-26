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


# ---------- pre-game projection locks (captain picks, accuracy record) ----------
from datetime import datetime, timezone  # noqa: E402

FIX = {"6": [{"t": "2026-11-26T14:00:00+11:00", "home": "GSW", "away": "SAC"},
             {"t": "2026-11-28T13:30:00+11:00", "home": "POR", "away": "GSW"}]}


def _live(proj):
    return {"round": 6, "fixtures": FIX, "players": [
        {"id": 1, "team": "GSW", "proj_v2": proj, "proj": 40, "proj_lo": 20, "proj_hi": 60},
        {"id": 2, "team": "DEN", "proj_v2": 90, "proj": 80}]}


def test_lock_uses_last_sync_before_tip_off():
    before = dict(_live(47), lastUpdated="2026-11-26T01:00:00+00:00")  # 12:00 Sydney, before the 14:00 tip
    after = _live(60)                                                     # projection moved after he played
    sc.attach_locks(after, before, 6, now=datetime(2026, 11, 26, 6, 0, tzinfo=timezone.utc))
    lock = after["players"][0]["lock"]
    assert lock["proj"] == 47 and lock["sc_proj"] == 40 and lock["at"] == "2026-11-26T01:00:00+00:00"
    assert "lock" not in after["players"][1]  # DEN has no game in these fixtures yet


def test_lock_is_carried_over_and_never_moves():
    first = _live(47)
    first["players"][0]["lock"] = {"proj": 47, "at": "x"}
    first["lastUpdated"] = "2026-11-26T05:00:00+00:00"
    later = _live(80)
    sc.attach_locks(later, first, 6, now=datetime(2026, 11, 27, 0, 0, tzinfo=timezone.utc))
    assert later["players"][0]["lock"] == {"proj": 47, "at": "x"}


def test_no_lock_before_tip_off_or_from_another_round():
    live = _live(47)
    sc.attach_locks(live, {"round": 5, "players": []}, 6, now=datetime(2026, 11, 26, 2, 0, tzinfo=timezone.utc))
    assert "lock" not in live["players"][0]
    sc.attach_locks(live, {"round": 5, "players": [{"id": 1, "proj_v2": 1}]}, 6, now=datetime(2026, 11, 26, 4, 0, tzinfo=timezone.utc))
    assert live["players"][0]["lock"]["proj"] == 47  # previous file was another round: lock from current values
