// Polygon math in millimetre floats. Clipper needs integers, so everything is scaled by
// SCALE (0.001 mm precision) on the way in and back out.
import ClipperLib from 'clipper-lib';
import type { Pt, Ring, Shape } from './types';

const SCALE = 1000;
const ARC_TOL = 0.02 * SCALE;
const MIN_AREA = 0.02; // mm² — slivers smaller than this are numerical noise

type IPath = { X: number; Y: number }[];

const toPath = (r: Ring): IPath => r.map((p) => ({ X: Math.round(p.x * SCALE), Y: Math.round(p.y * SCALE) }));
const fromPath = (p: IPath): Ring => p.map((q) => ({ x: q.X / SCALE, y: q.Y / SCALE }));

function shapesToPaths(shapes: Shape[]): IPath[] {
  const out: IPath[] = [];
  for (const s of shapes) {
    const o = toPath(s.outer);
    if (o.length < 3) continue;
    if (!ClipperLib.Clipper.Orientation(o)) o.reverse();
    out.push(o);
    for (const h of s.holes) {
      const hp = toPath(h);
      if (hp.length < 3) continue;
      if (ClipperLib.Clipper.Orientation(hp)) hp.reverse();
      out.push(hp);
    }
  }
  return out;
}

function treeToShapes(tree: unknown): Shape[] {
  const ex = ClipperLib.JS.PolyTreeToExPolygons(tree) as { outer: IPath; holes: IPath[] }[];
  const out: Shape[] = [];
  for (const e of ex) {
    const outer = fromPath(e.outer);
    if (outer.length < 3 || Math.abs(signedArea(outer)) < MIN_AREA) continue;
    out.push({
      outer,
      holes: e.holes.map(fromPath).filter((h) => h.length >= 3 && Math.abs(signedArea(h)) >= MIN_AREA),
    });
  }
  return out;
}

function clip(type: number, subj: IPath[], clipPaths: IPath[], fill = ClipperLib.PolyFillType.pftNonZero): Shape[] {
  const c = new ClipperLib.Clipper();
  if (subj.length) c.AddPaths(subj, ClipperLib.PolyType.ptSubject, true);
  if (clipPaths.length) c.AddPaths(clipPaths, ClipperLib.PolyType.ptClip, true);
  const tree = new ClipperLib.PolyTree();
  c.Execute(type, tree, fill, fill);
  return treeToShapes(tree);
}

export function union(shapes: Shape[]): Shape[] {
  if (!shapes.length) return [];
  return clip(ClipperLib.ClipType.ctUnion, shapesToPaths(shapes), []);
}

export function difference(a: Shape[], b: Shape[]): Shape[] {
  if (!a.length) return [];
  if (!b.length) return a;
  return clip(ClipperLib.ClipType.ctDifference, shapesToPaths(a), shapesToPaths(b));
}

export function intersect(a: Shape[], b: Shape[]): Shape[] {
  if (!a.length || !b.length) return [];
  return clip(ClipperLib.ClipType.ctIntersection, shapesToPaths(a), shapesToPaths(b));
}

/** Build shapes from loose rings using the even-odd rule (how SVG compound paths nest). */
export function fromRingsEvenOdd(rings: Ring[]): Shape[] {
  const paths = rings.filter((r) => r.length >= 3).map(toPath);
  if (!paths.length) return [];
  return clip(ClipperLib.ClipType.ctUnion, paths, [], ClipperLib.PolyFillType.pftEvenOdd);
}

