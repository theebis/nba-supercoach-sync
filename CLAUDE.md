# SCHOOPS — NBA SuperCoach breakeven terminal

Standing brief from the owner: [docs/BRIEF.md](docs/BRIEF.md). Read it. Roadmap/specs live in `docs/`.

## Working rules (from the brief)
- You are lead engineer + product owner. Change anything that's wrong; existing code is not a constraint. Suggest the bigger version.
- Plain language with the owner; explain jargon once. They are new to coding agents and GitHub.
- Routine work (reading, editing, installing, running, local commits): just do it.
- **Ask first** before: pushing to GitHub (= going live), deleting data not in git, spending money, signing up for things, sending anything, rewriting git history.
- Verify before saying done: tests, data check, UI screenshots at desktop + phone. Show evidence.
- UI work: read the relevant skills in `.claude/skills/` first (emil-design-eng, interface-polish, transitions-dev/-polish, design-taste-frontend, break-ui, review-animations). Polish is part of done.
- Blocked? Unblock yourself → find another source → ask for exactly what you need with steps → only then report it as blocked. Never silently drop a goal.

## Owner preferences (learned while working together)
- Plain language, short answers; explain any jargon once. The owner is not a developer.
- **Show a preview (screenshots) of visual changes before shipping**, and always ask before pushing to main.
- Be honest about numbers: report real test results (including "no improvement"), never overstate confidence.
- Run the requirements-interview style (numbered questions, recommended answer, "yes" accepts) for roadmap decisions; record answers in `docs/ROADMAP.md`.
- Never ask for or accept secrets in chat; keys go straight into GitHub secrets. (`ACCURACY_TOKEN` exists for the private repo.)
- The owner's screen is 2560px wide (1440p) — check `npm run check:ui` xwide/wide screenshots, not just 1440.
- Current status and what's next: `docs/ROADMAP.md`.

## Layout
- `index.html` — the whole app shell, styles and Market/Inspector/Settings logic (vanilla JS, no build step).
- `court.js` — My Court (lineup board, captaincy, Best-9-of-10 optimiser). `tradelab.js` — Trade Lab.
- `captains.js` — Captain picks strip above the Market: top 3 C/VC options (My team = starters or squad, Everyone = league), one-line reason, chance of top score (simulation from likely ranges), "Use C & VC" sets them in My Court. Shrinks to one line on phones.
- `briefing.js` — Round briefing panel on wide screens (your squad's news, injury report, cash cows). What fits beside the Market (briefing, Form & price column) is decided by `marketExtras()` in index.html.
- `importer.js` + `importmatch.js` — squad import (screenshot read in-browser by Tesseract.js from jsDelivr, or pasted names) with a review step. `npm run check:import` runs real OCR on generated light/dark team screenshots (expects 13+/15).
- `scripts/accuracy_report.py` — per finished round: projection miss, price-model miss, breakeven hit rate. Published by the data sync to the PRIVATE repo theebis/schoops-private (README.md) when the `ACCURACY_TOKEN` secret exists; it's the owner's private page until they choose to publish it.
- `projection_model.py` — SCHOOPS projections (v2): points-per-game blend (EWMA form, price/magic, SC projection, shrinkage) × expected games (availability + ESPN injuries). Grid-fitted, leave-one-round-out tested vs SuperCoach; refits automatically when a new round finishes (`maybe_refit`, called by the scraper). Params + honest-test results in `model/projection_params.json`. Run `python projection_model.py` to refit/print the backtest. The site uses these by default (Settings → Projections switches to SuperCoach).
- Trade advisor (in `tradelab.js`): ranks single/double trades by exact lineup gain (solver), goal (points / balanced: $50K = 1 pt / cash) and "chance it helps" from projection ranges.
- `pricing.js` — the price/breakeven model. Shared by the site and `tests/pricing.test.js`.
- `update_supercoach.py` — scraper → `supercoach_data.json` (live round) + `history/round_N.json`.
- `debug/` — feed inspection report and `price_history.json` (per-round price rows used to fit/backtest the model).

## Run and check locally (Windows; Node 22+, Python 3.12)
- `npm run serve` → http://localhost:8765. On localhost the site reads the **local** `supercoach_data.json`; the live site reads `main` on GitHub.
- `python update_supercoach.py` refreshes local data (works from this PC via curl_cffi). `--rebuild-history` rebuilds all snapshots. `--inspect` writes `debug/feed_inspection.json` + `debug/price_history.json`.
- `npm test` (model + backtest), `python -m pytest -q tests` (scraper), `npm run check:data` (data sanity incl. round chaining).
- `npm run check:ui [view]` → screenshots in `.checks/` (market, inspector, court, tradelab, settings × desktop 1440 / phone 390). Fails on console errors, failed requests, sideways scroll. Uses the system Edge via Playwright. Look at the PNGs yourself.
- Git: if `git` isn't on PATH in a fresh shell, refresh it: `$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [Environment]::GetEnvironmentVariable("Path","User")`. Credential helper is `manager` (browser sign-in, already done).

## Deploying
- The live site is GitHub Pages from `main` (https://theebis.github.io/nba-supercoach-sync/). Pushing to `main` = live within ~1 minute. Ask the owner first.
- Data is refreshed by `.github/workflows/weekly-sync.yml` (daily 22:00 UTC, Mon 08:00 + 15:00 UTC, and on any push that changes the scraper). It runs `scripts/check_data.py` and won't commit failing data.
- `checks.yml` runs tests + data check on every push. Check Actions after pushing: `https://api.github.com/repos/theebis/nba-supercoach-sync/actions/runs`.
- After going live, check the live site; if broken, `git revert` + push first, then fix.
- Bump the `?v=N` query on `<script src>` tags in index.html when changing a JS file so browsers don't use a cached copy.

## Data facts and quirks (learned the hard way)
- Source: SuperCoach public JSON (`/2026/api/nba/classic/v1/players-cf?embed=...&round=N`, `settings`, `real_fixture?round=N`). Needs Chrome impersonation (curl_cffi); plain requests get 403.
- **No breakeven in the feed** (official BEs are paywalled). We compute them with the fitted model in `pricing.js`.
- **Injury fields in the SuperCoach feed are always empty.** Injuries come from ESPN's public report (`site.api.espn.com/.../nba/injuries`), matched by normalized name.
- A round's score is the **total over that round's games** (2–4 games). Scores can be negative.
- A round's stat row `price` is the price **after** that round's change; `price_change` is caused by **that same round's** games. Price during round N = row N price − row N price_change. SuperCoach's own price chart labels week N with the end-of-week price.
- Price model: `new = price + 0.0415 × games_played × (712,000 × avg − price)`, avg = points per game over last round + this round. 0 games → no change. Median error ~$50k, direction 95% (see backtest).
- The `settings` current_round lags (said Round 5 on Tue 24 Nov while Round 6 had started). The scraper moves to round N+1 as soon as round N+1 stat rows exist. Rounds run Tuesday–Tuesday AEDT. Rounds 7–8 include the NBA Cup (odd game counts; championship game doesn't score).
- SuperCoach's `ppts1` projection gives scores to players who haven't played in weeks; the site treats no games in the last two rounds as "likely DNP" (projected to hold price).
- Saved prefs in the browser use `localStorage` key `schoops_terminal_v3`; old magic numbers (<400k) are ignored.
