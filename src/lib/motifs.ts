// Parametric motif library. Every motif is generated in code (no bundled assets, no licensing
// to track) and normalised into a unit box centred on the origin: x across, y along the radius,
// with the tip at y = -0.5 pointing AWAY from the mandala centre.
import type { Pt, Ring, Shape } from './types';
import { circleRing, difference, signedArea, union } from './geom';
import { REINDEER_ASPECT, REINDEER_LINES, REINDEER_SOLID } from './reindeer';

export interface MotifDef {
  id: string;
  label: string;
  shapes: Shape[];
  /** Figures are pictures, not petals: they keep this width / height ratio and are added as a single centrepiece. */
  aspect?: number;
  figure?: boolean;
}

const bez = (p0: Pt, p1: Pt, p2: Pt, p3: Pt, n = 14): Ring => {
  const out: Ring = [];
  for (let i = 0; i < n; i++) {
    const t = i / n, u = 1 - t;
    out.push({
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
    });
  }
  return out;
};

/** Mirror a right-hand profile (base → tip) to make a closed symmetric outline. */
const sym = (right: Ring, tip: Pt): Ring => {
  const left = right.slice(1).reverse().map((p) => ({ x: -p.x, y: p.y }));
  return [...right, tip, ...left];
};

const polar = (f: (a: number) => number, n = 72): Ring => {
  const out: Ring = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = f(a);
    out.push({ x: r * Math.sin(a), y: -r * Math.cos(a) });
  }
  return out;
};

function normalise(shapes: Shape[]): Shape[] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of shapes)
    for (const p of s.outer) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
  const w = maxX - minX || 1, h = maxY - minY || 1, cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const f = (p: Pt) => ({ x: (p.x - cx) / w, y: (p.y - cy) / h });
  return shapes.map((s) => ({ outer: s.outer.map(f), holes: s.holes.map((r) => r.map(f)) }));
}

const one = (r: Ring): Shape[] => [{ outer: signedArea(r) < 0 ? r.slice().reverse() : r, holes: [] }];
const P = (x: number, y: number): Pt => ({ x, y });

