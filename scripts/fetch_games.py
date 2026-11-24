#!/usr/bin/env python3
"""
Game-by-game data for projection v3: every finished NBA game's box score from ESPN's public API.
Saves data/games.json: one compact row per player per game, plus the schedule (for back-to-backs).
Cached: games already saved are never re-downloaded. Polite: one request at a time with a short pause.

Run: python scripts/fetch_games.py [YYYYMMDD start]   (default: season start)
"""
import json
import os
import sys
import time
from datetime import date, datetime, timedelta, timezone

from curl_cffi import requests

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "games.json")
SEASON_START = date(2026, 10, 15)
SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates={d}&limit=50"
SUMMARY = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event={e}"
HDRS = {"Accept": "application/json", "Referer": "https://www.espn.com/", "Origin": "https://www.espn.com"}


def get(url):
    for attempt in range(3):
        try:
            r = requests.get(url, headers=HDRS, impersonate="chrome", timeout=20)
            if r.status_code == 200:
                return r.json()
        except Exception:
            pass
        time.sleep(1.5 * (attempt + 1))
    return None


def made_att(s):
    try:
        m, a = s.split("-")
        return int(m), int(a)
    except Exception:
        return 0, 0


def parse_box(summary, event_id, tip_utc):
    rows = []
    box = (summary or {}).get("boxscore", {})
    for team in box.get("players", []):
        abbrev = (team.get("team") or {}).get("abbreviation")
        for grp in team.get("statistics", []):
            labels = [l.upper() for l in grp.get("labels") or grp.get("names") or []]
            for a in grp.get("athletes", []):
                ath = a.get("athlete") or {}
                stats = a.get("stats") or []
                rec = dict(zip(labels, stats))
                dnp = bool(a.get("didNotPlay")) or not stats
                fgm, fga = made_att(rec.get("FG", "0-0"))
                ftm, fta = made_att(rec.get("FT", "0-0"))
                tpm, _ = made_att(rec.get("3PT", "0-0"))
                num = lambda k: int(float(rec.get(k) or 0)) if str(rec.get(k, "")).replace(".", "", 1).lstrip("-").isdigit() else 0
                rows.append({
                    "e": event_id, "t": tip_utc, "team": abbrev, "id": ath.get("id"), "name": ath.get("displayName"),
                    "start": bool(a.get("starter")), "dnp": dnp, "reason": a.get("reason") or "",
                    "min": num("MIN"), "pts": num("PTS"), "reb": num("REB"), "ast": num("AST"), "stl": num("STL"),
                    "blk": num("BLK"), "to": num("TO"), "fgm": fgm, "fga": fga, "ftm": ftm, "fta": fta, "tpm": tpm,
                })
    return rows


def main():
    start = datetime.strptime(sys.argv[1], "%Y%m%d").date() if len(sys.argv) > 1 else SEASON_START
    data = {"games": {}, "rows": []}
    if os.path.exists(OUT):
        with open(OUT, encoding="utf-8") as f:
            data = json.load(f)
    have = set(data["games"])
    today = datetime.now(timezone.utc).date()
    d = start
    new = 0
    while d <= today:
        sb = get(SCOREBOARD.format(d=d.strftime("%Y%m%d")))
        for ev in (sb or {}).get("events", []):
            eid = ev.get("id")
            done = ((ev.get("status") or {}).get("type") or {}).get("completed")
            comp = (ev.get("competitions") or [{}])[0]
            teams = [c.get("team", {}).get("abbreviation") for c in comp.get("competitors", [])]
            if not eid or not done or eid in have:
                continue
            summ = get(SUMMARY.format(e=eid))
            rows = parse_box(summ, eid, ev.get("date"))
            if rows:
                data["games"][eid] = {"t": ev.get("date"), "teams": teams}
                data["rows"].extend(rows)
                have.add(eid)
                new += 1
            time.sleep(0.25)
        d += timedelta(days=1)
        time.sleep(0.2)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, separators=(",", ":"))
    print(f"Saved {len(data['games'])} games ({new} new), {len(data['rows'])} player-game rows -> {OUT}")


if __name__ == "__main__":
    main()
