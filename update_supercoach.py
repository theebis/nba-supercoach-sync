#!/usr/bin/env python3
"""
update_supercoach.py
Live NBA SuperCoach scraper using the public CloudFront (players-cf) JSON feed.
- Fetches current round from /settings
- Fetches full player pool, prices, ownership %, 3-wk & 5-wk averages, projections (ppts1), and injuries
- Fetches exact Wk N-1 and Wk N-2 scores from the previous two rounds
- Counts exact upcoming games per team from /real_fixture
- NEVER runs fake offline rollovers: if the API fails, it exits cleanly without corrupting your data
"""
import json
import os
import sys
from datetime import datetime, timezone
from curl_cffi import requests

DATA_FILE = "supercoach_data.json"
DEFAULT_MAGIC_NUMBER = 178000

BASE_URLS = [
    "https://www.supercoach.com.au/2026/api/nba/classic/v1",
    "https://supercoach.com.au/2026/api/nba/classic/v1",
    "https://www.supercoach.com.au/2027/api/nba/classic/v1",
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Origin": "https://www.supercoach.com.au",
    "Referer": "https://www.supercoach.com.au/",
}


def fetch_json(url):
    res = requests.get(url, headers=HEADERS, impersonate="chrome", timeout=25)
    if res.status_code != 200:
        raise RuntimeError(f"HTTP {res.status_code}")
    try:
        return res.json()
    except Exception:
        snippet = res.text[:120].replace("\n", " ")
        raise RuntimeError(f"Non-JSON response: {snippet!r}")


def detect_working_base_and_round():
    for base in BASE_URLS:
        try:
            print(f"Checking SuperCoach settings: {base}/settings?min=false")
            settings = fetch_json(f"{base}/settings?min=false")
            comp = settings.get("competition") or settings
            curr_round = (
                comp.get("current_round")
                or comp.get("next_round")
                or settings.get("current_round")
                or settings.get("round")
            )
            if curr_round:
                print(f"Connected! Active SuperCoach round: {curr_round}")
                return base, int(curr_round)
            print(f"Connected to {base} (no round field in settings)")
            return base, None
        except Exception as err:
            print(f"  -> {base} failed: {err}")
    return None, None


def fetch_round_scores(base_url, round_num):
    """Returns { player_id: points } for a specific completed round."""
    if not round_num or round_num < 1:
        return {}
    url = f"{base_url}/players-cf?embed=player_stats&round={round_num}"
    try:
        payload = fetch_json(url)
        raw_list = payload if isinstance(payload, list) else payload.get("players", [])
        scores = {}
        for p in raw_list:
            pid = str(p.get("id", ""))
            stats = p.get("player_stats") or []
            pts = 0
            for s in stats:
                if s.get("round") == round_num or len(stats) == 1:
                    pts = int(s.get("points") or 0)
                    break
            scores[pid] = pts
        print(f"Fetched Round {round_num} scores for {len(scores)} players.")
        return scores
    except Exception as err:
        print(f"Could not fetch Round {round_num} scores: {err}")
        return {}


def fetch_team_game_counts(base_url, round_num):
    """Counts how many NBA games each team plays in the target round."""
    if not round_num or round_num < 1:
        return {}
    url = f"{base_url}/real_fixture?round={round_num}"
    counts = {}
    try:
        fixtures = fetch_json(url)
        if not isinstance(fixtures, list):
            fixtures = fixtures.get("fixtures") or fixtures.get("matches") or []
        for fx in fixtures:
            for key in ("team1", "team2", "home_team", "away_team"):
                t = fx.get(key)
                if isinstance(t, dict):
                    abbrev = t.get("abbrev") or t.get("team_abbrev")
                    if abbrev:
                        counts[abbrev] = counts.get(abbrev, 0) + 1
            for id_key in ("team1_id", "team2_id"):
                tid = fx.get(id_key)
                if tid is not None:
                    counts[str(tid)] = counts.get(str(tid), 0) + 1
        print(f"Fetched Round {round_num} fixture game counts ({len(fixtures)} games).")
    except Exception as err:
        print(f"Could not fetch Round {round_num} fixtures (will default to player feed): {err}")
    return counts


