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

## Round 7 answers (25 Nov 2026), preview on branch `preview/round6`
Built:
1. My Squad **Projected / Live** switch (defaults to Live once your starters' games have started; remembered). Live: hero "so far", heading for (vs projected), starter games played, on court now; red-tinted header; cards show live score, "→ finish", game pips, on-court glow. Totals come from `SchoopsLive.team()` so they match the Live page.
2. Player profile: "This week" schedule (date, opponent, W/L + his score, live, or tip-off); each game opens it on the Live page. "Projected finish" renamed "Heading for" with "X so far + Y to come".
3. Games hover box: general NBA Cup note for Rounds 7–8 (knockouts Dec 4–11) until the bracket is known; set `NBA_CUP.teams` in index.html once it is for team-specific notes. Disappears after Dec 11.
5. SC feed: your players' plays get an accent wash, ringed photo (when he made the play) and points in an accent pill.
7. Import made obvious: big "Import your SuperCoach team" banner at the top of the Market until the squad has 15 (slim version when partly filled); My Squad's main button is now "Import team".
Still to do: 4. Trade Advisor overhaul + rename (examples on request); 6. likely-range approach (discuss).

## Round 8 answers (25 Nov 2026), preview on branch `preview/round7`
- Bug fixed: My Squad "Projected" button did nothing (its click was wired to the header-buttons handler).
- **Likely range redone** (owner agreed): range is now per game *if he plays* ("Most games 17–33 a game"), with availability shown separately ("about 1.6 of 3"). Spread blends a league spread by scoring band (0–15 / 15–25 / 25+ a game; low scorers swing far more) with the player's own round-to-round consistency. Held 76% on rounds it wasn't built from (target 80%). Old round-total range kept only for internal maths (trade/captain chances). Stored as `ppg_lo`/`ppg_hi`; params `ppg_sd` in model/projection_params.json.
- **Trade Lab renamed Trade Advisor and redesigned** (owner picked B, phones A): suggestion list (+ Add toggles in/out of the plan) beside a sticky "Your plan" scoreboard (points, price change, plan tabs, hand-picked trades, bank, apply, copy to compare); mid-size screens put numbers under the names; phones get cards and a bottom plan tray with Review.

## Round 9 interview (25 Nov 2026): plan to launch
Decisions:
- Trade Advisor look: owner is happy enough for now. Make it smarter instead: look 3 rounds ahead, use injury return dates, and flag long-term injured players as sell priorities (Cameron Boozer, out ~4 weeks, ranked low because the advisor only valued this round and he sits on the bench).
- Live: the captain sorts by his doubled score.
- Safety net: automatic click-through tests of every page before shipping; alert if the Monday rollover doesn't happen (GitHub already emails on failed syncs).
- Beta pill by the logo + "Send feedback" form (Tally, emailed to the owner).
- Private visitor counter (GoatCounter: no cookies, dashboard behind the owner's login only) + "Don't count my visits" switch in Settings.
- "Send to my phone" QR/link for the squad, AND optional sign-in (Supabase: email link, Google later) to sync squads across devices. Must say clearly that sign-in is optional and no feature needs it.
- Round recap with a shareable portrait image each Monday.
- Phone pass: every page, most useful info first, as polished as possible.
- Player page + compare two players.
- Off-season: season review + "back next season" (roadmap only, build ~March).

Order (owner agreed):
1. Captain sort fix + click-through safety tests
2. Trade Advisor: 3-round horizon, injury return dates, sell-priority flags
3. Beta pill, feedback form, private visitor counter
4. Phone pass
5. QR "send to my phone"
6. Launch to a small group
7. Optional sign-in (Supabase)
8. Round recap + share image
9. Multi-round planner
10. Rival compare
11. Player page + compare
12. Off-season review (build ~March)

Waiting on the owner (free sign-ups, steps given in chat): GoatCounter, Tally, Supabase.

Progress (25 Nov 2026, branch preview/launch1, not pushed): steps 1-3 built and tested (captain sort, click-through check npm run check:clicks, rollover alarm scripts/check_rollover.py, 3-round advisor with Sell first / Hot buys, Beta pill, feedback via Tally form xVJAvG, Cloudflare analytics with a Don't count me switch). Supabase project for step 7: https://zbhvwaunbnwggqsfxxtk.supabase.co (publishable key given by owner in chat; public by design). Next: step 4 phone pass, step 5 QR link.

## Handoff (25 Nov 2026, end of session)
Where things stand:
- Live on main: launch steps 1-4 (captain sort, click-through check `npm run check:clicks`, rollover alarm, 3-round Trade Advisor with Sell first / Hot buys, Beta pill, Tally feedback form xVJAvG, Cloudflare analytics + "Don't count me" switch, phone pass).
- Shipped 25 Nov 2026: **Market Cash / Points switch** (top right of the Market, remembered in prefs as `marketMode`). Points mode sorts by points over this round + next two (`horizonOf()` in index.html, now shared with the Trade Advisor via `SCHOOPS.horizon`), columns Pts/Game, 3-round Pts (hover = split by round), Pts / $1M (green at 15+). New sidebar view **Top Scorers** (top 50 by 3-round points), placed above Cash Cows at the owner's request; clicking it switches to Points, Cash Cows / Bleeding switch to Cash.

Next: continue the agreed order: 5. QR "send to my phone" link -> 6. launch to a small group -> 7. optional sign-in (Supabase project https://zbhvwaunbnwggqsfxxtk.supabase.co, publishable key is in the owner's chat history; ask the owner to paste it again, it is public by design; never ask for the service_role key; site must say sign-in is optional and no feature needs it) -> 8. round recap + share image -> 9. multi-round planner -> 10. rival compare -> 11. player page + compare -> 12. off-season review (build ~March).
Also open: trade-advice scorecard (measure whether the advisor's suggestions actually gained points); check Monday 30 Nov evening that Round 7 rolled over (alarm emails if not).
Benched by owner: monetisation and the News Corp data-permission question (robots.txt + News Corp terms prohibit automated collection without written permission; plan: ask permission before any public promotion or charging).
