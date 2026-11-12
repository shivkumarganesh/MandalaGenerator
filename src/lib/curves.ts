// Pattern algorithms: classic mathematical curves turned into cuttable line-work.
// Each pattern returns polylines (stroked to the element's line width) or ready shapes.
import type { Ring, Shape } from './types';
import { circleRing, strokeToShapes, union } from './geom';

export type CurvePattern = 'spiro' | 'rose' | 'guilloche' | 'starpoly' | 'flowerlife' | 'spiral' | 'phyllo' | 'web';

export interface PatternDef { id: CurvePattern; label: string; a: string; b: string; c: string; defaults: { a: number; b: number; c: number }; aRange: [number, number]; bRange: [number, number] }

// a / b / c mean different things per pattern; the labels are what the user sees.
export const PATTERNS: PatternDef[] = [
  { id: 'spiro', label: 'Spirograph', a: 'Lobes', b: 'Skip', c: 'Loop size', defaults: { a: 8, b: 3, c: 0.7 }, aRange: [3, 24], bRange: [1, 11] },
  { id: 'rose', label: 'Rose curve', a: 'Petals', b: 'Weave', c: 'Open centre', defaults: { a: 8, b: 1, c: 0.25 }, aRange: [2, 24], bRange: [1, 7] },
  { id: 'guilloche', label: 'Guilloché braid', a: 'Waves', b: 'Strands', c: 'Depth', defaults: { a: 12, b: 3, c: 0.25 }, aRange: [3, 48], bRange: [1, 6] },
  { id: 'starpoly', label: 'Star polygon', a: 'Points', b: 'Skip', c: 'Inner copies', defaults: { a: 12, b: 5, c: 0.3 }, aRange: [5, 36], bRange: [2, 17] },
  { id: 'flowerlife', label: 'Flower of life', a: 'Rings', b: 'Petals', c: 'Overlap', defaults: { a: 2, b: 6, c: 0.5 }, aRange: [1, 4], bRange: [4, 12] },
  { id: 'spiral', label: 'Spiral arms', a: 'Arms', b: 'Twist', c: 'Start', defaults: { a: 12, b: 4, c: 0.15 }, aRange: [3, 36], bRange: [1, 12] },
  { id: 'web', label: 'Web', a: 'Spokes', b: 'Rings', c: 'Sag', defaults: { a: 12, b: 5, c: 0.3 }, aRange: [4, 36], bRange: [1, 10] },
  { id: 'phyllo', label: 'Sunflower dots', a: 'Dots', b: 'Growth', c: 'Open centre', defaults: { a: 120, b: 5, c: 0.1 }, aRange: [10, 500], bRange: [1, 10] },
];
export const patternDef = (id: string): PatternDef => PATTERNS.find((p) => p.id === id) ?? PATTERNS[0];

const gcd = (x: number, y: number): number => (y ? gcd(y, x % y) : Math.abs(x));
type Line = { pts: Ring; closed: boolean };

