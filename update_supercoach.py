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

# Price model, fitted to 1,231 real SuperCoach NBA price changes (Rounds 3-5, 2026-27):
#   avg       = points per game over this round + last round (pooled: total points / total games)
#   new price = price + PER_GAME_RATE * games_played_this_round * (MAGIC_NUMBER * avg - price)
# Players with 0 games in a round do not change price. Median error ~$50k, direction right 95%.
DEFAULT_MAGIC_NUMBER = 712000
PER_GAME_RATE = 0.0415
PRICE_MODEL = {
    "magic": DEFAULT_MAGIC_NUMBER,
    "perGameRate": PER_GAME_RATE,
    "windowRounds": 2,
    "calibratedOn": "2026-27 Rounds 3-5 (1,231 price changes)",
}

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

# SuperCoach's NBA feed has injury fields but leaves them empty, so injuries come from ESPN.
ESPN_INJURIES_URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries"


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


def fetch_injury_map():
    """
    Builds { normalized_name: injury_dict } from ESPN's public NBA injury report.
    Also returns a compact-key map. Never raises: returns empty maps if ESPN is unreachable.
    """
    injuries, compact = {}, {}
    try:
        payload = fetch_json(
            ESPN_INJURIES_URL,
            extra_headers={"Origin": "https://www.espn.com", "Referer": "https://www.espn.com/"},
            timeout=20,
        )
        for team_block in payload.get("injuries") or []:
            for item in team_block.get("injuries") or []:
                ath = item.get("athlete") or {}
                name = ath.get("displayName") or f"{ath.get('firstName', '')} {ath.get('lastName', '')}".strip()
                status = str(item.get("status") or "").strip()
                if not name or not status or status.lower() in HEALTHY_VALUES:
                    continue
                details = item.get("details") or {}
                entry = {
                    "status": status,
                    "type": details.get("type") or None,
                    "detail": item.get("shortComment") or None,
                    "return_date": details.get("returnDate") or None,
                    "updated": item.get("date") or None,
                }
                k, ck = normalize_name_key(name), normalize_compact_key(name)
                injuries.setdefault(k, entry)
                compact.setdefault(ck, entry)
        print(f"Loaded {len(injuries)} injury reports from ESPN.")
    except Exception as err:
        print(f"ESPN injury report fetch note: {err}")
    return injuries, compact


def short_injury_label(entry):
    """'Out · Hip' / 'Day-To-Day · Ankle' style label for the site's injury text."""
    if not entry:
        return None
    return " · ".join(x for x in (entry.get("status"), entry.get("type")) if x)


BE_KEYS = ("be", "breakeven", "break_even", "breakEven", "be_next", "nbe")
INJURY_KEYS = (
    "injury_suspension_status_text",
    "injury_suspension_status",
    "injury_status",
    "injury",
    "injury_text",
    "suspension",
)
HEALTHY_VALUES = ("", "none", "null", "available", "fit", "healthy", "active", "ok", "false", "0")


def is_blank(val):
    return val is None or (isinstance(val, str) and val.strip() == "") or val == [] or val == {}


def first_present(sources, keys):
    """Returns the first non-blank value for any of `keys` across the dicts in `sources`."""
    for src in sources:
        if not isinstance(src, dict):
            continue
        for key in keys:
            val = src.get(key)
            if not is_blank(val):
                return val
    return None


def describe_injury_value(val):
    """Flattens an injury field (string, dict or list) into a short readable label, or None if healthy."""
    if is_blank(val) or val is False:
        return None
    if isinstance(val, dict):
        val = first_present([val], ("text", "status_text", "description", "status", "type", "name"))
        return describe_injury_value(val)
    if isinstance(val, list):
        parts = [describe_injury_value(v) for v in val]
        parts = [x for x in parts if x]
        return "; ".join(parts) if parts else None
    text = str(val).strip()
    return None if text.lower() in HEALTHY_VALUES else text


