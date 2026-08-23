// wavemark playground. `'wavemark'` resolves to ../src/index.ts (tsconfig
// paths) and is bundled into app.js by scripts/build.ts — the demo runs the
// real library, exactly as a consumer would import it.
import { wavemark, type WavemarkOptions, type WavemarkStyle } from 'wavemark';

const SAMPLES = [
  'ada', 'grace', 'turing', 'hello@example.com', 'user_4821', 'dijkstra',
  'hopper', 'lovelace', 'noether', 'curie', 'ramanujan', 'anonymous',
];

/** `user: null` means "the name currently typed in the box". */
const COMMENTS: { user: string | null; text: string }[] = [
  { user: null,        text: 'Shipping the new avatars today. Thoughts?' },
  { user: 'grace',     text: 'They still read at 24 px. That is the whole point.' },
  { user: 'hopper',    text: 'Same string in, same avatar out. Sold.' },
  { user: 'user_4821', text: 'Does it need a build step?' },
  { user: 'dijkstra',  text: 'No. One import from the CDN and you are done.' },
];

/** The header mark and favicon: the avatar for "wavemark", a fixed identity. */
const BRAND = 'wavemark';
const DEBOUNCE_MS = 120;

let DPR = Math.min(2, window.devicePixelRatio || 1);
const state = { name: 'ankit', style: 'nodal' as WavemarkStyle, breathe: false };
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const options = (): WavemarkOptions => ({ style: state.style, breathe: state.breathe });
const shownName = (): string => (state.name.trim() ? state.name : 'anonymous');

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

function supersample(cssSize: number, style: WavemarkStyle | undefined): number {
  if (style === 'pen') return 1;
  return Math.min(4, Math.max(1, Math.round(120 / (cssSize * DPR))));
}

interface Avatar {
  canvas: HTMLCanvasElement;
  render(name: string, opts: WavemarkOptions): void;
  setLabel(label: string): void;
}

function avatar(canvas: HTMLCanvasElement, cssSize: number, label?: string): Avatar {
  canvas.className = 'avatar';
  if (label) { canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', label); }
  else canvas.setAttribute('aria-hidden', 'true');
  const off = document.createElement('canvas');
  let blitting = 0;
  let handle: { stop(): void } | null = null; // the library's handle for whichever canvas we last drew into

  function render(name: string, opts: WavemarkOptions): void {
    cancelAnimationFrame(blitting);
    handle?.stop();
    canvas.width = canvas.height = Math.round(cssSize * DPR);
    canvas.style.width = canvas.style.height = `${cssSize}px`;

    const ss = supersample(cssSize, opts.style);
    if (ss === 1) { handle = wavemark(name, canvas, opts); return; }

    off.width = off.height = canvas.width * ss;
    handle = wavemark(name, off, opts);
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    const animate = !!opts.breathe && !reduceMotion.matches;
    const blit = (): void => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
      if (animate) blitting = requestAnimationFrame(blit);
    };
    blit();
  }

  return { canvas, render, setLabel: (l) => canvas.setAttribute('aria-label', l) };
}

// ---- build the static parts of the page once ----

const hero = avatar($('hero'), 220, 'Avatar for the current name');
const brandMark = avatar($('brand-mark'), 28);

const grid = SAMPLES.map((name) => {
  const li = document.createElement('li');
  const figure = document.createElement('figure');
  const av = avatar(document.createElement('canvas'), 60, `Avatar for ${name}`);
  const caption = document.createElement('figcaption');
  caption.textContent = name;
  figure.append(av.canvas, caption);
  li.append(figure);
  $('grid').append(li);
  return { name, av };
});

const thread = COMMENTS.map(({ user, text }) => {
  const li = document.createElement('li');
  const av = avatar(document.createElement('canvas'), 24);
  const body = document.createElement('div');
  const author = document.createElement('strong');
  const line = document.createElement('p');
  line.textContent = text;
  body.append(author, line);
  li.append(av.canvas, body);
  $('thread').append(li);
  return { user, av, author };
});

// ---- rendering ----

function renderBrand(): void {
  brandMark.render(BRAND, { style: 'nodal', breathe: true });
  $<HTMLLinkElement>('favicon').href = wavemark.toDataURL(BRAND, 32);
}

function renderHero(): void {
  hero.render(state.name, options());
  hero.setLabel(`Avatar for ${shownName()}`);
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

function renderAll(): void {
  renderHero();
  renderGrid();
  renderThread();
}

// ---- controls ----

const nameInput = $<HTMLInputElement>('name');
const styleRadios = document.querySelectorAll<HTMLInputElement>('input[name="style"]');
const motionRadios = document.querySelectorAll<HTMLInputElement>('input[name="motion"]');

let pending = 0;
nameInput.addEventListener('input', () => {
  window.clearTimeout(pending);
  pending = window.setTimeout(() => {
    state.name = nameInput.value;
    renderHero();
    renderThread(true);
  }, DEBOUNCE_MS);
});

for (const radio of styleRadios) {
  radio.addEventListener('change', () => {
    if (!radio.checked) return;
    state.style = radio.value as WavemarkStyle;
    renderAll();
  });
}

for (const radio of motionRadios) {
  radio.addEventListener('change', () => {
    if (!radio.checked) return;
    state.breathe = radio.value === 'animated';
    renderAll();
  });
}

const syncMotionNote = (): void => { $('motion-note').hidden = !reduceMotion.matches; };
reduceMotion.addEventListener('change', syncMotionNote);
syncMotionNote();

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
renderBrand();
renderAll();
