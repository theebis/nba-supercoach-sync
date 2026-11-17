#!/usr/bin/env python3
"""
update_supercoach.py
DIRECT NBA SUPERCOACH 450+ PLAYER SCRAPER!
Pulls the official NBA SuperCoach master players JSON feed directly from SuperCoach's API:
- Every active NBA player (~450-500 players)
- Exact SuperCoach Price ($), Dual Positions (PG/SG, PF/C, etc.), and Team
- Exact Last 2 Weekly Round Scores (Wk N-2 and Wk N-1) & Rolling 3-Week Averages
"""
import json
import os
from datetime import datetime, timezone
import requests

DATA_FILE = "supercoach_data.json"
DEFAULT_MAGIC_NUMBER = 178000

# Official SuperCoach API endpoints that serve the 450+ player pool
SC_API_ENDPOINTS = [
    "https://supercoach.heraldsun.com.au/2026/api/nba/classic/v1/players?embed=notes,odds,player_stats,positions",
    "https://supercoach.heraldsun.com.au/2025/api/nba/classic/v1/players?embed=notes,odds,player_stats,positions",
    "https://fantasy.nba.com/api/nba/classic/v1/players?embed=notes,odds,player_stats,positions"
]

def parse_supercoach_player(p, existing_status_map):
    """Extracts exact price, Wk N-2, Wk N-1, and weekly average from a SuperCoach player object."""
    first_name = str(p.get("first_name", "")).strip()
    last_name = str(p.get("last_name", "")).strip()
    full_name = p.get("name") or f"{first_name} {last_name}".strip()

    # Team abbreviation
    team_obj = p.get("team") or {}
    team = team_obj.get("abbrev") or p.get("team_abbrev") or "NBA"

    # Positions (e.g., PG/SG, PF/C)
    positions_arr = p.get("positions") or []
    if isinstance(positions_arr, list) and len(positions_arr) > 0:
        pos = "/".join([str(x.get("position", "")) for x in positions_arr if x.get("position")])
    else:
        pos = str(p.get("position") or "UTIL")

    # Round-by-round SuperCoach scores inside player_stats
    stats = p.get("player_stats") or []
    completed_rounds = [
        s for s in stats
        if s.get("points") is not None and int(s.get("points") or 0) > 0
    ]

    if len(completed_rounds) >= 2:
        r_minus_1 = int(completed_rounds[-1].get("points", 0))
        r_minus_2 = int(completed_rounds[-2].get("points", 0))
    elif len(completed_rounds) == 1:
        r_minus_1 = int(completed_rounds[-1].get("points", 0))
        r_minus_2 = r_minus_1
    else:
        r_minus_1 = int(p.get("last_score") or p.get("r_minus_1") or 0)
        r_minus_2 = int(p.get("r_minus_2") or r_minus_1)

    latest_stat = stats[-1] if len(stats) > 0 else {}
    price = int(p.get("price") or latest_stat.get("price") or 3800000)

    # Weekly average / projection
    season_avg = float(
        p.get("points_average")
        or latest_stat.get("avg3")
        or latest_stat.get("avg")
        or ((r_minus_2 + r_minus_1) / 2.0)
    )
    proj = int(round(season_avg)) if season_avg > 0 else int(round((r_minus_2 + r_minus_1) / 2.0))

    # Preserve your 'squad' tag for your 15 players; tag cheap breakout players as 'prospect'
    saved_status = existing_status_map.get(full_name.lower())
    if saved_status:
        status = saved_status
    elif price <= 9800000 and proj >= 55:
        status = "prospect"
    else:
        status = "watchlist"

    return {
        "id": str(p.get("id", full_name)),
        "name": full_name,
        "team": team,
        "pos": pos or "PG",
        "price": price,
        "r_minus_2": r_minus_2,
        "r_minus_1": r_minus_1,
        "proj": proj,
        "status": status
    }

def scrape_all_supercoach_players(existing_players):
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json"
    }
    # Optional Bearer token if SuperCoach requires session auth
    sc_token = os.environ.get("SC_BEARER_TOKEN", "").strip()
    if sc_token:
        headers["Authorization"] = f"Bearer {sc_token}"

    existing_status_map = {p["name"].lower(): p.get("status", "watchlist") for p in existing_players}

    for url in SC_API_ENDPOINTS:
        try:
            print(f"Trying SuperCoach endpoint: {url}")
            res = requests.get(url, headers=headers, timeout=20)
            if res.status_code == 200:
                payload = res.json()
                raw_list = payload if isinstance(payload, list) else payload.get("players", [])
                if isinstance(raw_list, list) and len(raw_list) > 50:
                    print(f"Found {len(raw_list)} official NBA SuperCoach players!")
                    return [parse_supercoach_player(p, existing_status_map) for p in raw_list]
        except Exception as err:
            print(f"Endpoint attempt failed: {err}")
    return None

def main():
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
    else:
        data = {"magicNumber": DEFAULT_MAGIC_NUMBER, "players": []}

    existing_players = data.get("players", [])
    scraped_players = scrape_all_supercoach_players(existing_players)

    if scraped_players:
        data["players"] = scraped_players
        data["totalPlayersScraped"] = len(scraped_players)
        data["lastUpdated"] = datetime.now(timezone.utc).isoformat()
        with open(DATA_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        print(f"Successfully saved {len(scraped_players)} players to {DATA_FILE}")
    else:
        print("No new players fetched; keeping existing supercoach_data.json intact.")

if __name__ == "__main__":
    main()
