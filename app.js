/* Vincent's Brand Books: a shelf of brand books that open on a desk.
   Every page lives in index.html; this file arranges pages into leaves and
   runs one animation loop for turns, corner peeks, tilt and light. */

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(pointer: fine)').matches;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = x => x * x * (3 - 2 * x);
const easeInOut = x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
const lerp = (a, b, k) => a + (b - a) * k;
const TURN_MS = reduce ? 1 : 950;
const PEEK_R = 190;     // px from a page corner where the corner starts to lift
const PEEK_MAX = 30;    // degrees a corner lifts at the very corner

/* ------------------------------------------------------------
   Book
   ------------------------------------------------------------ */
class Book {
  constructor(stand) {
    this.stand = stand;
    this.el = stand.querySelector('.book');
    this.pages = [...this.el.querySelectorAll(':scope > .pg')];
    this.ui = stand.querySelector('.book-ui');
    this.hint = this.ui.querySelector('.hint');
    this.prevBtn = this.ui.querySelector('.prev');
    this.nextBtn = this.ui.querySelector('.nextp');
    this.mode = null; this.t = 0; this.turnedOnce = false; this.invited = false;
    this.inner = this.pages.length - 2;
    this.peek = null; this.drag = null;
    this.pages.forEach((p, i) => {
      if (i === 0 || i === this.pages.length - 1) return;
      const f = document.createElement('span'); f.className = 'folio'; f.textContent = i; p.appendChild(f);
    });
    this.prevBtn.addEventListener('click', () => this.turn(-1));
    this.nextBtn.addEventListener('click', () => this.turn(1));
    this.bindPointer();
  }

  firstVisiblePage() { return this.mode === 'spread' ? (this.t === 0 ? 0 : 2 * this.t - 1) : this.t; }

  build(mode) {
    if (mode === this.mode) return;
    const keep = this.mode ? this.firstVisiblePage() : 0;
    this.mode = mode;
    this.el.classList.toggle('single', mode === 'single');
    this.el.textContent = '';
    const groups = [];
    if (mode === 'spread') for (let i = 0; i < this.pages.length; i += 2) groups.push([this.pages[i], this.pages[i + 1]]);
    else this.pages.forEach(p => groups.push([p, null]));
    this.leaves = groups.map(([a, b]) => {
      const leaf = document.createElement('div'); leaf.className = 'leaf';
      leaf.front = this.face('front', a); leaf.back = this.face('back', b);
      leaf.fs = leaf.front.querySelector('.shade'); leaf.bs = leaf.back.querySelector('.shade');
      leaf.append(leaf.front, leaf.back); this.el.appendChild(leaf);
      leaf.rot = 0; leaf.anim = null;
      return leaf;
    });
    this.n = this.leaves.length;
    this.castR = this.add('cast r'); this.castL = this.add('cast l');
    this.add('edges l'); this.add('edges r');
    this.add('fold l'); this.add('fold r'); this.add('sheen');
    this.el.style.setProperty('--cols', mode === 'spread' ? 2 : 1);
    this.t = clamp(mode === 'spread' ? Math.ceil(keep / 2) : keep, 0, this.n);
    this.leaves.forEach((l, i) => this.setRot(l, i < this.t ? -180 : 0));
    this.el.classList.add('no-anim');
    this.apply();
    requestAnimationFrame(() => requestAnimationFrame(() => this.el.classList.remove('no-anim')));
  }

  add(cls) { const d = document.createElement('div'); d.className = cls; this.el.appendChild(d); return d; }

  face(side, page) {
    const f = document.createElement('div'); f.className = 'face ' + side;
    if (page) { f.appendChild(page); if (page.classList.contains('cover')) f.classList.add('is-cover'); }
    else {
      const blank = document.createElement('div');
      blank.className = 'pg ' + (this.pages[1].classList.contains('dark') ? 'dark' : 'light');
      f.appendChild(blank);
    }
    const s = document.createElement('div'); s.className = 'shade'; f.appendChild(s);
    return f;
  }

