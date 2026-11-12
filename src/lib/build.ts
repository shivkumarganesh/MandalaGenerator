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
    if (el.op === 'score') continue; // engraving does not change the sheet's outline
    if (el.op !== pendingOp) { flush(); pendingOp = el.op; }
    pending.push(...elementShapes(el, custom));
  }
  flush();
  layerCache.set(layer, { motifs: custom, shapes: acc });
  return acc;
}

/** Engraved artwork of a layer (before it is trimmed to the sheet). */
export function layerScore(layer: Layer, custom: CustomMotif[]): Shape[] {
  const els = layer.elements.filter((e) => e.op === 'score');
  return els.length ? els.flatMap((e) => elementShapes(e, custom)) : [];
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

function holeShapes(d: Design, stack: BuiltLayer[]): Shape[] {
  const h = d.holes;
  if (!h || !stack.length) return [];
  const out: Shape[] = [];
  if (h.centre > 0) out.push({ outer: circleRing(h.centre / 2, 40), holes: [] });
  if (h.hang > 0) {
    const bb = bbox(stack[0].shapes);
    if (bb) {
      // straight above the centre, a few mm inside the bottom sheet's top edge
      const band = Math.max(2, (bb.maxX - bb.minX) * 0.03);
      let top = Infinity;
      for (const s of stack[0].shapes) for (const p of s.outer) if (Math.abs(p.x) < band && p.y < top) top = p.y;
      if (top === Infinity) top = bb.minY;
      out.push({ outer: circleRing(h.hang / 2, 28, 0, top + h.hang / 2 + Math.max(3, h.hang)), holes: [] });
    }
  }
  if (h.pins) {
    const r = shapesFar(stack[stack.length - 1].shapes) * 0.38;
    out.push({ outer: circleRing(1.5, 20, r, 0), holes: [] }, { outer: circleRing(1.5, 20, -r, 0), holes: [] });
  }
  return out;
}

const stackCache = new WeakMap<Design, BuiltLayer[]>();

export function buildStack(d: Design): BuiltLayer[] {
  const hit = stackCache.get(d);
  if (hit) return hit;
  const vis = d.layers.map((l, i) => ({ l, i })).filter((x) => x.l.visible);
  let own = vis.map((x) => layerShapes(x.l, d.customMotifs));
  const frame = d.frame?.shapes.length ? d.frame : null;
  // inside a frame every layer is clipped to the outline, stepping in a little more each tier
  // (crumbs under 1 mm² left at sharp corners are dropped — they cannot be cut or glued).
  // With a rim, each layer also keeps a border along the outline, which ties open line-work
  // into one piece and gives the stepped picture-frame look.
  if (frame)
    own = own.map((s, k) => {
      const clip = offset(frame.shapes, -frame.step * (k + 1));
      const inside = intersect(s, clip).filter((p) => shapeArea(p) >= 1);
      const rim = frame.rim ?? 0;
      if (rim <= 0 || !inside.length) return inside;
      return union([...inside, ...difference(clip, offset(clip, -rim))]);
    });
  const final: Shape[][] = own.slice();
  if (d.solidStack) {
    // top-down: every sheet also carries the footprint of everything above it
    for (let i = final.length - 2; i >= 0; i--) final[i] = union([...final[i], ...final[i + 1]]);
  }
  const out: BuiltLayer[] = [];
  if (frame) {
    out.push({ id: 'plate', name: frame.name || 'Shape', color: d.plateColor, shapes: frame.shapes, own: frame.shapes, score: [], isPlate: true, srcIndex: -1 });
  } else if (d.plate !== 'none' && final.length) {
    const footprint = d.solidStack ? final[0] : union(final.flat());
    const p = plateShapes(d, footprint);
    if (p.length) out.push({ id: 'plate', name: 'Backplate', color: d.plateColor, shapes: p, own: p, score: [], isPlate: true, srcIndex: -1 });
  }
  vis.forEach((x, k) => {
    if (final[k].length) out.push({ id: x.l.id, name: x.l.name, color: x.l.color, shapes: final[k], own: own[k], score: layerScore(x.l, d.customMotifs), isPlate: false, srcIndex: x.i });
  });
  // through-holes go through every sheet
  const holes = holeShapes(d, out);
  if (holes.length) for (const l of out) { l.shapes = difference(l.shapes, holes); l.own = difference(l.own, holes); }
  // engraving only exists where the sheet is visible material
  out.forEach((l, i) => { if (l.score.length) l.score = intersect(l.score, i < out.length - 1 ? difference(l.shapes, out[i + 1].shapes) : l.shapes); });
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
const thinCache = new WeakMap<Shape[], Map<number, number>>();

/** Area (mm²) that disappears when the sheet is opened by the minimum width. Cached per geometry. */
function thinLoss(shapes: Shape[], minFeature: number): number {
  let m = thinCache.get(shapes);
  if (!m) thinCache.set(shapes, (m = new Map()));
  let v = m.get(minFeature);
  if (v === undefined) {
    // mitered offsets are several times cheaper than rounded ones and slightly lenient, which suits a warning
    const opened = offset(clean(offset(shapes, -minFeature / 2, 'miter'), 0.04), minFeature / 2, 'miter');
    v = area(shapes) - area(opened);
    m.set(minFeature, v);
  }
  return v;
}

/**
 * `solid` = the design uses "fill under upper layers": every sheet then contains the ones above
 * it by construction, so the overhang tests are skipped.
 */
export function validate(stack: BuiltLayer[], minFeature = MIN_FEATURE.laser, solid = false): Issue[] {
  const issues: Issue[] = [];
  if (!stack.length) return [{ id: 'empty', level: 'error', message: 'Nothing to make yet — pick a template or add a motif.' }];

  const bottom = stack[0];
  if (bottom.shapes.length > 1)
    issues.push({
      id: 'bottom', level: 'error',
      message: `The bottom sheet is ${bottom.shapes.length} loose pieces, so nothing holds the stack together.`,
      fix: { label: 'Add backplate', action: 'plate' },
    });

  for (let i = 1; i < stack.length && !solid; i++) {
    const L = stack[i], below = stack[i - 1];
    // one boolean answers the common case: nothing hangs past the sheet below
    const overhang = difference(L.shapes, below.shapes);
    if (area(overhang) < 0.5) continue;
    let floating = 0, weak = 0;
    for (const piece of L.shapes) {
      const a = shapeArea(piece);
      const hang = area(intersect([piece], overhang));
      const contact = a - hang;
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
    // a sheet's own shapes carry its fine detail (the fill under upper layers only thickens it)
    const lost = thinLoss(L.own, minFeature);
    if (lost > Math.max(8, area(L.own) * 0.012))
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
  const frame = d.frame ? { ...d.frame, shapes: mapShapes(d.frame.shapes, (p) => ({ x: p.x * k, y: p.y * k })) } : d.frame;
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
