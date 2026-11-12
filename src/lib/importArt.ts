// Three ways in: an SVG (filled shapes AND stroke-only outlines), a bitmap (traced to a
// silhouette), or typed text. All of them end as a CustomMotif — normalised artwork that can be a
// centrepiece or be repeated around the mandala like any built-in motif.
import DOMPurify from 'dompurify';
import parse from 'parse-svg-path';
import abs from 'abs-svg-path';
import normalize from 'normalize-svg-path';
import bezier from 'adaptive-bezier-curve';
import type { CustomMotif, Pt, Ring, Shape } from './types';
import { bbox, clean, fromRingsEvenOdd, strokeToShapes, union } from './geom';
import { uid } from './recipes';

const MAX_POINTS = 6000;

function countPoints(shapes: Shape[]) {
  return shapes.reduce((t, s) => t + s.outer.length + s.holes.reduce((u, h) => u + h.length, 0), 0);
}

/** Centre on the origin, fit into the unit box (like the built-in motifs) and thin out points until it is light. */
export function toMotif(shapes: Shape[], name: string, box?: { minX: number; minY: number; maxX: number; maxY: number }): CustomMotif {
  const bb = box ?? bbox(shapes);
  if (!bb) throw new Error('No closed shapes were found in that file.');
  const w = bb.maxX - bb.minX, h = bb.maxY - bb.minY, k = 1 / Math.max(w, h, 1e-9);
  const cx = (bb.minX + bb.maxX) / 2, cy = (bb.minY + bb.maxY) / 2;
  // work at 100 units so clipper's 0.001 grid is plenty, then scale to the unit box
  const f = (p: Pt) => ({ x: (p.x - cx) * k * 100, y: (p.y - cy) * k * 100 });
  let s = shapes.map((sh) => ({ outer: sh.outer.map(f), holes: sh.holes.map((r) => r.map(f)) }));
  let tol = 0.03;
  s = clean(s, tol);
  while (countPoints(s) > MAX_POINTS && tol < 1) { tol *= 1.8; s = clean(s, tol); }
  // simplification ran at true proportions; the stored shape fills the unit box on both axes
  const g = (p: Pt) => ({ x: p.x / (100 * w * k), y: p.y / (100 * h * k) });
  return {
    id: uid('c'), name: name.replace(/\.[a-z0-9]+$/i, '').slice(0, 40) || 'Artwork', aspect: w / Math.max(h, 1e-9),
    shapes: s.map((sh) => ({ outer: sh.outer.map(g), holes: sh.holes.map((r) => r.map(g)) })),
  };
}

// ── SVG ─────────────────────────────────────────────────────────────────────