  /* one leaf at one angle: transform and both shades */
  setRot(leaf, deg) {
    leaf.rot = deg;
    const lift = deg < -1 && deg > -179 ? 1 : 0;
    leaf.style.transform = `rotateY(${deg}deg) translateZ(${lift}px)`;
    const s = Math.sin(Math.abs(deg) * Math.PI / 180);
    leaf.fs.style.opacity = deg > -90 ? s * .75 : 0;
    leaf.bs.style.opacity = deg <= -90 ? s * .6 : 0;
  }

  /* the shadow a moving leaf casts on the page underneath it */
  castFrom(leaf) {
    const deg = leaf ? leaf.rot : 0;
    const s = Math.sin(Math.abs(deg) * Math.PI / 180);
    this.castR.style.opacity = leaf && deg > -90 && deg < -.5 ? s * .9 : 0;
    this.castL.style.opacity = leaf && this.mode === 'spread' && deg <= -90 && deg > -179.5 ? s * .9 : 0;
  }

  apply() {
    const { n, t } = this;
    this.leaves.forEach((leaf, i) => {
      const active = leaf.anim || (this.drag && this.drag.leaf === leaf) || (this.peek && this.peek.leaf === leaf);
      leaf.style.zIndex = active ? n + 5 + (n - i) : (i < t ? i + 1 : n - i + 1);
      leaf.front.inert = i !== t;
      leaf.back.inert = !(this.mode === 'spread' && i === t - 1);
    });
    const pw = parseFloat(getComputedStyle(this.el).getPropertyValue('--pw')) || 0;
    let shift = 0;
    if (this.mode === 'spread') { if (t === 0) shift = -pw / 2; if (t === n) shift = pw / 2; }
    this.el.style.setProperty('--shift', shift + 'px');
    this.el.style.setProperty('--left-n', this.mode === 'spread' ? Math.max(0, t - 1) * 2 : 0);
    this.el.style.setProperty('--right-n', Math.max(0, n - t - 1) * 2);
    this.el.classList.toggle('closed-front', t === 0);
    this.el.classList.toggle('closed-back', t === n);
    this.stand.classList.toggle('is-open', t > 0 && t < n);
    this.prevBtn.disabled = t === 0; this.nextBtn.disabled = t === n;
    let text;
    if (!this.turnedOnce && t === 0) text = 'Drag the page corner, or press the arrow keys';
    else if (t === 0) text = 'Front cover';
    else if (t === n) text = 'Back cover';
    else if (this.mode === 'spread') text = `Pages ${2 * t - 1} and ${2 * t} of ${this.inner}`;
    else text = `Page ${t} of ${this.inner}`;
    this.hint.textContent = text;
    this.nextBtn.textContent = t === 0 ? 'Open the book' : 'Next';
    this.onchange && this.onchange();
  }

  animate(leaf, to, ms = TURN_MS) {
    leaf.anim = { from: leaf.rot, to, t0: performance.now(), ms };
    loop.wake();
  }

  turn(dir) {
    const target = this.t + dir;
    if (target < 0 || target > this.n) return;
    const leaf = this.leaves[dir > 0 ? this.t : this.t - 1];
    if (this.peek && this.peek.leaf !== leaf) this.setRot(this.peek.leaf, this.peek.base);
    this.peek = null;
    this.t = target; this.turnedOnce = true;
    sfx.flip();
    this.animate(leaf, dir > 0 ? -180 : 0);
    this.apply();
  }

  /* the cover corner lifts once when a book is first ready, to show that it turns */
  invite() {
    if (this.invited || this.turnedOnce || reduce || this.t !== 0) return;
    this.invited = true;
    const leaf = this.leaves[0];
    this.animate(leaf, -26, 650);
    leaf.anim.then = () => setTimeout(() => { if (this.t === 0 && !this.drag && !this.peek) this.animate(leaf, 0, 750); }, 250);
  }

  /* per-frame work for this book; returns true while something still moves */
  tick(now) {
    let busy = false, castLeaf = null;
    for (const leaf of this.leaves) {
      if (!leaf.anim) continue;
      const a = leaf.anim, k = clamp((now - a.t0) / a.ms, 0, 1);
      this.setRot(leaf, lerp(a.from, a.to, easeInOut(k)));
      castLeaf = leaf;
      if (k >= 1) { leaf.anim = null; a.then && a.then(); this.apply(); } else busy = true;
    }
    if (this.peek && !this.drag) {
      const { leaf, base, target } = this.peek;
      if (!leaf.anim) {
        const goal = base + target;
        const next = lerp(leaf.rot, goal, .2);
        this.setRot(leaf, Math.abs(next - goal) < .05 ? goal : next);
        castLeaf = leaf;
        if (leaf.rot !== goal) busy = true;
        else if (target === 0) { this.peek = null; this.apply(); }
      }
    }
    if (this.drag && this.drag.leaf) castLeaf = this.drag.leaf;
    this.castFrom(castLeaf);
    return busy;
  }

