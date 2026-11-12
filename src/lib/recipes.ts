// Starting points: palettes, a seeded mandala generator ("Surprise me") and the template list.
// Templates are just fixed (style, seed, palette) triples, so every thumbnail is the real thing.
import type { Design, DiscEl, EdgeStyle, Element, Layer, RingEl } from './types';

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
  if (p.id === 'walnut') return Array.from({ length: n }, (_, i) => p.colors[i % p.colors.length]);
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

export const ring = (o: Partial<RingEl> & Pick<RingEl, 'motif' | 'count' | 'radius' | 'length' | 'width'>): RingEl => ({
  id: uid(), kind: 'ring', op: 'add', rotate: 0, spin: 0, outline: 0, ...o,
});
export const disc = (o: Partial<DiscEl> & Pick<DiscEl, 'outer'>): DiscEl => ({
  id: uid(), kind: 'disc', op: 'add', inner: 0, edge: 'plain', lobes: 12, depth: 3, rotate: 0, ...o,
});
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

export type Style = 'lotus' | 'sunburst' | 'dahlia' | 'lace' | 'rosewindow' | 'snowflake' | 'compass' | 'hearts' | 'aztec' | 'bloom';
export const STYLES: Style[] = ['lotus', 'sunburst', 'dahlia', 'lace', 'rosewindow', 'snowflake', 'compass', 'hearts', 'aztec', 'bloom'];

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
  const T = (k: number) => R * (1 - 0.8 * (k / L));
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
      if (wlen >= 4) els.push(ring({ op: 'cut', motif: pick(cfg.cut), count: cnt, radius: rad, length: wlen, width: Math.max(2.5, pitch * cfg.fill), rotate: k % 2 ? 180 / n : 0 }));
      if (wlen >= 14 && pitch > 14) els.push(ring({ op: 'cut', motif: 'circle', count: cnt, radius: rad + wlen * 0.2, length: 3, width: 3, rotate: (k % 2 ? 180 / n : 0) + 180 / cnt }));
    }
    if (k === L - 1) els.push(ring({ op: 'cut', motif: style === 'aztec' ? 'star' : 'flower', count: 1, radius: 0, length: r * 0.42, width: r * 0.42 }));
    out.push(layer(`Layer ${k + 1}`, '#cccccc', els));
  }
  return out;
}

/** `layers` fixes the number of sheets (2–10); leave it out to let the style decide. */
export function generate(seed: number, style?: Style, paletteId?: string, layers?: number): Design {
  const count = layers ? Math.min(10, Math.max(2, Math.round(layers))) : undefined;
  const rnd = mulberry32(seed * 7919 + 13);
  const st = style ?? STYLES[Math.floor(rnd() * STYLES.length)];
  const cfg = TIERS[st];
  const built = cfg ? tiers(st, cfg, rnd, count) : windows(st, rnd, count);
  const pal = PALETTES.find((p) => p.id === paletteId) ?? PALETTES[Math.floor(rnd() * PALETTES.length)];
  const d = { ...emptyDesign(), layers: built, name: st[0].toUpperCase() + st.slice(1) + ' mandala' };
  return applyPalette(d, pal);
}

export interface Template { id: string; label: string; style: Style; seed: number; palette: string }

export const TEMPLATES: Template[] = [
  { id: 'lotus', label: 'Lotus', style: 'lotus', seed: 3, palette: 'wood' },
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

export const fromTemplate = (t: Template): Design => ({ ...generate(t.seed, t.style, t.palette), name: t.label + ' mandala' });
