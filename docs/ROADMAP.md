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