def extract_injury(p):
    """Reads injury/suspension status from the player object, falling back to injury-flagged notes."""
    label = describe_injury_value(first_present([p], INJURY_KEYS))
    if label:
        return label
    notes = p.get("notes")
    if isinstance(notes, dict):
        notes = [notes]
    if isinstance(notes, list):
        for note in notes:
            if not isinstance(note, dict):
                continue
            kind = str(note.get("type") or note.get("category") or "").lower()
            if "injur" in kind or "suspen" in kind:
                text = first_present([note], ("text", "note", "body", "description", "title"))
                label = describe_injury_value(text) or kind.title()
                if label:
                    return label
    return None


def summarize_keys(objs, max_examples=4):
    """Key inventory for a list of dicts: how often each key is filled, its types and a few example values."""
    inv = {}
    for obj in objs:
        if not isinstance(obj, dict):
            continue
        for k, v in obj.items():
            e = inv.setdefault(k, {"present": 0, "non_blank": 0, "types": set(), "examples": []})
            e["present"] += 1
            e["types"].add(type(v).__name__)
            if not is_blank(v):
                e["non_blank"] += 1
                ex = v if isinstance(v, (int, float, bool)) else json.dumps(v, default=str)[:160]
                if ex not in e["examples"] and len(e["examples"]) < max_examples:
                    e["examples"].append(ex)
    for e in inv.values():
        e["types"] = sorted(e["types"])
    return dict(sorted(inv.items()))


def inspect_feed(base_url, round_num, out_path="debug/feed_inspection.json"):
    """
    Diagnostic mode (--inspect): records which fields the live SuperCoach feed actually sends,
    so breakeven/injury/price field names can be mapped exactly. Never touches the live data files.
    """
    settings = fetch_json(f"{base_url}/settings?min=false")
    comp = settings.get("competition") if isinstance(settings.get("competition"), dict) else {}
    payload = fetch_json(f"{base_url}/players-cf?embed=notes,odds,player_stats,positions&round={round_num}")
    players = payload if isinstance(payload, list) else payload.get("players", [])

    all_stats = [s for p in players for s in (p.get("player_stats") or []) if isinstance(s, dict)]
    all_notes = []
    for p in players:
        n = p.get("notes")
        all_notes.extend(n if isinstance(n, list) else [n] if isinstance(n, dict) else [])

    def scalars(d):
        return {k: v for k, v in d.items() if isinstance(v, (str, int, float, bool)) or v is None}

    interesting = re.compile(r"(^be$|break|inj|susp|status|note|price|avg|ppts|proj|owned|active|out)", re.I)
    top_inv = summarize_keys(players)
    stat_inv = summarize_keys(all_stats)

    by_price = sorted(players, key=lambda p: float(p.get("price") or 0), reverse=True)
    flagged = [p for p in players if any(not is_blank(p.get(k)) for k in INJURY_KEYS) or p.get("notes")]
    samples = by_price[:2] + flagged[:3]

    report = {
        "generated": datetime.now(timezone.utc).isoformat(),
        "base_url": base_url,
        "round": round_num,
        "player_count": len(players),
        "settings_top_level": scalars(settings),
        "settings_competition": scalars(comp),
        "player_stats_rows_per_player": sorted({len(p.get("player_stats") or []) for p in players}),
        "player_stats_rounds_seen": sorted({s.get("round") for s in all_stats if s.get("round") is not None}),
        "interesting_player_keys": {k: v for k, v in top_inv.items() if interesting.search(k)},
        "interesting_stat_keys": {k: v for k, v in stat_inv.items() if interesting.search(k)},
        "player_keys": top_inv,
        "player_stats_keys": stat_inv,
        "notes_keys": summarize_keys(all_notes),
        "players_with_injury_or_notes": len(flagged),
        "sample_players": samples,
    }
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, default=str)

    print(f"Inspection saved to {out_path} ({len(players)} players, {len(all_stats)} stat rows).")
    print("Player keys:", ", ".join(top_inv))
    print("Stat keys:", ", ".join(stat_inv))
    print("Notes keys:", ", ".join(report["notes_keys"]))
    print(f"Players with injury fields or notes: {len(flagged)}")


PRICE_HISTORY_FIELDS = (
    "price", "price_change", "total_price_change", "points", "games", "total_points",
    "total_games", "avg", "avg3", "avg5", "ppts", "ppts1", "updated_at",
)


