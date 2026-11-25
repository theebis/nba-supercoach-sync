"""Safety net: fail loudly (so GitHub emails the owner) if a round has clearly finished but the site
is still on it. A round is "clearly finished" 30 hours after its last game tipped off, by which point
the Monday rollover syncs (3-11 PM AEDT) and the 2 AM Tuesday sync have all had their chance.
Runs after the data is committed, so a failure here never blocks fresh data."""
import json
import os
import sys
from datetime import datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GRACE = timedelta(hours=30)


def main():
    with open(os.path.join(ROOT, "supercoach_data.json"), encoding="utf-8") as f:
        data = json.load(f)
    rnd = int(data.get("round") or 0)
    games = (data.get("fixtures") or {}).get(str(rnd)) or []
    if not games:
        print(f"Rollover check: no fixture list for Round {rnd}, nothing to check.")
        return 0
    last_tip = max(datetime.fromisoformat(g["t"].replace("Z", "+00:00")) for g in games)
    now = datetime.now(timezone.utc)
    if now > last_tip + GRACE:
        print(f"ROLLOVER PROBLEM: Round {rnd}'s last game tipped off at {last_tip:%a %d %b %H:%M} UTC, "
              f"more than {int(GRACE.total_seconds() // 3600)} hours ago, but the site is still on Round {rnd}. "
              "The next round's data hasn't been picked up. Check SuperCoach's settings feed and update_supercoach.py.")
        return 1
    left = last_tip + GRACE - now
    print(f"Rollover check OK: Round {rnd} (last tip-off {last_tip:%a %d %b %H:%M} UTC; alarm in {left.days}d {left.seconds // 3600}h if it hasn't moved on).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
