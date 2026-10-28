// Shared helpers for every Muze page.
// The daily seed is the local date, so everyone gets the same prompt. A seed in the
// URL hash (#abc123) is free play: a different prompt that can be shared by link.
const Muze = (() => {
  const pad = n => String(n).padStart(2, '0');
  const now = new Date();
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const hashSeed = decodeURIComponent(location.hash.slice(1));
  const daily = !hashSeed;
  const seed = hashSeed || today;
  const LAUNCH = new Date(2026, 9, 28);
  const day = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - LAUNCH) / 864e5) + 1;

  // xmur3 string hash -> mulberry32 generator.
  function rng(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; }
    h = Math.imul(h ^ h >>> 16, 2246822507); h = Math.imul(h ^ h >>> 13, 3266489909);
    let a = (h ^= h >>> 16) >>> 0;
    return () => {
      a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  const pick = (arr, r) => arr[Math.floor(r() * arr.length)];
  function shuffle(arr, r) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  // Saves: {seed, st}. Daily and free play keep separate slots so free play never clobbers today.
  const slot = game => `muze-${game}${daily ? '' : '-free'}`;
  function load(game) {
    try { const s = JSON.parse(localStorage.getItem(slot(game))); return s && s.seed === seed ? s.st : null; } catch (e) { return null; }
  }
  function save(game, st) {
    try { localStorage.setItem(slot(game), JSON.stringify({ seed, st })); return true; } catch (e) { return false; }
  }
  // Keeps finished daily text pieces (poems, stories) so a shelf page can show them later.
  function keep(game, text) {
    if (!daily) return;
    try {
      const k = 'muze-shelf', s = JSON.parse(localStorage.getItem(k)) || {};
      (s[today] = s[today] || {})[game] = text;
      localStorage.setItem(k, JSON.stringify(s));
    } catch (e) {}
  }

  function freePlay() {
    location.hash = Math.random().toString(36).slice(2, 8);
    location.reload();
  }

  // Header: back link, day label, title, and a free-play button.
  function header({ title, lede, another = 'Another one' }) {
    const wrap = document.querySelector('.wrap');
    const dateTxt = now.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    const when = daily ? `Day ${day} · ${dateTxt}` : `Free play · <a href="${location.pathname}">back to today</a>`;
    wrap.insertAdjacentHTML('afterbegin',
      `<header class="bar"><a href="./">← The Muze</a><div class="when">${when}</div></header>
       <div class="titlerow"><h1>${title}</h1><button class="btn ghost" id="another">${another}</button></div>
       ${lede ? `<p class="lede">${lede}</p>` : ''}`);
    document.getElementById('another').onclick = freePlay;
    addEventListener('hashchange', () => location.reload());
  }

  let toastT;
  function toast(msg) {
    let el = document.querySelector('.toast');
    if (!el) { el = document.createElement('div'); el.className = 'toast'; el.setAttribute('role', 'status'); document.body.append(el); }
    el.textContent = msg; el.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('on'), 1800);
  }

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); toast('Copied'); }
    catch (e) { toast('Could not copy'); }
  }

  function download(canvas, name) {
    canvas.toBlob(b => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b); a.download = `${name}-${daily ? today : seed}.png`;
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }, 'image/png');
  }

  // Caption used on saved images and copied text.
  const tag = daily ? `The Muze · Day ${day}` : `The Muze · free play #${seed}`;

  const css = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  // Freehand drawing on a canvas: round brush, pen pressure, undo snapshots.
  // bg null leaves the canvas transparent (for drawing over another layer); erase rubs out to transparent.
  function sketch(cv, { bg = '#FFFDF8', onStart, onEnd } = {}) {
    const g = cv.getContext('2d');
    const s = { color: '#1E1B17', size: 8, erase: false, locked: false, history: [] };
    const wipe = () => { g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, cv.width, cv.height); if (bg) { g.fillStyle = bg; g.fillRect(0, 0, cv.width, cv.height); } };
    wipe();
    const snap = () => {
      const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height;
      c.getContext('2d').drawImage(cv, 0, 0); s.history.push(c); if (s.history.length > 15) s.history.shift();
    };
    const pt = e => { const R = cv.getBoundingClientRect(); return [(e.clientX - R.left) * cv.width / R.width, (e.clientY - R.top) * cv.height / R.height]; };
    const width = e => e.pointerType === 'pen' && e.pressure ? s.size * (0.3 + e.pressure * 1.2) : s.size;
    let last = null;
    cv.style.touchAction = 'none';
    cv.addEventListener('pointerdown', e => {
      if (s.locked || (onStart && onStart() === false)) return;
      e.preventDefault(); snap(); cv.setPointerCapture(e.pointerId);
      last = pt(e);
      g.globalCompositeOperation = s.erase ? 'destination-out' : 'source-over';
      g.fillStyle = s.color; g.beginPath(); g.arc(...last, width(e) / 2, 0, Math.PI * 2); g.fill();
    });
    cv.addEventListener('pointermove', e => {
      if (!last) return;
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
      g.strokeStyle = s.color; g.lineCap = g.lineJoin = 'round';
      for (const ev of evs.length ? evs : [e]) {
        const p = pt(ev); g.lineWidth = width(ev); g.beginPath(); g.moveTo(...last); g.lineTo(...p); g.stroke(); last = p;
      }
    });
    const end = () => { if (last) { last = null; onEnd && onEnd(); } };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    s.undo = () => { const c = s.history.pop(); if (!c) return false; g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, cv.width, cv.height); g.drawImage(c, 0, 0); return true; };
    s.clear = () => { snap(); wipe(); };
    s.load = url => new Promise(res => { const im = new Image(); im.onload = () => { wipe(); g.drawImage(im, 0, 0); res(); }; im.src = url; });
    s.toDataURL = () => cv.toDataURL('image/png');
    return s;
  }

  // A text card as an image: wrapped, centred blocks on paper, with optional colour swatches.
  function card({ width = 1000, pad = 80, bg = '#FAF6EC', blocks }) {
    const c = document.createElement('canvas'), g = c.getContext('2d');
    const laid = blocks.map(b => {
      g.font = b.font;
      const lines = [];
      String(b.text).split('\n').forEach(par => {
        let line = '';
        par.split(' ').forEach(w => {
          const t = line ? line + ' ' + w : w;
          if (g.measureText(t).width > width - pad * 2 - (b.indent || 0) && line) { lines.push(line); line = w; } else line = t;
        });
        lines.push(line);
      });
      return { ...b, lines, lh: b.lh || parseFloat(b.font.match(/(\d+)px/)[1]) * 1.4 };
    });
    const H = pad * 2 + laid.reduce((h, b) => h + (b.gap || 0) + (b.swatch ? Math.max(b.lh * b.lines.length, 56) : b.lh * b.lines.length), 0);
    c.width = width; c.height = H;
    g.fillStyle = bg; g.fillRect(0, 0, width, H);
    let y = pad;
    laid.forEach(b => {
      y += b.gap || 0;
      g.font = b.font; g.fillStyle = b.color || '#2A2620'; g.textBaseline = 'top';
      g.textAlign = b.align || 'center';
      const x = b.align === 'left' ? pad + (b.indent || 0) : width / 2;
      if (b.swatch) { g.save(); g.fillStyle = b.swatch; g.beginPath(); g.arc(pad + 22, y + 26, 22, 0, Math.PI * 2); g.fill(); g.restore(); }
      b.lines.forEach((l, i) => g.fillText(l, x, y + i * b.lh));
      y += b.swatch ? Math.max(b.lh * b.lines.length, 56) : b.lh * b.lines.length;
    });
    return c;
  }

  // Rough English syllable count; good enough for a guess the player can correct.
  function syllables(word) {
    let w = word.toLowerCase().replace(/[^a-z]/g, '');
    if (!w) return 0;
    if (w.length <= 3) return 1;
    w = w.replace(/(?:[^laeiouy]es|[^laeiouy]ed|[^laeiouy]e)$/, '').replace(/^y/, '');
    const m = w.match(/[aeiouy]{1,2}/g);
    return m ? m.length : 1;
  }

  const PALETTES = [
    ['#264653', '#2A9D8F', '#E9C46A', '#F4A261', '#E76F51'], ['#1D3557', '#457B9D', '#A8DADC', '#F1FAEE', '#E63946'],
    ['#3D405B', '#81B29A', '#F2CC8F', '#E07A5F', '#F4F1DE'], ['#22223B', '#4A4E69', '#9A8C98', '#C9ADA7', '#F2E9E4'],
    ['#0B3954', '#087E8B', '#BFD7EA', '#FF5A5F', '#C81D25'], ['#2B2D42', '#8D99AE', '#EDF2F4', '#EF233C', '#D90429'],
    ['#335C67', '#FFF3B0', '#E09F3E', '#9E2A2B', '#540B0E'], ['#606C38', '#283618', '#FEFAE0', '#DDA15E', '#BC6C25'],
    ['#003049', '#D62828', '#F77F00', '#FCBF49', '#EAE2B7'], ['#5F0F40', '#9A031E', '#FB8B24', '#E36414', '#0F4C5C'],
    ['#390099', '#9E0059', '#FF0054', '#FF5400', '#FFBD00'], ['#03045E', '#0077B6', '#00B4D8', '#90E0EF', '#CAF0F8'],
    ['#10002B', '#3C096C', '#7B2CBF', '#C77DFF', '#E0AAFF'], ['#582F0E', '#7F4F24', '#A68A64', '#C2C5AA', '#656D4A'],
    ['#FFBE0B', '#FB5607', '#FF006E', '#8338EC', '#3A86FF'], ['#0D1B2A', '#1B263B', '#415A77', '#778DA9', '#E0E1DD'],
    ['#2D6A4F', '#40916C', '#74C69D', '#B7E4C7', '#FFB4A2'], ['#7400B8', '#5390D9', '#48BFE3', '#64DFDF', '#80FFDB'],
    ['#F72585', '#B5179E', '#560BAD', '#3A0CA3', '#4CC9F0'], ['#353535', '#3C6E71', '#FFFFFF', '#D9D9D9', '#284B63'],
    ['#EF476F', '#FFD166', '#06D6A0', '#118AB2', '#073B4C'], ['#6F1D1B', '#BB9457', '#432818', '#99582A', '#FFE6A7'],
    ['#F6BD60', '#F7EDE2', '#F5CAC3', '#84A59D', '#F28482'], ['#011627', '#FDFFFC', '#2EC4B6', '#E71D36', '#FF9F1C'],
  ];

  // Simple things to draw: used by One Line and Pixel Postcard.
  const SUBJECTS = ('a teapot|a bicycle|a cat asleep|a house plant|a snail|a hot-air balloon|a lighthouse|an umbrella|a fish|a pair of glasses|' +
    'a mushroom|a rocket|a teacup|a key|a crown|a chair|a whale|a bird on a branch|a lightbulb|a pineapple|an ice cream cone|a guitar|' +
    'a sailing boat|a cactus|a rabbit|an octopus|a castle|a cloud with rain|a tree|a hand|your own face|a dog|a horse|a shoe|a clock|' +
    'a bee|a strawberry|a car|a camera|a moon and star|an owl|a snowman|a candle|a fox|a bridge|a mountain|a frog|a pear|a feather|' +
    'a sun|a butterfly|a ghost|a robot|a cupcake|a dinosaur|a penguin|a watering can|a lamp|a book|a mug of coffee|a turtle|a bus|' +
    'a heart|a duck|a slice of pizza|a flower in a pot|a hedgehog|a skull|an anchor|a crab|a planet with rings|a cherry|a bell').split('|');

  return { today, daily, seed, day, rng, pick, shuffle, load, save, keep, header, toast, copy, download, tag, css,
    sketch, card, syllables, PALETTES, SUBJECTS };
})();