def collect_price_history(base_url, max_round, out_path="debug/price_history.json"):
    """
    Calibration data (--inspect): every player's price, price change, score and games for each
    round 1..max_round+1, as compact rows. Used to fit the real price formula / magic number.
    """
    report = {"generated": datetime.now(timezone.utc).isoformat(), "fields": ["id", *PRICE_HISTORY_FIELDS], "rounds": {}}
    for r in range(1, max_round + 3):
        try:
            payload = fetch_json(f"{base_url}/players-cf?embed=player_stats&round={r}")
        except Exception as err:
            print(f"  price history round {r}: {err}")
            continue
        players = payload if isinstance(payload, list) else payload.get("players", [])
        rows = []
        for p in players:
            stats = [s for s in (p.get("player_stats") or []) if isinstance(s, dict)]
            row_stat = next((s for s in stats if s.get("round") == r), None)
            if row_stat is None and len(stats) == 1:
                row_stat = stats[0]
            if row_stat is None:
                continue
            rows.append([str(p.get("id", "")), *[row_stat.get(f) for f in PRICE_HISTORY_FIELDS]])
        stat_rounds = sorted({s.get("round") for p in players for s in (p.get("player_stats") or []) if isinstance(s, dict)})
        report["rounds"][str(r)] = {"stat_rounds_returned": stat_rounds, "rows": rows}
        print(f"  price history round {r}: {len(rows)} rows (stat rounds returned: {stat_rounds})")
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(report, f, separators=(",", ":"), default=str)
    print(f"Price history saved to {out_path}.")


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


def next_round_rows_exist(base, round_num):
    """True when most players already have a player_stats row for `round_num` (its prices are set)."""
    try:
        payload = fetch_json(f"{base}/players-cf?embed=player_stats&round={round_num}")
        players = payload if isinstance(payload, list) else payload.get("players", [])
        with_row = sum(
            1 for p in players
            if any(isinstance(s, dict) and s.get("round") == round_num for s in (p.get("player_stats") or []))
        )
        return len(players) >= 50 and with_row >= 0.5 * len(players)
    except Exception as err:
        print(f"  -> Could not probe Round {round_num} rows: {err}")
        return False


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
                elif next_round > curr_round and next_round_rows_exist(base, next_round):
                    # SuperCoach's settings flag lags (it still said Round 5 on Tue 24 Nov 2026), but the
                    # next round's price rows are created as soon as the previous round's prices are final.
                    target_round = next_round
                    print(
                        f"Connected! Settings still say Round {curr_round}, but Round {next_round} price rows "
                        f"already exist, so Round {curr_round} is final. Targeting Round {target_round}."
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
    """Returns { player_id: {"points": int, "games": int} } for a specific completed round (cached)."""
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
            pts, gms = 0, 0
            for s in stats:
                if s.get("round") == round_num or len(stats) == 1:
                    pts = int(s.get("points") or 0)
                    gms = int(s.get("games") or 0)
                    break
            scores[pid] = {"points": pts, "games": gms}
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
    injury_map=None,
    compact_injury_map=None,
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

    # Exact past 2 round scores (round totals) and games played in those rounds
    prev1 = scores_r1.get(pid)
    prev2 = scores_r2.get(pid)
    r_minus_1 = prev1["points"] if prev1 else None
    r_minus_2 = prev2["points"] if prev2 else None
    r_minus_1_games = prev1["games"] if prev1 else None
    r_minus_2_games = prev2["games"] if prev2 else None

    if r_minus_1 is None or r_minus_2 is None:
        # Only rounds BEFORE this one (the last row is this round itself)
        completed = [s for s in stats[:-1] if s.get("points") is not None]
        if r_minus_1 is None:
            r_minus_1 = int(completed[-1].get("points") or 0) if len(completed) >= 1 else 0
        if r_minus_2 is None:
            r_minus_2 = int(completed[-2].get("points") or 0) if len(completed) >= 2 else 0

    # A round's stat row holds the price AFTER that round's change (price_change is caused by that
    # round's own games). The price during the round is therefore price - price_change. For the live
    # round before any games this is the same number (price_change is 0).
    row_price = int(latest_stat.get("price") or p.get("price") or 3800000)
    row_change = int(latest_stat.get("price_change") or 0)
    price = row_price - row_change
    games_played = int(latest_stat.get("games") or 0)
    actual_points = int(latest_stat.get("points") or 0)

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

    # Official breakeven: check the stat rows newest-first, then the player object itself.
    # 0 is a valid breakeven, so test for presence rather than truthiness.
    be_raw = first_present([*reversed(stats), p], BE_KEYS)
    try:
        be = int(round(float(be_raw))) if be_raw is not None else None
    except (TypeError, ValueError):
        be = None

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

    # Injury: ESPN report first (SuperCoach leaves its own fields empty), SuperCoach fields as fallback
    inj_entry = (injury_map or {}).get(normalize_name_key(full_name)) or (compact_injury_map or {}).get(
        normalize_compact_key(full_name)
    )
    injury = short_injury_label(inj_entry) or extract_injury(p)

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
        "r_minus_2_games": r_minus_2_games,
        "r_minus_1_games": r_minus_1_games,
        "proj": proj,
        "avg5": avg5,
        "be": be,
        "games": int(games),
        # What actually happened in this round (0 until games are played; final for past rounds)
        "games_played": games_played,
        "actual_points": actual_points,
        "actual_price_change": row_change,
        "price_after": row_price,
        "next_round_games": next_round_games,
        "round_after_games": round_after_games,
        "owned": round(owned, 2),
        "injury": injury,
        "injury_status": (inj_entry or {}).get("status") or (injury and "Injured") or None,
        "injury_detail": (inj_entry or {}).get("detail"),
        "injury_return": (inj_entry or {}).get("return_date"),
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
    injury_map=None,
    compact_injury_map=None,
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
            injury_map,
            compact_injury_map,
        )
        for p in raw_list
    ]

    matched_photos = sum(1 for x in parsed if x.get("photo"))
    print(f"Round {round_num}: matched headshots for {matched_photos}/{len(parsed)} players.")
    if injury_map:
        matched_inj = sum(1 for x in parsed if x.get("injury"))
        print(f"Round {round_num}: matched injuries for {matched_inj}/{len(injury_map)} ESPN reports.")

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
        "priceModel": PRICE_MODEL,
        "totalPlayersScraped": len(parsed),
        "lastUpdated": datetime.now(timezone.utc).isoformat(),
        "injurySource": "ESPN" if injury_map else None,
        "team_schedule": team_schedule,
        "players": parsed,
    }


