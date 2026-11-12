// Starting points: palettes, a seeded mandala generator ("Surprise me") and the template list.
// Templates are just fixed (style, seed, palette) triples, so every thumbnail is the real thing.
import { builtinMotif } from './motifs';
import type { CurveEl, Design, DiscEl, EdgeStyle, Element, Layer, RingEl } from './types';

let idCounter = 0;
export const uid = (p = 'e'): string => `${p}${Date.now().toString(36)}${(idCounter++).toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;

export interface Palette { id: string; label: string; colors: string[]; wood?: boolean }

export const PALETTES: Palette[] = [
  { id: 'wood', label: 'Natural wood', wood: true, colors: ['#5a3a22', '#8a5a33', '#b98552', '#d9b382', '#ecd5ad', '#f6e8cf'] },
  { id: 'walnut', label: 'Walnut & maple', wood: true, colors: ['#3b2616', '#f1dcb6', '#6b4226', '#e2c391', '#8f5e38', '#f8ecd4'] },
  { id: 'sunset', label: 'Sunset', colors: ['#3d1e4f', '#8e2f5c', '#d6455a', '#f47b4f', '#fbb55a', '#fde9a9'] },
  { id: 'ocean', label: 'Ocean', colors: ['#0f2b46', '#15507a', '#1f86a8', '#49b6b8', '#9bdcc9', '#e6f6e6'] },
  { id: 'forest', label: 'Forest', colors: ['#1f3326', '#2f5d3a', '#5a8f4a', '#9cbf5c', '#d7dd8a', '#f5f1c9'] },
  { id: 'berry', label: 'Berry', colors: ['#2b1338', '#5b1f6b', '#a0318c', '#dd5a9a', '#f6a3b7', '#fde3e3'] },
  { id: 'peacock', label: 'Peacock', colors: ['#12263a', '#0f6d7a', '#12a594', '#f2c14e', '#f78154', '#fbf3d5'] },
  { id: 'terracotta', label: 'Terracotta', colors: ['#3a2a25', '#8c3b2a', '#c65d3b', '#e39b5d', '#f0cf9a', '#f9efdc'] },
  { id: 'christmas', label: 'Christmas', colors: ['#16321f', '#2f6b45', '#9c1b25', '#c8323a', '#d9a441', '#fbf1d8'] },
  { id: 'frost', label: 'Frost', colors: ['#0d2640', '#1f4f7a', '#5c9bc4', '#a8d3ea', '#e3f2fa', '#ffffff'] },
  { id: 'nordic', label: 'Nordic red', colors: ['#6b101b', '#a51c27', '#f3ece0', '#c8323a', '#fff9f0', '#a51c27'] },
  { id: 'mono', label: 'Monochrome', colors: ['#1c1c1f', '#3d3e42', '#6f7177', '#a5a7ad', '#d6d8db', '#f6f6f7'] },
];

function mix(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

/** n colours, bottom → top, spread across the palette ramp. */
export function paletteColors(p: Palette, n: number): string[] {
  if (n <= 1) return [p.colors[2]];
  if (p.id === 'walnut' || p.id === 'nordic') return Array.from({ length: n }, (_, i) => p.colors[i % p.colors.length]);
  return Array.from({ length: n }, (_, i) => {
    const x = (i / (n - 1)) * (p.colors.length - 1);
    const k = Math.min(p.colors.length - 2, Math.floor(x));
    return mix(p.colors[k], p.colors[k + 1], x - k);
  });
}

export function applyPalette(d: Design, p: Palette): Design {
  const cols = paletteColors(p, d.layers.length);
  return {
    ...d,
    finish: p.wood ? 'wood' : d.finish === 'wood' ? 'painted' : d.finish,
    plateColor: mix(cols[0], '#000000', 0.35),
    layers: d.layers.map((l, i) => ({ ...l, color: cols[i] })),
  };
}

/** First colouring of a generated design: layers the generator already coloured keep their colour. */
function colourGenerated(d: Design, p: Palette): Design {
  const done = applyPalette(d, p);
  return { ...done, layers: done.layers.map((l, i) => (d.layers[i].color === '#cccccc' ? l : { ...l, color: d.layers[i].color })) };
}

export const ring = (o: Partial<RingEl> & Pick<RingEl, 'motif' | 'count' | 'radius' | 'length' | 'width'>): RingEl => ({
  id: uid(), kind: 'ring', op: 'add', rotate: 0, spin: 0, outline: 0, ...o,
});
export const disc = (o: Partial<DiscEl> & Pick<DiscEl, 'outer'>): DiscEl => ({
  id: uid(), kind: 'disc', op: 'add', inner: 0, edge: 'plain', lobes: 12, depth: 3, rotate: 0, ...o,
});
export const curve = (o: Partial<CurveEl> & Pick<CurveEl, 'pattern' | 'size' | 'a' | 'b' | 'c' | 'line'>): CurveEl => ({ id: uid(), kind: 'curve', op: 'add', rotate: 0, ...o });
export const layer = (name: string, color: string, elements: Element[]): Layer => ({ id: uid('l'), name, color, visible: true, elements });

export function emptyDesign(): Design {
  return {
    v: 2, name: 'My mandala', layers: [], customMotifs: [],
    thickness: 3, solidStack: true, plate: 'none', plateMargin: 5, plateColor: '#3b2616',
    kerf: 0, guides: false, finish: 'wood', print: { layer: 0.8, base: 1.2 },
  };
}

// ── seeded generator ─────────────────────────────────────────────────────────

function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Style = 'spirograph' | 'rosette' | 'girih' | 'guilloche' | 'flowerlife' | 'sunflower' | 'cobweb' | 'christmas' | 'filigree' | 'swirl' | 'gothic' | 'starlace' | 'lotus' | 'sunburst' | 'dahlia' | 'lace' | 'rosewindow' | 'snowflake' | 'compass' | 'hearts' | 'aztec' | 'bloom';
export const STYLES: Style[] = ['spirograph', 'rosette', 'girih', 'guilloche', 'flowerlife', 'sunflower', 'cobweb', 'christmas', 'filigree', 'swirl', 'gothic', 'starlace', 'lotus', 'sunburst', 'dahlia', 'lace', 'rosewindow', 'snowflake', 'compass', 'hearts', 'aztec', 'bloom'];

interface TierCfg {
  folds: number[]; layers: [number, number];
  motifs: string[]; wf: number; lf: number; shrink: number;
  inner: string | null; dots: boolean; twist: boolean; edge: EdgeStyle; centre: string;
}

const TIERS: Partial<Record<Style, TierCfg>> = {
  lotus: { folds: [8, 10, 12], layers: [4, 6], motifs: ['lotus', 'petal'], wf: 0.98, lf: 0.42, shrink: 0.2, inner: 'same', dots: false, twist: true, edge: 'plain', centre: 'flower' },
  sunburst: { folds: [12, 16], layers: [4, 5], motifs: ['spear', 'kite', 'triangle'], wf: 0.92, lf: 0.36, shrink: 0.24, inner: null, dots: true, twist: true, edge: 'plain', centre: 'star' },
  dahlia: { folds: [16, 20, 24], layers: [5, 6], motifs: ['petal', 'leaf'], wf: 1.25, lf: 0.36, shrink: 0.2, inner: null, dots: false, twist: true, edge: 'plain', centre: 'circle' },
  snowflake: { folds: [6], layers: [4, 5], motifs: ['spear', 'diamond'], wf: 0.6, lf: 0.5, shrink: 0.18, inner: 'diamond', dots: true, twist: true, edge: 'pointed', centre: 'hexagon' },
  hearts: { folds: [8, 10], layers: [3, 5], motifs: ['heart'], wf: 0.9, lf: 0.34, shrink: 0.2, inner: 'heart', dots: true, twist: true, edge: 'scallop', centre: 'heart' },
  bloom: { folds: [6, 8], layers: [4, 5], motifs: ['teardrop', 'flame', 'paisley'], wf: 0.8, lf: 0.46, shrink: 0.2, inner: 'teardrop', dots: true, twist: true, edge: 'wave', centre: 'flower' },
  compass: { folds: [8], layers: [4, 5], motifs: ['kite', 'leaf'], wf: 0.7, lf: 0.55, shrink: 0.2, inner: null, dots: true, twist: true, edge: 'plain', centre: 'star' },
};

const R = 100; // generated at Ø200 mm; "Design size" rescales everything

function tiers(style: Style, cfg: TierCfg, rnd: () => number, count?: number): Layer[] {
  const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)];
  const n0 = pick(cfg.folds);
  const auto = cfg.layers[0] + Math.floor(rnd() * (cfg.layers[1] - cfg.layers[0] + 1));
  const L = count ?? auto;
  const motif = pick(cfg.motifs);
  const lf = cfg.lf * (0.9 + rnd() * 0.2);
  const out: Layer[] = [];
  const tip = (k: number) => R * (1 - (1 - cfg.shrink) * Math.pow(k / (L - 1), 0.88));
  for (let k = 0; k < L; k++) {
    const T = tip(k);
    const top = k === L - 1;
    const els: Element[] = [];
    if (top) {
      // centre boss
      els.push(disc({ outer: T * 0.62, edge: cfg.edge === 'plain' ? 'scallop' : cfg.edge, lobes: n0, depth: T * 0.1 }));
      els.push(ring({ motif, count: n0, radius: T * 0.66, length: T * 0.68, width: Math.min(T * 0.5, ((2 * Math.PI * T * 0.66) / n0) * cfg.wf), rotate: cfg.twist && k % 2 ? 180 / n0 : 0 }));
      els.push(ring({ op: 'cut', motif: cfg.centre, count: 1, radius: 0, length: T * 0.5, width: T * 0.5 }));
      out.push(layer(`Layer ${k + 1}`, '#cccccc', els));
      continue;
    }
    let n = n0;
    let len = T * lf;
    if (style === 'compass') len = T * (k % 2 ? lf * 0.7 : lf);
    const rad = T - len / 2;
    let pitch = (2 * Math.PI * rad) / n;
    if (pitch * cfg.wf < 7 && n % 2 === 0) { n /= 2; pitch *= 2; }
    const width = Math.min(pitch * cfg.wf, len * 1.1);
    const discR = T - len * 0.8;
    const rot = cfg.twist && k % 2 ? 180 / n : 0;
    els.push(disc({ outer: discR, edge: cfg.edge, lobes: n * 2, depth: Math.min(3, discR * 0.06) }));
    els.push(ring({ motif, count: n, radius: rad, length: len, width, rotate: rot }));
    if (cfg.inner && k > 0 && width >= 9 && len >= 12) {
      const im = cfg.inner === 'same' ? motif : cfg.inner;
      els.push(ring({ op: 'cut', motif: im, count: n, radius: rad + len * 0.02, length: len * 0.46, width: width * 0.42, rotate: rot }));
    }
    const nextT = tip(k + 1);
    const band = discR - nextT;
    if (cfg.dots && k > 0 && band > 7) {
      const dr = nextT + band / 2;
      const dia = Math.min(band - 4.5, ((2 * Math.PI * dr) / n) * 0.45, 9);
      if (dia >= 2.5) els.push(ring({ op: 'cut', motif: rnd() < 0.5 ? 'circle' : 'diamond', count: n, radius: dr, length: dia, width: dia, rotate: rot + 180 / n }));
    }
    out.push(layer(`Layer ${k + 1}`, '#cccccc', els));
  }
  return out;
}

/** "Window" mandalas: stacked discs, each with a ring of cut-outs that shows the sheet below. */
function windows(style: Style, rnd: () => number, count?: number): Layer[] {
  const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)];
  const cfg = style === 'rosewindow'
    ? { folds: [8, 12], cut: ['arch', 'petal'], edge: ['plain', 'scallop'] as EdgeStyle[], fill: 0.7 }
    : style === 'aztec'
      ? { folds: [8, 12, 16], cut: ['triangle', 'kite', 'square'], edge: ['zigzag', 'pointed'] as EdgeStyle[], fill: 0.6 }
      : { folds: [10, 12, 16], cut: ['teardrop', 'leaf', 'lotus'], edge: ['scallop', 'wave'] as EdgeStyle[], fill: 0.62 };
  const n = pick(cfg.folds);
  const auto = 4 + Math.floor(rnd() * 2);
  const L = count ?? auto;
  const edge = pick(cfg.edge);
  const out: Layer[] = [];
  const reach = 0.72 + rnd() * 0.12, bend = 0.85 + rnd() * 0.4, fill = cfg.fill * (0.85 + rnd() * 0.3);
  const T = (k: number) => R * (1 - reach * Math.pow(k / L, bend));
  for (let k = 0; k < L; k++) {
    const r = T(k), next = k === L - 1 ? r * 0.25 : T(k + 1);
    const depth = Math.min(5, (r - next) * 0.22);
    const els: Element[] = [disc({ outer: r, edge, lobes: k % 2 ? n : n * 2, depth, rotate: k % 2 ? 180 / n : 0 })];
    if (k > 0) {
      const rim = depth + 2.4;
      const wlen = r - rim - next - 2.2;
      const rad = next + 2.2 + wlen / 2;
      let cnt = n;
      let pitch = (2 * Math.PI * rad) / cnt;
      if (pitch < 8 && cnt % 2 === 0) { cnt /= 2; pitch *= 2; }
      if (wlen >= 4) els.push(ring({ op: 'cut', motif: pick(cfg.cut), count: cnt, radius: rad, length: wlen, width: Math.max(2.5, pitch * fill), rotate: k % 2 ? 180 / n : 0 }));
      if (wlen >= 14 && pitch > 14) els.push(ring({ op: 'cut', motif: 'circle', count: cnt, radius: rad + wlen * 0.2, length: 3, width: 3, rotate: (k % 2 ? 180 / n : 0) + 180 / cnt }));
    }
    if (k === L - 1) els.push(ring({ op: 'cut', motif: style === 'aztec' ? 'star' : 'flower', count: 1, radius: 0, length: r * 0.42, width: r * 0.42 }));
    out.push(layer(`Layer ${k + 1}`, '#cccccc', els));
  }
  return out;
}

export const STYLE_LABELS: Record<Style, string> = {
  spirograph: 'Spirograph', rosette: 'Rose curves', girih: 'Star polygons', guilloche: 'Guilloché braid', flowerlife: 'Flower of life', sunflower: 'Sunflower', cobweb: 'Cobweb',
  christmas: 'Christmas', filigree: 'Filigree lotus', swirl: 'Swirl', gothic: 'Gothic tracery', starlace: 'Star lace',
  lotus: 'Lotus tiers', sunburst: 'Sunburst', dahlia: 'Dahlia', lace: 'Lace', rosewindow: 'Rose window',
  snowflake: 'Snowflake', compass: 'Compass', hearts: 'Hearts', aztec: 'Aztec', bloom: 'Bloom',
};

/**
 * Open line-work mandalas, like the classic multilayer cut files: every layer is a lattice of
 * OUTLINED motifs tied together by thin rings. The same petal repeats smaller on each lower
 * layer (nested outlines), odd layers sit half a step round, and detail gets finer going down.
 */
function filigree(style: Style, rnd: () => number, count?: number): Layer[] {
  const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)];
  const cfg = style === 'swirl'
    ? { folds: [6, 8, 9, 10], motifs: ['teardrop', 'leaf', 'petal'], spin: 24 + rnd() * 14, wf: 0.92 }
    : style === 'gothic'
      ? { folds: [8, 12, 16], motifs: ['arch', 'spear', 'lotus'], spin: 0, wf: 1.0 }
      : style === 'starlace'
        ? { folds: [8, 10, 12], motifs: ['kite', 'diamond', 'triangle', 'spear'], spin: 0, wf: 1.05 }
        : { folds: [8, 10, 12, 16], motifs: ['lotus', 'petal', 'leaf'], spin: 0, wf: 1.12 };
  const n = pick(cfg.folds);
  const L = count ?? 5 + Math.floor(rnd() * 3);
  const swirl = style === 'swirl';
  const zones = swirl ? 2 : 2 + Math.floor(rnd() * 2); // radial bands of petals
  const hub = R * (0.13 + rnd() * 0.05);
  const bounds = [hub];
  for (let j = 1; j <= zones; j++) bounds.push(hub + (R * 0.97 - hub) * Math.pow(j / zones, 0.82 + rnd() * 0.25));
  const main = pick(cfg.motifs), alt = swirl ? main : pick(cfg.motifs), fine = pick(['circle', 'teardrop', 'diamond', 'petal']);
  const spinDir = rnd() < 0.5 ? 1 : -1;
  const dotted = rnd() < 0.75;
  const out: Layer[] = [];

  // bottom sheet: one solid piece that defines the silhouette
  const back: Element[] = [disc({ outer: R * 0.9, edge: 'scallop', lobes: n, depth: R * 0.03 })];
  back.push(ring({ motif: main, count: n, radius: bounds[zones - 1] + (R - bounds[zones - 1]) * 0.5, length: (R - bounds[zones - 1]) * 1.06, width: ((2 * Math.PI * R * 0.8) / n) * cfg.wf * 0.86, rotate: (zones - 1) % 2 ? 180 / n : 0, spin: cfg.spin * spinDir }));
  out.push(layer('Layer 1', '#cccccc', back));

  for (let k = 1; k < L; k++) {
    const s = L > 2 ? (k - 1) / (L - 2) : 1; // 0 = deepest lattice, 1 = top
    const depth = L - 1 - k; // 0 on top
    const wall = 1.7 + 1.3 * s;
    const q = Math.max(0.36, 1 - 0.17 * depth); // nested: lower layers repeat the petal smaller
    const half = depth % 2 === 1;
    const els: Element[] = [];
    // tie rings at every zone boundary
    for (let j = 0; j < zones; j++) els.push(disc({ outer: bounds[j] + wall * 0.6, inner: Math.max(0, bounds[j] - wall * 0.6) }));
    if (dotted && depth >= 1 && depth <= 2) {
      // a beaded band: a wider ring pierced by a row of holes
      const j = 1 + ((depth + zones) % Math.max(1, zones - 1));
      const r = bounds[Math.min(zones, j)], bw = 3.2;
      const beads = n * (r > R * 0.55 ? 4 : 2);
      els.push(disc({ outer: r + bw, inner: r - bw }));
      els.push(ring({ op: 'cut', motif: 'circle', count: beads, radius: r, length: 3, width: 3 }));
    }
    for (let j = 0; j < zones; j++) {
      const inner = bounds[j], outer = bounds[j + 1];
      const span = (outer - inner) * (j === zones - 1 ? 1.04 : 1.16);
      const zonePhase = (j % 2 ? 180 / n : 0) + (half ? 180 / n : 0);
      const motif = half ? alt : main;
      const len = Math.max(wall * 3, span * (half ? Math.min(1, q + 0.12) * 0.86 : q));
      const rad = inner + len / 2 - wall * 0.5;
      const pitch = (2 * Math.PI * (inner + span * 0.45)) / n;
      const width = Math.max(wall * 2.6, pitch * cfg.wf * (half ? 0.8 : 1) * Math.pow(q, 0.55));
      els.push(ring({ motif, count: n, radius: rad, length: len, width, rotate: zonePhase, spin: cfg.spin * spinDir, outline: wall }));
      // finer filler on the deeper layers, between the big petals
      if (!swirl && depth >= 3 && pitch > 16) {
        const fl = Math.min(span * 0.42, pitch * 0.42);
        els.push(ring({ motif: fine, count: n, radius: inner + span * 0.62, length: fl, width: fl * (fine === 'circle' ? 1 : 0.62), rotate: zonePhase + 180 / n, outline: Math.min(wall, fl * 0.22) }));
      }
    }
    // centre
    const c = hub * (1.5 - 0.12 * depth);
    if (depth === 0) els.push(ring({ motif: style === 'starlace' ? 'star' : 'flower', count: 1, radius: 0, length: c, width: c, outline: wall }));
    else els.push(ring({ motif: 'petal', count: n <= 9 ? n : n / 2, radius: hub * 0.52, length: hub * 0.95, width: hub * 0.42, rotate: half ? 180 / n : 0, outline: Math.min(wall, 1.6) }));
    out.push(layer(`Layer ${k + 1}`, '#cccccc', els));
  }
  return out;
}

// ── Christmas ───────────────────────────────────────────────────────────────

export const XMAS_FIGURES = ['reindeer', 'santa', 'snowman', 'gingerbread', 'stocking', 'bell-art'] as const;
export const XMAS_VARIANTS = ['snowflake', 'wreath', 'trees', 'poinsettia', 'bells', 'star', ...XMAS_FIGURES] as const;
export type XmasVariant = (typeof XMAS_VARIANTS)[number];
const XMAS_PALETTE: Record<string, string[]> = {
  santa: ['christmas', 'nordic'], snowman: ['frost', 'christmas'], gingerbread: ['terracotta', 'christmas', 'wood'], stocking: ['christmas', 'nordic'], 'bell-art': ['christmas', 'nordic', 'frost'],
  snowflake: ['frost'], wreath: ['christmas'], trees: ['christmas', 'forest', 'frost'], poinsettia: ['christmas'], bells: ['christmas', 'nordic'], star: ['christmas', 'frost', 'nordic'], reindeer: ['christmas', 'frost', 'nordic'],
};

/** Festive designs built from the seasonal motifs. Every proportion is jittered by the seed. */
function christmas(variant: XmasVariant, rnd: () => number, count?: number): Layer[] {
  const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)];
  const j = (v: number, amt = 0.1) => v * (1 - amt + rnd() * amt * 2);
  const L = Math.max(3, count ?? 4 + Math.floor(rnd() * 2));
  const out: Layer[] = [];
  // a colour given here is kept; '#cccccc' layers take the palette
  const add = (els: Element[], color = '#cccccc') => out.push(layer(`Layer ${out.length + 1}`, color, els));
  const GREENS = ['#16321f', '#24553a', '#2f6b45', '#3f8a57', '#56a06a', '#74b584'];

  if (variant === 'snowflake') {
    const fat = j(0.62), hub = j(0.3);
    for (let k = 0; k < L - 1; k++) {
      const s = 1 - 0.72 * (k / Math.max(1, L - 2));
      const len = R * 0.96 * s;
      const rot = k % 2 ? 30 : 0;
      const els: Element[] = [ring({ motif: 'snowarm', count: 6, radius: len / 2 + R * 0.03, length: len, width: len * fat, rotate: rot }), disc({ outer: len * hub, edge: 'pointed', lobes: 6, depth: len * 0.07, rotate: rot })];
      if (k === 0) els.push(ring({ motif: 'diamond', count: 6, radius: R * 0.46, length: R * 0.2, width: R * 0.11, rotate: 30 }));
      if (k > 0 && len * hub > 14) els.push(ring({ op: 'cut', motif: 'diamond', count: 6, radius: len * hub * 0.6, length: len * hub * 0.34, width: len * hub * 0.2, rotate: rot + 30 }));
      add(els);
    }
    add([ring({ motif: 'sparkle', count: 1, radius: 0, length: R * 0.26, width: R * 0.26 }), ring({ op: 'cut', motif: 'circle', count: 1, radius: 0, length: R * 0.06, width: R * 0.06 })]);
  } else if (variant === 'wreath') {
    const n = pick([14, 16, 18]), mid = R * j(0.74, 0.03);
    const pitch = (2 * Math.PI * mid) / n;
    add([disc({ outer: R * 0.97, inner: R * 0.5, edge: 'scallop', lobes: n, depth: R * 0.04 })], GREENS[0]);
    for (let k = 0; k < L - 2; k++) {
      // a garland: leaves lie along the ring, each layer half a leaf round and leaning the other way
      const half = k % 2 === 1, sc = 1 - 0.08 * k, lean = half ? 62 : 118;
      add([disc({ outer: mid + R * 0.05, inner: mid - R * 0.05 }), ring({ motif: 'holly', count: n, radius: mid + (half ? -1 : 1) * R * 0.03, length: pitch * 1.7 * sc, width: R * 0.17 * sc, rotate: half ? 180 / n : 0, spin: lean })], GREENS[Math.min(5, 2 + k)]);
    }
    add([ring({ motif: 'circle', count: n / 2, radius: mid + R * 0.03, length: R * 0.085, width: R * 0.085 }), ring({ motif: 'circle', count: n / 2, radius: mid - R * 0.05, length: R * 0.07, width: R * 0.07, rotate: 360 / n }), ring({ motif: 'bell', count: 1, radius: mid * 0.98, length: R * 0.3, width: R * 0.24, rotate: 180, spin: 180 })], '#c8323a');
  } else if (variant === 'trees') {
    const n = pick([6, 8, 10]), shrink = j(0.74, 0.05);
    for (let k = 0; k < L - 1; k++) {
      const s = Math.pow(shrink, k), core = R * 0.5 * s, len = R * 0.52 * s;
      const pitch = (2 * Math.PI * (core + len * 0.4)) / n;
      const rot = k % 2 ? 180 / n : 0;
      const els: Element[] = [disc({ outer: core, edge: 'plain' }), ring({ motif: 'tree', count: n, radius: core + len * 0.42, length: len, width: Math.min(pitch * 0.95, len * 0.9), rotate: rot })];
      if (k < L - 2 && core > 22) els.push(ring({ op: 'cut', motif: 'star', count: n, radius: core * 0.86, length: core * 0.16, width: core * 0.16, rotate: rot + 180 / n }));
      add(els, GREENS[Math.min(5, k + (k > 0 ? 1 : 0))]);
    }
    add([ring({ motif: 'star', count: 1, radius: 0, length: R * 0.3, width: R * 0.3 }), ring({ op: 'cut', motif: 'circle', count: 1, radius: 0, length: R * 0.06, width: R * 0.06 })], '#d9a441');
  } else if (variant === 'poinsettia') {
    const n = pick([6, 7, 8]), slim = j(0.42);
    add([ring({ motif: 'holly', count: n, radius: R * 0.56, length: R * 0.86, width: R * 0.36, rotate: 180 / n }), disc({ outer: R * 0.32 })]);
    for (let k = 0; k < L - 2; k++) {
      const len = R * (0.92 - (0.5 * k) / Math.max(1, L - 3));
      add([ring({ motif: 'leaf', count: n, radius: len * 0.5, length: len, width: len * slim, rotate: k % 2 ? 180 / n : 0 }), disc({ outer: len * 0.2 })]);
    }
    add([disc({ outer: R * 0.11 }), ring({ op: 'cut', motif: 'circle', count: 6, radius: R * 0.065, length: R * 0.034, width: R * 0.034 }), ring({ motif: 'circle', count: n, radius: R * 0.15, length: R * 0.055, width: R * 0.055 })]);
  } else if (variant === 'bells') {
    const n = pick([5, 6, 8]);
    add([disc({ outer: R * 0.96, edge: 'scallop', lobes: n * 2, depth: R * 0.05 })]);
    for (let k = 0; k < L - 2; k++) {
      const s = 1 - 0.14 * k;
      const els: Element[] = [ring({ motif: 'bell', count: n, radius: R * 0.57, length: R * 0.5 * s, width: R * 0.4 * s, spin: 180 }), disc({ outer: R * 0.3 * s })];
      if (k === 0) els.push(ring({ motif: 'holly', count: n, radius: R * 0.66, length: R * 0.34, width: R * 0.17, rotate: 180 / n }));
      else els.push(ring({ op: 'cut', motif: 'circle', count: n, radius: R * 0.69, length: R * 0.07 * s, width: R * 0.07 * s }));
      add(els);
    }
    add([ring({ motif: 'sparkle', count: 1, radius: 0, length: R * 0.34, width: R * 0.34 }), ring({ motif: 'circle', count: n, radius: R * 0.66, length: R * 0.07, width: R * 0.07, rotate: 180 / n })]);
  } else if ((XMAS_FIGURES as readonly string[]).includes(variant)) {
    // a figure on a starry medallion: border layers, then the silhouette, then its pen lines
    const aspect = builtinMotif(variant)?.aspect ?? 1;
    // sized so the picture's box sits inside the border (the reindeer's corners are empty, so it can go larger)
    const n = pick([10, 12, 16]), star = pick(['sparkle', 'star', 'snowarm']), W = variant === 'reindeer' ? R * j(1.5, 0.05) : (R * j(1.62, 0.03) * aspect) / Math.hypot(aspect, 1), H = W / aspect;
    add([disc({ outer: R * 0.97, edge: 'scallop', lobes: n * 2, depth: R * 0.03 })]);
    for (let k = 0; k < L - 3; k++) {
      const inner = R * (0.8 - 0.05 * k);
      add([disc({ outer: R * (0.93 - 0.03 * k), inner }), ring({ op: 'cut', motif: k % 2 ? 'circle' : star, count: n * (k % 2 ? 2 : 1), radius: (R * (0.93 - 0.03 * k) + inner) / 2, length: R * (k % 2 ? 0.04 : 0.085), width: R * (k % 2 ? 0.04 : 0.085), rotate: k % 2 ? 0 : 180 / n })]);
    }
    add([ring({ motif: variant + '-solid', count: 1, radius: 0, length: H, width: W })]);
    add([ring({ motif: variant, count: 1, radius: 0, length: H, width: W })]);
  } else {
    // star of Bethlehem: nested, counter-turned sparkle stars over a halo
    const turn = j(22.5, 0.2);
    add([disc({ outer: R * 0.7, edge: 'pointed', lobes: 16, depth: R * 0.08 }), ring({ motif: 'sparkle', count: 1, radius: 0, length: R * 2, width: R * 2 })]);
    for (let k = 1; k < L; k++) {
      const s = 1 - 0.78 * (k / (L - 1)) * 0.9;
      const els: Element[] = [ring({ motif: 'sparkle', count: 1, radius: 0, length: R * 1.9 * s, width: R * 1.9 * s, rotate: k % 2 ? turn : 0 })];
      if (k === 1) els.push(ring({ op: 'cut', motif: 'star', count: 8, radius: R * 0.3, length: R * 0.07, width: R * 0.07, rotate: 22.5 }));
      add(els);
    }
  }
  return out;
}

// ── pattern algorithms ──────────────────────────────────────────────────────

const CURVE_STYLES: Style[] = ['spirograph', 'rosette', 'girih', 'guilloche', 'flowerlife', 'sunflower', 'cobweb'];
const coprime = (n: number): number[] => { const g = (x: number, y: number): number => (y ? g(y, x % y) : x); const o: number[] = []; for (let b = 1; b <= n / 2; b++) if (g(n, b) === 1) o.push(b); return o.length ? o : [1]; };

/**
 * Designs drawn by a mathematical curve instead of placed petals. Each layer runs the same
 * algorithm with its parameters stepped by depth, so the layers are related but never identical;
 * a rim (and hub) ring ties each layer's line-work into one piece.
 */
function curveStyle(style: Style, rnd: () => number, count?: number): Layer[] {
  const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)];
  const L = Math.max(3, count ?? 5 + Math.floor(rnd() * 2));
  const out: Layer[] = [];
  const add = (els: Element[]) => out.push(layer(`Layer ${out.length + 1}`, '#cccccc', els));

  if (style === 'sunflower') {
    const petals = pick([16, 20, 24]), seeds = 150 + Math.floor(rnd() * 140), motif = pick(['petal', 'leaf', 'lotus']);
    for (let k = 0; k < L; k++) {
      const core = R * (0.62 - (0.4 * k) / (L - 1)), len = R * 0.4 * (1 - (0.45 * k) / (L - 1));
      const els: Element[] = [disc({ outer: core }), ring({ motif, count: petals, radius: core + len * 0.42, length: len, width: Math.min(len * 0.6, ((2 * Math.PI * (core + len * 0.4)) / petals) * 1.25), rotate: k % 2 ? 180 / petals : 0 })];
      const next = k < L - 1 ? R * (0.62 - (0.4 * (k + 1)) / (L - 1)) : 0;
      // the seed head: golden-angle dots cut through the visible band of each disc
      if (k > 0 && core - next > 7) els.push(curve({ op: 'cut', pattern: 'phyllo', size: core - 2.5, a: Math.round(seeds * (core / (R * 0.62)) ** 2 * (1 - (next / core) ** 2)) + 12, b: 5, c: Math.min(0.92, (next + 2.5) / (core - 2.5)), line: 4.2 }));
      add(els);
    }
    return out;
  }

  const n = style === 'flowerlife' ? 6 : pick(style === 'girih' ? [8, 10, 12, 16] : style === 'cobweb' ? [8, 10, 12, 16] : [5, 6, 7, 8, 9, 10, 12]);
  const bs = coprime(n), b0 = Math.floor(rnd() * bs.length), c0 = 0.25 + rnd() * 0.45, flip = rnd() < 0.5;
  const inner = 0.5 + rnd() * 0.22, weight = 0.85 + rnd() * 0.4, webRings = 2 + Math.floor(rnd() * 4);
  add([disc({ outer: R * 0.97, edge: pick<EdgeStyle>(['scallop', 'plain', 'pointed']), lobes: n * 2, depth: R * 0.03 })]);
  for (let k = 1; k < L; k++) {
    const depth = L - 1 - k, s = L > 2 ? (k - 1) / (L - 2) : 1;
    const wall = (1.8 + 1.4 * s) * weight, size = R * 0.92;
    const rot = (depth % 2 ? 180 / n : 0) * (flip ? 1 : -1);
    const els: Element[] = [disc({ outer: size + wall * 0.6, inner: size - wall * 0.9 })];
    const cz = (v: number) => Math.min(0.95, Math.max(0.05, v));
    if (style === 'spirograph') {
      els.push(curve({ pattern: 'spiro', size: size * (1 - 0.05 * depth), a: n, b: bs[(b0 + depth) % bs.length], c: cz(c0 + (depth % 2 ? -0.16 : 0.12) * depth), line: wall, rotate: rot }));
    } else if (style === 'rosette') {
      els.push(curve({ pattern: 'rose', size, a: n * (depth % 2 ? 2 : 1), b: 1 + ((b0 + depth) % 3), c: cz(0.12 + 0.13 * depth + c0 * 0.2), line: wall, rotate: rot }));
      if (depth >= 2) els.push(disc({ outer: size * 0.52 + wall * 0.6, inner: size * 0.52 - wall * 0.6 }));
    } else if (style === 'girih') {
      const maxSkip = Math.floor((n - 1) / 2);
      els.push(curve({ pattern: 'starpoly', size, a: n, b: Math.max(2, maxSkip - ((b0 + depth) % Math.max(1, maxSkip - 1))), c: cz(0.34 * Math.min(3, depth + 1) - 0.1), line: wall, rotate: rot }));
      if (depth >= 1) els.push(disc({ outer: size * inner + wall * 0.6, inner: size * inner - wall * 0.6 }));
      if (depth === 0) els.push(ring({ motif: 'star', count: 1, radius: 0, length: size * inner * 0.5, width: size * inner * 0.5, outline: wall }));
    } else if (style === 'guilloche') {
      const bands = 2 + (depth > 1 ? 1 : 0);
      for (let q = 0; q < bands; q++) {
        const r = size * (1 - q * 0.3);
        els.push(curve({ pattern: 'guilloche', size: r, a: n * (1 + ((depth + q) % 2)), b: 2 + ((b0 + depth + q) % 3), c: cz(0.2 + 0.05 * depth + c0 * 0.15), line: wall, rotate: rot }));
        if (q) els.push(disc({ outer: r * 0.985 + wall * 0.6, inner: r * 0.985 - wall * 0.6 }));
      }
      els.push(ring({ motif: 'flower', count: 1, radius: 0, length: size * 0.34, width: size * 0.34, outline: wall, rotate: rot }));
    } else if (style === 'flowerlife') {
      els.push(curve({ pattern: 'flowerlife', size, a: Math.min(4, 1 + depth), b: 6, c: cz(0.5 + (c0 - 0.45) * 0.4), line: wall, rotate: depth % 2 ? 30 : 0 }));
    } else {
      els.push(curve({ pattern: 'web', size, a: n * (depth > 1 ? 2 : 1), b: webRings + depth, c: cz(c0 * 0.5 + 0.12 * depth), line: wall, rotate: rot }));
      els.push(disc({ outer: size * inner * 0.22 }));
    }
    add(els);
  }
  return out;
}

const FILIGREE: Style[] = ['filigree', 'swirl', 'gothic', 'starlace'];

/** `layers` fixes the number of sheets (2–10); leave it out to let the style decide. */
export function generate(seed: number, style?: Style, paletteId?: string, layers?: number, variant?: string): Design {
  const count = layers ? Math.min(10, Math.max(2, Math.round(layers))) : undefined;
  const rnd = mulberry32(seed * 7919 + 13);
  const st = style ?? STYLES[Math.floor(rnd() * STYLES.length)];
  const cfg = TIERS[st];
  const xv = st === 'christmas' ? ((XMAS_VARIANTS as readonly string[]).includes(variant ?? '') ? (variant as XmasVariant) : XMAS_VARIANTS[Math.floor(rnd() * XMAS_VARIANTS.length)]) : null;
  if (xv && !paletteId) paletteId = XMAS_PALETTE[xv][Math.floor(rnd() * XMAS_PALETTE[xv].length)];
  const built = CURVE_STYLES.includes(st) ? curveStyle(st, rnd, count) : xv ? christmas(xv, rnd, count) : FILIGREE.includes(st) ? filigree(st, rnd, count) : cfg ? tiers(st, cfg, rnd, count) : windows(st, rnd, count);
  const pal = PALETTES.find((p) => p.id === paletteId) ?? PALETTES[Math.floor(rnd() * PALETTES.length)];
  const d: Design = { ...emptyDesign(), layers: built, name: STYLE_LABELS[st] + ' mandala', gen: { style: st }, ...(st === 'christmas' ? { theme: 'christmas' } : {}) };
  return colourGenerated(d, pal);
}

export interface Template { id: string; label: string; style: Style; seed: number; palette: string; shape?: string; layers?: number; variant?: string; group?: string; hang?: number }

// 26 starting points: the open line-work styles in every format first, then the solid-tier classics.
export const TEMPLATES: Template[] = [
  // Christmas
  { id: 'x-snow', label: 'Snow crystal', style: 'christmas', variant: 'snowflake', seed: 31, palette: 'frost', layers: 5, group: 'Christmas' },
  { id: 'x-wreath', label: 'Holly wreath', style: 'christmas', variant: 'wreath', seed: 32, palette: 'christmas', layers: 5, group: 'Christmas' },
  { id: 'x-trees', label: 'Fir tree ring', style: 'christmas', variant: 'trees', seed: 33, palette: 'christmas', layers: 5, group: 'Christmas' },
  { id: 'x-poin', label: 'Poinsettia', style: 'christmas', variant: 'poinsettia', seed: 34, palette: 'christmas', layers: 5, group: 'Christmas' },
  { id: 'x-bells', label: 'Jingle bells', style: 'christmas', variant: 'bells', seed: 35, palette: 'christmas', layers: 4, group: 'Christmas' },
  { id: 'x-star', label: 'Christmas star', style: 'christmas', variant: 'star', seed: 36, palette: 'christmas', layers: 5, group: 'Christmas' },
  { id: 'x-deer', label: 'Leaping reindeer', style: 'christmas', variant: 'reindeer', seed: 37, palette: 'christmas', layers: 5, group: 'Christmas' },
  { id: 'x-santa', label: 'Santa', style: 'christmas', variant: 'santa', seed: 51, palette: 'christmas', layers: 5, group: 'Christmas' },
  { id: 'x-snowman', label: 'Snowman', style: 'christmas', variant: 'snowman', seed: 52, palette: 'frost', layers: 5, group: 'Christmas' },
  { id: 'x-ginger', label: 'Gingerbread', style: 'christmas', variant: 'gingerbread', seed: 53, palette: 'terracotta', layers: 5, group: 'Christmas' },
  { id: 'x-stocking', label: 'Stocking', style: 'christmas', variant: 'stocking', seed: 54, palette: 'christmas', layers: 5, group: 'Christmas' },
  { id: 'x-hollybell', label: 'Holly bell', style: 'christmas', variant: 'bell-art', seed: 55, palette: 'nordic', layers: 5, group: 'Christmas' },
  { id: 'x-tree', label: 'Tree ornament', style: 'filigree', seed: 207, palette: 'christmas', shape: 'tree', layers: 4, group: 'Christmas', hang: 3 },
  { id: 'x-bauble', label: 'Bauble', style: 'starlace', seed: 312, palette: 'christmas', shape: 'bauble', layers: 4, group: 'Christmas', hang: 3 },
  { id: 'x-frost', label: 'Frost window', style: 'starlace', seed: 319, palette: 'frost', shape: 'circle', layers: 5, group: 'Christmas' },
  { id: 'x-nordic', label: 'Nordic tile', style: 'starlace', seed: 326, palette: 'nordic', shape: 'square', layers: 5, group: 'Christmas' },
  { id: 'x-mint', label: 'Peppermint', style: 'swirl', seed: 249, palette: 'nordic', shape: 'circle', layers: 4, group: 'Christmas' },
  { id: 'x-bellp', label: 'Bell ornament', style: 'gothic', seed: 284, palette: 'christmas', shape: 'bell', layers: 4, group: 'Christmas', hang: 3 },
  // pattern algorithms
  { id: 'p-spiro', label: 'Spirograph', style: 'spirograph', seed: 41, palette: 'peacock', layers: 5, group: 'Pattern algorithms' },
  { id: 'p-spiro2', label: 'Orbit panel', style: 'spirograph', seed: 47, palette: 'ocean', shape: 'circle', layers: 5, group: 'Pattern algorithms' },
  { id: 'p-rose', label: 'Rose curves', style: 'rosette', seed: 42, palette: 'berry', layers: 5, group: 'Pattern algorithms' },
  { id: 'p-girih', label: 'Star polygons', style: 'girih', seed: 43, palette: 'walnut', layers: 5, group: 'Pattern algorithms' },
  { id: 'p-girih2', label: 'Girih tile', style: 'girih', seed: 49, palette: 'ocean', shape: 'square', layers: 5, group: 'Pattern algorithms' },
  { id: 'p-guil', label: 'Guilloché', style: 'guilloche', seed: 44, palette: 'sunset', layers: 5, group: 'Pattern algorithms' },
  { id: 'p-life', label: 'Flower of life', style: 'flowerlife', seed: 45, palette: 'forest', layers: 5, group: 'Pattern algorithms' },
  { id: 'p-sun', label: 'Sunflower', style: 'sunflower', seed: 46, palette: 'terracotta', layers: 5, group: 'Pattern algorithms' },
  { id: 'p-web', label: 'Cobweb', style: 'cobweb', seed: 48, palette: 'mono', layers: 4, group: 'Pattern algorithms' },
  // line-work and classics
  { id: 'f-lotus', label: 'Filigree lotus', style: 'filigree', seed: 207, palette: 'forest', layers: 6 },
  { id: 'f-rose', label: 'Rose lattice', style: 'filigree', seed: 200, palette: 'berry', layers: 6 },
  { id: 'f-round', label: 'Round panel', style: 'filigree', seed: 214, palette: 'ocean', shape: 'circle', layers: 6 },
  { id: 'f-square', label: 'Square panel', style: 'filigree', seed: 221, palette: 'wood', shape: 'square', layers: 5 },
  { id: 'f-wide', label: 'Wide panel', style: 'filigree', seed: 228, palette: 'ocean', shape: 'rect', layers: 6 },
  { id: 'g-rose', label: 'Cathedral', style: 'gothic', seed: 270, palette: 'berry', layers: 6 },
  { id: 'g-crown', label: 'Crown', style: 'gothic', seed: 277, palette: 'terracotta', layers: 5 },
  { id: 'g-round', label: 'Tracery round', style: 'gothic', seed: 284, palette: 'sunset', shape: 'circle', layers: 6 },
  { id: 'g-square', label: 'Tracery square', style: 'gothic', seed: 291, palette: 'ocean', shape: 'square', layers: 6 },
  { id: 'g-wide', label: 'Sunrise panel', style: 'gothic', seed: 298, palette: 'sunset', shape: 'rect', layers: 5 },
  { id: 's-star', label: 'Star lace', style: 'starlace', seed: 312, palette: 'forest', layers: 5 },
  { id: 's-weave', label: 'Woven star', style: 'starlace', seed: 305, palette: 'wood', layers: 5 },
  { id: 's-round', label: 'Compass rose', style: 'starlace', seed: 319, palette: 'mono', shape: 'circle', layers: 5 },
  { id: 's-square', label: 'Star tile', style: 'starlace', seed: 326, palette: 'walnut', shape: 'square', layers: 5 },
  { id: 'w-swirl', label: 'Swirl', style: 'swirl', seed: 235, palette: 'peacock', layers: 5 },
  { id: 'w-round', label: 'Whirl panel', style: 'swirl', seed: 249, palette: 'terracotta', shape: 'circle', layers: 5 },
  { id: 'lotus', label: 'Lotus tiers', style: 'lotus', seed: 3, palette: 'wood' },
  { id: 'sunburst', label: 'Sunburst', style: 'sunburst', seed: 5, palette: 'sunset' },
  { id: 'lace', label: 'Lace', style: 'lace', seed: 2, palette: 'ocean' },
  { id: 'dahlia', label: 'Dahlia', style: 'dahlia', seed: 4, palette: 'berry' },
  { id: 'rosewindow', label: 'Rose window', style: 'rosewindow', seed: 7, palette: 'walnut' },
  { id: 'snowflake', label: 'Snowflake', style: 'snowflake', seed: 1, palette: 'mono' },
  { id: 'compass', label: 'Compass', style: 'compass', seed: 6, palette: 'peacock' },
  { id: 'hearts', label: 'Hearts', style: 'hearts', seed: 8, palette: 'terracotta' },
  { id: 'aztec', label: 'Aztec', style: 'aztec', seed: 9, palette: 'forest' },
  { id: 'bloom', label: 'Bloom', style: 'bloom', seed: 11, palette: 'sunset' },
];

/** The free-form part of a template; lib/frame.templateDesign adds its shape, if it has one. */
export const fromTemplate = (t: Template, layers?: number): Design => ({ ...generate(t.seed, t.style, t.palette, layers ?? t.layers, t.variant), name: t.label, ...(t.group === 'Christmas' ? { theme: 'christmas' } : {}), ...(t.hang ? { holes: { centre: 0, hang: t.hang, pins: false } } : {}) });
