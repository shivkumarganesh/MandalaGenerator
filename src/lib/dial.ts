// Clock dials. A dial is an ordinary layer (tagged 'dial') added on top of the design, so it is
// previewed, checked, exported and edited like everything else. Numerals are drawn with a small
// built-in single-stroke alphabet and stored as artwork in the design.
import type { CustomMotif, Design, Element, Pt, Ring, Shape } from './types';
import { bbox, strokeToShapes } from './geom';
import { buildStack, designDiameter } from './build';
import { disc, layer, ring } from './recipes';

export const DIALS: { id: string; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'ticks', label: 'Hour marks' },
  { id: 'minutes', label: 'Hour + minute marks' },
  { id: 'dots', label: 'Dots' },
  { id: 'roman', label: 'Roman numerals' },
  { id: 'numbers', label: 'Numbers' },
  { id: 'quarters', label: '12 · 3 · 6 · 9' },
];

type Line = { pts: Ring; closed: boolean };
const L = (pts: number[][], closed = false): Line => ({ pts: pts.map(([x, y]) => ({ x, y })), closed });
const oval = (cx: number, cy: number, rx: number, ry: number): Line => ({ closed: true, pts: Array.from({ length: 28 }, (_, i) => ({ x: cx + rx * Math.cos((i / 28) * Math.PI * 2), y: cy + ry * Math.sin((i / 28) * Math.PI * 2) })) });
/** Corner-cutting pass that rounds a hand-plotted polyline without moving its ends. */
const soften = (l: Line): Line => {
  if (l.closed || l.pts.length < 3) return l;
  let p = l.pts;
  for (let k = 0; k < 2; k++) {
    const o: Ring = [p[0]];
    for (let i = 0; i < p.length - 1; i++) { const a = p[i], b = p[i + 1]; o.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 }, { x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 }); }
    o.push(p[p.length - 1]); p = o;
  }
  return { pts: p, closed: false };
};

// Digits on a 1 × 1.5 grid (y down).
const SIX = [[0.82, 0.08], [0.5, 0], [0.2, 0.2], [0.07, 0.7], [0.07, 1.1], [0.2, 1.4], [0.5, 1.5], [0.82, 1.38], [0.93, 1.05], [0.82, 0.75], [0.5, 0.64], [0.2, 0.76], [0.07, 1.05]];
const DIGITS: Record<string, Line[]> = {
  '0': [oval(0.5, 0.75, 0.42, 0.75)],
  '1': [L([[0.22, 0.32], [0.56, 0], [0.56, 1.5]])],
  '2': [soften(L([[0.05, 0.4], [0.15, 0.12], [0.5, 0], [0.85, 0.12], [0.95, 0.42], [0.8, 0.75], [0.05, 1.5]])), L([[0.05, 1.5], [0.95, 1.5]])],
  '3': [soften(L([[0.08, 0.2], [0.45, 0], [0.85, 0.12], [0.92, 0.4], [0.75, 0.65], [0.45, 0.72]])), soften(L([[0.45, 0.72], [0.8, 0.82], [0.95, 1.1], [0.82, 1.38], [0.45, 1.5], [0.05, 1.3]]))],
  '4': [L([[0.7, 1.5], [0.7, 0], [0.05, 1.05], [0.95, 1.05]])],
  '5': [L([[0.88, 0], [0.2, 0], [0.12, 0.68]]), soften(L([[0.12, 0.68], [0.5, 0.56], [0.85, 0.7], [0.95, 1.02], [0.82, 1.36], [0.45, 1.5], [0.08, 1.32]]))],
  '6': [soften(L(SIX))],
  '7': [L([[0.05, 0], [0.95, 0], [0.4, 1.5]])],
  '8': [oval(0.5, 0.38, 0.34, 0.38), oval(0.5, 1.1, 0.42, 0.4)],
  '9': [soften(L(SIX.map(([x, y]) => [1 - x, 1.5 - y])))],
};
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];
const ROMAN_GLYPH: Record<string, { w: number; lines: Line[] }> = {
  I: { w: 0.16, lines: [L([[0.08, 0], [0.08, 1.5]])] },
  V: { w: 0.9, lines: [L([[0, 0], [0.45, 1.5], [0.9, 0]])] },
  X: { w: 0.9, lines: [L([[0, 0], [0.9, 1.5]]), L([[0.9, 0], [0, 1.5]])] },
};

