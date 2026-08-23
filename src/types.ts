// Public types. The API surface is frozen by SPEC.md: no extra options in v0.1.

export type WavemarkStyle = 'nodal' | 'pen' | 'halo';

export type RGB = [number, number, number];

export interface WavemarkOptions {
  /** Rendering style. Default: 'nodal'. */
  style?: WavemarkStyle;
  /** Slow in-place phase oscillation. Default: false. */
  breathe?: boolean;
  /** Override the hash-picked palette: [darkest, mid, lightest]. */
  palette?: [RGB, RGB, RGB];
}

export interface WavemarkHandle {
  /** Stops the breathe animation. No-op if breathe was false. */
  stop(): void;
}