def main():
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            existing_data = json.load(f)
    else:
        existing_data = {"round": 5, "magicNumber": DEFAULT_MAGIC_NUMBER, "players": []}

    # The old 0.75/0.25 model stored a magic number around 178k; the per-game model's is ~712k
    magic_number = DEFAULT_MAGIC_NUMBER
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

    if "--inspect" in sys.argv:
        inspect_round = active_round or int(existing_data.get("round") or 1)
        inspect_feed(base_url, inspect_round)
        collect_price_history(base_url, inspect_round)
        return

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
    # Injuries are a live report, so they only go on the live round (not on backfilled history)
    injury_map, compact_injury_map = fetch_injury_map()

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
            injury_map,
            compact_injury_map,
        )
    except Exception as err:
        print(f"ERROR: {err}. Aborting without modifying JSON.")
        sys.exit(1)

    # 2. Save historical snapshot for current round + backfill any missing past rounds
    os.makedirs(HISTORY_DIR, exist_ok=True)
    current_snap_path = os.path.join(HISTORY_DIR, f"round_{target_round}.json")
    with open(current_snap_path, "w", encoding="utf-8") as f:
        json.dump(live_data, f, indent=2)

    # Past snapshots: build missing ones, always refresh the round that just finished (so it gets its
    # final scores and price change), and rebuild everything with --rebuild-history.
    rebuild_all = "--rebuild-history" in sys.argv
    for past_r in range(1, target_round):
        snap_path = os.path.join(HISTORY_DIR, f"round_{past_r}.json")
        if rebuild_all or past_r == target_round - 1 or not os.path.exists(snap_path):
            try:
                print(f"Building historical snapshot for Round {past_r}...")
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