function glyph(text: string, roman: boolean): { shapes: Shape[]; aspect: number } {
  const lines: Line[] = [];
  let x = 0;
  const gap = roman ? 0.3 : 0.28;
  for (const ch of text) {
    const g = roman ? ROMAN_GLYPH[ch] : { w: 1, lines: DIGITS[ch] };
    for (const l of g.lines) lines.push({ closed: l.closed, pts: l.pts.map((p) => ({ x: p.x + x, y: p.y })) });
    x += g.w + gap;
  }
  const width = x - gap;
  // Roman numerals get the classic bars top and bottom, which also tie the strokes into one piece
  if (roman) lines.push(L([[-0.14, 0], [width + 0.14, 0]]), L([[-0.14, 1.5], [width + 0.14, 1.5]]));
  const raw = strokeToShapes(lines, 0.2);
  const bb = bbox(raw)!;
  const w = bb.maxX - bb.minX, h = bb.maxY - bb.minY, cx = (bb.minX + bb.maxX) / 2, cy = (bb.minY + bb.maxY) / 2;
  const f = (p: Pt) => ({ x: (p.x - cx) / w, y: (p.y - cy) / h });
  return { aspect: w / h, shapes: raw.map((s) => ({ outer: s.outer.map(f), holes: s.holes.map((r) => r.map(f)) })) };
}

const BUSY = ['filigree', 'swirl', 'gothic', 'starlace', 'spirograph', 'rosette', 'girih', 'guilloche', 'flowerlife', 'cobweb'];
/** Line-work designs need a plain ring behind the dial or the marks disappear into the pattern. */
export const wantsDialRing = (d: Design): boolean => d.dialRing ?? BUSY.includes(d.gen?.style ?? '');

/**
 * Add, replace or remove the clock dial. `style` is one of DIALS; 'none' removes it.
 * With a backing ring, hour marks and dots are cut through the ring as windows (one piece, nothing
 * loose to place); numerals sit on top of it. Without a ring, everything is raised.
 */
export function applyDial(d: Design, style: string): Design {
  // remove any dial already there: its own layers, and marks engraved on the back sheet
  const kept = d.layers.filter((l) => l.tag !== 'dial').map((l) => (l.elements.some((e) => e.tag === 'dial') ? { ...l, elements: l.elements.filter((e) => e.tag !== 'dial') } : l));
  const plain = { ...d, layers: kept, customMotifs: d.customMotifs.filter((m) => !m.id.startsWith('dial-')), dial: undefined };
  if (style === 'none' || !DIALS.some((x) => x.id === style) || !plain.layers.length) return plain;
  if (d.dialBack) return dialOn(plain, style, 'back');
  if (wantsDialRing(d)) return dialOn(plain, style, 'ring');
  // Raised marks need material under every one of them. Where the design has gaps at the rim
  // (petals, points), some would hang in mid-air, so the ring is switched on for you.
  const raised = dialOn(plain, style, 'raised');
  const loose = (x: Design) => buildStack(x)[0]?.shapes.length ?? 0;
  return loose(raised) > loose(plain) ? { ...dialOn(plain, style, 'ring'), dialRing: true } : raised;
}

/** Outlines of a pair of hands at ten past ten, for the previews only. IR space: y down, 12 o'clock is −y. */
export function clockHands(R: number): { hour: Shape; minute: Shape; cap: Shape } {
  const hand = (len: number, w: number, deg: number): Shape => {
    const a = (deg * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a);
    const pts = [[-w, len * 0.16], [w, len * 0.16], [w * 0.55, -len * 0.9], [0, -len], [-w * 0.55, -len * 0.9]];
    return { outer: pts.map(([x, y]) => ({ x: x * c - y * sn, y: x * sn + y * c })), holes: [] };
  };
  const cap: Ring = Array.from({ length: 28 }, (_, i) => ({ x: R * 0.045 * Math.cos((i / 28) * Math.PI * 2), y: R * 0.045 * Math.sin((i / 28) * Math.PI * 2) }));
  return { hour: hand(R * 0.46, R * 0.032, -55), minute: hand(R * 0.7, R * 0.022, 60), cap: { outer: cap, holes: [] } };
}

