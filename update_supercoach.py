#!/usr/bin/env python3
"""
update_supercoach.py
Live NBA SuperCoach scraper using the public CloudFront (players-cf) JSON feed.
- Uses curl_cffi (Chrome impersonation) to bypass 403 firewall blocks on GitHub Actions
- Smart Rollover: only flips to next_round when BOTH is_lockout and is_partial_lockout are False
  (meaning the entire previous round has concluded and salaries have updated, not mid-round gaps)
- Multi-Round Fixtures: pulls R, R+1, and R+2 team game counts from SuperCoach real_fixture
- Player Headshots: enriches each player with official NBA/ESPN transparent PNG headshot URLs
- Historical Snapshots: saves history/round_X.json and automatically backfills past rounds
- NEVER runs fake offline rollovers: if the API fails, it exits cleanly without corrupting data
"""
import json
import os
import re
import sys
import unicodedata
from datetime import datetime, timezone
from curl_cffi import requests

DATA_FILE = "supercoach_data.json"
HISTORY_DIR = "history"
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

ESPN_ATHLETES_URLS = [
    "https://sports.core.api.espn.com/v3/sports/basketball/nba/athletes?limit=2000&active=true",
    "https://sports.core.api.espn.com/v3/sports/basketball/nba/athletes?limit=2000",
]

ESPN_TEAMS_URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams?limit=40"


def fetch_json(url, extra_headers=None, timeout=25):
    hdrs = dict(HEADERS)
    if extra_headers:
        hdrs.update(extra_headers)
    res = requests.get(url, headers=hdrs, impersonate="chrome", timeout=timeout)
    if res.status_code != 200:
        raise RuntimeError(f"HTTP {res.status_code}")
    try:
        return res.json()
    except Exception:
        snippet = res.text[:120].replace("\n", " ")
        raise RuntimeError(f"Non-JSON response: {snippet!r}")


def normalize_name_key(name):
    """Normalizes player names for resilient cross-feed headshot matching."""
    if not name:
        return ""
    s = unicodedata.normalize("NFKD", str(name))
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    s = s.lower().strip()
    # Remove punctuation & standardize whitespace
    s = re.sub(r"['’`.\-,]", " ", s)
    # Remove generational suffixes
    tokens = [t for t in s.split() if t not in ("jr", "sr", "ii", "iii", "iv", "v")]
    return " ".join(tokens)


def normalize_compact_key(name):
    """Aggressive fallback key removing all spaces (handles P.J. vs PJ, etc.)."""
    return normalize_name_key(name).replace(" ", "")


def fetch_headshot_map():
    """
    Builds { normalized_name: headshot_url } from public ESPN NBA endpoints.
    Never raises — returns empty map if external headshot services are unreachable.
    """
    headshots = {}
    compact = {}

    def register(full_name, url):
        if not full_name or not url:
            return
        k = normalize_name_key(full_name)
        ck = normalize_compact_key(full_name)
        if k and k not in headshots:
            headshots[k] = url
        if ck and ck not in compact:
            compact[ck] = url

    # Source 1: ESPN NBA active athletes bulk feed (fast single request)
    for url in ESPN_ATHLETES_URLS:
        try:
            payload = fetch_json(
                url,
                extra_headers={"Origin": "https://www.espn.com", "Referer": "https://www.espn.com/"},
                timeout=20,
            )
            items = payload.get("items") or []
            for item in items:
                aid = item.get("id")
                fname = item.get("fullName") or item.get("displayName") or ""
                hs = item.get("headshot")
                href = hs.get("href") if isinstance(hs, dict) else None
                if not href and aid:
                    href = f"https://a.espncdn.com/i/headshots/nba/players/full/{aid}.png"
                if fname and href:
                    register(fname, href)
            if headshots:
                print(f"Loaded {len(headshots)} NBA player headshots from ESPN athletes feed.")
                break
        except Exception as err:
            print(f"ESPN bulk athletes headshot fetch note ({url}): {err}")

    # Source 2: If bulk feed returned fewer than 400 players, supplement via ESPN team rosters
    if len(headshots) < 400:
        try:
            teams_data = fetch_json(
                ESPN_TEAMS_URL,
                extra_headers={"Origin": "https://www.espn.com", "Referer": "https://www.espn.com/"},
                timeout=15,
            )
            sports = teams_data.get("sports") or []
            leagues = (sports[0].get("leagues") or []) if sports else []
            teams = (leagues[0].get("teams") or []) if leagues else []
            for entry in teams:
                t = entry.get("team") or entry
                tid = t.get("id")
                if not tid:
                    continue
                try:
                    roster = fetch_json(
                        f"https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/{tid}/roster",
                        extra_headers={"Origin": "https://www.espn.com", "Referer": "https://www.espn.com/"},
                        timeout=12,
                    )
                    for ath in roster.get("athletes") or []:
                        aid = ath.get("id")
                        fname = ath.get("fullName") or ath.get("displayName") or ""
                        hs = ath.get("headshot")
                        href = hs.get("href") if isinstance(hs, dict) else None
                        if not href and aid:
                            href = f"https://a.espncdn.com/i/headshots/nba/players/full/{aid}.png"
                        if fname and href:
                            register(fname, href)
                except Exception:
                    continue
            print(f"Supplemented NBA headshots via team rosters (total {len(headshots)}).")
        except Exception as err:
            print(f"ESPN team rosters fallback skipped: {err}")

    return headshots, compact