const defs: [string, string, () => Shape[]][] = [
  ['petal', 'Petal', () => one(sym(bez(P(0, 0.5), P(0.667, 0.17), P(0.667, -0.17), P(0, -0.5), 20), P(0, -0.5)))],
  ['lotus', 'Lotus', () => one(sym(bez(P(0, 0.5), P(0.85, 0.5), P(0.3, -0.18), P(0, -0.5), 22), P(0, -0.5)))],
  ['leaf', 'Leaf', () => one(sym(bez(P(0, 0.5), P(0.7, 0.3), P(0.35, -0.3), P(0, -0.5), 20), P(0, -0.5)))],
  ['teardrop', 'Teardrop', () => {
    const r: Ring = [];
    for (let i = 0; i < 56; i++) {
      const t = (i / 56) * Math.PI * 2;
      r.push({ x: Math.sin(t) * Math.sin(t / 2) ** 1.6, y: -Math.cos(t) });
    }
    return one(r);
  }],
  ['spear', 'Spear', () => one(sym([...bez(P(0, 0.5), P(0.1, 0.35), P(0.2, 0.25), P(0.5, 0.12), 8), ...bez(P(0.5, 0.12), P(0.16, -0.05), P(0.06, -0.25), P(0, -0.5), 12)], P(0, -0.5)))],
  ['flame', 'Flame', () => one([...bez(P(0, 0.5), P(0.75, 0.4), P(0.55, -0.1), P(0.12, -0.5), 20), ...bez(P(0.12, -0.5), P(0.2, -0.15), P(-0.2, -0.1), P(-0.3, 0.15), 14), ...bez(P(-0.3, 0.15), P(-0.36, 0.33), P(-0.2, 0.5), P(0, 0.5), 10)])],
  ['diamond', 'Diamond', () => one([P(0, 0.5), P(0.5, 0), P(0, -0.5), P(-0.5, 0)])],
  ['kite', 'Kite', () => one([P(0, 0.5), P(0.5, 0.2), P(0, -0.5), P(-0.5, 0.2)])],
  ['triangle', 'Triangle', () => one([P(-0.5, 0.5), P(0.5, 0.5), P(0, -0.5)])],
  ['arch', 'Arch', () => one(sym([P(0, 0.5), P(0.5, 0.5), ...bez(P(0.5, 0), P(0.5, -0.28), P(0.25, -0.42), P(0, -0.5), 14)], P(0, -0.5)))],
  ['fan', 'Fan', () => {
    const r: Ring = [P(0, 0.5)];
    for (let i = 0; i <= 28; i++) {
      const a = ((-55 + (i / 28) * 110) * Math.PI) / 180;
      r.push({ x: Math.sin(a), y: 0.5 - Math.cos(a) });
    }
    return one(r);
  }],
  ['circle', 'Dot', () => one(circleRing(0.5, 40))],
  ['heart', 'Heart', () => {
    const r: Ring = [];
    for (let i = 0; i < 60; i++) {
      const t = (i / 60) * Math.PI * 2;
      r.push({ x: 16 * Math.sin(t) ** 3, y: -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) });
    }
    return one(r);
  }],
  ['star', 'Star', () => {
    const r: Ring = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2, rad = i % 2 ? 0.42 : 1;
      r.push({ x: rad * Math.sin(a), y: -rad * Math.cos(a) });
    }
    return one(r);
  }],
  ['flower', 'Flower', () => one(polar((a) => 0.72 + 0.28 * Math.cos(5 * a), 90))],
  ['quatrefoil', 'Quatrefoil', () => one(polar((a) => 0.6 + 0.4 * Math.abs(Math.cos(2 * a)) ** 0.7, 96))],
  ['hexagon', 'Hexagon', () => one(polar(() => 1, 6))],
  ['square', 'Square', () => one([P(-0.5, 0.5), P(0.5, 0.5), P(0.5, -0.5), P(-0.5, -0.5)])],
  ['crescent', 'Crescent', () => difference(one(circleRing(0.5, 56)), one(circleRing(0.42, 56, 0, 0.2)))],
  ['paisley', 'Paisley', () => {
    const r: Ring = [];
    for (let i = 0; i < 60; i++) {
      const t = (i / 60) * Math.PI * 2;
      const y = -Math.cos(t);
      const bend = 0.35 * ((1 - y) / 2) ** 2 * 1; // curl the tip sideways
      r.push({ x: Math.sin(t) * Math.sin(t / 2) ** 1.4 * 0.62 + (y < 0 ? bend * (-y) * 2.2 : 0), y });
    }
    return one(r);
  }],
  // ── festive ──
  ['tree', 'Fir tree', () => one(sym([P(0, 0.5), P(0.09, 0.5), P(0.09, 0.38), P(0.5, 0.38), P(0.16, 0.08), P(0.34, 0.08), P(0.1, -0.2), P(0.22, -0.2)], P(0, -0.5)))],
  ['holly', 'Holly', () => one(sym([P(0, 0.5), P(0.3, 0.36), P(0.2, 0.24), P(0.48, 0.1), P(0.3, -0.02), P(0.5, -0.16), P(0.26, -0.26), P(0.3, -0.4)], P(0, -0.5)))],
  ['bell', 'Bell', () => one(sym([P(0, 0.5), P(0.12, 0.44), P(0.12, 0.38), P(0.5, 0.38), P(0.5, 0.3), ...bez(P(0.5, 0.3), P(0.3, 0.1), P(0.36, -0.4), P(0.08, -0.42), 16).slice(1), P(0.08, -0.42), P(0.08, -0.5)], P(0, -0.5)))],
  ['snowarm', 'Snow branch', () => one(sym([P(0, 0.5), P(0.05, 0.5), P(0.05, 0.26), P(0.46, -0.05), P(0.4, -0.14), P(0.05, 0.1), P(0.05, -0.08), P(0.36, -0.34), P(0.3, -0.42), P(0.05, -0.22), P(0.05, -0.44)], P(0, -0.5)))],
  ['bauble', 'Bauble', () => union([...one(circleRing(0.42, 48, 0, 0.08)), ...one([P(-0.11, -0.5), P(0.11, -0.5), P(0.11, -0.3), P(-0.11, -0.3)])])],
  ['sparkle', 'Sparkle', () => {
    const r: Ring = [];
    const pat = [1, 0.26, 0.5, 0.26];
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; r.push({ x: pat[i % 4] * Math.sin(a), y: -pat[i % 4] * Math.cos(a) }); }
    return one(r);
  }],
];

const unpack = (data: number[][][]): Shape[] => data.map((rings) => {
  const ring = (flat: number[]): Ring => { const r: Ring = []; for (let i = 0; i < flat.length; i += 2) r.push({ x: flat[i], y: flat[i + 1] }); return r; };
  return { outer: ring(rings[0]), holes: rings.slice(1).map(ring) };
});

export const FIGURES: MotifDef[] = [
  { id: 'reindeer', label: 'Reindeer', shapes: unpack(REINDEER_LINES), aspect: REINDEER_ASPECT, figure: true },
  { id: 'reindeer-solid', label: 'Reindeer shape', shapes: unpack(REINDEER_SOLID), aspect: REINDEER_ASPECT, figure: true },
];

export const MOTIFS: MotifDef[] = [...defs.map(([id, label, f]) => ({ id, label, shapes: normalise(f()) })), ...FIGURES];
const byId = new Map(MOTIFS.map((m) => [m.id, m]));
export const builtinMotif = (id: string): MotifDef | undefined => byId.get(id);