/** Positive grows, negative shrinks. Round joins. */
export function offset(shapes: Shape[], delta: number): Shape[] {
  if (!shapes.length || Math.abs(delta) < 1e-6) return shapes;
  const co = new ClipperLib.ClipperOffset(2, ARC_TOL);
  co.AddPaths(shapesToPaths(shapes), ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
  const tree = new ClipperLib.PolyTree();
  co.Execute(tree, delta * SCALE);
  return treeToShapes(tree);
}

/** Turn open or closed line-work into cuttable material of the given width. */
export function strokeToShapes(lines: { pts: Ring; closed: boolean }[], width: number): Shape[] {
  const co = new ClipperLib.ClipperOffset(2, ARC_TOL);
  for (const l of lines) {
    if (l.pts.length < 2) continue;
    co.AddPath(
      toPath(l.pts),
      ClipperLib.JoinType.jtRound,
      l.closed ? ClipperLib.EndType.etClosedLine : ClipperLib.EndType.etOpenRound,
    );
  }
  const tree = new ClipperLib.PolyTree();
  co.Execute(tree, (width / 2) * SCALE);
  return treeToShapes(tree);
}

/** Drop near-collinear points; tol in mm. */
export function clean(shapes: Shape[], tol = 0.02): Shape[] {
  const fix = (r: Ring): Ring => fromPath(ClipperLib.Clipper.CleanPolygon(toPath(r), tol * SCALE));
  const out: Shape[] = [];
  for (const s of shapes) {
    const outer = fix(s.outer);
    if (outer.length < 3) continue;
    out.push({ outer, holes: s.holes.map(fix).filter((h) => h.length >= 3) });
  }
  return out;
}

export function signedArea(r: Ring): number {
  let a = 0;
  for (let i = 0, n = r.length; i < n; i++) {
    const p = r[i], q = r[(i + 1) % n];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

export function shapeArea(s: Shape): number {
  return Math.abs(signedArea(s.outer)) - s.holes.reduce((t, h) => t + Math.abs(signedArea(h)), 0);
}

export const area = (shapes: Shape[]): number => shapes.reduce((t, s) => t + shapeArea(s), 0);

export function ringLength(r: Ring): number {
  let l = 0;
  for (let i = 0, n = r.length; i < n; i++) {
    const p = r[i], q = r[(i + 1) % n];
    l += Math.hypot(q.x - p.x, q.y - p.y);
  }
  return l;
}

export const cutLength = (shapes: Shape[]): number =>
  shapes.reduce((t, s) => t + ringLength(s.outer) + s.holes.reduce((u, h) => u + ringLength(h), 0), 0);

export type BBox = { minX: number; minY: number; maxX: number; maxY: number };

export function bbox(shapes: Shape[]): BBox | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of shapes)
    for (const p of s.outer) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
  return minX === Infinity ? null : { minX, minY, maxX, maxY };
}

export function pointInRing(p: Pt, r: Ring): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const a = r[i], b = r[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export const pointInShape = (p: Pt, s: Shape): boolean =>
  pointInRing(p, s.outer) && !s.holes.some((h) => pointInRing(p, h));

export const pointInShapes = (p: Pt, shapes: Shape[]): boolean => shapes.some((s) => pointInShape(p, s));

// ── affine helpers ───────────────────────────────────────────────────────────

export const mapShapes = (shapes: Shape[], f: (p: Pt) => Pt): Shape[] =>
  shapes.map((s) => ({ outer: s.outer.map(f), holes: s.holes.map((h) => h.map(f)) }));

export function rotator(deg: number): (p: Pt) => Pt {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return (p) => ({ x: p.x * c - p.y * s, y: p.x * s + p.y * c });
}

export function circleRing(r: number, n = 64, cx = 0, cy = 0): Ring {
  const out: Ring = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return out;
}

export function polygonRing(r: number, sides: number, rotDeg = 0): Ring {
  const out: Ring = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2 + (rotDeg * Math.PI) / 180;
    out.push({ x: r * Math.cos(a), y: r * Math.sin(a) });
  }
  return out;
}

/** SVG path data, one M…Z per ring; pair with fill-rule="evenodd". */
export function pathD(shapes: Shape[], dp = 2): string {
  const f = (n: number) => n.toFixed(dp);
  let d = '';
  const ring = (r: Ring) => {
    if (r.length < 3) return;
    d += 'M' + f(r[0].x) + ' ' + f(r[0].y);
    for (let i = 1; i < r.length; i++) d += 'L' + f(r[i].x) + ' ' + f(r[i].y);
    d += 'Z';
  };
  for (const s of shapes) {
    ring(s.outer);
    s.holes.forEach(ring);
  }
  return d;
}
