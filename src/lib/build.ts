// Design → physical layers. This is the ONE geometry pipeline: the 2D canvas, the 3D preview,
// the laser SVGs and the STL/3MF meshes all consume the BuiltLayer[] it returns.
import { getStroke } from 'perfect-freehand';
import type { BuiltLayer, CustomMotif, Design, DiscEl, Element, Issue, Layer, RingEl, Shape, Stats, StrokeEl, Ring } from './types';
import { area, bbox, circleRing, clean, cutLength, difference, intersect, mapShapes, offset, polygonRing, rotator, shapeArea, union } from './geom';
import { builtinMotif } from './motifs';

// ── element → shapes (cached on object identity; state updates are immutable) ─────────────

const elCache = new WeakMap<Element, { motifs: CustomMotif[]; shapes: Shape[] }>();

export function motifShapes(id: string, custom: CustomMotif[]): Shape[] {
  if (id.startsWith('custom:')) return custom.find((m) => 'custom:' + m.id === id)?.shapes ?? [];
  return builtinMotif(id)?.shapes ?? [];
}

function ringShapes(el: RingEl, custom: CustomMotif[]): Shape[] {
  const src = motifShapes(el.motif, custom);
  if (!src.length) return [];
  let base = mapShapes(src, (p) => ({ x: p.x * el.width, y: p.y * el.length }));
  if (el.outline > 0) {
    const inner = offset(base, -el.outline);
    if (inner.length) base = difference(base, inner);
  }
  if (el.spin) base = mapShapes(base, rotator(el.spin));
  if (el.radius) base = mapShapes(base, (p) => ({ x: p.x, y: p.y - el.radius }));
  const n = Math.max(1, Math.round(el.count));
  const out: Shape[] = [];
  for (let i = 0; i < n; i++) out.push(...mapShapes(base, rotator(el.rotate + (i * 360) / n)));
  return out;
}

function discRing(r: number, el: DiscEl): Ring {
  if (el.edge === 'plain' || el.depth <= 0 || el.lobes < 2) return circleRing(r, 120);
  const n = Math.max(120, el.lobes * 20);
  const out: Ring = [];
  const d = Math.min(el.depth, r * 0.9);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const t = (el.lobes * a) / 2;
    let k: number; // 0 at the outermost point, 1 at the deepest
    if (el.edge === 'scallop') k = 1 - Math.abs(Math.cos(t));
    else if (el.edge === 'pointed') k = Math.abs(Math.sin(t));
    else if (el.edge === 'wave') k = 0.5 - 0.5 * Math.cos(2 * t);
    else { const u = (t / Math.PI) % 1; k = u < 0.5 ? u * 2 : 2 - u * 2; }
    const rr = r - d * k;
    out.push({ x: rr * Math.sin(a), y: -rr * Math.cos(a) });
  }
  return out;
}

function discShapes(el: DiscEl): Shape[] {
  if (el.outer <= 0) return [];
  let s: Shape[] = [{ outer: discRing(el.outer, el), holes: [] }];
  if (el.inner > 0 && el.inner < el.outer) s = difference(s, [{ outer: circleRing(el.inner, 120), holes: [] }]);
  return el.rotate ? mapShapes(s, rotator(el.rotate)) : s;
}

export function strokeOutline(pts: number[][], size: number): Shape[] {
  if (pts.length < 2) {
    const p = pts[0];
    return p ? [{ outer: circleRing(size / 2, 24, p[0], p[1]), holes: [] }] : [];
  }
  const o = getStroke(pts, { size, thinning: 0.25, smoothing: 0.6, streamline: 0.4, simulatePressure: pts[0].length < 3 });
  return clean(union([{ outer: o.map(([x, y]) => ({ x, y })), holes: [] }]), 0.03);
}

function strokeShapes(el: StrokeEl): Shape[] {
  const base = strokeOutline(el.pts, el.size);
  const out: Shape[] = [];
  const fold = Math.max(1, Math.round(el.fold));
  for (let i = 0; i < fold; i++) {
    const rot = rotator((i * 360) / fold);
    out.push(...mapShapes(base, rot));
    if (el.mirror) out.push(...mapShapes(base, (p) => rot({ x: -p.x, y: p.y })));
  }
  return out;
}

