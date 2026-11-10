// Kitchen streaks: one small cookie shared by The Puzz and The Muze.
// Both sites live on thecosmickitchen.github.io, so a cookie on path=/ is readable by either.
// The same file is copied into both repos; keep the two copies identical.
//
// Cookie "ck1" = <yyyymmdd of newest day>.<best Puzz streak>.<best Muze streak>.<mask>-<mask>-...
// Each mask is a base-36 bitmask of the dailies finished that day, newest day first, 42 days kept.
// One bit per game, in the order of GAMES below. Never reorder, only append (and stay under 31 games).
(function () {
  const NAME = 'ck1', KEEP = 42, MAX_AGE = 400 * 86400;
  const GAMES = ['hex', 'sb', 'jg', 'ws', 'hk', 'cl', 'st', 'sm', 'ta', 'la',
    'blackout', 'haiku', 'cutup', 'fridge', 'sixwords', 'palette', 'strip', 'paint', 'oneline', 'shape', 'corpse', 'pixel', 'collage', 'vale',
    'ts'];
  // Which site each game belongs to.
  const PUZZ = ['hex', 'sb', 'jg', 'ws', 'hk', 'cl', 'st', 'sm', 'ta', 'la', 'ts'];
  const bits = list => list.reduce((m, g) => m | (1 << GAMES.indexOf(g)), 0);
  const SITE = { puzz: bits(PUZZ), muze: bits(GAMES.filter(g => !PUZZ.includes(g))) };

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

  // The day this page was opened on. A daily shows that day's puzzle until the page reloads.
  const LOADED = midnight(new Date());

  // Record that a daily was finished. It counts for the day the page was opened on, which is the
  // day of the puzzle on screen, so finishing just after midnight still counts for that puzzle's day.
  // Hubs pass `day` ('yyyy-mm-dd' or a Date) to fill in finishes found in saved games. Days in the
  // future or older than the cookie keeps are ignored. Safe to call more than once.
  function mark(game, day) {
    const bit = GAMES.indexOf(game);
    if (bit < 0) return;
    let when = LOADED;
    if (day) {
      const m = typeof day === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
      when = m ? new Date(+m[1], +m[2] - 1, +m[3]) : typeof day.getTime === 'function' ? midnight(day) : null;
      const today = midnight(new Date());
      if (!when || isNaN(when) || when > today || when <= addDays(today, -KEEP)) return;
    }
    const s = read(), key = ymd(when);
    s.days[key] = (s.days[key] || 0) | (1 << bit);
    for (const site of Object.keys(SITE)) s.best[site] = Math.max(s.best[site] || 0, run(s, SITE[site]).current);
    write(s);
  }

  // ---- Keeping saves safe. This file is on every page of both sites, so these guards cover every game. ----
  //
  // 1. A new day. A daily page left open overnight (phones keep tabs for days) would still show
  //    yesterday's puzzle. When it's looked at again on a later day, reload it to today's.
  //    Pages with a #seed (endless, free play) are left alone.
  //
  // 2. Two tabs of the same page. Every save goes through localStorage. The tab opened or looked at
  //    most recently owns saving: a tab in the background that isn't the owner doesn't write, so an
  //    old board's timer can't overwrite newer progress. And if another tab changes a key this tab has
  //    read or written, this tab's copy is out of date: it stops writing that key and reloads the next
  //    time it's looked at.
  //
  // 3. A full shelf. Both sites share one origin, so one localStorage quota (about 5 MB), and the
  //    Muze keeps pictures in it. When a save doesn't fit, make room by dropping the oldest gallery
  //    day (never today's), then free-play drawings, and try again.
  const isDaily = () => !location.hash || location.hash === '#';
  const seen = new Map(), stale = new Set();   // key -> the value this tab last read or wrote
  const OWNER = 'kitchen-tab', TAB = Math.random().toString(36).slice(2);
  let ls = null, claim = () => {};
  try { ls = window.localStorage; } catch (e) {}
  if (ls) {
    const setItem = Storage.prototype.setItem, getItem = Storage.prototype.getItem;
    Storage.prototype.getItem = function (k) {
      const v = getItem.call(this, k);
      if (this === ls && !seen.has(String(k))) seen.set(String(k), v);
      return v;
    };
    const raw = (k, v) => setItem.call(ls, k, v);
    const dash = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    // Free one thing that can go, other than the key being written. True if something went.
    const freeOne = except => {
      try {
        if (except !== 'muze-gallery') {
          const g = JSON.parse(ls.getItem('muze-gallery') || 'null');
          const old = g && Object.keys(g).sort().filter(d => d !== dash(new Date()) && d !== dash(LOADED))[0];
          if (old) { delete g[old]; raw('muze-gallery', JSON.stringify(g)); return true; }
        }
        for (let i = 0; i < ls.length; i++) {
          const k = ls.key(i);
          if (k !== except && /^muze-.+-free$/.test(k)) { ls.removeItem(k); return true; }
        }
      } catch (e) {}
      return false;
    };
    Storage.prototype.setItem = function (k, v) {
      if (this !== ls) return setItem.call(this, k, v);
      k = String(k); v = String(v);
      if (stale.has(k)) return;               // another tab has newer data here; leave it be
      if (document.hidden && getItem.call(ls, OWNER) !== TAB) return;   // a newer tab owns saving now
      for (;;) {
        try { raw(k, v); break; }
        catch (e) { if (!freeOne(k)) throw e; } // nothing left to free: callers see the error as before
      }
      seen.set(k, v);
    };
    addEventListener('storage', e => {
      if (e.storageArea !== ls) return;
      if (e.key === null) { seen.forEach((_, k) => stale.add(k)); return; }   // storage cleared elsewhere
      if (seen.has(e.key) && e.newValue !== seen.get(e.key)) stale.add(e.key);
    });
    claim = () => { try { raw(OWNER, TAB); } catch (e) {} };
    claim();
  }
  function freshen() {
    if (stale.size || (isDaily() && +midnight(new Date()) !== +LOADED)) location.reload();
    else claim();
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) freshen(); });
  addEventListener('pageshow', e => { if (e.persisted) freshen(); });
  addEventListener('focus', freshen);

  window.Kitchen = { mark, streak, week, doneOn, GAMES };
})();
