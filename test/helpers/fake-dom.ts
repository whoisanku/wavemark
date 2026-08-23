// A minimal, dependency-free fake browser for the API tests: just enough of
// `document.createElement('canvas')`, `requestAnimationFrame`,
// `cancelAnimationFrame` and `matchMedia` for wavemark() to run in Node.
//
// `toDataURL` returns base64 of the raw RGBA bytes — NOT a real PNG. Real PNG
// encoding is the browser's job; this only exercises the contract wiring.

export interface FakeImageData {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export class FakeContext2D {
  private readonly canvas: FakeCanvas;
  constructor(canvas: FakeCanvas) { this.canvas = canvas; }

  createImageData(width: number, height: number): FakeImageData {
    return { width, height, data: new Uint8ClampedArray(width * height * 4) };
  }

  putImageData(img: FakeImageData, _x: number, _y: number): void {
    this.canvas.lastPut = new Uint8ClampedArray(img.data); // copy: the caller reuses its buffer
    this.canvas.puts++;
  }
}

export class FakeCanvas {
  width = 0;
  height = 0;
  /** number of putImageData calls */
  puts = 0;
  /** bytes of the most recent putImageData */
  lastPut: Uint8ClampedArray | null = null;
  private ctx: FakeContext2D | null = null;

  getContext(type: string): FakeContext2D | null {
    if (type !== '2d') return null;
    return (this.ctx ??= new FakeContext2D(this));
  }

  toDataURL(type = 'image/png'): string {
    const bytes = this.lastPut ?? new Uint8ClampedArray(0);
    return `data:${type};base64,${Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64')}`;
  }
}

/** Cast for passing a FakeCanvas where the library expects an HTMLCanvasElement. */
export const asCanvas = (c: FakeCanvas): HTMLCanvasElement => c as unknown as HTMLCanvasElement;

export interface FakeDomOptions {
  /** make `matchMedia('(prefers-reduced-motion: reduce)')` report a match */
  reduceMotion?: boolean;
}

export interface FakeDom {
  /** every canvas created via document.createElement, in order */
  canvases: FakeCanvas[];
  /** convenience: a square canvas */
  createCanvas(size?: number): FakeCanvas;
  /** run every callback queued at the time of the call, once, with `now` */
  flush(now: number): void;
  /** number of queued animation frames */
  pending(): number;
  /** restore the previous globals; idempotent */
  uninstall(): void;
}

const GLOBALS = ['document', 'requestAnimationFrame', 'cancelAnimationFrame', 'matchMedia'] as const;

export function installFakeDom(opts: FakeDomOptions = {}): FakeDom {
  const g = globalThis as Record<string, unknown>;
  const saved = new Map<string, PropertyDescriptor | undefined>(
    GLOBALS.map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]),
  );

  const canvases: FakeCanvas[] = [];
  const queue = new Map<number, FrameRequestCallback>();
  let nextId = 1;

  g['document'] = {
    createElement(tag: string): FakeCanvas {
      if (tag !== 'canvas') throw new Error(`fake DOM only creates <canvas>, not <${tag}>`);
      const c = new FakeCanvas();
      canvases.push(c);
      return c;
    },
  };
  g['requestAnimationFrame'] = (cb: FrameRequestCallback): number => {
    queue.set(nextId, cb);
    return nextId++;
  };
  g['cancelAnimationFrame'] = (id: number): void => { queue.delete(id); };
  g['matchMedia'] = (query: string) => ({
    media: query,
    matches: opts.reduceMotion === true && /prefers-reduced-motion/.test(query),
  });

  let installed = true;
  return {
    canvases,
    createCanvas(size = 64) {
      const c = (g['document'] as { createElement(tag: string): FakeCanvas }).createElement('canvas');
      c.width = c.height = size;
      return c;
    },
    flush(now) {
      const batch = [...queue.entries()];
      queue.clear(); // callbacks re-queued during this flush run on the NEXT flush
      for (const [, cb] of batch) cb(now);
    },
    pending: () => queue.size,
    uninstall() {
      if (!installed) return;
      installed = false;
      for (const [k, desc] of saved) {
        if (desc) Object.defineProperty(globalThis, k, desc);
        else delete g[k];
      }
    },
  };
}