/** Un-unioned copies of one element — used for building, hit-testing and selection outlines. */
export function elementShapes(el: Element, custom: CustomMotif[]): Shape[] {
  const hit = elCache.get(el);
  if (hit && hit.motifs === custom) return hit.shapes;
  const shapes = el.kind === 'ring' ? ringShapes(el, custom) : el.kind === 'disc' ? discShapes(el) : strokeShapes(el);
  elCache.set(el, { motifs: custom, shapes });
  return shapes;
}

// ── layer ───────────────────────────────────────────────────────────────────

const layerCache = new WeakMap<Layer, { motifs: CustomMotif[]; shapes: Shape[] }>();

/** Elements are applied in order: "add" unions material in, "cut" removes it. */
export function layerShapes(layer: Layer, custom: CustomMotif[]): Shape[] {
  const hit = layerCache.get(layer);
  if (hit && hit.motifs === custom) return hit.shapes;
  let acc: Shape[] = [];
  let pending: Shape[] = [];
  let pendingOp: 'add' | 'cut' | null = null;
  const flush = () => {
    if (!pending.length) return;
    acc = pendingOp === 'add' ? union([...acc, ...pending]) : difference(acc, union(pending));
    pending = [];
  };
  for (const el of layer.elements) {
    if (el.op !== pendingOp) { flush(); pendingOp = el.op; }
    pending.push(...elementShapes(el, custom));
  }
  flush();
  layerCache.set(layer, { motifs: custom, shapes: acc });
  return acc;
}

// ── stack ───────────────────────────────────────────────────────────────────

function plateShapes(d: Design, footprint: Shape[]): Shape[] {
  const bb = bbox(footprint);
  if (!bb) return [];
  const r = Math.max(Math.abs(bb.minX), Math.abs(bb.maxX), Math.abs(bb.minY), Math.abs(bb.maxY));
  let far = 0;
  for (const s of footprint) for (const p of s.outer) far = Math.max(far, Math.hypot(p.x, p.y));
  const m = d.plateMargin;
  switch (d.plate) {
    case 'round': return [{ outer: circleRing(far + m, 160), holes: [] }];
    case 'square': { const h = r + m; return [{ outer: [{ x: -h, y: -h }, { x: h, y: -h }, { x: h, y: h }, { x: -h, y: h }], holes: [] }]; }
    case 'hexagon': return [{ outer: polygonRing((far + m) / Math.cos(Math.PI / 6), 6, 0), holes: [] }];
    case 'outline': return offset(footprint, Math.max(m, 0.5)).map((s) => ({ outer: s.outer, holes: [] }));
    default: return [];
  }
}

const stackCache = new WeakMap<Design, BuiltLayer[]>();

export function buildStack(d: Design): BuiltLayer[] {
  const hit = stackCache.get(d);
  if (hit) return hit;
  const vis = d.layers.map((l, i) => ({ l, i })).filter((x) => x.l.visible);
  let own = vis.map((x) => layerShapes(x.l, d.customMotifs));
  const frame = d.frame?.shapes.length ? d.frame : null;
  // inside a frame every layer is clipped to the outline, stepping in a little more each tier
  // (crumbs under 1 mm² left at sharp corners are dropped — they cannot be cut or glued)
  if (frame) own = own.map((s, k) => intersect(s, offset(frame.shapes, -frame.step * (k + 1))).filter((p) => shapeArea(p) >= 1));
  const final: Shape[][] = own.slice();
  if (d.solidStack) {
    // top-down: every sheet also carries the footprint of everything above it
    for (let i = final.length - 2; i >= 0; i--) final[i] = union([...final[i], ...final[i + 1]]);
  }
  const out: BuiltLayer[] = [];
  if (frame) {
    out.push({ id: 'plate', name: frame.name || 'Shape', color: d.plateColor, shapes: frame.shapes, own: frame.shapes, isPlate: true, srcIndex: -1 });
  } else if (d.plate !== 'none' && final.length) {
    const footprint = d.solidStack ? final[0] : union(final.flat());
    const p = plateShapes(d, footprint);
    if (p.length) out.push({ id: 'plate', name: 'Backplate', color: d.plateColor, shapes: p, own: p, isPlate: true, srcIndex: -1 });
  }
  vis.forEach((x, k) => {
    if (final[k].length) out.push({ id: x.l.id, name: x.l.name, color: x.l.color, shapes: final[k], own: own[k], isPlate: false, srcIndex: x.i });
  });
  stackCache.set(d, out);
  return out;
}

// ── checks ──────────────────────────────────────────────────────────────────

export const MIN_FEATURE = { laser: 1.2, print: 0.8 };