export function importSvg(text: string, name: string): { motif: CustomMotif; notes: string[] } {
  const notes: string[] = [];
  const safe = DOMPurify.sanitize(text, { USE_PROFILES: { svg: true, svgFilters: false }, FORBID_TAGS: ['script', 'foreignObject', 'image', 'style'], FORBID_ATTR: ['style'] });
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-99999px;top:0;width:10px;height:10px;overflow:hidden;pointer-events:none';
  host.setAttribute('aria-hidden', 'true');
  host.innerHTML = safe;
  const svg = host.querySelector('svg');
  if (!svg) throw new Error('That file does not look like an SVG.');
  document.body.appendChild(host);
  try {
    // inline every <use> so the walk below never special-cases it
    for (let pass = 0; pass < 4; pass++) {
      const uses = Array.from(svg.querySelectorAll('use'));
      if (!uses.length) break;
      for (const u of uses) {
        const href = u.getAttribute('href') || u.getAttribute('xlink:href') || '';
        const ref = href.startsWith('#') ? svg.querySelector('#' + CSS.escape(href.slice(1))) : null;
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        const t = `${u.getAttribute('transform') ?? ''} translate(${u.getAttribute('x') || 0} ${u.getAttribute('y') || 0})`;
        g.setAttribute('transform', t);
        if (ref) { const c = ref.cloneNode(true) as Element; c.removeAttribute('id'); g.appendChild(c); }
        u.replaceWith(g);
      }
    }
    const filled: Ring[] = [];
    const lines: { pts: Ring; closed: boolean; width: number }[] = [];
    let skippedOpen = 0;
    const els = svg.querySelectorAll<SVGGeometryElement>('path,circle,ellipse,rect,polygon,polyline,line');
    els.forEach((el) => {
      if (el.closest('defs,clipPath,mask,symbol,pattern,marker')) return;
      const ctm = el.getCTM();
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      const hasFill = cs.fill !== 'none' && parseFloat(cs.fillOpacity || '1') > 0;
      const hasStroke = cs.stroke !== 'none' && parseFloat(cs.strokeWidth || '0') > 0;
      if (!hasFill && !hasStroke) return;
      const tf = (x: number, y: number): Pt => (ctm ? { x: ctm.a * x + ctm.c * y + ctm.e, y: ctm.b * x + ctm.d * y + ctm.f } : { x, y });
      const scale = ctm ? Math.sqrt(Math.abs(ctm.a * ctm.d - ctm.b * ctm.c)) : 1;
      const subs: { pts: Ring; closed: boolean }[] = [];
      if (el.tagName.toLowerCase() === 'path') {
        const d = el.getAttribute('d') || '';
        let segs: (string | number)[][];
        try { segs = normalize(abs(parse(d))); } catch { return; }
        let cur: Ring = [], start: Pt = { x: 0, y: 0 }, pen: Pt = { x: 0, y: 0 };
        const closedFlags = /z\s*$/i;
        const subD = d.split(/(?=[Mm])/).filter((s) => s.trim());
        let si = -1;
        const flush = () => { if (cur.length > 1) subs.push({ pts: cur, closed: si >= 0 && si < subD.length ? closedFlags.test(subD[si].trim()) : false }); };
        for (const s of segs) {
          if (s[0] === 'M') {
            flush(); si++;
            pen = { x: s[1] as number, y: s[2] as number }; start = pen; cur = [tf(pen.x, pen.y)];
          } else if (s[0] === 'C') {
            const pts = bezier([pen.x, pen.y], [s[1], s[2]], [s[3], s[4]], [s[5], s[6]], Math.max(1, scale) * 4) as number[][];
            for (let i = 1; i < pts.length; i++) cur.push(tf(pts[i][0], pts[i][1]));
            pen = { x: s[5] as number, y: s[6] as number };
          }
        }
        flush();
        void start;
      } else {
        const len = el.getTotalLength();
        if (!(len > 0)) return;
        const tag = el.tagName.toLowerCase();
        const n = tag === 'line' ? 1 : tag === 'polygon' || tag === 'polyline' || (tag === 'rect' && !el.getAttribute('rx') && !el.getAttribute('ry')) ? 0 : Math.min(240, Math.max(24, Math.round(len * scale / 1.5)));
        const pts: Ring = [];
        if (n === 0) {
          const list = tag === 'rect'
            ? (() => { const b = (el as unknown as SVGRectElement); const x = b.x.baseVal.value, y = b.y.baseVal.value, w = b.width.baseVal.value, h = b.height.baseVal.value; return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]; })()
            : Array.from((el as unknown as SVGPolygonElement).points).map((p) => [p.x, p.y]);
          list.forEach(([x, y]) => pts.push(tf(x, y)));
        } else for (let i = 0; i <= n; i++) { if (i === n && tag !== 'line') break; const p = el.getPointAtLength((i / n) * len); pts.push(tf(p.x, p.y)); }
        subs.push({ pts, closed: tag !== 'line' && tag !== 'polyline' });
      }
      for (const s of subs) {
        if (hasFill && s.pts.length >= 3) filled.push(s.pts);
        else if (hasStroke) lines.push({ ...s, width: Math.max(parseFloat(cs.strokeWidth) * scale, 0) });
        else skippedOpen++;
      }
    });
    let shapes = fromRingsEvenOdd(filled);
    if (lines.length) {
      // stroke-only artwork (outlines, line drawings) becomes material of the stroke's width;
      // hairlines are thickened so they survive cutting
      const all = bbox([...shapes, ...lines.map((l) => ({ outer: l.pts, holes: [] }))]);
      const span = all ? Math.max(all.maxX - all.minX, all.maxY - all.minY) : 100;
      const minW = span * 0.012;
      const groups = new Map<number, { pts: Ring; closed: boolean }[]>();
      for (const l of lines) { const w = Math.max(l.width, minW); groups.set(w, [...(groups.get(w) ?? []), l]); }
      const stroked: Shape[] = [];
      groups.forEach((ls, w) => stroked.push(...strokeToShapes(ls, w)));
      shapes = union([...shapes, ...stroked]);
      notes.push(`${lines.length} outline${lines.length > 1 ? 's were' : ' was'} thickened into cuttable lines.`);
    }
    if (skippedOpen) notes.push(`${skippedOpen} open path${skippedOpen > 1 ? 's' : ''} without a stroke skipped.`);
    if (!shapes.length) throw new Error('No shapes with a fill or stroke were found in that SVG.');
    return { motif: toMotif(shapes, name), notes };
  } finally { host.remove(); }
}

// ── bitmap → silhouette ─────────────────────────────────────────────────────

export interface TraceOptions { threshold: number; invert: boolean }

