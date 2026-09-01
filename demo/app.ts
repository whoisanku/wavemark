// wavemark playground. `'wavemark'` resolves to ../src/index.ts (tsconfig
// paths) and is bundled into app.js by scripts/build.ts — the demo runs the
// real library, exactly as a consumer would import it.
//
// Everything here is plain DOM + CSS: the scroll reveals are an
// IntersectionObserver, avatar changes crossfade through a second canvas, the
// segmented controls slide a measured thumb, and the page's accent colour is
// sampled from the current avatar's pixels. No framework, no animation lib.
import { wavemark, type RGB, type WavemarkOptions, type WavemarkStyle } from 'wavemark';

const SAMPLES = [
  'ada', 'grace', 'turing', 'hello@example.com', 'user_4821', 'dijkstra',
  'hopper', 'lovelace', 'noether', 'curie', 'ramanujan', 'anonymous',
];

const CHIPS = ['ada', 'grace', 'turing', 'hello@example.com'];

const SHUFFLE = [
  'ada', 'grace', 'turing', 'hopper', 'lovelace', 'noether', 'curie', 'ramanujan',
  'dijkstra', 'hamilton', 'euler', 'gauss', 'emmy', 'katherine', 'margaret', 'hedy',
  'faraday', 'maxwell', 'feynman', 'octocat', 'hello@example.com', 'user_4821',
  'id-7f3a9c', 'wavemark',
];

/** `user: null` means "the name currently typed in the box". */
const COMMENTS: { user: string | null; when: string; text: string }[] = [
  { user: null,        when: 'just now', text: 'Shipping the new avatars today. Thoughts?' },
  { user: 'grace',     when: '2 min',    text: 'They still read at 24 px. That is the whole point.' },
  { user: 'hopper',    when: '9 min',    text: 'Same string in, same avatar out. Sold.' },
  { user: 'user_4821', when: '14 min',   text: 'Does it need a build step?' },
  { user: 'dijkstra',  when: '1 h',      text: 'No. One import from the CDN and you are done.' },
];

const STYLES: { id: WavemarkStyle; blurb: string }[] = [
  { id: 'nodal', blurb: 'A soft line wherever the waves cancel.' },
  { id: 'pen',   blurb: 'A uniform hairline, however steep the wave.' },
  { id: 'halo',  blurb: 'The nodal core with a faint, wide bloom.' },
];

/** The header mark and favicon: the avatar for "wavemark", a fixed identity. */
const BRAND = 'wavemark';
const DEBOUNCE_MS = 120;
/** The hero breathes at 30 fps in pure JS; cap its backing so that stays cheap. */
const HERO_MAX_BACKING = 512;

let DPR = Math.min(2, window.devicePixelRatio || 1);
const state = { name: 'ankit', style: 'nodal' as WavemarkStyle, breathe: false };
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
const root = document.documentElement;

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const options = (): WavemarkOptions => ({ style: state.style, breathe: state.breathe });
const shownName = (): string => (state.name.trim() ? state.name : 'anonymous');
const motionOk = (): boolean => !reduceMotion.matches;

// ---- avatars ----
//
// Small avatars are supersampled. The renderer has no anti-aliasing, so at a
// 30 px backing a nodal line breaks into dots — and simply giving the visible
// canvas a bigger backing doesn't help, because the browser minifies canvases
// with a bilinear filter that skips pixels. So: render with wavemark() into an
// offscreen canvas at a few times the device pixels, then drawImage() it down
// into the visible canvas with imageSmoothingQuality 'high', which does a real
// area filter. The nodal and halo line widths live in field space, so the look
// is unchanged; pen's hairline is defined in backing pixels and would thin out,
// so pen renders directly at device resolution.
//
// Every avatar is two stacked canvases: before a re-render, the old frame is
// copied into the "ghost" on top, which then fades out over the new frame.

function supersample(backing: number, style: WavemarkStyle | undefined): number {
  if (style === 'pen') return 1;
  return Math.min(4, Math.max(1, Math.round(120 / backing)));
}

interface Avatar {
  el: HTMLElement;
  render(name: string, opts: WavemarkOptions): void;
  setLabel(label: string): void;
  setSize(cssSize: number): void;
}

