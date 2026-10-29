// Shared cut-and-paste for Collage and Funnies.
// Source side: pick a scrap, zoom in, and cut a piece with a select tool
// (freehand, polygon, box, oval or the whole thing).
// Board side: pieces (and speech bubbles, if enabled) that you move, resize, rotate, flip and layer
// with the corner and top handles, a two-finger pinch, the sliders and nudge buttons, or the keyboard.
const CutPaste = (() => {
  const TOOLS = [
    ['free', 'Freehand', 'Draw around a shape'],
    ['poly', 'Polygon', 'Tap corner points, then tap the first point (or Finish) to close'],
    ['box', 'Box', 'Drag a rectangle'],
    ['oval', 'Oval', 'Drag an oval'],
    ['hand', 'Move', 'Drag to look around when zoomed in'],
  ];
  const BUBBLES = [['speech', 'Speech'], ['thought', 'Thought'], ['shout', 'Shout'], ['caption', 'Caption']];
  const uid = () => Math.random().toString(36).slice(2, 9);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

  // Bubble outline as SVG path strings (used by both the page and the saved image via Path2D).
  // Box is the text area; the body is drawn around it; tip is the tail point, relative to the box centre.
  function bubblePaths(style, w, h, tip) {
    const out = { body: '', tail: '', dots: [] };
    if (style === 'caption') {
      const p = h * 0.25 + 6;
      out.body = `M${-w / 2 - p},${-h / 2 - p}H${w / 2 + p}V${h / 2 + p}H${-w / 2 - p}Z`;
      return out;
    }
    const k = style === 'shout' ? 1.62 : 1.45, rx = w / 2 * k + 6, ry = h / 2 * k + 6;
    if (style === 'speech') out.body = `M${-rx},0A${rx},${ry} 0 1 0 ${rx},0A${rx},${ry} 0 1 0 ${-rx},0Z`;
    if (style === 'thought') {
      const n = Math.max(9, Math.round((rx + ry) / 14));
      const pts = Array.from({ length: n }, (_, i) => [Math.cos(i / n * Math.PI * 2) * rx, Math.sin(i / n * Math.PI * 2) * ry]);
      out.body = `M${pts[0]}` + pts.map((p, i) => { const q = pts[(i + 1) % n], c = Math.hypot(q[0] - p[0], q[1] - p[1]) * 0.62; return `A${c},${c} 0 0 1 ${q}`; }).join('') + 'Z';
    }
    if (style === 'shout') {
      const n = Math.max(14, Math.round((rx + ry) / 9));
      out.body = Array.from({ length: n * 2 }, (_, i) => {
        const a = i / (n * 2) * Math.PI * 2, f = i % 2 ? 0.78 : 1.04 + (i % 4 === 0 ? 0.08 : 0);
        return `${i ? 'L' : 'M'}${Math.cos(a) * rx * f},${Math.sin(a) * ry * f}`;
      }).join('') + 'Z';
    }
    // No tail when the tip sits inside the bubble.
    if (!tip || (tip[0] / rx) ** 2 + (tip[1] / ry) ** 2 < 1.05) return out;
    const d = Math.hypot(...tip), ux = tip[0] / d, uy = tip[1] / d, half = Math.min(rx, ry) * 0.32;
    if (style === 'thought') {
      // Little puffs leading out to the tip.
      const edge = 1 / Math.sqrt((ux / rx) ** 2 + (uy / ry) ** 2);
      [0.25, 0.55, 0.85].forEach((t, i) => {
        const s = edge + (d - edge) * t, r = Math.max(3, half * (0.55 - i * 0.15));
        out.dots.push([ux * s, uy * s, r]);
      });
      return out;
    }
    const b1 = [-uy * half, ux * half], b2 = [uy * half, -ux * half];
    const bend = [tip[0] * 0.55 - uy * half * 0.4, tip[1] * 0.55 + ux * half * 0.4];
    out.tail = `M${b1}Q${bend} ${tip}Q${bend} ${b2}Z`;
    return out;
  }
  const BUBBLE_FONT = { speech: '700 {px}px "Comic Neue", "Comic Sans MS", sans-serif', thought: 'italic 700 {px}px "Comic Neue", "Comic Sans MS", sans-serif',
    shout: '400 {px}px Bangers, Impact, sans-serif', caption: '700 {px}px "Comic Neue", "Comic Sans MS", sans-serif' };
  const bubbleFont = (style, px) => BUBBLE_FONT[style].replace('{px}', px.toFixed(1));

  function wrapLines(g, text, width) {
    const lines = [];
    String(text || ' ').toUpperCase().split('\n').forEach(par => {
      let line = '';
      par.split(' ').forEach(w => { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > width && line) { lines.push(line); line = w; } else line = t; });
      lines.push(line);
    });
    return lines;
  }

  function create(o) {
    const st = o.st;
    st.items = st.items || [];
    st.items.forEach(it => { it.id = it.id || uid(); });
    const { board, panel } = o.els;
    let sel = null, cur = 0, zoom = 1, tool = 'free';

    // ---------- Sources ----------
    const imgs = o.sources.map(s => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = s.src; }));
    imgs.forEach(p => p.catch(() => {}));

    const view = o.els.view;
    view.classList.add('cp-view');
    view.innerHTML = '<div class="cp-scroll"><div class="cp-stage"><img alt=""><canvas aria-label="Cut a piece out of this picture"></canvas></div></div><div class="cp-msg">Loading…</div>';
    const scroller = view.querySelector('.cp-scroll'), stage = view.querySelector('.cp-stage');
    const srcImg = view.querySelector('img'), cv = view.querySelector('canvas'), msg = view.querySelector('.cp-msg');
    const lg = cv.getContext('2d');

    o.sources.forEach((s, i) => {
      const b = el('button', 'cp-thumb', `<img alt="" src="${s.src}" loading="lazy">`);
      b.setAttribute('aria-pressed', i === 0); b.setAttribute('aria-label', s.label);
      b.onclick = () => { cur = i; o.els.thumbs.querySelectorAll('.cp-thumb').forEach(x => x.setAttribute('aria-pressed', x === b)); showSource(); };
      o.els.thumbs.append(b);
    });
    function showSource() {
      msg.hidden = false; msg.textContent = 'Loading…'; resetCut();
      srcImg.src = o.sources[cur].src; srcImg.alt = o.sources[cur].label;
      if (o.els.credit) o.els.credit.innerHTML = o.sources[cur].credit;
    }
    srcImg.onload = () => { msg.hidden = true; cv.width = srcImg.naturalWidth; cv.height = srcImg.naturalHeight; };
    srcImg.onerror = () => { msg.textContent = 'Couldn\'t load this picture. Try another scrap.'; };

    // Tool bar: select tools, zoom, polygon finish, whole picture.
    const tb = o.els.tools;
    tb.classList.add('cp-tools');
    TOOLS.forEach(([id, label, hint]) => {
      const b = el('button', 'btn', label); b.dataset.tool = id; b.title = hint; b.setAttribute('aria-pressed', id === tool);
      b.onclick = () => { tool = id; resetCut(); tb.querySelectorAll('[data-tool]').forEach(x => x.setAttribute('aria-pressed', x === b)); setHint(); cv.style.cursor = id === 'hand' ? 'grab' : 'crosshair'; };
      tb.append(b);
    });
    const zoomOut = el('button', 'btn', '−'), zoomLbl = el('span', 'cp-zoom', '1×'), zoomIn = el('button', 'btn', '+');
    zoomOut.setAttribute('aria-label', 'Zoom out'); zoomIn.setAttribute('aria-label', 'Zoom in');
    const zoomBox = el('span', 'cp-zoombox'); zoomBox.append(zoomOut, zoomLbl, zoomIn); tb.append(zoomBox);
    const setZoom = z => {
      const cx = (scroller.scrollLeft + scroller.clientWidth / 2) / stage.clientWidth, cy = (scroller.scrollTop + scroller.clientHeight / 2) / stage.clientHeight;
      zoom = Math.max(1, Math.min(4, z)); stage.style.width = zoom * 100 + '%'; zoomLbl.textContent = zoom + '×';
      scroller.scrollLeft = cx * stage.clientWidth - scroller.clientWidth / 2; scroller.scrollTop = cy * stage.clientHeight - scroller.clientHeight / 2;
      scroller.classList.toggle('zoomed', zoom > 1);
    };
    zoomOut.onclick = () => setZoom(zoom - 1); zoomIn.onclick = () => setZoom(zoom + 1);
    const whole = el('button', 'btn ghost', 'Whole picture');
    whole.onclick = () => { if (msg.hidden) addPiece([[0, 0], [1, 0], [1, 1], [0, 1]]); };
    tb.append(whole);
    const hintEl = el('div', 'cp-hint-line'); tb.after(hintEl);
    const polyBar = el('span', 'cp-polybar');
    const polyFinish = el('button', 'btn primary', 'Finish cut'), polyUndo = el('button', 'btn', 'Undo point');
    polyBar.append(polyFinish, polyUndo); hintEl.after(polyBar);
    polyFinish.onclick = () => finishPoly(); polyUndo.onclick = () => { if (pts) { pts.pop(); if (!pts.length) pts = null; drawCut(); } };
    function setHint() {
      hintEl.textContent = TOOLS.find(t => t[0] === tool)[2] + (zoom > 1 || tool === 'hand' ? '' : '. Zoom in for fiddly bits.');
      polyBar.hidden = !(tool === 'poly' && pts && pts.length);
    }

    let pts = null, start = null, hover = null, panFrom = null;
    const nat = e => { const R = cv.getBoundingClientRect(); return [(e.clientX - R.left) / R.width * cv.width, (e.clientY - R.top) / R.height * cv.height]; };
    const dispPx = () => cv.width / cv.getBoundingClientRect().width;   // source px per screen px
    function resetCut() { pts = null; start = null; hover = null; drawCut(); }
    function shapePts(a, b, kind) {
      const [x0, y0] = [Math.min(a[0], b[0]), Math.min(a[1], b[1])], [x1, y1] = [Math.max(a[0], b[0]), Math.max(a[1], b[1])];
      if (kind === 'box') return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      return Array.from({ length: 64 }, (_, i) => [cx + Math.cos(i / 64 * Math.PI * 2) * (x1 - x0) / 2, cy + Math.sin(i / 64 * Math.PI * 2) * (y1 - y0) / 2]);
    }
    function drawCut() {
      lg.clearRect(0, 0, cv.width, cv.height);
      let path = pts;
      if (start && hover && (tool === 'box' || tool === 'oval')) path = shapePts(start, hover, tool);
      if (path && path.length) {
        const k = dispPx();
        lg.save();
        lg.fillStyle = 'rgba(0,0,0,.35)'; lg.fillRect(0, 0, cv.width, cv.height);
        lg.globalCompositeOperation = 'destination-out';
        lg.beginPath(); path.forEach((p, i) => i ? lg.lineTo(...p) : lg.moveTo(...p));
        if (tool === 'poly' && hover) lg.lineTo(...hover);
        lg.closePath(); lg.fill();
        lg.restore();
        lg.lineWidth = 2 * k; lg.setLineDash([8 * k, 5 * k]); lg.strokeStyle = '#fff';
        lg.beginPath(); path.forEach((p, i) => i ? lg.lineTo(...p) : lg.moveTo(...p));
        if (tool === 'poly' && hover) lg.lineTo(...hover);
        if (tool !== 'poly') lg.closePath();
        lg.stroke(); lg.setLineDash([]);
        if (tool === 'poly') pts.forEach((p, i) => { lg.fillStyle = i ? '#fff' : '#C8462E'; lg.beginPath(); lg.arc(...p, (i ? 4 : 7) * k, 0, Math.PI * 2); lg.fill(); });
      }
      setHint();
    }
    function finishPoly() { if (pts && pts.length >= 3) { const p = pts; resetCut(); addPiece(p.map(([x, y]) => [x / cv.width, y / cv.height])); } }

    cv.addEventListener('pointerdown', e => {
      if (!msg.hidden) return;
      e.preventDefault();
      if (tool === 'hand') { panFrom = [e.clientX, e.clientY, scroller.scrollLeft, scroller.scrollTop]; cv.setPointerCapture(e.pointerId); return; }
      const p = nat(e);
      if (tool === 'poly') {
        if (pts && pts.length >= 3 && Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]) < 14 * dispPx()) return finishPoly();
        (pts = pts || []).push(p); drawCut(); return;
      }
      cv.setPointerCapture(e.pointerId);
      if (tool === 'free') pts = [p]; else { start = p; hover = p; }
      drawCut();
    });
    cv.addEventListener('pointermove', e => {
      if (panFrom) { scroller.scrollLeft = panFrom[2] - (e.clientX - panFrom[0]); scroller.scrollTop = panFrom[3] - (e.clientY - panFrom[1]); return; }
      if (tool === 'free' && pts) { pts.push(nat(e)); drawCut(); }
      else if ((tool === 'box' || tool === 'oval') && start) { hover = nat(e); drawCut(); }
      else if (tool === 'poly' && pts) { hover = nat(e); drawCut(); }
    });
    cv.addEventListener('pointerup', () => {
      if (panFrom) { panFrom = null; return; }
      let path = null;
      if (tool === 'free' && pts) { path = pts; }
      if ((tool === 'box' || tool === 'oval') && start) path = shapePts(start, hover, tool);
      if (tool === 'poly') return;
      resetCut();
      if (!path) return;
      const xs = path.map(q => q[0]), ys = path.map(q => q[1]), min = 12 * dispPx();
      if (path.length < 3 || Math.max(...xs) - Math.min(...xs) < min || Math.max(...ys) - Math.min(...ys) < min) return Muze.toast(tool === 'free' ? 'Draw all the way around a shape' : 'Drag out a bigger shape');
      const step = Math.max(1, Math.floor(path.length / 160));
      addPiece(path.filter((_, i) => i % step === 0).map(([x, y]) => [x / cv.width, y / cv.height]));
    });
    cv.addEventListener('pointerleave', () => { if (tool === 'poly' && pts) { hover = null; drawCut(); } });
    // Ctrl/⌘ + wheel zooms the source.
    scroller.addEventListener('wheel', e => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); setZoom(zoom + (e.deltaY < 0 ? 1 : -1)); } }, { passive: false });

    // ---------- Pieces ----------
    const cache = new Map();
    async function cut(it) {
      const key = JSON.stringify([it.a, it.poly]);
      if (cache.has(key)) return cache.get(key);
      const im = await imgs[it.a];
      const p = it.poly.map(([u, v]) => [u * im.naturalWidth, v * im.naturalHeight]);
      const x0 = Math.floor(Math.min(...p.map(q => q[0]))), y0 = Math.floor(Math.min(...p.map(q => q[1])));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.ceil(Math.max(...p.map(q => q[0])) - x0)); c.height = Math.max(1, Math.ceil(Math.max(...p.map(q => q[1])) - y0));
      const g = c.getContext('2d');
      g.beginPath(); p.forEach(([x, y], i) => i ? g.lineTo(x - x0, y - y0) : g.moveTo(x - x0, y - y0)); g.closePath(); g.clip();
      g.drawImage(im, -x0, -y0);
      cache.set(key, c); return c;
    }
    const topZ = () => Math.max(0, ...st.items.map(q => q.z || 0));
    async function addPiece(poly) {
      const it = { id: uid(), k: 'p', a: cur, poly: poly.map(([x, y]) => [+x.toFixed(4), +y.toFixed(4)]), x: 0.5, y: 0.5, s: 1, r: 0, f: 1, v: 1, z: topZ() + 1 };
      const c = await cut(it);
      // Start at the size it looked on the source, but never bigger than 80% of the board.
      const W = board.clientWidth, H = board.clientHeight, u = W / o.base;
      it.s = +Math.min(1, 0.8 * W / (c.width * u), 0.8 * H / (c.height * u)).toFixed(3);
      it.x = 0.5 + (Math.random() - 0.5) * 0.2; it.y = 0.5 + (Math.random() - 0.5) * 0.2;
      st.items.push(it); select(it); change();
    }

    // ---------- Bubbles ----------
    function addBubble(style = 'speech') {
      const it = { id: uid(), k: 'b', style, text: style === 'caption' ? 'Meanwhile…' : 'Hello!', x: 0.3 + Math.random() * 0.4, y: 0.25 + Math.random() * 0.2,
        w: 0.16, fs: 26, tx: 0.06, ty: 0.18, z: topZ() + 1 };
      st.items.push(it); select(it); change();
      setTimeout(() => panel.querySelector('textarea')?.select(), 0);
    }

    // ---------- Board ----------
    board.classList.add('cp-board');
    const hint = el('div', 'cp-empty', o.empty || 'Cut a piece out of a scrap. It lands here.');
    const selBox = el('div', 'cp-sel', '<span class="cp-h cp-rot" title="Drag to rotate"></span><span class="cp-h cp-scale" title="Drag to resize"></span>');
    const tipH = el('span', 'cp-h cp-tip'); tipH.title = 'Drag to point the tail';
    board.append(hint, selBox, tipH);
    const nodes = new Map();
    const unit = () => board.clientWidth / o.base;

    function geom(it, node) {
      const W = board.clientWidth, H = board.clientHeight;
      if (it.k === 'b') {
        const tw = it.w * W, th = node ? node.txt.offsetHeight : 20;
        return { cx: it.x * W, cy: it.y * H, w: tw, h: th, r: 0 };
      }
      const c = node && node.src;
      return { cx: it.x * W, cy: it.y * H, w: (c ? c.width : 10) * unit() * it.s, h: (c ? c.height : 10) * unit() * it.s, r: it.r };
    }
    async function sync() {
      const ids = new Set(st.items.map(i => i.id));
      for (const [id, n] of nodes) if (!ids.has(id)) { n.root.remove(); nodes.delete(id); }
      for (const it of st.items) {
        let n = nodes.get(it.id);
        if (!n) {
          if (it.k === 'p') {
            const src = await cut(it).catch(() => null); if (!src || !st.items.includes(it)) continue;
            const c = el('canvas', 'cp-piece'); c.width = src.width; c.height = src.height; c.getContext('2d').drawImage(src, 0, 0);
            n = { root: c, src };
          } else {
            const root = el('div', 'cp-bubble');
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'cp-bsvg');
            const txt = el('div', 'cp-btxt'); root.append(svg, txt); n = { root, svg, txt };
          }
          n.root.dataset.id = it.id; nodes.set(it.id, n); board.append(n.root);
        }
        place(it, n);
      }
      hint.hidden = st.items.length > 0;
      placeSel();
    }
    function place(it, n) {
      const g = geom(it, n);
      if (it.k === 'p') {
        Object.assign(n.root.style, { width: g.w + 'px', height: g.h + 'px', zIndex: it.z,
          transform: `translate(${g.cx - g.w / 2}px,${g.cy - g.h / 2}px) rotate(${it.r}deg) scale(${it.f},${it.v || 1})` });
        return;
      }
      const W = board.clientWidth, px = it.fs * W / 1000;
      Object.assign(n.txt.style, { width: g.w + 'px', font: bubbleFont(it.style, px), lineHeight: 1.15 });
      n.txt.textContent = (it.text || ' ').toUpperCase();
      const h = n.txt.offsetHeight, tip = [it.tx * W, it.ty * board.clientHeight];
      const p = bubblePaths(it.style, g.w, h, it.style === 'caption' ? null : tip);
      const fill = it.style === 'caption' ? '#FFF1B8' : '#fff';
      n.svg.innerHTML = `<g stroke="#111" stroke-width="2.4" stroke-linejoin="round">
        ${p.tail ? `<path d="${p.tail}" fill="none"/>` : ''}<path d="${p.body}" fill="none"/>
        ${p.dots.map(d => `<circle cx="${d[0]}" cy="${d[1]}" r="${d[2]}" fill="${fill}"/>`).join('')}</g>
        ${p.tail ? `<path d="${p.tail}" fill="${fill}"/>` : ''}<path d="${p.body}" fill="${fill}"/>`;
      Object.assign(n.root.style, { zIndex: 2000 + it.z, transform: `translate(${g.cx}px,${g.cy}px)` });
      n.txt.style.transform = `translate(${-g.w / 2}px,${-h / 2}px)`;
    }
    function placeSel() {
      const it = sel && st.items.includes(sel) ? sel : null;
      selBox.hidden = !it; tipH.hidden = !(it && it.k === 'b' && it.style !== 'caption');
      board.classList.toggle('has-sel', !!it);
      renderPanel();
      if (!it) return;
      const n = nodes.get(it.id), g = geom(it, n);
      const pad = it.k === 'b' ? (it.style === 'caption' ? 10 : g.w * 0.25) : 0;
      Object.assign(selBox.style, { width: g.w + pad * 2 + 'px', height: g.h + pad * 2 + 'px', zIndex: 5000,
        transform: `translate(${g.cx - g.w / 2 - pad}px,${g.cy - g.h / 2 - pad}px) rotate(${g.r}deg)` });
      selBox.querySelector('.cp-rot').hidden = it.k === 'b';
      if (it.k === 'b') Object.assign(tipH.style, { zIndex: 5001, transform: `translate(${it.tx * board.clientWidth + g.cx}px,${it.ty * board.clientHeight + g.cy}px)` });
    }
    function select(it) { sel = it; placeSel(); }
    let saveT;
    function change() { sync(); clearTimeout(saveT); saveT = setTimeout(() => o.persist(), 250); }

    // Dragging, handles and two-finger pinch.
    const ptrs = new Map();
    let act = null;
    const bp = e => { const R = board.getBoundingClientRect(); return [e.clientX - R.left, e.clientY - R.top]; };
    board.addEventListener('pointerdown', e => {
      ptrs.set(e.pointerId, bp(e));
      const W = board.clientWidth, H = board.clientHeight;
      if (ptrs.size === 2 && sel) {
        const [a, b] = [...ptrs.values()];
        act = { kind: 'pinch', d0: Math.hypot(b[0] - a[0], b[1] - a[1]), a0: Math.atan2(b[1] - a[1], b[0] - a[0]), s0: sel.k === 'b' ? sel.fs : sel.s, r0: sel.r || 0, w0: sel.w };
        return;
      }
      const h = e.target.closest('.cp-h');
      const target = h ? sel : st.items.find(i => i.id === e.target.closest('[data-id]')?.dataset.id);
      if (!target) { if (!e.target.closest('.cp-sel')) select(null); return; }
      e.preventDefault(); try { board.setPointerCapture(e.pointerId); } catch (err) {}
      if (sel !== target) select(target);
      const g = geom(target, nodes.get(target.id)), p = bp(e);
      if (h && h.classList.contains('cp-tip')) act = { kind: 'tip' };
      else if (h && h.classList.contains('cp-rot')) act = { kind: 'rot', r0: target.r, a0: Math.atan2(p[1] - g.cy, p[0] - g.cx) };
      else if (h) act = { kind: 'scale', d0: Math.hypot(p[0] - g.cx, p[1] - g.cy), s0: target.s, w0: target.w, fs0: target.fs };
      else act = { kind: 'move', dx: p[0] - target.x * W, dy: p[1] - target.y * H };
    });
    board.addEventListener('pointermove', e => {
      if (!ptrs.has(e.pointerId)) return;
      ptrs.set(e.pointerId, bp(e));
      if (!act || !sel) return;
      const W = board.clientWidth, H = board.clientHeight, p = bp(e), g = geom(sel, nodes.get(sel.id));
      if (act.kind === 'pinch' && ptrs.size === 2) {
        const [a, b] = [...ptrs.values()], k = Math.hypot(b[0] - a[0], b[1] - a[1]) / act.d0;
        if (sel.k === 'b') { sel.w = Math.max(0.05, Math.min(0.9, act.w0 * k)); }
        else { sel.s = Math.max(0.05, Math.min(8, act.s0 * k)); sel.r = Math.round(act.r0 + (Math.atan2(b[1] - a[1], b[0] - a[0]) - act.a0) * 180 / Math.PI); }
      } else if (act.kind === 'move') {
        sel.x = Math.max(-0.2, Math.min(1.2, (p[0] - act.dx) / W)); sel.y = Math.max(-0.2, Math.min(1.2, (p[1] - act.dy) / H));
      } else if (act.kind === 'scale') {
        const k = Math.hypot(p[0] - g.cx, p[1] - g.cy) / act.d0;
        if (sel.k === 'b') sel.w = Math.max(0.05, Math.min(0.9, act.w0 * k)); else sel.s = Math.max(0.05, Math.min(8, act.s0 * k));
      } else if (act.kind === 'rot') {
        let r = act.r0 + (Math.atan2(p[1] - g.cy, p[0] - g.cx) - act.a0) * 180 / Math.PI;
        if (e.shiftKey) r = Math.round(r / 15) * 15;
        sel.r = Math.round(((r + 540) % 360) - 180);
      } else if (act.kind === 'tip') { sel.tx = (p[0] - g.cx) / W; sel.ty = (p[1] - g.cy) / H; }
      const n = nodes.get(sel.id); if (n) place(sel, n); placeSel();
    });
    const up = e => { ptrs.delete(e.pointerId); if (act && ptrs.size === 0) { act = null; change(); } else if (act && act.kind === 'pinch') act = null; };
    board.addEventListener('pointerup', up); board.addEventListener('pointercancel', up);
    addEventListener('resize', () => sync());

    // ---------- Fine-tuning panel ----------
    panel.classList.add('cp-panel');
    function renderPanel() {
      const it = sel && st.items.includes(sel) ? sel : null;
      const all = `<button class="btn ghost cp-clear" data-a="clear">Delete all</button>`;
      const add = o.bubbles ? `<span class="cp-add">${BUBBLES.map(([s, l]) => `<button class="btn" data-add="${s}">+ ${l}</button>`).join('')}</span>` : '';
      if (!it) {
        panel.innerHTML = `<div class="cp-row">${add}<span class="gap"></span>${all}</div>
          <p class="cp-tip-text">Tap something to select it. Drag the corner dot to resize${o.bubbles ? ', the tail dot to point a bubble' : ', the top dot to rotate'}. Two fingers pinch and twist. Arrow keys nudge.</p>`;
        return;
      }
      const isB = it.k === 'b';
      panel.innerHTML = `
        ${isB ? `<div class="cp-row"><textarea rows="2" aria-label="Bubble text" maxlength="200"></textarea></div>
          <div class="cp-row cp-styles">${BUBBLES.map(([s, l]) => `<button class="btn" data-style="${s}" aria-pressed="${it.style === s}">${l}</button>`).join('')}</div>` : ''}
        <div class="cp-row"><label>${isB ? 'Width' : 'Size'} <input type="range" data-k="size" min="${isB ? 5 : 5}" max="${isB ? 90 : 400}" step="1"></label><output data-o="size"></output></div>
        ${isB ? `<div class="cp-row"><label>Text <input type="range" data-k="fs" min="12" max="80" step="1"></label><output data-o="fs"></output></div>`
              : `<div class="cp-row"><label>Turn <input type="range" data-k="rot" min="-180" max="180" step="1"></label><output data-o="rot"></output></div>`}
        <div class="cp-row cp-btns">
          <span class="cp-nudge"><button class="btn" data-n="-1,0" aria-label="Nudge left">←</button><button class="btn" data-n="0,-1" aria-label="Nudge up">↑</button><button class="btn" data-n="0,1" aria-label="Nudge down">↓</button><button class="btn" data-n="1,0" aria-label="Nudge right">→</button></span>
          ${isB ? '' : '<button class="btn" data-a="fh">Flip ↔</button><button class="btn" data-a="fv">Flip ↕</button>'}
          <button class="btn" data-a="fwd">Forward</button><button class="btn" data-a="back">Back</button>
          <button class="btn" data-a="dup">Copy</button><button class="btn" data-a="del">Delete</button>
        </div>
        <div class="cp-row">${add}<span class="gap"></span>${all}</div>`;
      fillPanel();
      const ta = panel.querySelector('textarea');
      if (ta) { ta.value = it.text; ta.oninput = () => { it.text = ta.value; const n = nodes.get(it.id); place(it, n); placeSelNoPanel(); change(); }; }
      panel.querySelectorAll('input[type=range]').forEach(r => r.oninput = () => {
        const v = +r.value;
        if (r.dataset.k === 'size') { if (isB) it.w = v / 100; else it.s = v / 100; }
        if (r.dataset.k === 'rot') it.r = v;
        if (r.dataset.k === 'fs') it.fs = v;
        const n = nodes.get(it.id); if (n) place(it, n); placeSelNoPanel(); fillPanel(); change();
      });
    }
    function fillPanel() {
      const it = sel; if (!it) return;
      const set = (k, v, txt) => { const r = panel.querySelector(`[data-k=${k}]`), out = panel.querySelector(`[data-o=${k}]`); if (r && document.activeElement !== r) r.value = v; if (out) out.textContent = txt; };
      if (it.k === 'b') { set('size', Math.round(it.w * 100), Math.round(it.w * 100) + '%'); set('fs', it.fs, it.fs); }
      else { set('size', Math.round(it.s * 100), Math.round(it.s * 100) + '%'); set('rot', it.r, it.r + '°'); }
    }
    // Move the selection box without rebuilding the panel (keeps focus in sliders and text).
    function placeSelNoPanel() {
      const it = sel; if (!it) return;
      const n = nodes.get(it.id), g = geom(it, n), pad = it.k === 'b' ? (it.style === 'caption' ? 10 : g.w * 0.25) : 0;
      Object.assign(selBox.style, { width: g.w + pad * 2 + 'px', height: g.h + pad * 2 + 'px', transform: `translate(${g.cx - g.w / 2 - pad}px,${g.cy - g.h / 2 - pad}px) rotate(${g.r}deg)` });
      if (it.k === 'b') tipH.style.transform = `translate(${it.tx * board.clientWidth + g.cx}px,${it.ty * board.clientHeight + g.cy}px)`;
    }
    panel.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.add) return addBubble(b.dataset.add);
      if (b.dataset.a === 'clear') {
        if (!st.items.length || !confirm('Delete everything on the board?')) return;
        st.items.length = 0; sel = null; change(); return;
      }
      const it = sel; if (!it) return;
      if (b.dataset.style) { it.style = b.dataset.style; change(); renderPanel(); return; }
      if (b.dataset.n) { const [dx, dy] = b.dataset.n.split(',').map(Number); nudge(it, dx, dy, false); return; }
      const a = b.dataset.a;
      if (a === 'fh') it.f = -(it.f || 1);
      if (a === 'fv') it.v = -(it.v || 1);
      if (a === 'fwd') { const above = st.items.filter(q => q.z > it.z).sort((p, q) => p.z - q.z)[0]; if (above) [it.z, above.z] = [above.z, it.z]; }
      if (a === 'back') { const below = st.items.filter(q => q.z < it.z).sort((p, q) => q.z - p.z)[0]; if (below) [it.z, below.z] = [below.z, it.z]; }
      if (a === 'dup') { const c = JSON.parse(JSON.stringify(it)); c.id = uid(); c.x += 0.03; c.y += 0.03; c.z = topZ() + 1; st.items.push(c); sel = c; }
      if (a === 'del') { st.items.splice(st.items.indexOf(it), 1); sel = null; }
      change(); if (a === 'dup' || a === 'del') placeSel();
    });
    function nudge(it, dx, dy, big) {
      const step = big ? 10 : 1;
      it.x += dx * step / board.clientWidth; it.y += dy * step / board.clientHeight;
      const n = nodes.get(it.id); if (n) place(it, n); placeSelNoPanel(); change();
    }
    addEventListener('keydown', e => {
      if (!sel || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
      const k = e.key, it = sel;
      const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (arrows[k]) { e.preventDefault(); return nudge(it, ...arrows[k], e.shiftKey); }
      if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); st.items.splice(st.items.indexOf(it), 1); sel = null; change(); return; }
      if (k === 'Escape') return select(null);
      if (it.k === 'p' && (k === '[' || k === ']')) it.r = Math.round(it.r + (k === '[' ? -5 : 5));
      else if (k === '-' || k === '_') { if (it.k === 'b') it.w = Math.max(0.05, it.w / 1.05); else it.s = Math.max(0.05, it.s / 1.05); }
      else if (k === '=' || k === '+') { if (it.k === 'b') it.w = Math.min(0.9, it.w * 1.05); else it.s = Math.min(8, it.s * 1.05); }
      else return;
      e.preventDefault(); const n = nodes.get(it.id); if (n) place(it, n); placeSelNoPanel(); fillPanel(); change();
    });

    // ---------- Saving as an image ----------
    // layer: 'p' for pieces, 'b' for bubbles. W, H are the output size.
    async function draw(g, W, H, layer, { shadow = true } = {}) {
      await document.fonts.ready;
      const u = W / o.base;
      for (const it of [...st.items].sort((a, b) => a.z - b.z)) {
        if (it.k !== layer) continue;
        if (it.k === 'p') {
          const src = await cut(it).catch(() => null); if (!src) continue;
          const w = src.width * u * it.s, h = src.height * u * it.s;
          g.save(); g.translate(it.x * W, it.y * H); g.rotate(it.r * Math.PI / 180); g.scale(it.f || 1, it.v || 1);
          if (shadow) { g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 8; g.shadowOffsetY = 3; }
          g.drawImage(src, -w / 2, -h / 2, w, h); g.restore();
          continue;
        }
        const px = it.fs * W / 1000, tw = it.w * W, lh = px * 1.15;
        g.save(); g.translate(it.x * W, it.y * H);
        g.font = bubbleFont(it.style, px);
        const lines = wrapLines(g, it.text, tw), th = lines.length * lh;
        const p = bubblePaths(it.style, tw, th, it.style === 'caption' ? null : [it.tx * W, it.ty * H]);
        const fill = it.style === 'caption' ? '#FFF1B8' : '#fff';
        g.lineWidth = 2.4 * W / board.clientWidth; g.lineJoin = 'round'; g.strokeStyle = '#111';
        if (p.tail) g.stroke(new Path2D(p.tail));
        g.stroke(new Path2D(p.body));
        p.dots.forEach(([x, y, r]) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fillStyle = fill; g.fill(); g.stroke(); });
        g.fillStyle = fill;
        if (p.tail) g.fill(new Path2D(p.tail));
        g.fill(new Path2D(p.body));
        g.fillStyle = '#111'; g.textAlign = 'center'; g.textBaseline = 'middle';
        lines.forEach((l, i) => g.fillText(l, 0, -th / 2 + lh * (i + 0.5)));
        g.restore();
      }
    }

    showSource(); setHint(); sync();
    return { draw, sync, select, get items() { return st.items; }, sources: o.sources };
  }
  return { create };
})();