  bindPointer() {
    const el = this.el;
    el.addEventListener('pointerdown', e => {
      if (e.button !== 0 || e.target.closest('a, button, input')) return;
      this.drag = { x: e.clientX, y: e.clientY, id: e.pointerId, target: e.target };
    });
    el.addEventListener('pointermove', e => {
      const d = this.drag;
      if (d && e.pointerId === d.id) { this.dragMove(e); return; }
      if (fine && !reduce) this.peekAt(e);
    });
    el.addEventListener('pointerleave', () => {
      el.classList.remove('near-r', 'near-l');
      if (this.peek) { this.peek.target = 0; loop.wake(); }
    });
    const end = e => {
      const d = this.drag;
      if (!d || e.pointerId !== d.id) return;
      this.drag = null;
      el.classList.remove('dragging');
      if (d.leaf) {
        const done = d.dir > 0 ? d.leaf.rot < -55 : d.leaf.rot > -125;
        if (done) { this.t += d.dir; this.turnedOnce = true; sfx.flip(); }
        this.peek = null;
        const to = (d.dir > 0) === done ? -180 : 0;
        this.animate(d.leaf, to, done ? 600 : 450);
        this.apply();
        return;
      }
      if (e.type === 'pointercancel') return;
      const r = el.getBoundingClientRect();
      this.turn(e.clientX >= r.left + r.width / 2 ? 1 : -1);
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  dragMove(e) {
    const d = this.drag, dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.leaf) {
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy)) return;
      const dir = dx < 0 ? 1 : -1;
      if ((dir > 0 && this.t >= this.n) || (dir < 0 && this.t <= 0)) return;
      d.dir = dir; d.leaf = this.leaves[dir > 0 ? this.t : this.t - 1];
      if (this.peek && this.peek.leaf !== d.leaf) this.setRot(this.peek.leaf, this.peek.base);
      this.peek = null;
      d.leaf.anim = null; d.start = d.leaf.rot;
      this.el.classList.add('dragging');
      this.el.setPointerCapture(e.pointerId);
      this.apply();
    }
    const pw = d.leaf.offsetWidth;
    this.setRot(d.leaf, clamp(d.start + dx / (pw * 1.05) * 180, -180, 0));
    loop.wake();
  }

  peekAt(e) {
    if (this.drag) return;
    const r = this.el.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const dR = Math.hypot(r.width - x, r.height - y), dL = Math.hypot(x, r.height - y);
    let peek = null;
    if (dR < PEEK_R && this.t < this.n) peek = { leaf: this.leaves[this.t], base: 0, target: -PEEK_MAX * Math.pow(1 - dR / PEEK_R, 1.3) };
    else if (dL < PEEK_R && this.t > 0 && this.mode === 'spread') peek = { leaf: this.leaves[this.t - 1], base: -180, target: PEEK_MAX * Math.pow(1 - dL / PEEK_R, 1.3) };
    if (peek && peek.leaf.anim) peek = null;
    this.el.classList.toggle('near-r', !!peek && peek.base === 0);
    this.el.classList.toggle('near-l', !!peek && peek.base === -180);
    if (peek) {
      if (this.peek && this.peek.leaf !== peek.leaf) this.setRot(this.peek.leaf, this.peek.base);
      this.peek = peek; this.apply(); loop.wake();
    } else if (this.peek) { this.peek.target = 0; loop.wake(); }
  }
}

/* ------------------------------------------------------------
   Sound: made in the browser with Web Audio, so nothing extra loads
   ------------------------------------------------------------ */