function avatar(cssSize: number, label?: string, cfg: { fluid?: boolean; maxBacking?: number } = {}): Avatar {
  const el = document.createElement('span');
  el.className = 'av';
  const canvas = document.createElement('canvas');
  const ghost = document.createElement('canvas');
  canvas.className = 'avatar';
  ghost.className = 'avatar ghost';
  ghost.setAttribute('aria-hidden', 'true');
  if (label) { canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', label); }
  else canvas.setAttribute('aria-hidden', 'true');
  el.append(canvas, ghost);

  let size = cssSize;
  const applySize = (): void => { if (!cfg.fluid) el.style.width = el.style.height = `${size}px`; };
  applySize();

  const off = document.createElement('canvas');
  let blitting = 0;
  let handle: { stop(): void } | null = null; // the library's handle for whichever canvas we last drew into
  let drawn = false;

  function render(name: string, opts: WavemarkOptions): void {
    cancelAnimationFrame(blitting);
    handle?.stop();
    const backing = Math.min(Math.round(size * DPR), cfg.maxBacking ?? Infinity);

    const fade = drawn && motionOk() && canvas.width === backing;
    if (fade) {
      if (ghost.width !== backing) ghost.width = ghost.height = backing;
      const g = ghost.getContext('2d')!;
      g.clearRect(0, 0, backing, backing);
      g.drawImage(canvas, 0, 0);
      ghost.classList.add('show');
      void ghost.offsetWidth; // commit opacity 1 now, so removing .show below transitions
    }

    canvas.width = canvas.height = backing;
    const ss = supersample(backing, opts.style);
    if (ss === 1) {
      handle = wavemark(name, canvas, opts);
    } else {
      off.width = off.height = backing * ss;
      handle = wavemark(name, off, opts);
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      const animate = !!opts.breathe && motionOk();
      const blit = (): void => {
        ctx.clearRect(0, 0, backing, backing);
        ctx.drawImage(off, 0, 0, backing, backing);
        if (animate) blitting = requestAnimationFrame(blit);
      };
      blit();
    }
    drawn = true;
    if (fade) requestAnimationFrame(() => ghost.classList.remove('show'));
  }

  return {
    el,
    render,
    setLabel: (l) => canvas.setAttribute('aria-label', l),
    setSize: (n) => { size = n; applySize(); },
  };
}

/** On fine pointers, an avatar breathes while hovered (unless everything already does). */
function hoverBreathe(target: HTMLElement, av: Avatar, name: () => string): void {
  if (!finePointer.matches) return;
  target.addEventListener('pointerenter', () => {
    if (state.breathe || !motionOk()) return;
    av.render(name(), { style: state.style, breathe: true });
  });
  target.addEventListener('pointerleave', () => {
    if (state.breathe) return;
    av.render(name(), options());
  });
}

// ---- accent colour, sampled from the avatar ----
//
// The two flat base tones of a render are its two most common opaque colours,
// and both sit on the palette's darkest→mid ramp (at 20% and 40%), so the
// palette's mid colour is 4·n1 − 3·n0. The brightest opaque pixel is the line
// colour. Only the public API is used: this is what any consumer could do.

const probe = document.createElement('canvas');
probe.width = probe.height = 32;

function peekPalette(name: string): { accent: RGB; line: RGB } {
  wavemark(name, probe);
  const { data } = probe.getContext('2d')!.getImageData(0, 0, probe.width, probe.height);
  const counts = new Map<number, number>();
  let line = 0, lineL = -1;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] !== 255) continue; // skip the soft rim and the outside
    const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    counts.set(key, (counts.get(key) ?? 0) + 1);
    const l = data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
    if (l > lineL) { lineL = l; line = key; }
  }
  const rgb = (k: number): RGB => [(k >> 16) & 255, (k >> 8) & 255, k & 255];
  const lum = (c: RGB): number => c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => rgb(k));
  if (top.length < 2) return { accent: rgb(line), line: rgb(line) };
  const [n0, n1] = lum(top[0]) <= lum(top[1]) ? [top[0], top[1]] : [top[1], top[0]];
  const c = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));
  return { accent: [c(4 * n1[0] - 3 * n0[0]), c(4 * n1[1] - 3 * n0[1]), c(4 * n1[2] - 3 * n0[2])], line: rgb(line) };
}

function applyAccent(name: string): void {
  const { accent, line } = peekPalette(name);
  root.style.setProperty('--accent-rgb', accent.join(' '));
  root.style.setProperty('--line-rgb', line.join(' '));
}

// ---- build the page once ----

const brandMark = avatar(26);
$('brand-mark').append(brandMark.el);

const stack = $('avatar-stack');
const hero = avatar(280, 'Avatar for the current name', { fluid: true, maxBacking: HERO_MAX_BACKING });
stack.append(hero.el);

const trio = STYLES.map(({ id, blurb }, i) => {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'style-card reveal';
  btn.style.setProperty('--i', String(i));
  btn.setAttribute('aria-pressed', String(state.style === id));
  const av = avatar(112, `${id} style`);
  const h = document.createElement('h3');
  h.textContent = id;
  const p = document.createElement('p');
  p.textContent = blurb;
  btn.append(av.el, h, p);
  btn.addEventListener('click', () => setStyle(id));
  hoverBreathe(btn, av, shownName);
  $('trio').append(btn);
  return { id, av, btn };
});