def parse_player(p, existing_status_map, scores_r1, scores_r2, team_games):
    pid = str(p.get("id", ""))
    first_name = str(p.get("first_name", "")).strip()
    last_name = str(p.get("last_name", "")).strip()
    full_name = p.get("name") or f"{first_name} {last_name}".strip()

    team_obj = p.get("team") or {}
    team = team_obj.get("abbrev") or p.get("team_abbrev") or "NBA"
    team_id = str(p.get("team_id") or team_obj.get("id") or "")

    positions_arr = p.get("positions") or []
    if isinstance(positions_arr, list) and positions_arr:
        pos = "/".join(str(x.get("position", "")) for x in positions_arr if x.get("position"))
    else:
        pos = str(p.get("position") or "UTIL")

    stats = p.get("player_stats") or []
    latest_stat = stats[-1] if stats else {}

    # Exact past 2 round scores
    r_minus_1 = scores_r1.get(pid, None)
    r_minus_2 = scores_r2.get(pid, None)

    if r_minus_1 is None or r_minus_2 is None:
        completed = [s for s in stats if s.get("points") is not None]
        if r_minus_1 is None:
            r_minus_1 = int(completed[-1].get("points") or 0) if len(completed) >= 1 else 0
        if r_minus_2 is None:
            r_minus_2 = int(completed[-2].get("points") or 0) if len(completed) >= 2 else 0

    price = int(latest_stat.get("price") or p.get("price") or 3800000)

    # Real projection: SuperCoach uses ppts1 (fall back to avg3 / avg)
    proj_raw = (
        latest_stat.get("ppts1")
        or p.get("ppts1")
        or latest_stat.get("avg3")
        or latest_stat.get("avg")
        or p.get("points_average")
        or 0
    )
    proj = int(round(float(proj_raw))) if proj_raw else 0

    # 5-week average if provided by SuperCoach
    avg5_raw = latest_stat.get("avg5") or p.get("avg5")
    avg5 = round(float(avg5_raw), 1) if avg5_raw not in (None, "", 0) else None

    # Official breakeven if provided by SuperCoach
    be_raw = latest_stat.get("be") or latest_stat.get("breakeven") or p.get("be")
    be = int(round(float(be_raw))) if be_raw not in (None, "") else None

    # Ownership %
    owned_raw = latest_stat.get("owned")
    if owned_raw is None:
        owned_raw = p.get("owned") or p.get("ownership") or 0
    if isinstance(owned_raw, dict):
        owned = float(owned_raw.get("percentage") or 0)
    else:
        owned = float(owned_raw or 0)

    # Games this round (prefer fixture count, fallback to player field)
    games = team_games.get(team) or team_games.get(team_id) or int(latest_stat.get("games") or p.get("games") or 3)

    # Injury status
    injury = p.get("injury_suspension_status") or p.get("injury") or None
    if isinstance(injury, str) and injury.strip().lower() in ("", "none", "available", "fit"):
        injury = None

    # Preserve your squad tags
    saved_status = existing_status_map.get(full_name.lower())
    status = saved_status if saved_status == "squad" else "watchlist"

    return {
        "id": pid or full_name,
        "name": full_name,
        "team": team,
        "pos": pos or "UTIL",
        "price": price,
        "r_minus_2": int(r_minus_2),
        "r_minus_1": int(r_minus_1),
        "proj": proj,
        "avg5": avg5,
        "be": be,
        "games": int(games),
        "owned": round(owned, 2),
        "injury": injury,
        "status": status,
    }


def main():
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
    else:
        data = {"round": 5, "magicNumber": DEFAULT_MAGIC_NUMBER, "players": []}

    existing_players = data.get("players", [])
    existing_status_map = {
        p.get("name", "").lower(): str(p.get("status", "")).lower()
        for p in existing_players
    }

    base_url, active_round = detect_working_base_and_round()
    if not base_url:
        print("ERROR: Could not connect to any SuperCoach API endpoint. Leaving existing JSON untouched.")
        sys.exit(1)

    round_param = f"&round={active_round}" if active_round else ""
    players_url = f"{base_url}/players-cf?embed=notes,odds,player_stats,positions{round_param}"
    print(f"Fetching main player pool: {players_url}")

    payload = fetch_json(players_url)
    raw_list = payload if isinstance(payload, list) else payload.get("players", [])
    if not isinstance(raw_list, list) or len(raw_list) < 50:
        print(f"ERROR: Unexpected player count ({len(raw_list)}). Aborting without modifying JSON.")
        sys.exit(1)

    target_round = active_round or data.get("round", 5)

    # Pull exact scores from the 2 most recently completed rounds
    scores_r1 = fetch_round_scores(base_url, target_round - 1)
    scores_r2 = fetch_round_scores(base_url, target_round - 2)
    team_games = fetch_team_game_counts(base_url, target_round)

    parsed = [
        parse_player(p, existing_status_map, scores_r1, scores_r2, team_games)
        for p in raw_list
    ]

    data["round"] = int(target_round)
    data["totalPlayersScraped"] = len(parsed)
    data["lastUpdated"] = datetime.now(timezone.utc).isoformat()
    data["players"] = parsed

    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

    print(f"SUCCESS: Saved {len(parsed)} live NBA SuperCoach players for Round {target_round}.")


if __name__ == "__main__":
    main()
