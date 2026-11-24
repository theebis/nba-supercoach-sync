// SCHOOPS squad import: find player names in text (from a screenshot's OCR, or pasted by hand).
// Pure functions shared by importer.js and tests/importmatch.test.js.
//
// Handles: accents (Jokić), suffixes (Jr.), initials ("N. Jokic"), last-name-only ("Jokic"),
// small OCR misreads ("Jokie", "Wembanyarna"), several names on one line, and surnames shared
// by several players (flagged as "check" with the alternatives listed).
(function (root) {
  const SUFFIX = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);

  function norm(s) {
    return String(s || "")
      .normalize("NFKD").replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[’'`]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }
  const tokens = (s) => norm(s).split(" ").filter((t) => t && !SUFFIX.has(t));

  function lev(a, b) {
    if (a === b) return 0;
    const m = a.length, n = b.length;
    if (!m || !n) return m || n;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[n];
  }
  // 1 = identical; short tokens must match exactly (too many false hits otherwise)
  function tokSim(a, b) {
    if (a === b) return 1;
    if (Math.min(a.length, b.length) < 4) return 0;
    return 1 - lev(a, b) / Math.max(a.length, b.length);
  }

  function buildIndex(players) {
    const idx = players.map((p) => {
      const t = tokens(p.name);
      return { p, first: t[0] || "", last: t.length > 1 ? t.slice(1) : t };
    });
    // How many players share each surname (for "is a last name alone enough?")
    const lastCount = {};
    idx.forEach((e) => { const k = e.last.join(" "); lastCount[k] = (lastCount[k] || 0) + 1; });
    idx.forEach((e) => { e.lastShared = lastCount[e.last.join(" ")]; });
    return idx;
  }

  // Best match of one player's surname inside a token list; returns {score, start, end} or null
  function locate(e, lt) {
    const k = e.last.length;
    let best = null;
    for (let i = 0; i + k <= lt.length; i++) {
      let sum = 0, ok = true;
      for (let j = 0; j < k; j++) {
        const s = tokSim(e.last[j], lt[i + j]);
        if (s < 0.75) { ok = false; break; }
        sum += s;
      }
      if (!ok) continue;
      let score = sum / k;              // surname similarity, 0.75..1
      let start = i;
      const before = lt[i - 1];
      if (before) {
        if (tokSim(e.first, before) >= 0.8) { score += 0.5; start = i - 1; }          // full first name
        else if (before.length === 1 && before === e.first[0]) { score += 0.35; start = i - 1; } // initial
      }
      if (score - (sum / k) === 0 && e.lastShared === 1 && sum / k === 1) score += 0.3; // unique surname, exact
      if (!best || score > best.score) best = { score, start, end: i + k };
    }
    return best;
  }

  /**
   * Find players in free text. Returns
   *  { matches: [{ player, score, confidence: "high"|"check", line, alternatives: [player...] }],
   *    unmatched: [line, ...] }
   */
  function matchText(text, players) {
    const idx = buildIndex(players);
    const lines = String(text || "").split(/\r?\n|,|;|\|/).map((l) => l.trim()).filter(Boolean);
    const found = new Map();
    const unmatched = [];

    lines.forEach((line) => {
      let lt = tokens(line);
      let matchedAny = false;
      for (let guard = 0; guard < 4 && lt.some((t) => t.length >= 3 && /[a-z]/.test(t)); guard++) {
        const cands = [];
        idx.forEach((e) => {
          const hit = locate(e, lt);
          if (hit && hit.score >= 0.85) cands.push({ e, ...hit });
        });
        if (!cands.length) break;
        // Tie-breakers from the same line: a matching price ($12.51M) or team code (CHI)
        const prices = [...line.matchAll(/(\d{1,2}\.\d{1,2})\s*m?\b/gi)].map((m) => Math.round(parseFloat(m[1]) * 100));
        const lineTeams = new Set(String(line).toUpperCase().match(/\b[A-Z]{3}\b/g) || []);
        cands.forEach((c) => {
          if (prices.includes(Math.round(c.e.p.price / 10000))) c.score += 0.3;
          if (lineTeams.has(String(c.e.p.team).toUpperCase())) c.score += 0.2;
        });
        cands.sort((a, b) => b.score - a.score || (b.e.p.owned || 0) - (a.e.p.owned || 0));
        const top = cands[0];
        // Close runners-up on the same words = ambiguous (e.g. "Thompson" alone)
        const rivals = cands.filter((c) => c !== top && c.start <= top.end && c.end >= top.start && top.score - c.score < 0.15);
        const confidence = top.score >= 1.25 && !rivals.length ? "high" : "check";
        const prev = found.get(top.e.p.id);
        if (!prev || prev.score < top.score) {
          found.set(top.e.p.id, {
            player: top.e.p,
            score: Math.round(top.score * 100) / 100,
            confidence,
            line,
            alternatives: rivals.slice(0, 3).map((c) => c.e.p)
          });
        }
        matchedAny = true;
        lt = [...lt.slice(0, top.start), ...lt.slice(top.end)];
      }
      if (!matchedAny && /[a-z]{3,}/i.test(line) && line.replace(/[^a-z]/gi, "").length >= 4) unmatched.push(line);
    });

    const matches = [...found.values()].sort((a, b) => (a.confidence === b.confidence ? b.score - a.score : a.confidence === "high" ? -1 : 1));
    return { matches, unmatched };
  }

  root.SchoopsImportMatch = { norm, tokens, matchText };
})(typeof window !== "undefined" ? window : globalThis);