/** Trace the boundary between "ink" and "paper" cells; returns rings on the pixel-corner grid. */
function traceMask(mask: Uint8Array, w: number, h: number): Ring[] {
  // directed boundary edges, keeping ink on the left; then chain them into loops
  const next = new Map<number, number[]>();
  const key = (x: number, y: number) => y * (w + 1) + x;
  const add = (x0: number, y0: number, x1: number, y1: number) => {
    const k = key(x0, y0); const a = next.get(k); const v = key(x1, y1);
    if (a) a.push(v); else next.set(k, [v]);
  };
  const ink = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!ink(x, y)) continue;
      if (!ink(x, y - 1)) add(x, y, x + 1, y);
      if (!ink(x + 1, y)) add(x + 1, y, x + 1, y + 1);
      if (!ink(x, y + 1)) add(x + 1, y + 1, x, y + 1);
      if (!ink(x - 1, y)) add(x, y + 1, x, y);
    }
  const rings: Ring[] = [];
  for (const [startKey] of next) {
    while ((next.get(startKey)?.length ?? 0) > 0) {
      const ring: Ring = [];
      let k = startKey;
      for (let guard = 0; guard < 4_000_000; guard++) {
        const outs = next.get(k);
        if (!outs || !outs.length) break;
        ring.push({ x: k % (w + 1), y: Math.floor(k / (w + 1)) });
        k = outs.pop()!;
        if (k === startKey) break;
      }
      if (ring.length >= 4) rings.push(ring);
    }
  }
  return rings;
}

/** Chaikin corner cutting — rounds the pixel staircase without shrinking the shape much. */
function smooth(r: Ring, passes = 2): Ring {
  let cur = r;
  for (let p = 0; p < passes; p++) {
    const out: Ring = [];
    for (let i = 0; i < cur.length; i++) {
      const a = cur[i], b = cur[(i + 1) % cur.length];
      out.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 }, { x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
    }
    cur = out;
  }
  return cur;
}

export function traceImageData(img: ImageData, opt: TraceOptions): Shape[] {
  const { width: w, height: h, data } = img;
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const a = data[i * 4 + 3] / 255;
    const lum = (0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]) / 255;
    const v = lum * a + (1 - a); // transparent counts as paper
    mask[i] = (v < opt.threshold) !== opt.invert ? 1 : 0;
  }
  const rings = traceMask(mask, w, h).map((r) => smooth(r));
  return clean(fromRingsEvenOdd(rings), 0.12).filter((s) => s.outer.length >= 6);
}

export async function loadBitmap(file: Blob, maxSide = 420): Promise<ImageData> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  return ctx.getImageData(0, 0, c.width, c.height);
}

/**
 * Photo → tonal layers: `levels` silhouettes from "everything but the highlights" down to "only
 * the darkest shadows". They share one frame, so stacked on successive layers they register.
 */
export function photoLevels(img: ImageData, levels: number, name: string): CustomMotif[] {
  const box = { minX: 0, minY: 0, maxX: img.width, maxY: img.height };
  const out: CustomMotif[] = [];
  for (let k = 0; k < levels; k++) {
    const threshold = 0.86 - (k / Math.max(1, levels - 1)) * 0.62; // 0.86 … 0.24
    const shapes = traceImageData(img, { threshold, invert: false });
    if (shapes.length) out.push(toMotif(shapes, `${name.replace(/\.[a-z0-9]+$/i, '')} tone ${k + 1}`, box));
  }
  return out;
}

export const FONTS: { id: string; label: string; css: string }[] = [
  { id: 'bold', label: 'Bold', css: '900 200px "Arial Rounded MT Bold", "Arial Black", "Segoe UI", system-ui, sans-serif' },
  { id: 'serif', label: 'Serif', css: '700 200px Georgia, "Times New Roman", "Noto Serif", serif' },
  { id: 'script', label: 'Script', css: '700 200px "Snell Roundhand", "Segoe Script", "Brush Script MT", "Apple Chancery", cursive' },
  { id: 'slab', label: 'Typewriter', css: '700 200px "Courier New", Courier, monospace' },
];

/** Type → artwork: rendered large in a face installed on this device, then traced. */
export function textToMotif(text: string, fontId = 'bold'): CustomMotif {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  const font = (FONTS.find((f) => f.id === fontId) ?? FONTS[0]).css;
  ctx.font = font;
  const m = ctx.measureText(text);
  c.width = Math.min(4000, Math.ceil(m.width) + 40); c.height = 300;
  const ctx2 = c.getContext('2d', { willReadFrequently: true })!;
  ctx2.fillStyle = '#fff'; ctx2.fillRect(0, 0, c.width, c.height);
  ctx2.fillStyle = '#000'; ctx2.font = font; ctx2.textBaseline = 'middle';
  ctx2.fillText(text, 20, 150);
  const shapes = traceImageData(ctx2.getImageData(0, 0, c.width, c.height), { threshold: 0.5, invert: false });
  if (!shapes.length) throw new Error('Nothing to trace — type some text first.');
  return toMotif(shapes, text);
}
