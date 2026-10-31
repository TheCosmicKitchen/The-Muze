// The little people, shared by Vale and the gallery. A person is an object with:
// x, y (feet), dir (1 or -1), shirt, skin, phase, wait, p; optional hat, hair, dress, load, hidden, run,
// and work: { kind } for a pose (chop, hoe, pet, pick, fetch, look, chin, point, photo, clap).
const Folk = (() => {
  const SHIRTS = ['#C8462E', '#3F6FB5', '#E0A23A', '#5B9A62', '#8C5BB0', '#D96C9A', '#3E8E9E'];
  const SKINS = ['#F2CDA8', '#D9A679', '#A8714A', '#7A4E30'];
  const HAIR = ['#3A2A20', '#7A4B2A', '#C9A14E', '#1F1B1A', '#9A9A9A', '#A8452E'];
  function person(c, f, now, cheer) {
    if (f.hidden) return;
    const job = f.work?.kind, moving = !job && f.wait <= 0 && f.p < 1;
    const t = now / (f.run ? 75 : 115) + f.phase, stride = moving ? Math.sin(t) * 4 : 0, d = f.dir;
    const low = job === 'pet' || job === 'pick' || job === 'fetch' ? 3 : 0;
    const lift = cheer ? Math.abs(Math.sin(now / 130 + f.phase)) * 9 : moving ? Math.abs(Math.cos(t)) * 1.8 : 0;
    const x = f.x, y = f.y - lift + low, bend = job === 'hoe' ? Math.sin(now / 340 + f.phase) * 1.6 + 1.5 : low ? 2 : 0;
    c.fillStyle = 'rgba(0,0,0,.16)'; c.beginPath(); c.ellipse(f.x, f.y + .5, 5, 2, 0, 0, 7); c.fill();
    c.strokeStyle = '#4A3A30'; c.lineWidth = 2; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x - 1, y - 6); c.lineTo(x - 1 - stride, y - low); c.moveTo(x + 1, y - 6); c.lineTo(x + 1 + stride, y - low); c.stroke();
    const hx = x + bend * d;   // shoulders lean into the work
    const swing = job === 'chop' ? Math.sin(now / 99 + f.phase) : job === 'hoe' ? Math.sin(now / 340 + f.phase) : 0;
    c.strokeStyle = f.skin; c.lineWidth = 1.8; c.beginPath();
    if (cheer) { c.moveTo(hx - 3, y - 12); c.lineTo(hx - 6, y - 19); c.moveTo(hx + 3, y - 12); c.lineTo(hx + 6, y - 19); }
    else if (job === 'chop') { c.moveTo(hx, y - 12); c.lineTo(hx + d * (5 + swing * 2), y - 13 - swing * 4); }
    else if (job === 'look') { c.moveTo(hx, y - 12); c.lineTo(hx - d * 5, y - 8); }
    else if (job === 'chin') { c.moveTo(hx, y - 12); c.lineTo(hx + d * 4, y - 15); }
    else if (job === 'point') { c.moveTo(hx, y - 12); c.lineTo(hx + d * 9, y - 19 + Math.sin(now / 300) * 1.2); }
    else if (job === 'photo') { c.moveTo(hx, y - 12); c.lineTo(hx + d * 6, y - 16); }
    else if (job === 'clap') { c.moveTo(hx, y - 12); c.lineTo(hx + d * (5 + Math.sin(now / 70) * 2.4), y - 13); c.moveTo(hx, y - 12); c.lineTo(hx + d * 7, y - 13); }
    else if (job) { c.moveTo(hx, y - 12); c.lineTo(hx + d * 7, y - 8 + (job === 'pet' ? Math.sin(now / 160) * 1.6 : 0)); }
    else { c.moveTo(hx - 3, y - 12); c.lineTo(hx - 4 + stride * .5, y - 7); c.moveTo(hx + 3, y - 12); c.lineTo(hx + 4 - stride * .5, y - 7); }
    c.stroke();
    if (job === 'chop' && !cheer) {
      const ax = hx + d * (5 + swing * 2), ay = y - 13 - swing * 4, tip = [ax + d * (5 + swing * 3), ay - 7 + swing * 12];
      c.strokeStyle = '#7A5433'; c.lineWidth = 1.8; c.beginPath(); c.moveTo(ax, ay); c.lineTo(...tip); c.stroke();
      c.fillStyle = '#AEB6BB'; c.fillRect(tip[0] - 2, tip[1] - 2.5, 5, 5);
    }
    if (job === 'hoe' && !cheer) { c.strokeStyle = '#7A5433'; c.lineWidth = 1.8; c.beginPath(); c.moveTo(hx + d * 5, y - 10); c.lineTo(hx + d * (12 + swing * 3), y + 1); c.stroke(); c.strokeStyle = '#8E979C'; c.lineWidth = 2.4; c.beginPath(); c.moveTo(hx + d * (10 + swing * 3), y + 1); c.lineTo(hx + d * (14 + swing * 3), y + 2); c.stroke(); }
    c.lineCap = 'butt';
    c.fillStyle = f.shirt; c.beginPath();
    if (f.dress) { c.moveTo(hx - 3, y - 14); c.lineTo(hx + 3, y - 14); c.lineTo(hx + 6, y - 3); c.lineTo(hx - 6, y - 3); c.fill(); }
    else { c.roundRect(hx - 4, y - 14, 8, 9, 2.5); c.fill(); }
    const nod = job === 'chin' ? Math.sin(now / 420 + f.phase) * .7 : 0;
    c.fillStyle = f.skin; c.beginPath(); c.arc(hx + d * .5, y - 17.5 + nod, 3.6, 0, 7); c.fill();
    if (f.hair) { c.fillStyle = f.hair; c.beginPath(); c.arc(hx + d * .5, y - 18 + nod, 3.8, Math.PI * (d > 0 ? .85 : .2), Math.PI * (d > 0 ? 1.8 : 2.15)); c.fill(); }
    if (job === 'photo') { c.fillStyle = '#2B2B30'; c.fillRect(hx + d * 6 - 2.5, y - 18.5, 5, 4); }
    if (f.hat) { c.fillStyle = '#E6C766'; c.beginPath(); c.ellipse(hx + d * .5, y - 19.5, 5.5, 1.6, 0, 0, 7); c.fill(); c.fillRect(hx - 2.5 + d * .5, y - 23, 6, 3.5); }
    if (f.load === 'log' || (job === 'drop' && f.load === 'log')) { c.save(); c.translate(hx, y - 15); c.rotate(-.35 * d); c.fillStyle = '#8A5F3A'; c.fillRect(-9, -2.5, 18, 5); c.fillStyle = '#D9B98C'; c.beginPath(); c.arc(9 * d, 0, 2.5, 0, 7); c.fill(); c.restore(); }
    if (f.load === 'sack') { c.fillStyle = '#E6D5AE'; c.beginPath(); c.ellipse(hx - d * 4, y - 15, 5.5, 6.5, 0, 0, 7); c.fill(); }
    if (f.load === 'pail') { c.fillStyle = '#9AA7AD'; c.fillRect(hx + d * 4 - 2, y - 9, 6, 6); c.fillStyle = '#8CCDE1'; c.fillRect(hx + d * 4 - 2, y - 9, 6, 2); }
    if (f.load === 'flower') { c.fillStyle = '#F2A7C0'; c.beginPath(); c.arc(hx + d * 6, y - 11, 3, 0, 7); c.fill(); c.fillStyle = '#FFD65C'; c.beginPath(); c.arc(hx + d * 6, y - 11, 1.2, 0, 7); c.fill(); }
  }
  return { SHIRTS, SKINS, HAIR, person };
})();