function lines(pattern: CurvePattern, R: number, a: number, b: number, c: number): Line[] {
  const out: Line[] = [];
  const TAU = Math.PI * 2;
  if (pattern === 'spiro') {
    // hypotrochoid: a circle of radius b rolling inside one of radius a, pen at c·b from its centre
    const A = Math.max(3, Math.round(a)), B = Math.max(1, Math.min(A - 1, Math.round(b)));
    const d = B * (0.15 + c * 1.6), turns = B / gcd(A, B), n = Math.round(turns * 160), k = R / (A - B + d);
    const pts: Ring = [];
    for (let i = 0; i < n; i++) { const t = (i / n) * TAU * turns; pts.push({ x: k * ((A - B) * Math.sin(t) - d * Math.sin(((A - B) / B) * t)), y: -k * ((A - B) * Math.cos(t) + d * Math.cos(((A - B) / B) * t)) }); }
    out.push({ pts, closed: true });
  } else if (pattern === 'rose') {
    // rhodonea r = c + (1−c)·cos(a/b·θ): b > 1 makes the petals weave through each other
    const A = Math.max(2, Math.round(a)), B = Math.max(1, Math.round(b)), turns = B / gcd(A, B), n = Math.round(turns * 60 + A * 40 * turns);
    const pts: Ring = [];
    for (let i = 0; i < n; i++) { const t = (i / n) * TAU * turns; const r = R * (c + (1 - c) * Math.abs(Math.cos(((A / B) * t) / 2))); pts.push({ x: r * Math.sin(t), y: -r * Math.cos(t) }); }
    out.push({ pts, closed: true });
  } else if (pattern === 'guilloche') {
    // interlaced sine rings, each strand phase-shifted
    const A = Math.max(3, Math.round(a)), B = Math.max(1, Math.round(b)), n = Math.max(120, A * 24);
    for (let s = 0; s < B; s++) {
      const pts: Ring = [];
      for (let i = 0; i < n; i++) { const t = (i / n) * TAU; const r = R * (1 - c * (0.5 + 0.5 * Math.sin(A * t + (s / B) * TAU))); pts.push({ x: r * Math.sin(t), y: -r * Math.cos(t) }); }
      out.push({ pts, closed: true });
    }
  } else if (pattern === 'starpoly') {
    // {a/b}: join every b-th of a points; c adds smaller copies turned half a step (Islamic star look)
    const A = Math.max(5, Math.round(a)), B = Math.max(2, Math.min(Math.floor((A - 1) / 2), Math.round(b)));
    const copies = 1 + Math.round(c * 3);
    for (let m = 0; m < copies; m++) {
      const r = R * Math.pow(0.62, m), rot = m % 2 ? Math.PI / A : 0, g = gcd(A, B);
      for (let s = 0; s < g; s++) {
        const pts: Ring = [];
        for (let i = 0; i < A / g; i++) { const t = ((s + i * B) / A) * TAU + rot; pts.push({ x: r * Math.sin(t), y: -r * Math.cos(t) }); }
        out.push({ pts, closed: true });
      }
    }
  } else if (pattern === 'flowerlife') {
    // equal circles on rings around the centre; overlap sets how deeply they interlock
    const rings = Math.max(1, Math.round(a)), per = Math.max(4, Math.round(b));
    const rho = R / (rings * (1 - c * 0.5) + 1), step = rho * (1 - c * 0.5) * 1;
    out.push({ pts: circleRing(rho, 64), closed: true });
    for (let q = 1; q <= rings; q++)
      for (let i = 0; i < per * q; i++) { const t = (i / (per * q)) * TAU + (q % 2 ? 0 : Math.PI / (per * q)); out.push({ pts: circleRing(rho, 64, q * step * Math.sin(t), -q * step * Math.cos(t)), closed: true }); }
  } else if (pattern === 'spiral') {
    const A = Math.max(3, Math.round(a)), twist = (b * Math.PI) / 6, r0 = R * Math.max(0.02, c);
    for (let s = 0; s < A; s++) {
      const pts: Ring = [];
      for (let i = 0; i <= 48; i++) { const u = i / 48; const r = r0 + (R - r0) * u; const t = (s / A) * TAU + twist * u * u; pts.push({ x: r * Math.sin(t), y: -r * Math.cos(t) }); }
      out.push({ pts, closed: false });
    }
  } else if (pattern === 'web') {
    // spokes with sagging threads between them
    const A = Math.max(4, Math.round(a)), B = Math.max(1, Math.round(b));
    for (let s = 0; s < A; s++) { const t = (s / A) * TAU; out.push({ pts: [{ x: 0, y: 0 }, { x: R * Math.sin(t), y: -R * Math.cos(t) }], closed: false }); }
    for (let q = 1; q <= B; q++) {
      const r = (R * q) / B, pts: Ring = [];
      for (let s = 0; s < A; s++)
        for (let i = 0; i < 10; i++) { const u = i / 10; const t = ((s + u) / A) * TAU; const sag = 1 - c * 0.5 * Math.sin(u * Math.PI); pts.push({ x: r * sag * Math.sin(t), y: -r * sag * Math.cos(t) }); }
      out.push({ pts, closed: true });
    }
  }
  return out;
}

/** Shapes for one pattern, centred on the origin. `line` is the stroke width (dot size for sunflower dots). */
export function curveShapes(pattern: CurvePattern, R: number, a: number, b: number, c: number, line: number): Shape[] {
  if (R <= 0 || line <= 0) return [];
  if (pattern === 'phyllo') {
    // Vogel's sunflower: dot i sits at the golden angle from the last, radius ∝ √i
    const n = Math.max(1, Math.min(600, Math.round(a))), golden = Math.PI * (3 - Math.sqrt(5));
    const dots: Shape[] = [];
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n, r = R * (c + (1 - c) * Math.sqrt(u)), t = i * golden;
      const size = line * (0.45 + (b / 10) * 1.1 * Math.sqrt(u));
      dots.push({ outer: circleRing(size / 2, 14, r * Math.sin(t), -r * Math.cos(t)), holes: [] });
    }
    return union(dots);
  }
  return strokeToShapes(lines(pattern, R, a, b, c), line);
}