const sfx = (() => {
  let ctx = null, noiseBuf = null, on = true;
  try { on = localStorage.getItem('bb-sound') !== 'off'; } catch (e) {}
  const btn = document.querySelector('.sound');
  const paint = () => { if (!btn) return; btn.setAttribute('aria-pressed', on ? 'true' : 'false'); btn.setAttribute('aria-label', on ? 'Turn sound off' : 'Turn sound on'); btn.classList.toggle('muted', !on); };
  paint();
  btn && btn.addEventListener('click', () => { on = !on; paint(); try { localStorage.setItem('bb-sound', on ? 'on' : 'off'); } catch (e) {} });
  function ac() {
    if (!on) return null;
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
    if (!ctx) {
      ctx = new C();
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  // a burst of filtered noise: paper, cloth and wood friction
  function hiss(c, { at = 0, dur = .2, type = 'bandpass', f0 = 2000, f1 = f0, q = 1, gain = .2, attack = .01 }) {
    const t = c.currentTime + at;
    const src = c.createBufferSource(); src.buffer = noiseBuf; src.playbackRate.value = .9 + Math.random() * .2;
    const fl = c.createBiquadFilter(); fl.type = type; fl.Q.value = q;
    fl.frequency.setValueAtTime(f0, t); fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    src.connect(fl).connect(g).connect(c.destination); src.start(t, Math.random()); src.stop(t + dur + .05);
  }
  // a short low knock: a book meeting wood
  function knock(c, { at = 0, f = 110, dur = .18, gain = .35 }) {
    const t = c.currentTime + at;
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(f * 1.6, t); o.frequency.exponentialRampToValueAtTime(f, t + .05);
    const g = c.createGain(); g.gain.setValueAtTime(.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + .006); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + .05);
    hiss(c, { at, dur: .06, type: 'lowpass', f0: 1400, f1: 500, gain: gain * .5, attack: .003 });
  }
  return {
    pull() { const c = ac(); if (!c) return;   // the book slides out of the shelf, then lands on the desk
      hiss(c, { dur: .32, f0: 1600, f1: 700, q: .8, gain: .14, attack: .04 });
      hiss(c, { at: .28, dur: .3, type: 'lowpass', f0: 900, f1: 300, gain: .1, attack: .05 });
      knock(c, { at: .7, f: 120, gain: .28 }); },
    flip() { const c = ac(); if (!c) return;   // a soft, unhurried page turn
      hiss(c, { dur: .5, f0: 700, f1: 1900, q: .45, gain: .05, attack: .2 });
      hiss(c, { at: .24, dur: .42, type: 'lowpass', f0: 1600, f1: 420, gain: .035, attack: .14 }); },
    close() { const c = ac(); if (!c) return;   // the cover shutting on the pages
      hiss(c, { dur: .1, type: 'lowpass', f0: 2600, f1: 700, gain: .22, attack: .004 });
      knock(c, { at: .01, f: 85, dur: .26, gain: .5 }); },
    shelve() { const c = ac(); if (!c) return;  // sliding back into place
      hiss(c, { dur: .34, f0: 1300, f1: 600, q: .8, gain: .12, attack: .05 });
      knock(c, { at: .34, f: 150, dur: .14, gain: .22 }); },
  };
})();

/* ------------------------------------------------------------
   Shelf and desk
   ------------------------------------------------------------ */
const desk = document.querySelector('.desk');
const scenes = [...document.querySelectorAll('.scene')].map(el => ({
  el, id: el.id, wrap: el.querySelector('.book-wrap'), tilt: el.querySelector('.tilt'),
  notes: el.querySelector('.notes'), ui: el.querySelector('.book-ui'), book: null, tx: 0, ty: 0,
}));
const shelfBooks = [...document.querySelectorAll('.sb')];
const navLinks = [];
let G = {}, current = null, busyFlight = false;

/* each shelf book wears a copy of its real cover */
function dressShelf() {
  shelfBooks.forEach(sb => {
    const sc = scenes.find(s => s.id === sb.dataset.go);
    const cover = sc.el.querySelector('.pg.cover:not(.back)');
    const box = sb.querySelector('.sb-cover');
    const inner = document.createElement('div'); inner.className = 'sb-cover-in ' + [...sc.el.querySelector('.book').classList].filter(c => c.startsWith('theme-')).join(' ');
    inner.style.cssText = 'position:absolute;left:0;top:0;width:480px;height:660px;transform:scale(var(--k));transform-origin:0 0;filter:none;cursor:pointer';
    const clone = cover.cloneNode(true); clone.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
    inner.appendChild(clone); box.appendChild(inner);
  });
  sizeShelf();
}
function sizeShelf() {
  shelfBooks.forEach(sb => { const c = sb.querySelector('.sb-cover'); c.style.setProperty('--k', c.clientWidth / 480); });
  shelfBooks.forEach(sb => { const b = sb.querySelector('.sb-book'); sb.style.setProperty('--plank-y', (b.offsetTop + b.offsetHeight - 6) + 'px'); });
}

function measureNeed(pw) {
  let need = 0;
  scenes.forEach(s => {
    s.book.el.style.setProperty('--pw', pw + 'px');
    s.book.pages.forEach(pg => {
      if (pg.matches('.cover, .full-bleed, .report-page')) return;
      const old = pg.style.height; pg.style.height = 'auto';
      need = Math.max(need, pg.scrollHeight); pg.style.height = old;
    });
  });
  return need + 2;
}

function layout() {
  const vw = innerWidth, vh = innerHeight, phone = vw < 768;
  const bar = phone ? 58 : 64, pad = phone ? 16 : 48, uiH = 52;
  const availW = vw - 2 * pad;
  let mode = 'spread', pw = clamp(Math.floor(availW / 2), 380, 520);
  if (availW / 2 < 380) { mode = 'single'; pw = Math.min(520, vw - 2 * pad); }
  scenes.forEach(s => s.book.build(mode));
  document.documentElement.classList.toggle('short', !phone && vh < 780);
  const need = measureNeed(pw);
  const top = bar + (phone ? 16 : 22);
  const availH = vh - top - uiH - 18;
  const ph = mode === 'single' ? Math.max(380, Math.min(need, availH)) : Math.max(need, Math.min(availH, need + 60));
  const side = (vw - pw) / 2 - pad - 66;
  const narrow = mode === 'single' || side < 280;
  const bookTop = top + Math.max(0, (availH - ph) / 2);
  const cx = vw / 2;
  G = { vw, vh, pw, ph, mode, narrow, cx, bookTop, phone, pad };
  desk.classList.toggle('narrow', narrow);
  scenes.forEach(s => {
    s.el.style.setProperty('--cx', cx + 'px');
    s.el.style.setProperty('--book-top', bookTop + 'px');
    s.el.style.setProperty('--ui-top', (bookTop + ph + 14) + 'px');
    s.el.style.setProperty('--cover-gap', (pw + 132) + 'px');
    s.el.style.setProperty('--notes-top', (narrow ? bookTop + ph + uiH + 34 : bookTop) + 'px');
    s.el.style.setProperty('--notes-h', ph + 'px');
    s.book.el.style.setProperty('--pw', pw + 'px');
    s.book.el.style.setProperty('--ph', ph + 'px');
    s.tilt.style.setProperty('--ph', ph + 'px');
    s.book.apply();
  });
  sizeShelf();
}

function sceneState(s) {
  const b = s.book, closed = b.t === 0 || b.t === b.n;
  s.el.classList.toggle('notes-on', closed && s.el.dataset.ready === '1');
}

/* the transform that puts the closed desk cover exactly over a shelf cover */
function shelfTransform(s, sb) {
  const r = sb.querySelector('.sb-cover').getBoundingClientRect();
  const k = r.width / G.pw;
  const tx = r.left - G.cx + k * G.pw / 2, ty = r.top - G.bookTop;
  return `translate(${tx}px, ${ty}px) scale(${k})`;
}

function resetBook(b) {
  b.peek = null; b.drag = null;
  b.leaves.forEach(l => { l.anim = null; b.setRot(l, 0); });
  b.t = 0; b.apply(); b.castFrom(null);
}

function openBook(id, { fly = true, push = true } = {}) {
  const s = scenes.find(x => x.id === id); if (!s || busyFlight) return;
  if (current && current !== s) { switchBook(s); return; }
  if (current === s) return;
  const sb = shelfBooks.find(b => b.dataset.go === id);
  current = s;
  document.documentElement.classList.add('desk-open');
  desk.hidden = false; s.el.hidden = false; s.el.dataset.ready = '0';
  layout(); resetBook(s.book); sceneState(s);
  const fromShelf = fly && !reduce && sb && sb.getBoundingClientRect().bottom > 0;
  if (fly) sfx.pull();
  if (fromShelf) {
    busyFlight = true;
    sb.classList.add('away');
    desk.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 380, easing: 'ease-out' });
    const a = s.wrap.animate([{ transform: shelfTransform(s, sb) }, { transform: 'none' }], { duration: 760, easing: 'cubic-bezier(.2,.75,.2,1)' });
    a.onfinish = () => { busyFlight = false; ready(s); };
  } else {
    desk.animate([{ opacity: 0 }, { opacity: 1 }], { duration: reduce ? 1 : 280 });
    ready(s);
  }
  s.el.querySelector('.desk-back').focus({ preventScroll: true });
  if (push) history.pushState({ book: id }, '', '#' + id);
  markNav(id);
}