function dialOn(d: Design, style: string, mode: 'raised' | 'ring' | 'back'): Design {
  const withRing = mode === 'ring';
  const layers = d.layers, customMotifs = d.customMotifs;
  const R = (designDiameter({ ...d, layers }) || 200) / 2;
  const thin = (v: number) => Math.max(1.4, v); // marks stay cuttable on small clocks
  const marks: Element[] = []; // ticks and dots
  const numerals: Element[] = [];
  const motifs: CustomMotif[] = [];
  // on the back sheet everything is engraved; in a ring, marks are windows; otherwise raised
  const op = mode === 'back' ? 'score' : withRing ? 'cut' : 'add';
  if (style === 'ticks' || style === 'minutes') {
    marks.push(ring({ op, motif: 'square', count: 12, radius: R * 0.84, length: R * 0.12, width: thin(R * 0.03) }));
    marks.push(ring({ op, motif: 'square', count: 4, radius: R * 0.82, length: R * 0.16, width: thin(R * 0.055) }));
    if (style === 'minutes') marks.push(ring({ op, motif: 'square', count: 60, radius: R * 0.885, length: R * 0.045, width: thin(R * 0.012) }));
  } else if (style === 'dots') {
    marks.push(ring({ op, motif: 'circle', count: 12, radius: R * 0.84, length: R * 0.055, width: R * 0.055 }));
    marks.push(ring({ op, motif: 'circle', count: 4, radius: R * 0.84, length: R * 0.09, width: R * 0.09 }));
  } else {
    const roman = style === 'roman';
    const hours = style === 'quarters' ? [12, 3, 6, 9] : [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    const height = R * (style === 'quarters' ? 0.19 : 0.15);
    for (const hr of hours) {
      const g = glyph(roman ? ROMAN[hr] : String(hr), roman);
      const id = `dial-${style}-${hr}`;
      motifs.push({ id, name: roman ? ROMAN[hr] : String(hr), shapes: g.shapes, aspect: g.aspect });
      const angle = (hr % 12) * 30;
      // spin cancels the turn round the dial, so every numeral stands upright
      numerals.push(ring({ op: mode === 'back' ? 'score' : 'add', motif: 'custom:' + id, count: 1, radius: R * 0.82, length: height, width: height * g.aspect, rotate: angle, spin: -angle }));
    }
    if (style === 'quarters') marks.push(ring({ op, motif: 'circle', count: 4, radius: R * 0.82, length: R * 0.05, width: R * 0.05, rotate: 30 }), ring({ op, motif: 'circle', count: 4, radius: R * 0.82, length: R * 0.05, width: R * 0.05, rotate: 60 }));
  }
  const top = layers[layers.length - 1], bottom = layers[0];
  if (mode === 'back') {
    const els = [...marks, ...numerals].map((e) => ({ ...e, tag: 'dial' }));
    return { ...d, layers: [{ ...bottom, elements: [...bottom.elements, ...els] }, ...layers.slice(1)], customMotifs: [...customMotifs, ...motifs], dial: style };
  }
  const added = [];
  if (withRing) {
    added.push({ ...layer('Dial ring', bottom.color, [disc({ outer: R * 0.96, inner: R * 0.68 }), ...marks]), tag: 'dial' });
    if (numerals.length) added.push({ ...layer('Clock dial', top.color, numerals), tag: 'dial' });
  } else added.push({ ...layer('Clock dial', top.color, [...marks, ...numerals]), tag: 'dial' });
  return { ...d, layers: [...layers, ...added], customMotifs: [...customMotifs, ...motifs], dial: style };
}
