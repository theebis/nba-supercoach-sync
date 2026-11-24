# SCHOOPS roadmap

Goal: pilot now, then the go-to hub for NBA SuperCoach. Anyone can use it with no setup; numbers are trusted because accuracy is measured and published (privately first).

## Agreed principles (from the requirements interviews)
- No accounts yet; everything per-browser. Squad import must be instant (screenshot or type-ahead), no extensions.
- Confidence over noise: show likely ranges when they're tight enough to help; only call a trade "Strong" when it beats typical error.
- Our numbers are measured every round in a private accuracy report (private repo `theebis/schoops-private`) until the owner chooses to publish.
- Injury/news refresh: 8 times a day around NBA tip-offs.

## Done
- Fitted price/breakeven model (median miss ~$50K, direction ~95%); round snapshots fixed and chained.
- ESPN injuries; Round briefing panel; Form & price column; fluid layout for any screen width.
- Squad import: screenshot OCR in the browser, type-ahead search with a 15-slot tray, paste-a-list.
- SCHOOPS projection model v2 (form + price + SC blend × expected games, injury-aware, refits each round). Honest test: beats SuperCoach every round (mean miss ~11 vs ~19 pts across all scheduled players; 15 vs 19 median for regulars who played).
- Trade advisor (1–2 trades, points / balanced / cash, chance-it-helps).
- Private accuracy report, workflow tests, data checks, UI/OCR checks.
- Hover tooltips (form bars, price dots, projection likely range).
- Captain picks on the front page (top 3 C/VC, one-line reason, chance of top score, "Use C & VC"). Shipped 25 Nov 2026, with a fix for squashed Market columns on phones.

## Agreed next (round 3 answers, 25 Nov 2026)
2. **Projection v3: use every available source to raise confidence.** Status:
   - Done: all box scores via ESPN (`scripts/fetch_games.py` -> `data/games.json`); SuperCoach scoring verified:
     PTS + REB + AST + 2*STL + 2*BLK - TO - missed FG - missed FT (exact 96%, within 3 pts 100% vs SC round totals).
   - Tested honestly (`projection_v3.py`): minutes-based model 13.9 mean miss (worse than v2's 11.4); v2 + minutes trend +
     back-to-backs 11.4 (no gain). Not shipped. Re-test as rounds accumulate.
   - Next sources to try: in-round live projections (actual so far + remaining games), teammate-out minutes redistribution,
     ESPN fantasy projections, betting player props (check free availability first).
3. **Multi-round trade planner** (next 3 rounds, NBA Cup R7-8 game counts, "sell before he peaks").
4. **Share my squad** link + QR, installable phone app (PWA).
6. **Public launch prep**: Beta label + feedback button, share with a small group after one more round of private accuracy.

## Round 4 answers (25 Nov 2026)
Facts from the owner:
- You can't change captain once his game has started, so no "captain loophole" helper.
- Trading only opens between rounds (Monday afternoon to Tuesday morning AEDT); no trades during the week.
- SuperCoach's own site lags well behind real time. Reference sites: supercoachinsight.com.au NBA match centre (live SC per game) and footypig.com live scores (AFL, compact two-column team lists). Build a hybrid with its own look, not a copy.

Agreed, in order:
1. **Live round tracker**: shipped 25 Nov 2026 (`live.js`). Free: ESPN public box scores read in the browser, scored with our verified formula (matched SuperCoach exactly for 8/8 players tested); round games from SuperCoach's fixture list (saved by the scraper). Finished games switch to SuperCoach's official scores once our data sync has them. Your team's live total (best 9 + captain x2), per-player live score and games left, game cards, per-game player lists, top scorers.
2. **Round recap** after each round (captain choice gain/loss, best trade you didn't make, value change).
3. **Trade-advice scorecard** (private repo only): how often the advisor's suggested trades actually gained points/cash.
4. **Rival compare**: paste a friend's squad, see differences and who's ahead.
5. **Schedule planner**: games per day for your 15 over the next 3 rounds.
6. **UI**: bigger player photos, lockout countdown in the header, light mode option.
7. **Price-rise alarm** and **Who's hot**: wanted, but the home page is full. Plan: show them during the trade window (Mon–Tue), inside Trade Lab / the briefing, not as new home-page blocks.
8. Undecided: "changed since your last visit" dots (owner unsure of value).

## Round 5 answers (25 Nov 2026), preview on branch `preview/round5`
Built:
- Live: SC play-by-play feed per game (every play that moved a score, by quarter, "My players" filter, photos), full box scores (SC, MIN, PTS, REB, AST, STL, BLK, TO, FG, FT). Play scoring verified: 227/227 players match the box score (heaves don't count as missed shots; travelling is a turnover). Game centre beside My team on wide screens.
- Player profile: the score slider is gone; "Round N live" shows score so far, projected finish, vs BE, est. cash and new price from live scores.
- My Court renamed **My Squad**; the sidebar filter formerly "My Squad" is now **My Players**. New **Injured** view (all injured players; briefing links "See all").
- Bigger Market stat tiles (clickable); My Squad header with projected cash gen, captain, games, not-counted, squad value.
- Trade Lab: lockout countdown banner (trades open/closed, next lockout from the fixture list). Advisor: 1-4 trades, "+ Add" per swap to mix suggestions into the current plan, "Add to Plan X" / "Start a new plan with this", card layout, 4-trade search 0.8 s (was 15 s).
- Every plain hover is now the styled info box; the games boxes show one clean per-round box; advisor chance box explains the numbers.
- Likely range widened from middle 50% to middle 80% (held the real score 87% of the time on rounds it wasn't built from). Wording: "In testing, N% of real scores landed inside this range." Trade/captain maths read the range level from the data.
- Past snapshots carry form + price history; Round 1 shows "first round" + its price move.
- Round rollover: hourly syncs Monday 3-11 PM AEDT. Not yet proven on a live Monday; check Mon 30 Nov evening that Round 7 + Round 6 snapshot appeared.
- "How it works" text checked against the real screens for Market, My Squad, Trade Lab, Live.
- Shipped 25 Nov 2026 (with the command menu removed at the owner's request).

## Round 6 answers (25 Nov 2026)
- Remove the Cmd/Ctrl+K command menu entirely (done, shipped).
- No phone push notifications yet. Instead **in-app notifications** (`notify.js`, preview on `preview/notifications`): a bell (sidebar top; header on phones) with unread count and a panel.
  - Since your last visit: injury changes for squad + watchlist, big projection moves (same round, >= max(10, 20%)), new round started with squad value.
  - Live while the site is open: squad player "on fire" (>= ppg + 12 and 1.35x), final well above/below projection (>= max(15, 40%)), DNPs. Live ones pop up in the corner for 7 s.
  - No spam: squad only (watchlist for injuries), one per player per game per kind, catch-up items go to the panel without pop-ups, first-ever visit starts clean, live alerts switch.
- Ideas still open: phone push alerts (needs the PWA), captain hindsight line on Live, breakeven progress bar in My Squad.