function ready(s) {
  s.el.dataset.ready = '1'; sceneState(s);
  setTimeout(() => { if (current === s) s.book.invite(); }, 1300);
}

function switchBook(next) {
  const prev = current;
  sfx.pull();
  prev.el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220 }).onfinish = () => {
    prev.el.hidden = true; resetBook(prev.book); prev.el.dataset.ready = '0'; sceneState(prev);
    shelfBooks.forEach(b => b.classList.toggle('away', b.dataset.go === next.id));
    current = next; next.el.hidden = false; next.el.dataset.ready = '0';
    layout(); resetBook(next.book); sceneState(next);
    next.wrap.animate([{ transform: 'translateY(40px) scale(.96)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: reduce ? 1 : 520, easing: 'cubic-bezier(.2,.75,.2,1)' });
    next.el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
    setTimeout(() => ready(next), reduce ? 0 : 420);
    history.replaceState({ book: next.id }, '', '#' + next.id);
    markNav(next.id);
  };
}

function closeBook({ push = true } = {}) {
  const s = current; if (!s || busyFlight) return;
  const sb = shelfBooks.find(b => b.dataset.go === s.id);
  const b = s.book;
  busyFlight = true;
  s.el.dataset.ready = '0'; sceneState(s);
  if (push) history.pushState({}, '', location.pathname);
  // close the book page by page, the last turned leaf first, so the cover lands on top
  let wait = 0;
  if (b.t > 0 && !reduce) {
    const turned = b.leaves.slice(0, b.t).reverse();
    b.peek = null; b.drag = null;
    turned.forEach((leaf, k) => setTimeout(() => b.animate(leaf, 0, 520), k * 85));
    b.t = 0; b.apply();
    wait = (turned.length - 1) * 85 + 540;
    if (turned.length > 1) sfx.flip();
    setTimeout(() => sfx.close(), wait - 40);
    wait += 260;
  } else if (b.t > 0) { resetBook(b); }
  setTimeout(() => flyHome(s, sb), wait);
}

function flyHome(s, sb) {
  const done = () => {
    resetBook(s.book);
    desk.hidden = true; s.el.hidden = true; current = null; busyFlight = false;
    document.documentElement.classList.remove('desk-open');
    shelfBooks.forEach(x => x.classList.remove('away'));
    sb && sb.focus({ preventScroll: true });
    markNav(null);
  };
  if (reduce || !sb) { done(); return; }
  sfx.shelve();
  s.tilt.style.transform = 'none';
  const a = s.wrap.animate([{ transform: 'none' }, { transform: shelfTransform(s, sb) }], { duration: 640, easing: 'cubic-bezier(.5,0,.2,1)', fill: 'forwards' });
  desk.animate([{ opacity: 1 }, { opacity: 1, offset: .6 }, { opacity: 0 }], { duration: 640, fill: 'forwards' });
  a.onfinish = () => { done(); a.cancel(); desk.getAnimations().forEach(x => x.cancel()); };
}

function markNav(id) { navLinks.forEach(a => a.setAttribute('aria-current', a.hash === '#' + id ? 'true' : 'false')); }

/* ------------------------------------------------------------
   One loop: page turns, peeks, desk tilt and the lamp that follows the pointer
   ------------------------------------------------------------ */
const ptr = { x: .5, y: .5, sx: .5, sy: .5 };
const loop = {
  running: false,
  wake() { if (!loop.running) { loop.running = true; requestAnimationFrame(loop.frame); } },
  frame(now) {
    let busy = false;
    for (const s of scenes) if (s.book.leaves && s.book.tick(now)) busy = true;
    if (!reduce && fine) {
      ptr.sx = lerp(ptr.sx, ptr.x, .08); ptr.sy = lerp(ptr.sy, ptr.y, .08);
      if (Math.abs(ptr.sx - ptr.x) > .001 || Math.abs(ptr.sy - ptr.y) > .001) busy = true;
      document.documentElement.style.setProperty('--mx', ptr.sx.toFixed(4));
      const s = current;
      if (s) {
        desk.style.setProperty('--sx', (.3 + ptr.sx * .4).toFixed(4));
        const tx = (ptr.sy - .5) * -4, ty = (ptr.sx - .5) * 6;
        s.tx = lerp(s.tx, tx, .1); s.ty = lerp(s.ty, ty, .1);
        if (Math.abs(s.tx - tx) > .01 || Math.abs(s.ty - ty) > .01) busy = true;
        s.tilt.style.transform = `rotateX(${s.tx.toFixed(3)}deg) rotateY(${s.ty.toFixed(3)}deg)`;
        s.book.el.style.setProperty('--hx', ptr.sx.toFixed(3));
        s.book.el.style.setProperty('--hy', ptr.sy.toFixed(3));
      }
    }
    if (busy) requestAnimationFrame(loop.frame); else loop.running = false;
  },
};
scenes.forEach(s => {
  s.book = new Book(s.el);
  s.book.onchange = () => { sceneState(s); if (G.narrow && s.book.t > 0 && s.book.t < s.book.n) s.el.scrollTo({ top: 0 }); };
});

addEventListener('pointermove', e => {
  if (e.pointerType !== 'mouse') return;
  ptr.x = e.clientX / innerWidth; ptr.y = e.clientY / innerHeight; loop.wake();
}, { passive: true });

/* shelf books lean toward the pointer while hovered */
shelfBooks.forEach(sb => {
  const book = sb.querySelector('.sb-book');
  sb.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse' || reduce) return;
    const r = book.getBoundingClientRect();
    const x = clamp((e.clientX - r.left) / r.width, 0, 1), y = clamp((e.clientY - r.top) / r.height, 0, 1);
    book.style.setProperty('--ry', (-10 + x * 16).toFixed(2) + 'deg');
    book.style.setProperty('--rx', (6 - y * 10).toFixed(2) + 'deg');
  });
  sb.addEventListener('pointerleave', () => { book.style.removeProperty('--ry'); book.style.removeProperty('--rx'); });
  sb.addEventListener('click', () => openBook(sb.dataset.go));
});

