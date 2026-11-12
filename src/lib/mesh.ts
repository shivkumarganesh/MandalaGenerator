// Slab mesher shared by the 3D preview and the STL / 3MF exporters, so a print is the preview.
// Input shapes may be in any 2D frame; triangles come out with outward normals for that frame
// read as right-handed (x, y, z). The preview feeds IR (Y-down) and flips once on its content
// group; the exporters feed Y-up shapes (see flipY).
import earcut from 'earcut';
import type { Ring, Shape } from './types';
import { signedArea, union } from './geom';

export interface TriSoup { caps: number[]; sides: number[] } // xyz triples, 9 numbers per triangle

export const flipY = (shapes: Shape[]): Shape[] =>
  shapes.map((s) => ({ outer: s.outer.map((p) => ({ x: p.x, y: -p.y })), holes: s.holes.map((h) => h.map((p) => ({ x: p.x, y: -p.y }))) }));

function capTris(shapes: Shape[], z: number, up: boolean, out: number[]) {
  for (const s of shapes) {
    const flat: number[] = [];
    const holes: number[] = [];
    for (const p of s.outer) flat.push(p.x, p.y);
    for (const h of s.holes) { holes.push(flat.length / 2); for (const p of h) flat.push(p.x, p.y); }
    const idx = earcut(flat, holes, 2);
    for (let i = 0; i < idx.length; i += 3) {
      let a = idx[i], b = idx[i + 1], c = idx[i + 2];
      const cross = (flat[b * 2] - flat[a * 2]) * (flat[c * 2 + 1] - flat[a * 2 + 1]) - (flat[b * 2 + 1] - flat[a * 2 + 1]) * (flat[c * 2] - flat[a * 2]);
      if (cross > 0 !== up) [b, c] = [c, b];
      out.push(flat[a * 2], flat[a * 2 + 1], z, flat[b * 2], flat[b * 2 + 1], z, flat[c * 2], flat[c * 2 + 1], z);
    }
  }
}

function wallTris(shapes: Shape[], z0: number, z1: number, out: number[]) {
  const ring = (r: Ring, wantCCW: boolean) => {
    const ccw = signedArea(r) > 0;
    const pts = ccw === wantCCW ? r : r.slice().reverse();
    for (let i = 0, n = pts.length; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      out.push(a.x, a.y, z0, b.x, b.y, z0, b.x, b.y, z1, a.x, a.y, z0, b.x, b.y, z1, a.x, a.y, z1);
    }
  };
  for (const s of shapes) { ring(s.outer, true); s.holes.forEach((h) => ring(h, false)); }
}

/**
 * Snap to a 1 µm grid and drop duplicate / collinear points. The triangulator silently removes
 * such points; doing it first means caps and walls use the very same vertices, which is what
 * makes a slab strictly watertight.
 */
function prep(shapes: Shape[]): Shape[] {
  const fix = (r: Ring): Ring => {
    let pts = r.map((p) => ({ x: Math.round(p.x * 1000) / 1000, y: Math.round(p.y * 1000) / 1000 }));
    for (let changed = true; changed && pts.length >= 3; ) {
      changed = false;
      const out: Ring = [];
      for (let i = 0, n = pts.length; i < n; i++) {
        const a = out.length ? out[out.length - 1] : pts[n - 1], p = pts[i], c = pts[(i + 1) % n];
        const dup = (a.x === p.x && a.y === p.y) || (c.x === p.x && c.y === p.y && i === n - 1);
        const cross = (p.x - a.x) * (c.y - p.y) - (p.y - a.y) * (c.x - p.x);
        if (dup || Math.abs(cross) < 1e-9) changed = true; else out.push(p);
      }
      pts = out;
    }
    return pts;
  };
  const out: Shape[] = [];
  for (const s of shapes) {
    const outer = fix(s.outer);
    if (outer.length >= 3) out.push({ outer, holes: s.holes.map(fix).filter((h) => h.length >= 3) });
  }
  return out;
}

/** A closed, watertight prism of `shapes` between z0 and z1. */
export function slab(shapes: Shape[], z0: number, z1: number): TriSoup {
  const p = prep(shapes);
  const caps: number[] = [], sides: number[] = [];
  capTris(p, z1, true, caps);
  capTris(p, z0, false, caps);
  wallTris(p, z0, z1, sides);
  return { caps: healCaps(caps, sides), sides };
}

/**
 * The triangulator may run a cap edge straight through vertices that happen to be collinear
 * with it (a row of square windows, say). Geometrically closed, but a T-junction. Split those
 * cap triangles at the vertices they pass through so every edge has exactly one partner.
 */