def extract_supercoach_photo(p):
    """Checks whether the SuperCoach payload already includes a direct photo/headshot URL."""
    for key in ("photo", "headshot", "avatar", "image", "image_url", "portrait_url"):
        val = p.get(key)
        if isinstance(val, str) and val.startswith("http"):
            return val
        if isinstance(val, dict):
            for sub in ("url", "href", "src"):
                sval = val.get(sub)
                if isinstance(sval, str) and sval.startswith("http"):
                    return sval
    return None


def detect_working_base_and_round():
    for base in BASE_URLS:
        try:
            print(f"Checking SuperCoach settings: {base}/settings?min=false")
            settings = fetch_json(f"{base}/settings?min=false")
            comp = settings.get("competition") or settings
            curr_round = comp.get("current_round") or settings.get("current_round") or settings.get("round")
            next_round = comp.get("next_round") or settings.get("next_round")
            is_lockout = bool(comp.get("is_lockout", False))
            is_partial = bool(comp.get("is_partial_lockout", False))

            if curr_round:
                curr_round = int(curr_round)
                next_round = int(next_round) if next_round else curr_round

                # Only roll over to next_round when the ENTIRE round has finished
                if not is_lockout and not is_partial and next_round > curr_round:
                    target_round = next_round
                    print(
                        f"Connected! Round {curr_round} fully concluded "
                        f"(is_lockout=False, is_partial_lockout=False). Targeting Round {target_round}."
                    )
                else:
                    target_round = curr_round
                    print(
                        f"Connected! Round {curr_round} still in progress "
                        f"(is_lockout={is_lockout}, is_partial_lockout={is_partial}). Staying on Round {target_round}."
                    )
                return base, target_round

            print(f"Connected to {base} (no round field in settings)")
            return base, None
        except Exception as err:
            print(f"  -> {base} failed: {err}")
    return None, None


def fetch_round_scores(base_url, round_num, cache):
    """Returns { player_id: points } for a specific completed round (cached)."""
    if not round_num or round_num < 1:
        return {}
    if round_num in cache:
        return cache[round_num]

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
        cache[round_num] = scores
        return scores
    except Exception as err:
        print(f"Could not fetch Round {round_num} scores: {err}")
        cache[round_num] = {}
        return {}


def fetch_team_game_counts(base_url, round_num, fixture_cache):
    """Counts how many NBA games each team plays in the target round (cached)."""
    if not round_num or round_num < 1:
        return {}
    if round_num in fixture_cache:
        return fixture_cache[round_num]

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
        print(f"Could not fetch Round {round_num} fixtures: {err}")
    fixture_cache[round_num] = counts
    return counts


def resolve_future_games(team, team_id, counts_map):
    """Returns team's scheduled games for a future round, or None if fixture feed is empty."""
    if not counts_map:
        return None
    if team in counts_map:
        return int(counts_map[team])
    if team_id and team_id in counts_map:
        return int(counts_map[team_id])
    return 0