const grid = SAMPLES.map((name, i) => {
  const li = document.createElement('li');
  li.className = 'reveal';
  li.style.setProperty('--i', String(i));
  const figure = document.createElement('figure');
  figure.className = 'card';
  const av = avatar(60, `Avatar for ${name}`);
  const caption = document.createElement('figcaption');
  caption.textContent = name;
  figure.append(av.el, caption);
  li.append(figure);
  hoverBreathe(figure, av, () => name);
  $('grid').append(li);
  return { name, av };
});

const thread = COMMENTS.map(({ user, when, text }) => {
  const li = document.createElement('li');
  const av = avatar(24);
  const body = document.createElement('div');
  const meta = document.createElement('div');
  meta.className = 'meta';
  const author = document.createElement('strong');
  const time = document.createElement('time');
  time.textContent = when;
  const line = document.createElement('p');
  line.textContent = text;
  meta.append(author, time);
  body.append(meta, line);
  li.append(av.el, body);
  $('thread').append(li);
  return { user, av, author };
});

const chips = CHIPS.map((name) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'chip';
  b.textContent = name;
  b.addEventListener('click', () => setName(name));
  $('chips').append(b);
  return { name, b };
});

// ---- rendering ----

function renderBrand(): void {
  brandMark.render(BRAND, { style: 'nodal', breathe: true });
  $<HTMLLinkElement>('favicon').href = wavemark.toDataURL(BRAND, 32);
}

function renderCall(): void {
  const el = $('live-call');
  el.replaceChildren();
  const tok = (cls: string, text: string): void => {
    const s = document.createElement('span');
    s.className = cls;
    s.textContent = text;
    el.append(s);
  };
  tok('tk-fn', 'wavemark');
  tok('tk-pun', '(');
  tok('tk-str', `'${shownName().replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`);
  tok('tk-pun', ', ');
  tok('tk-var', 'canvas');
  const opts: [string, string, string][] = [];
  if (state.style !== 'nodal') opts.push(['style', `'${state.style}'`, 'tk-str']);
  if (state.breathe) opts.push(['breathe', 'true', 'tk-kw']);
  if (opts.length) {
    tok('tk-pun', ', { ');
    opts.forEach(([k, v, cls], i) => {
      if (i) tok('tk-pun', ', ');
      tok('tk-prop', k);
      tok('tk-pun', ': ');
      tok(cls, v);
    });
    tok('tk-pun', ' }');
  }
  tok('tk-pun', ')');
}

function renderHero(): void {
  hero.render(state.name, options());
  hero.setLabel(`Avatar for ${shownName()}`);
  applyAccent(state.name);
  renderCall();
  if (motionOk()) {
    stack.classList.remove('pop');
    void stack.offsetWidth;
    stack.classList.add('pop');
  }
}

function renderTrio(): void {
  for (const { id, av, btn } of trio) {
    av.render(state.name, { style: id, breathe: state.breathe });
    btn.setAttribute('aria-pressed', String(state.style === id));
  }
}

function renderGrid(): void {
  for (const { name, av } of grid) av.render(name, options());
}

function renderThread(onlyCurrentName = false): void {
  for (const { user, av, author } of thread) {
    if (onlyCurrentName && user !== null) continue;
    author.textContent = user ?? shownName();
    av.render(user ?? state.name, options());
  }
}

function syncChips(): void {
  for (const { name, b } of chips) b.classList.toggle('active', name === state.name);
}

function renderAll(): void {
  renderHero();
  renderTrio();
  renderGrid();
  renderThread();
  syncChips();
}

// ---- controls ----

const nameInput = $<HTMLInputElement>('name');
const styleRadios = document.querySelectorAll<HTMLInputElement>('input[name="style"]');
const motionRadios = document.querySelectorAll<HTMLInputElement>('input[name="motion"]');

/** Segmented controls: measure the checked label and slide the thumb under it. */
const segs = [...document.querySelectorAll<HTMLElement>('.seg')].map((seg) => {
  const thumb = seg.querySelector<HTMLElement>('.seg-thumb')!;
  const update = (): void => {
    const label = seg.querySelector<HTMLInputElement>('input:checked')?.parentElement;
    if (!label) return;
    thumb.style.setProperty('--x', `${label.offsetLeft}px`);
    thumb.style.setProperty('--w', `${label.offsetWidth}px`);
  };
  update();
  requestAnimationFrame(() => seg.classList.add('ready')); // no slide on first paint
  return update;
});
const updateSegs = (): void => segs.forEach((u) => u());

function setName(name: string, fromInput = false): void {
  state.name = name;
  if (!fromInput) nameInput.value = name;
  renderHero();
  renderTrio();
  renderThread(true);
  syncChips();
}

