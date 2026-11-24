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

## Agreed next (round 3 answers, 25 Nov 2026)
1. **Hover tooltips** (form bars, price dots per round, projection with likely range). Preview built on branch `preview/tooltips`; ship when the owner approves.
2. **Projection v3: use every available source to raise confidence.** Status:
   - Done: all box scores via ESPN (`scripts/fetch_games.py` -> `data/games.json`); SuperCoach scoring verified:
     PTS + REB + AST + 2*STL + 2*BLK - TO - missed FG - missed FT (exact 96%, within 3 pts 100% vs SC round totals).
   - Tested honestly (`projection_v3.py`): minutes-based model 13.9 mean miss (worse than v2's 11.4); v2 + minutes trend +
     back-to-backs 11.4 (no gain). Not shipped. Re-test as rounds accumulate.
   - Next sources to try: in-round live projections (actual so far + remaining games), teammate-out minutes redistribution,
     ESPN fantasy projections, betting player props (check free availability first).
3. **Multi-round trade planner** (next 3 rounds, NBA Cup R7-8 game counts, "sell before he peaks").
4. **Share my squad** link + QR, installable phone app (PWA).
5. **Captain picks on the front page**: top 3 captain and vice-captain picks with a one-line reason each (+ chance of being top scorer). Preview built on branch `preview/captain-picks` (`captains.js`); ship when the owner approves. Also fixes squashed Market columns on phones.
6. **Public launch prep**: Beta label + feedback button, share with a small group after one more round of private accuracy.