def parse_player(
    p,
    existing_status_map,
    existing_photo_map,
    scores_r1,
    scores_r2,
    team_games,
    team_games_next,
    team_games_after,
    headshot_map,
    compact_headshot_map,
):
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

    proj_raw = (
        latest_stat.get("ppts1")
        or p.get("ppts1")
        or latest_stat.get("avg3")
        or latest_stat.get("avg")
        or p.get("points_average")
        or 0
    )
    proj = int(round(float(proj_raw))) if proj_raw else 0

    avg5_raw = latest_stat.get("avg5") or p.get("avg5")
    avg5 = round(float(avg5_raw), 1) if avg5_raw not in (None, "", 0) else None

    be_raw = latest_stat.get("be") or latest_stat.get("breakeven") or p.get("be")
    be = int(round(float(be_raw))) if be_raw not in (None, "") else None

    owned_raw = latest_stat.get("owned")
    if owned_raw is None:
        owned_raw = p.get("owned") or p.get("ownership") or 0
    if isinstance(owned_raw, dict):
        owned = float(owned_raw.get("percentage") or 0)
    else:
        owned = float(owned_raw or 0)

    games = team_games.get(team) or team_games.get(team_id) or int(latest_stat.get("games") or p.get("games") or 3)
    next_round_games = resolve_future_games(team, team_id, team_games_next)
    round_after_games = resolve_future_games(team, team_id, team_games_after)

    injury = p.get("injury_suspension_status") or p.get("injury") or None
    if isinstance(injury, str) and injury.strip().lower() in ("", "none", "available", "fit"):
        injury = None

    saved_status = existing_status_map.get(full_name.lower())
    status = saved_status if saved_status == "squad" else "watchlist"

    # Resolve headshot: SuperCoach direct field -> ESPN exact normalized -> ESPN compact -> cached existing
    nkey = normalize_name_key(full_name)
    ckey = normalize_compact_key(full_name)
    photo = (
        extract_supercoach_photo(p)
        or headshot_map.get(nkey)
        or compact_headshot_map.get(ckey)
        or existing_photo_map.get(pid)
        or existing_photo_map.get(full_name.lower())
        or None
    )

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
        "next_round_games": next_round_games,
        "round_after_games": round_after_games,
        "owned": round(owned, 2),
        "injury": injury,
        "photo": photo,
        "status": status,
    }


def build_round_dataset(
    base_url,
    round_num,
    existing_status_map,
    existing_photo_map,
    magic_number,
    scores_cache,
    fixture_cache,
    headshot_map,
    compact_headshot_map,
):
    players_url = f"{base_url}/players-cf?embed=notes,odds,player_stats,positions&round={round_num}"
    print(f"Fetching Round {round_num} player pool: {players_url}")
    payload = fetch_json(players_url)
    raw_list = payload if isinstance(payload, list) else payload.get("players", [])
    if not isinstance(raw_list, list) or len(raw_list) < 50:
        raise RuntimeError(f"Unexpected player count ({len(raw_list)}) for Round {round_num}")

    scores_r1 = fetch_round_scores(base_url, round_num - 1, scores_cache)
    scores_r2 = fetch_round_scores(base_url, round_num - 2, scores_cache)
    team_games = fetch_team_game_counts(base_url, round_num, fixture_cache)
    team_games_next = fetch_team_game_counts(base_url, round_num + 1, fixture_cache)
    team_games_after = fetch_team_game_counts(base_url, round_num + 2, fixture_cache)

    parsed = [
        parse_player(
            p,
            existing_status_map,
            existing_photo_map,
            scores_r1,
            scores_r2,
            team_games,
            team_games_next,
            team_games_after,
            headshot_map,
            compact_headshot_map,
        )
        for p in raw_list
    ]

    matched_photos = sum(1 for x in parsed if x.get("photo"))
    print(f"Round {round_num}: matched headshots for {matched_photos}/{len(parsed)} players.")

    # Compact team_schedule map by team abbreviation
    team_schedule = {}
    all_teams = {x["team"] for x in parsed if x.get("team")}
    for abbrev in sorted(all_teams):
        team_schedule[abbrev] = {
            str(round_num): team_games.get(abbrev),
            str(round_num + 1): team_games_next.get(abbrev) if team_games_next else None,
            str(round_num + 2): team_games_after.get(abbrev) if team_games_after else None,
        }

    return {
        "round": int(round_num),
        "magicNumber": magic_number,
        "totalPlayersScraped": len(parsed),
        "lastUpdated": datetime.now(timezone.utc).isoformat(),
        "team_schedule": team_schedule,
        "players": parsed,
    }


