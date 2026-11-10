// Kitchen streaks: one small cookie shared by The Puzz and The Muze.
// Both sites live on thecosmickitchen.github.io, so a cookie on path=/ is readable by either.
// The same file is copied into both repos; keep the two copies identical.
//
// Cookie "ck1" = <yyyymmdd of newest day>.<best Puzz streak>.<best Muze streak>.<mask>-<mask>-...
// Each mask is a base-36 bitmask of the dailies finished that day, newest day first, 42 days kept.
// Bits 0-9 are Puzz games, bits 10-23 are Muze makes, and bit 24 on are Puzz games added later, in the order of GAMES
// below. Never reorder, only append.
(function () {
  const NAME = 'ck1', KEEP = 42, MAX_AGE = 400 * 86400;
  const GAMES = ['hex', 'sb', 'jg', 'ws', 'hk', 'cl', 'st', 'sm', 'ta', 'la',
    'blackout', 'haiku', 'cutup', 'fridge', 'sixwords', 'palette', 'strip', 'paint', 'oneline', 'shape', 'corpse', 'pixel', 'collage', 'vale',
    'ts'];
  const SITE = { puzz: ((1 << 10) - 1) | (1 << 24), muze: ((1 << 24) - 1) & ~((1 << 10) - 1) };

  const midnight = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const ymd = d => `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const parseYmd = s => /^\d{8}$/.test(s) ? new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)) : null;

  // { days: { yyyymmdd: mask }, best: { puzz, muze } }
  function read() {
    const out = { days: {}, best: { puzz: 0, muze: 0 } };
    try {
      const m = document.cookie.match(/(?:^|;\s*)ck1=([^;]*)/);
      if (!m) return out;
      const [d, bp, bm, masks] = m[1].split('.');
      const end = parseYmd(d);
      if (!end) return out;
      out.best.puzz = parseInt(bp, 10) || 0;
      out.best.muze = parseInt(bm, 10) || 0;
      (masks || '').split('-').forEach((s, i) => { const v = parseInt(s, 36) || 0; if (v) out.days[ymd(addDays(end, -i))] = v; });
    } catch (e) {}
    return out;
  }

  function write(s) {
    const today = midnight(new Date()), masks = [];
    for (let i = 0; i < KEEP; i++) masks.push((s.days[ymd(addDays(today, -i))] || 0).toString(36));
    while (masks.length > 1 && masks[masks.length - 1] === '0') masks.pop();
    const secure = location.protocol === 'https:' ? '; Secure' : '';
    try {
      document.cookie = `${NAME}=${ymd(today)}.${s.best.puzz}.${s.best.muze}.${masks.join('-')}; path=/; max-age=${MAX_AGE}; SameSite=Lax${secure}`;
    } catch (e) {}
  }

  // Days in a row with something finished on that site. Today not done yet doesn't break it:
  // the streak is still alive until a whole day goes by with nothing.
  function run(s, mask) {
    const today = midnight(new Date());
    const has = d => ((s.days[ymd(d)] || 0) & mask) !== 0;
    const doneToday = has(today);
    let n = 0, d = doneToday ? today : addDays(today, -1);
    while (has(d)) { n++; d = addDays(d, -1); }
    return { current: n, doneToday };
  }

  function streak(site) {
    const s = read(), mask = SITE[site];
    const r = run(s, mask);
    return { current: r.current, doneToday: r.doneToday, best: Math.max(s.best[site] || 0, r.current) };
  }

  // Monday to Sunday of this week: [{ date, done, today, future }]
  function week(site) {
    const s = read(), mask = SITE[site], today = midnight(new Date());
    const mon = addDays(today, -((today.getDay() + 6) % 7));
    return [...Array(7)].map((_, i) => {
      const d = addDays(mon, i);
      return { date: d, done: ((s.days[ymd(d)] || 0) & mask) !== 0, today: +d === +today, future: d > today };
    });
  }

  // Which games were finished on a given day (default today).
  function doneOn(date) {
    const m = read().days[ymd(midnight(date || new Date()))] || 0;
    return GAMES.filter((_, i) => m & (1 << i));
  }

  // Record that a daily was finished today. Safe to call more than once.
  function mark(game) {
    const bit = GAMES.indexOf(game);
    if (bit < 0) return;
    const s = read(), key = ymd(midnight(new Date()));
    s.days[key] = (s.days[key] || 0) | (1 << bit);
    for (const site of Object.keys(SITE)) s.best[site] = Math.max(s.best[site] || 0, run(s, SITE[site]).current);
    write(s);
  }

  window.Kitchen = { mark, streak, week, doneOn, GAMES };
})();
