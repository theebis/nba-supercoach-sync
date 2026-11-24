// SCHOOPS price model, shared by the site (index.html, court.js, tradelab.js) and the tests.
//
// Fitted to 1,231 real SuperCoach NBA price changes (2026-27 Rounds 3-5, see debug/price_history.json):
//   avg       = points per game over last round + this round (total points / total games)
//   new price = price + PER_GAME_RATE x games played this round x (MAGIC x avg - price), rounded to $10k
// A player who plays 0 games in a round keeps his price (true in all 925 such cases).
// Backtest: median error ~$50k, up/down direction right ~95% (old 0.75/0.25 model: $600k, 71%).
(function (root) {
  const DEFAULT_MAGIC_NUMBER = 712000;
  const PER_GAME_RATE = 0.0415;

  // Games the player played last round; when unknown (older data files), assume a normal 3-game week
  function prevRoundGames(p) {
    const g = p.prevGames;
    if (g !== null && g !== undefined && !Number.isNaN(Number(g))) return Number(g);
    return p.r_minus_1 > 0 ? 3 : 0;
  }

  // Projected price after this round if the player scores `roundScore` in total over `games` games
  function projectPrice(p, roundScore, games, magic = DEFAULT_MAGIC_NUMBER) {
    const g = Number(games) || 0;
    if (g <= 0) return p.price;
    const gPrev = prevRoundGames(p);
    const avg = (Number(p.r_minus_1 || 0) + Number(roundScore || 0)) / (gPrev + g);
    const next = p.price + PER_GAME_RATE * g * (magic * avg - p.price);
    return Math.max(0, Math.round(next / 10000) * 10000);
  }

  // Breakeven: round total (over this round's games) that leaves the price unchanged
  function calcBreakeven(p, magic = DEFAULT_MAGIC_NUMBER, games = p.games) {
    const g = Number(games) || 0;
    if (g <= 0) return null;
    return Math.round((p.price / magic) * (prevRoundGames(p) + g) - Number(p.r_minus_1 || 0));
  }

  root.SchoopsPricing = { DEFAULT_MAGIC_NUMBER, PER_GAME_RATE, prevRoundGames, projectPrice, calcBreakeven };
})(typeof window !== "undefined" ? window : globalThis);