function healCaps(caps: number[], sides: number[]): number[] {
  const key = (t: number[], i: number) => t[i] + ',' + t[i + 1] + ',' + t[i + 2];
  for (let pass = 0; pass < 6; pass++) {
    const open = new Map<string, number>();
    const note = (t: number[]) => {
      for (let q = 0; q < t.length; q += 9)
        for (let e = 0; e < 3; e++) {
          const a = key(t, q + e * 3), b = key(t, q + ((e + 1) % 3) * 3), rev = b + '|' + a, n = open.get(rev) ?? 0;
          if (n > 0) open.set(rev, n - 1); else open.set(a + '|' + b, (open.get(a + '|' + b) ?? 0) + 1);
        }
    };
    note(caps); note(sides);
    const pts: number[][] = [];
    const bad = new Set<string>();
    open.forEach((n, k) => { if (n > 0) { bad.add(k); const [a, b] = k.split('|'); pts.push(a.split(',').map(Number), b.split(',').map(Number)); } });
    if (!bad.size) return caps;
    const out: number[] = [];
    let split = false;
    for (let q = 0; q < caps.length; q += 9) {
      let done = false;
      for (let e = 0; e < 3 && !done; e++) {
        const ia = q + e * 3, ib = q + ((e + 1) % 3) * 3, ic = q + ((e + 2) % 3) * 3;
        if (!bad.has(key(caps, ia) + '|' + key(caps, ib))) continue;
        const ax = caps[ia], ay = caps[ia + 1], z = caps[ia + 2], bx = caps[ib], by = caps[ib + 1];
        const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
        const on: { t: number; x: number; y: number }[] = [];
        for (const p of pts) {
          if (p[2] !== z) continue;
          const t = ((p[0] - ax) * dx + (p[1] - ay) * dy) / len2;
          if (t <= 1e-9 || t >= 1 - 1e-9) continue;
          if (Math.abs((p[0] - ax) * dy - (p[1] - ay) * dx) / Math.sqrt(len2) > 2e-3) continue;
          if (!on.some((o) => o.x === p[0] && o.y === p[1])) on.push({ t, x: p[0], y: p[1] });
        }
        if (!on.length) continue;
        on.sort((u, v) => u.t - v.t);
        const chain = [[ax, ay], ...on.map((o) => [o.x, o.y]), [bx, by]];
        for (let i = 0; i < chain.length - 1; i++) out.push(chain[i][0], chain[i][1], z, chain[i + 1][0], chain[i + 1][1], z, caps[ic], caps[ic + 1], caps[ic + 2]);
        done = split = true;
      }
      if (!done) for (let i = 0; i < 9; i++) out.push(caps[q + i]);
    }
    caps = out;
    if (!split) return caps;
  }
  return caps;
}

/**
 * One printable body for a stack: each tier is nested under the ones above (a print cannot
 * start in mid-air) and emitted as its own watertight slab. Slabs meet only on the horizontal
 * planes between tiers, which every slicer unions cleanly — no seams inside a printed layer.
 */
export function fusedBody(tiers: { shapes: Shape[]; h: number }[]): number[] {
  const nested: Shape[][] = tiers.map((t) => t.shapes);
  for (let i = nested.length - 2; i >= 0; i--) nested[i] = union([...nested[i], ...nested[i + 1]]);
  const out: number[] = [];
  let z = 0;
  nested.forEach((n, i) => {
    const s = slab(n, z, z + tiers[i].h);
    for (const v of s.caps) out.push(v);
    for (const v of s.sides) out.push(v);
    z += tiers[i].h;
  });
  return out;
}

export function stlBinary(tris: number[]): ArrayBuffer {
  const n = tris.length / 9;
  const buf = new ArrayBuffer(84 + n * 50);
  const dv = new DataView(buf);
  const head = 'Mandala Stack Studio';
  for (let i = 0; i < head.length; i++) dv.setUint8(i, head.charCodeAt(i));
  dv.setUint32(80, n, true);
  let o = 84;
  for (let t = 0; t < n; t++) {
    const p = t * 9;
    const ux = tris[p + 3] - tris[p], uy = tris[p + 4] - tris[p + 1], uz = tris[p + 5] - tris[p + 2];
    const vx = tris[p + 6] - tris[p], vy = tris[p + 7] - tris[p + 1], vz = tris[p + 8] - tris[p + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    dv.setFloat32(o, nx, true); dv.setFloat32(o + 4, ny, true); dv.setFloat32(o + 8, nz, true);
    for (let k = 0; k < 9; k++) dv.setFloat32(o + 12 + k * 4, tris[p + k], true);
    o += 50;
  }
  return buf;
}

/** Indexed vertices for formats that want shared vertices (3MF). */
export function indexed(tris: number[]): { verts: number[]; idx: number[] } {
  const map = new Map<string, number>();
  const verts: number[] = [], idx: number[] = [];
  for (let i = 0; i < tris.length; i += 3) {
    const x = Math.round(tris[i] * 1000) / 1000, y = Math.round(tris[i + 1] * 1000) / 1000, z = Math.round(tris[i + 2] * 1000) / 1000;
    const k = x + ',' + y + ',' + z;
    let v = map.get(k);
    if (v === undefined) { v = verts.length / 3; verts.push(x, y, z); map.set(k, v); }
    idx.push(v);
  }
  // drop triangles that collapsed after rounding
  const clean: number[] = [];
  for (let i = 0; i < idx.length; i += 3) if (idx[i] !== idx[i + 1] && idx[i + 1] !== idx[i + 2] && idx[i] !== idx[i + 2]) clean.push(idx[i], idx[i + 1], idx[i + 2]);
  return { verts, idx: clean };
}