navLinks.forEach(a => a.addEventListener('click', e => { e.preventDefault(); openBook(a.hash.slice(1)); }));
document.querySelectorAll('.desk-back').forEach(b => b.addEventListener('click', () => closeBook()));
document.querySelectorAll('.desk-next, .pg [data-go]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); openBook(b.dataset.go); }));

addEventListener('keydown', e => {
  if (e.target.closest && e.target.closest('input, textarea')) return;
  if (/^[1-9]$/.test(e.key) && +e.key <= scenes.length && !e.metaKey && !e.ctrlKey && !e.altKey) { openBook(scenes[+e.key - 1].id); return; }
  if (!current) return;
  if (e.key === 'Escape') { closeBook(); return; }
  if (e.key === 'ArrowRight') { e.preventDefault(); current.book.turn(1); }
  if (e.key === 'ArrowLeft') { e.preventDefault(); current.book.turn(-1); }
});

addEventListener('popstate', () => {
  const id = location.hash.slice(1);
  if (scenes.some(s => s.id === id)) openBook(id, { fly: false, push: false });
  else if (current) closeBook({ push: false });
});

let rt;
addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(layout, 120); });

dressShelf();
layout();
addEventListener('load', () => { layout(); sizeShelf(); });
if (scenes.some(s => s.id === location.hash.slice(1))) openBook(location.hash.slice(1), { fly: false, push: false });
