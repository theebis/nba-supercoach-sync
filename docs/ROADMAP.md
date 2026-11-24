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

## Next (to be agreed in the current interview round)
- Projection v3 from game-by-game data (minutes, back-to-backs, rest days) via ESPN box scores.
- Multi-round trade planning (next 2–3 rounds, incl. NBA Cup rounds 7–8 game counts; when to sell a peaking cash cow).
- Captain picker with probabilities.
- Squad on any device (share link / QR, no accounts), installable phone app (PWA), in-app alerts.
- Public launch prep: Beta label, feedback button, public accuracy page when ready.
