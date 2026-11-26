// Artist mode: click any pixel sprite on the page and recolour it, live, everywhere it appears.
//
// Off for everyone by default. Visit any page with ?artist to turn it on (it stays on across The Puzz, The Muze and
// the menu, which share one domain); ?artist=off or the panel's Exit button turns it off.
// Swaps are kept in this browser only. "Copy swaps" gives a list to paste into LibreSprite or a message, and each
// sprite can be downloaded recoloured as a PNG. Nothing here changes the site for anyone else.
//
// The same file is copied into The-Puzz, The-Muze and TheCosmicKitchen.github.io; keep the copies identical.
(() => {
  const ON = 'artist-mode', KEY = 'artist-swaps';
  const q = new URLSearchParams(location.search);
  if (q.has('artist')) q.get('artist') === 'off' ? localStorage.removeItem(ON) : localStorage.setItem(ON, '1');
  if (!localStorage.getItem(ON)) return;

  // swaps: sprite key -> { "#rrggbb": "#rrggbb" }. A sprite's key is its folder and file name, e.g. "img/sushi.png",
  // so the same swaps apply on the live site and in a local copy.
  let swaps = {};
  try { swaps = JSON.parse(localStorage.getItem(KEY)) || {}; } catch {}
  const save = () => localStorage.setItem(KEY, JSON.stringify(swaps));
  const abs = u => new URL(u, location.href).href;
  const keyOf = u => new URL(u, location.href).pathname.split('/').filter(Boolean).slice(-2).join('/');
  const isSprite = u => /\.png$/i.test(new URL(u, location.href).pathname);
  const hex = (r, g, b) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');

  // ---- sprites: original pixels, palette, and the current recoloured URL --------------------------------------
  const sprites = new Map();      // original absolute URL -> { key, url, img, palette, out }
  const blobToOrig = new Map();   // recoloured blob URL -> original absolute URL
  function load(url) {
    url = abs(url);
    if (sprites.has(url)) return sprites.get(url).ready;
    const s = { key: keyOf(url), url, out: url, palette: [] };
    s.ready = new Promise(res => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
        const x = c.getContext('2d'); x.drawImage(img, 0, 0);
        s.data = x.getImageData(0, 0, c.width, c.height);
        const n = new Map(), d = s.data.data;
        for (let i = 0; i < d.length; i += 4) if (d[i + 3]) { const h = hex(d[i], d[i + 1], d[i + 2]); n.set(h, (n.get(h) || 0) + 1); }
        s.palette = [...n].sort((a, b) => b[1] - a[1]).map(([h]) => h);
        res(s);
      };
      img.onerror = () => res(null);
      img.src = url;
    });
    sprites.set(url, s);
    return s.ready;
  }
  async function render(s) {
    const map = swaps[s.key];
    if (s.out !== s.url) { URL.revokeObjectURL(s.out); blobToOrig.delete(s.out); }
    if (!map || !Object.keys(map).length) { s.out = s.url; return; }
    const src = s.data, out = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height), d = out.data;
    const rgb = {}; for (const [a, b] of Object.entries(map)) rgb[a] = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16));
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      const to = rgb[hex(d[i], d[i + 1], d[i + 2])];
      if (to) [d[i], d[i + 1], d[i + 2]] = to;
    }
    const c = document.createElement('canvas'); c.width = out.width; c.height = out.height;
    c.getContext('2d').putImageData(out, 0, 0);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    s.out = URL.createObjectURL(blob); blobToOrig.set(s.out, s.url);
  }
  const outFor = url => { const s = sprites.get(abs(url)); return s ? s.out : url; };

  // ---- where sprites appear: <img src>, SVG <image href>, and url(...) in stylesheets and inline styles --------
  const URL_RE = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;
  const cssUses = [];             // { style, prop, text, base }: the original text of every declaration with a .png url
  function scanStyle(style, base) {
    for (let i = 0; i < style.length; i++) {
      const prop = style[i], text = style.getPropertyValue(prop);
      if (!/url\(/.test(text)) continue;
      const urls = [...text.matchAll(URL_RE)].map(m => abs(new URL(m[2], base).href)).filter(isSprite);
      if (!urls.length) continue;
      cssUses.push({ style, prop, text, base, prio: style.getPropertyPriority(prop) });
      urls.forEach(load);
    }
  }
  function scanRules(rules, base) {
    for (const r of rules) {
      if (r.style) scanStyle(r.style, base);
      if (r.cssRules) scanRules(r.cssRules, base);
    }
  }
  function scanSheets() {
    for (const sh of document.styleSheets) { try { scanRules(sh.cssRules, sh.href || location.href); } catch {} }
    document.querySelectorAll('[style]').forEach(el => scanStyle(el.style, location.href));
  }
  function applyCss() {
    for (const u of cssUses) {
      const text = u.text.replace(URL_RE, (m, qt, p) => {
        const a = new URL(p, u.base).href;
        return isSprite(a) ? `url("${outFor(a)}")` : m;
      });
      if (u.style.getPropertyValue(u.prop) !== text) u.style.setProperty(u.prop, text, u.prio);
    }
  }
  const ORIG = 'data-artist-src';
  function origOf(el) {
    if (el.hasAttribute(ORIG)) return el.getAttribute(ORIG);
    const v = el.tagName === 'IMG' ? el.getAttribute('src') : el.getAttribute('href');
    if (!v || v.startsWith('blob:') || !isSprite(v)) return null;
    const a = abs(v); el.setAttribute(ORIG, a); load(a); return a;
  }
  function applyEl(el) {
    const o = origOf(el); if (!o) return;
    const want = outFor(o), attr = el.tagName === 'IMG' ? 'src' : 'href';
    if (el.getAttribute(attr) !== want && abs(el.getAttribute(attr) || '') !== want) el.setAttribute(attr, want);
  }
  const spriteEls = root => root.querySelectorAll ? root.querySelectorAll('img, image') : [];
  function applyAll() { spriteEls(document).forEach(applyEl); applyCss(); }

  // Pages that redraw (Joannagrams' letter ring) put the original file back; recolour new nodes as they arrive.
  new MutationObserver(ms => {
    for (const m of ms) {
      if (m.type === 'attributes') {
        const el = m.target, v = el.getAttribute(m.attributeName) || '';
        if (v.startsWith('blob:')) continue;
        el.removeAttribute(ORIG); applyEl(el);
      } else m.addedNodes.forEach(n => {
        if (n.nodeType !== 1) return;
        if (n.matches('img, image')) applyEl(n);
        spriteEls(n).forEach(applyEl);
        if (n.matches('[style]')) { scanStyle(n.style, location.href); applyCss(); }
      });
    }
  }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['src', 'href'] });

  // ---- picking: which sprites are under a point ---------------------------------------------------------------
  function spritesAt(x, y) {
    const found = new Set();
    for (const el of document.elementsFromPoint(x, y)) {
      if (el.closest('#artist-panel')) continue;
      if (el.matches('img, image')) { const o = origOf(el); if (o) found.add(o); }
      const bg = getComputedStyle(el).backgroundImage;
      for (const m of bg.matchAll(URL_RE)) {
        const a = blobToOrig.get(m[2]) || abs(m[2]);
        if (isSprite(a)) found.add(a);
      }
    }
    return [...found];
  }

  // ---- panel ----------------------------------------------------------------------------------------------------
  const css = `
#artist-panel{position:fixed;right:12px;bottom:12px;z-index:2147483647;width:min(340px,calc(100vw - 24px));max-height:min(78vh,640px);
  display:flex;flex-direction:column;background:#FBF8F2;color:#1E1B18;border:2px solid #1E1B18;border-radius:14px;
  box-shadow:0 10px 30px rgba(0,0,0,.3);font:14px/1.4 system-ui,sans-serif;color-scheme:light}
#artist-panel *{box-sizing:border-box}
#artist-panel header{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #D9D1C3}
#artist-panel header b{flex:1;font-size:15px}
#artist-panel button{font:600 12.5px system-ui,sans-serif;padding:5px 9px;border-radius:8px;border:1.5px solid #1E1B18;background:#fff;color:#1E1B18;cursor:pointer}
#artist-panel button.on{background:#1E1B18;color:#fff}
#artist-panel .body{overflow:auto;padding:10px 12px;display:flex;flex-direction:column;gap:12px}
#artist-panel .hint{color:#6B6258;margin:0}
#artist-panel .sp{border:1px solid #D9D1C3;border-radius:10px;padding:8px;background:#fff}
#artist-panel .sp .top{display:flex;gap:10px;align-items:center;margin-bottom:6px}
#artist-panel .sp img{width:64px;height:64px;object-fit:contain;image-rendering:pixelated;background:repeating-conic-gradient(#eee 0 25%,#fff 0 50%) 0 0/12px 12px;border-radius:6px}
#artist-panel .sp img.strip{object-fit:cover;object-position:left}
#artist-panel .sp .name{flex:1;font-weight:700;word-break:break-all}
#artist-panel .sw{display:flex;flex-wrap:wrap;gap:6px}
#artist-panel label.c{position:relative;width:34px;height:34px;border-radius:7px;border:1.5px solid #1E1B18;cursor:pointer;overflow:hidden}
#artist-panel label.c i{position:absolute;right:0;bottom:0;width:12px;height:12px;border-top-left-radius:4px;border:1px solid rgba(0,0,0,.4)}
#artist-panel label.c input{position:absolute;inset:0;opacity:0;cursor:pointer}
#artist-panel .row{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.artist-hover{outline:3px dashed #E5484D !important;outline-offset:2px}`;
  const panel = document.createElement('div');
  panel.id = 'artist-panel';
  panel.innerHTML = `<style>${css}</style>
    <header><b>🎨 Artist mode</b><button data-a="pick" class="on">Picking</button><button data-a="min">–</button><button data-a="exit">Exit</button></header>
    <div class="body"><p class="hint">Click any pixel art on the page to see its colours. Click a colour to change it. Turn off <b>Picking</b> to use the page normally.</p>
    <div class="list"></div>
    <div class="row"><button data-a="copy">Copy swaps</button><button data-a="resetall">Reset all</button></div></div>`;
  const list = panel.querySelector('.list'), body = panel.querySelector('.body');
  let picking = true, shown = [];

  function card(s) {
    const map = swaps[s.key] || {};
    const el = document.createElement('div'); el.className = 'sp';
    el.innerHTML = `<div class="top"><img alt=""><span class="name"></span></div><div class="sw"></div>
      <div class="row"><button data-a="reset">Reset</button><button data-a="png">Download PNG</button></div>`;
    el.querySelector('img').src = s.out;
    // an animation strip (a row of square frames) previews as its first frame
    if (s.data.width >= 3 * s.data.height && s.data.width % s.data.height === 0) el.querySelector('img').classList.add('strip');
    el.querySelector('.name').textContent = s.key;
    const sw = el.querySelector('.sw');
    for (const h of s.palette) {
      const now = map[h] || h;
      const l = document.createElement('label'); l.className = 'c'; l.title = h + (map[h] ? ' → ' + map[h] : '');
      l.style.background = now;
      l.innerHTML = `<i style="background:${h}"></i><input type="color" value="${now}">`;
      l.querySelector('input').addEventListener('input', e => setSwap(s, h, e.target.value));
      sw.append(l);
    }
    el.addEventListener('click', async e => {
      const a = e.target.dataset.a;
      if (a === 'reset') { delete swaps[s.key]; save(); await update(s); }
      if (a === 'png') { const link = document.createElement('a'); link.href = s.out; link.download = s.key.replace(/\//g, '-'); link.click(); }
    });
    return el;
  }
  function drawList() { list.replaceChildren(...shown.map(u => sprites.get(u)).filter(s => s && s.data).map(card)); }

  let pending = new Map(), timer;
  function setSwap(s, from, to) {
    const map = swaps[s.key] = swaps[s.key] || {};
    if (to.toLowerCase() === from) delete map[from]; else map[from] = to.toLowerCase();
    if (!Object.keys(map).length) delete swaps[s.key];
    save();
    // colour inputs fire on every drag step: redraw at most every 60ms
    pending.set(s.url, s); clearTimeout(timer);
    timer = setTimeout(async () => { const all = [...pending.values()]; pending.clear(); for (const p of all) await update(p, true); }, 60);
  }
  async function update(s, keepInputs) {
    // the same file can be loaded under several URLs (relative paths): recolour every copy with this key
    for (const t of sprites.values()) if (t.key === s.key && t.data) await render(t);
    applyAll();
    if (keepInputs) {
      list.querySelectorAll('.sp').forEach((c, i) => {
        const t = sprites.get(shown[i]); if (!t || t.key !== s.key) return;
        c.querySelector('img').src = t.out;
        const map = swaps[t.key] || {};
        c.querySelectorAll('label.c').forEach((l, j) => { const h = t.palette[j]; l.style.background = map[h] || h; l.title = h + (map[h] ? ' → ' + map[h] : ''); });
      });
    } else drawList();
  }

  panel.addEventListener('click', async e => {
    const a = e.target.dataset.a; if (!a) return;
    if (a === 'pick') { picking = !picking; e.target.classList.toggle('on', picking); e.target.textContent = picking ? 'Picking' : 'Pick'; clearHover(); }
    if (a === 'min') { const hide = body.style.display !== 'none'; body.style.display = hide ? 'none' : ''; e.target.textContent = hide ? '+' : '–'; }
    if (a === 'exit') { localStorage.removeItem(ON); location.reload(); }
    if (a === 'resetall') { if (!confirm('Reset every colour change on every sprite?')) return; swaps = {}; save(); for (const s of sprites.values()) if (s.data) await render(s); applyAll(); drawList(); }
    if (a === 'copy') {
      const text = Object.entries(swaps).map(([k, m]) => k + '\n' + Object.entries(m).map(([f, t]) => `  ${f} → ${t}`).join('\n')).join('\n\n') || 'No colour changes yet.';
      try { await navigator.clipboard.writeText(text); e.target.textContent = 'Copied!'; } catch { prompt('Copy the swaps:', text); }
      setTimeout(() => (e.target.textContent = 'Copy swaps'), 1500);
    }
  });

  let hoverEl = null;
  const clearHover = () => { if (hoverEl) hoverEl.classList.remove('artist-hover'); hoverEl = null; };
  document.addEventListener('pointermove', e => {
    if (!picking || panel.contains(e.target)) return clearHover();
    const el = document.elementsFromPoint(e.clientX, e.clientY).find(el => !el.closest('#artist-panel') &&
      (el.matches('img, image') ? origOf(el) : /url\(/.test(getComputedStyle(el).backgroundImage) && spritesAtEl(el)));
    if (el === hoverEl) return; clearHover(); if (el && el !== document.body && el !== document.documentElement) { hoverEl = el; el.classList.add('artist-hover'); }
  }, true);
  const spritesAtEl = el => [...getComputedStyle(el).backgroundImage.matchAll(URL_RE)].some(m => isSprite(blobToOrig.get(m[2]) || abs(m[2])));

  // While picking, a click selects sprites instead of following links or pressing buttons.
  const swallow = e => { if (picking && !panel.contains(e.target)) { e.preventDefault(); e.stopPropagation(); } };
  ['pointerdown', 'pointerup', 'mousedown', 'mouseup'].forEach(t => document.addEventListener(t, swallow, { capture: true, passive: false }));
  document.addEventListener('click', async e => {
    if (!picking || panel.contains(e.target)) return;
    e.preventDefault(); e.stopPropagation();
    const urls = spritesAt(e.clientX, e.clientY);
    if (!urls.length) return;
    await Promise.all(urls.map(load));
    shown = urls; body.style.display = ''; panel.querySelector('[data-a=min]').textContent = '–';
    drawList();
  }, true);

  async function start() {
    document.body.append(panel);
    scanSheets();
    spriteEls(document).forEach(origOf);
    const all = await Promise.all([...sprites.values()].map(s => s.ready));
    for (const s of all) if (s && swaps[s.key]) await render(s);
    applyAll();
  }
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', start) : start();
})();