export function computeStats(d: Design, stack: BuiltLayer[], mode: 'laser' | 'print' = 'laser'): Stats {
  const bb = bbox(stack.flatMap((l) => l.shapes));
  const height = mode === 'laser'
    ? stack.length * d.thickness
    : stack.reduce((t, l) => t + (l.isPlate ? d.print.base : d.print.layer), 0);
  return {
    sizeX: bb ? bb.maxX - bb.minX : 0,
    sizeY: bb ? bb.maxY - bb.minY : 0,
    layers: stack.length,
    pieces: stack.reduce((t, l) => t + l.shapes.length, 0),
    cutLength: stack.reduce((t, l) => t + cutLength(l.shapes), 0),
    height,
  };
}

/** Real geometry checks, phrased as things to fix. Cheap enough to stay always-on. */
export function validate(stack: BuiltLayer[], minFeature = MIN_FEATURE.laser): Issue[] {
  const issues: Issue[] = [];
  if (!stack.length) return [{ id: 'empty', level: 'error', message: 'Nothing to make yet — pick a template or add a motif.' }];

  const bottom = stack[0];
  if (bottom.shapes.length > 1)
    issues.push({
      id: 'bottom', level: 'error',
      message: `The bottom sheet is ${bottom.shapes.length} loose pieces, so nothing holds the stack together.`,
      fix: { label: 'Add backplate', action: 'plate' },
    });

  for (let i = 1; i < stack.length; i++) {
    const L = stack[i], below = stack[i - 1];
    let floating = 0, weak = 0;
    for (const piece of L.shapes) {
      const a = shapeArea(piece);
      const contact = area(intersect([piece], below.shapes));
      if (contact < Math.min(0.5, a * 0.5)) floating++;
      else if (contact < a * 0.35) weak++;
    }
    if (floating)
      issues.push({
        id: 'float-' + L.id, level: 'error',
        message: `${L.name}: ${floating} piece${floating > 1 ? 's have' : ' has'} nothing underneath to glue to.`,
        fix: { label: 'Fill under layers', action: 'solid' },
      });
    else if (weak)
      issues.push({
        id: 'weak-' + L.id, level: 'warn',
        message: `${L.name}: ${weak} piece${weak > 1 ? 's overhang' : ' overhangs'} the sheet below by more than half.`,
        fix: { label: 'Fill under layers', action: 'solid' },
      });
  }

  for (const L of stack) {
    if (L.isPlate) continue;
    // opening by half the minimum width removes anything thinner than it
    const opened = offset(offset(L.shapes, -minFeature / 2), minFeature / 2);
    const lost = area(difference(L.shapes, offset(opened, 0.05)));
    if (lost > Math.max(8, area(L.shapes) * 0.012))
      issues.push({ id: 'thin-' + L.id, level: 'warn', message: `${L.name}: some details are thinner than ${minFeature} mm and may burn away or snap.` });
    if (L.shapes.length > 24)
      issues.push({ id: 'many-' + L.id, level: 'warn', message: `${L.name} is ${L.shapes.length} separate pieces to place by hand.` });
  }
  return issues;
}

/** Proportionally resize a whole design (all element dimensions are stored in mm). */
export function scaleDesign(d: Design, k: number): Design {
  const el = (e: Element): Element => {
    if (e.kind === 'ring') return { ...e, radius: e.radius * k, length: e.length * k, width: e.width * k, outline: e.outline * k };
    if (e.kind === 'disc') return { ...e, outer: e.outer * k, inner: e.inner * k, depth: e.depth * k };
    return { ...e, size: e.size * k, pts: e.pts.map((p) => [p[0] * k, p[1] * k, ...p.slice(2)]) };
  };
  const frame = d.frame ? { ...d.frame, step: d.frame.step, shapes: mapShapes(d.frame.shapes, (p) => ({ x: p.x * k, y: p.y * k })) } : d.frame;
  return { ...d, frame, layers: d.layers.map((l) => ({ ...l, elements: l.elements.map(el) })) };
}

export function shapesFar(shapes: Shape[]): number {
  let far = 0;
  for (const s of shapes) for (const p of s.outer) far = Math.max(far, Math.hypot(p.x, p.y));
  return far;
}

export function designDiameter(d: Design): number {
  if (d.frame?.shapes.length) return shapesFar(d.frame.shapes) * 2;
  let far = 0;
  for (const l of d.layers)
    for (const s of layerShapes(l, d.customMotifs)) for (const p of s.outer) far = Math.max(far, Math.hypot(p.x, p.y));
  return far * 2;
}