def main():
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            existing_data = json.load(f)
    else:
        existing_data = {"round": 5, "magicNumber": DEFAULT_MAGIC_NUMBER, "players": []}

    magic_number = existing_data.get("magicNumber", DEFAULT_MAGIC_NUMBER)
    existing_status_map = {
        p.get("name", "").lower(): str(p.get("status", "")).lower()
        for p in existing_data.get("players", [])
    }
    existing_photo_map = {}
    for p in existing_data.get("players", []):
        if p.get("photo"):
            if p.get("id"):
                existing_photo_map[str(p["id"])] = p["photo"]
            if p.get("name"):
                existing_photo_map[p["name"].lower()] = p["photo"]

    base_url, active_round = detect_working_base_and_round()
    if not base_url:
        print("ERROR: Could not connect to any SuperCoach API endpoint. Leaving existing JSON untouched.")
        sys.exit(1)

    existing_round = int(existing_data.get("round") or 0)
    max_history_round = 0
    if os.path.isdir(HISTORY_DIR):
        for fname in os.listdir(HISTORY_DIR):
            if fname.startswith("round_") and fname.endswith(".json"):
                try:
                    max_history_round = max(max_history_round, int(fname.replace("round_", "").replace(".json", "")))
                except ValueError:
                    pass

    floor_round = max(existing_round, max_history_round)
    detected_round = active_round or existing_round or 5
    if detected_round < floor_round:
        print(
            f"Monotonic guard: API reported Round {detected_round}, but Round {floor_round} is already active/saved. "
            f"Keeping target_round = {floor_round} so live data never reverts backwards."
        )
        target_round = floor_round
    else:
        target_round = detected_round

    scores_cache = {}
    fixture_cache = {}
    headshot_map, compact_headshot_map = fetch_headshot_map()

    # 1. Build live target round dataset
    try:
        live_data = build_round_dataset(
            base_url,
            target_round,
            existing_status_map,
            existing_photo_map,
            magic_number,
            scores_cache,
            fixture_cache,
            headshot_map,
            compact_headshot_map,
        )
    except Exception as err:
        print(f"ERROR: {err}. Aborting without modifying JSON.")
        sys.exit(1)

    # 2. Save historical snapshot for current round + backfill any missing past rounds
    os.makedirs(HISTORY_DIR, exist_ok=True)
    current_snap_path = os.path.join(HISTORY_DIR, f"round_{target_round}.json")
    with open(current_snap_path, "w", encoding="utf-8") as f:
        json.dump(live_data, f, indent=2)

    for past_r in range(1, target_round):
        snap_path = os.path.join(HISTORY_DIR, f"round_{past_r}.json")
        if not os.path.exists(snap_path):
            try:
                print(f"Backfilling missing historical snapshot for Round {past_r}...")
                past_data = build_round_dataset(
                    base_url,
                    past_r,
                    existing_status_map,
                    existing_photo_map,
                    magic_number,
                    scores_cache,
                    fixture_cache,
                    headshot_map,
                    compact_headshot_map,
                )
                with open(snap_path, "w", encoding="utf-8") as f:
                    json.dump(past_data, f, indent=2)
            except Exception as err:
                print(f"  -> Skipped backfill for Round {past_r}: {err}")

    # Collect all available snapshot rounds
    available_rounds = []
    for fname in os.listdir(HISTORY_DIR):
        if fname.startswith("round_") and fname.endswith(".json"):
            try:
                r_num = int(fname.replace("round_", "").replace(".json", ""))
                available_rounds.append(r_num)
            except ValueError:
                pass
    if target_round not in available_rounds:
        available_rounds.append(target_round)
    available_rounds.sort()

    live_data["availableRounds"] = available_rounds

    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(live_data, f, indent=2)

    print(
        f"SUCCESS: Saved {len(live_data['players'])} live NBA SuperCoach players for Round {target_round}. "
        f"Snapshots available: {available_rounds}"
    )


if __name__ == "__main__":
    main()