function setStyle(style: WavemarkStyle): void {
  state.style = style;
  for (const r of styleRadios) r.checked = r.value === style;
  updateSegs();
  renderAll();
}

function setBreathe(on: boolean): void {
  state.breathe = on;
  for (const r of motionRadios) r.checked = (r.value === 'animated') === on;
  updateSegs();
  renderAll();
}

let pending = 0;
nameInput.addEventListener('input', () => {
  window.clearTimeout(pending);
  pending = window.setTimeout(() => setName(nameInput.value, true), DEBOUNCE_MS);
});

for (const radio of styleRadios) {
  radio.addEventListener('change', () => { if (radio.checked) setStyle(radio.value as WavemarkStyle); });
}
for (const radio of motionRadios) {
  radio.addEventListener('change', () => { if (radio.checked) setBreathe(radio.value === 'animated'); });
}

$('shuffle').addEventListener('click', () => {
  const pool = SHUFFLE.filter((n) => n !== state.name);
  setName(pool[Math.floor(Math.random() * pool.length)]);
  nameInput.focus({ preventScroll: true });
});

function copyButton(btn: HTMLElement, text: () => string): void {
  let timer = 0;
  btn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(text()); } catch { return; }
    btn.classList.add('copied');
    window.clearTimeout(timer);
    timer = window.setTimeout(() => btn.classList.remove('copied'), 1400);
  });
}
copyButton($('copy-call'), () => $('live-call').textContent ?? '');

const tabs = document.querySelectorAll<HTMLButtonElement>('.code-tabs [role="tab"]');
const panels = document.querySelectorAll<HTMLElement>('.code-card [data-panel]');
for (const tab of tabs) {
  tab.addEventListener('click', () => {
    for (const t of tabs) t.setAttribute('aria-selected', String(t === tab));
    for (const p of panels) p.hidden = p.dataset['panel'] !== tab.dataset['tab'];
  });
}
copyButton($('copy-code'), () => [...panels].find((p) => !p.hidden)?.textContent?.trim() ?? '');

const syncMotionNote = (): void => { $('motion-note').hidden = !reduceMotion.matches; };
reduceMotion.addEventListener('change', () => { syncMotionNote(); renderAll(); });
syncMotionNote();

// ---- page motion ----

// Scroll reveals. Elements start hidden only when JS is running (the .js class
// on <html>), so the page never depends on this to be readable.
const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    e.target.classList.add('in');
    io.unobserve(e.target);
  }
}, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
for (const el of document.querySelectorAll('.reveal')) io.observe(el);

// Header gains a blurred backdrop once the page has scrolled.
const top = $('top');
const syncTop = (): void => { top.classList.toggle('scrolled', window.scrollY > 8); };
window.addEventListener('scroll', syncTop, { passive: true });
syncTop();

// The hero stage leans away from the pointer a little (glow one way, avatar the other).
const stage = $('stage');
if (finePointer.matches) {
  stage.addEventListener('pointermove', (e) => {
    if (!motionOk()) return;
    const r = stage.getBoundingClientRect();
    stage.style.setProperty('--px', ((e.clientX - r.left) / r.width - 0.5).toFixed(3));
    stage.style.setProperty('--py', ((e.clientY - r.top) / r.height - 0.5).toFixed(3));
  });
  stage.addEventListener('pointerleave', () => {
    stage.style.setProperty('--px', '0');
    stage.style.setProperty('--py', '0');
  });
}

// The hero avatar is fluid (sized by CSS); re-render at the new backing size
// when its box changes.
let heroSize = Math.round(stack.getBoundingClientRect().width) || 280;
hero.setSize(heroSize);
new ResizeObserver(() => {
  const s = Math.round(stack.getBoundingClientRect().width);
  if (!s || s === heroSize) return;
  heroSize = s;
  hero.setSize(s);
  renderHero();
}).observe(stack);

// Thumb positions depend on text metrics: re-measure once webfonts land and on resize.
document.fonts?.ready.then(updateSegs);
window.addEventListener('resize', updateSegs);

// Re-render everything when the window moves to a display with a different
// devicePixelRatio (the media query only matches the *current* ratio, so it
// has to be re-armed after each change).
function watchDpr(): void {
  matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener('change', () => {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    renderBrand();
    renderAll();
    watchDpr();
  }, { once: true });
}
watchDpr();

// Read the controls once at start so browser-restored form values win.
state.name = nameInput.value;
for (const radio of styleRadios) if (radio.checked) state.style = radio.value as WavemarkStyle;
for (const radio of motionRadios) if (radio.checked) state.breathe = radio.value === 'animated';
updateSegs();
renderBrand();
renderAll();
