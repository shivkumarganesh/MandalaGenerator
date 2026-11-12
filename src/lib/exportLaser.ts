// Laser output. Files are machine-facing: 1:1, millimetres, viewBox in mm, hairline strokes.
// Cut = red #FE0002 (what Atomm / xTool Studio auto-classifies as "cut"), score = blue.
import JSZip from 'jszip';
import type { BuiltLayer, Design, Shape } from './types';
import { bbox, intersect, offset, pathD } from './geom';

export const CUT = '#FE0002';
export const SCORE = '#0000FF';
const PAD = 2;

export interface CutLayer { name: string; file: string; cut: Shape[]; score: Shape[]; w: number; h: number; minX: number; minY: number; color: string }

/** What actually gets cut: kerf-compensated outlines plus optional glue guides. */
export function cutLayers(d: Design, stack: BuiltLayer[]): CutLayer[] {
  return stack.map((l, i) => {
    const cut = d.kerf > 0 ? offset(l.shapes, d.kerf / 2) : l.shapes;
    let score: Shape[] = [];
    if (d.guides && i < stack.length - 1) score = offset(intersect(stack[i + 1].shapes, l.shapes), -0.5);
    if (l.score.length) score = [...score, ...l.score];
    const bb = bbox(cut) ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    const slug = l.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'layer';
    return {
      name: l.name, file: `${String(i + 1).padStart(2, '0')}-${slug}.svg`, cut, score, color: l.color,
      w: bb.maxX - bb.minX, h: bb.maxY - bb.minY, minX: bb.minX, minY: bb.minY,
    };
  });
}

const paths = (c: CutLayer) =>
  (c.score.length ? `<path d="${pathD(c.score, 3)}" fill="none" stroke="${SCORE}" stroke-width="0.1"/>` : '') +
  `<path d="${pathD(c.cut, 3)}" fill="none" stroke="${CUT}" stroke-width="0.1" fill-rule="evenodd"/>`;

const svgDoc = (w: number, h: number, body: string) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${w.toFixed(3)}mm" height="${h.toFixed(3)}mm" viewBox="0 0 ${w.toFixed(3)} ${h.toFixed(3)}">${body}</svg>\n`;

export function layerSvg(c: CutLayer): string {
  return svgDoc(c.w + PAD * 2, c.h + PAD * 2, `<g transform="translate(${(PAD - c.minX).toFixed(3)} ${(PAD - c.minY).toFixed(3)})">${paths(c)}</g>`);
}

export interface SheetCell { c: CutLayer; x: number; y: number }

/** Every sheet side by side, wrapped into rows — the same layout the "Cut sheets" view shows. */
export function sheetLayout(cuts: CutLayer[], gap = 6): { cells: SheetCell[]; w: number; h: number } {
  const maxRow = Math.max(...cuts.map((c) => c.w), 1) * Math.min(3, Math.ceil(Math.sqrt(cuts.length))) + gap * 4;
  const cells: SheetCell[] = [];
  let x = gap, y = gap, rowH = 0, w = 0;
  for (const c of cuts) {
    if (x > gap && x + c.w + gap > maxRow) { x = gap; y += rowH + gap; rowH = 0; }
    cells.push({ c, x, y });
    x += c.w + gap; rowH = Math.max(rowH, c.h); w = Math.max(w, x);
  }
  return { cells, w, h: y + rowH + gap };
}

export function sheetSvg(cuts: CutLayer[]): string {
  const { cells, w, h } = sheetLayout(cuts);
  return svgDoc(w, h, cells.map(({ c, x, y }) => `<g transform="translate(${(x - c.minX).toFixed(3)} ${(y - c.minY).toFixed(3)})">${paths(c)}</g>`).join(''));
}

/** Assembled, coloured picture of the stack (also the source of the PNG snapshot). */
export function previewSvg(stack: BuiltLayer[], px?: number, background?: string): string {
  const bb = bbox(stack.flatMap((l) => l.shapes)) ?? { minX: -50, minY: -50, maxX: 50, maxY: 50 };
  const m = Math.max(bb.maxX - bb.minX, bb.maxY - bb.minY) * 0.06 + 2;
  const w = bb.maxX - bb.minX + m * 2, h = bb.maxY - bb.minY + m * 2;
  const size = px ? `width="${px}" height="${Math.round((px * h) / w)}"` : `width="${w.toFixed(2)}mm" height="${h.toFixed(2)}mm"`;
  const blur = Math.max(w, h) * 0.006;
  return `<svg xmlns="http://www.w3.org/2000/svg" ${size} viewBox="${(bb.minX - m).toFixed(2)} ${(bb.minY - m).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}">` +
    `<defs><filter id="s" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="0" dy="${(blur * 0.8).toFixed(2)}" stdDeviation="${blur.toFixed(2)}" flood-color="#000" flood-opacity=".42"/></filter></defs>` +
    (background ? `<rect x="${bb.minX - m}" y="${bb.minY - m}" width="${w}" height="${h}" fill="${background}"/>` : '') +
    stack.map((l) => `<path d="${pathD(l.shapes)}" fill="${l.color}" fill-rule="evenodd" filter="url(#s)"/>`).join('') + '</svg>';
}

export async function svgToPng(svg: string): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('Could not render the picture')); img.src = url; });
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d')!.drawImage(img, 0, 0);
    return await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not encode PNG'))), 'image/png'));
  } finally { URL.revokeObjectURL(url); }
}

// ── material plan ───────────────────────────────────────────────────────────

export interface Nest { sheets: SheetCell[][]; tooBig: string[]; w: number; h: number }

/** Shelf-pack whole layers onto stock sheets (layers stay in one piece so assembly stays simple). */
export function nestSheets(cuts: CutLayer[], w: number, h: number, gap = 4): Nest {
  const sheets: SheetCell[][] = [];
  const tooBig: string[] = [];
  const order = cuts.slice().sort((a, b) => b.h - a.h);
  let cur: SheetCell[] = [], x = gap, y = gap, rowH = 0;
  for (const c of order) {
    if (c.w + gap * 2 > w || c.h + gap * 2 > h) { tooBig.push(c.name); continue; }
    if (x + c.w + gap > w) { x = gap; y += rowH + gap; rowH = 0; }
    if (y + c.h + gap > h) { if (cur.length) sheets.push(cur); cur = []; x = gap; y = gap; rowH = 0; }
    cur.push({ c, x, y });
    x += c.w + gap; rowH = Math.max(rowH, c.h);
  }
  if (cur.length) sheets.push(cur);
  return { sheets, tooBig, w, h };
}

export interface Plan { sheets: number; tooBig: string[]; minutes: number; cost: number }

export function materialPlan(d: Design, stack: BuiltLayer[]): Plan | null {
  const s = d.sheet;
  if (!s || s.w <= 0 || s.h <= 0) return null;
  const cuts = cutLayers(d, stack);
  const nest = nestSheets(cuts, s.w, s.h);
  const length = cuts.reduce((t, c) => t + c.cut.reduce((u, sh) => u + ringLen(sh.outer) + sh.holes.reduce((q, r) => q + ringLen(r), 0), 0), 0);
  return { sheets: nest.sheets.length, tooBig: nest.tooBig, minutes: length / Math.max(0.1, s.speed) / 60, cost: nest.sheets.length * s.price };
}

const ringLen = (r: { x: number; y: number }[]) => { let l = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; l += Math.hypot(q.x - p.x, q.y - p.y); } return l; };

const nestSvg = (cells: SheetCell[], w: number, h: number) =>
  svgDoc(w, h, `<rect width="${w}" height="${h}" fill="none" stroke="#999999" stroke-width="0.1" stroke-dasharray="2 2"/>` +
    cells.map(({ c, x, y }) => `<g transform="translate(${(x - c.minX).toFixed(3)} ${(y - c.minY).toFixed(3)})">${paths(c)}</g>`).join(''));

// ── other outputs ───────────────────────────────────────────────────────────

/** For Cricut / Silhouette and similar: every layer as a FILLED shape in its colour, side by side, 1:1 in mm. */
export function craftSvg(stack: BuiltLayer[]): string {
  const cuts = cutLayers({ kerf: 0, guides: false } as Design, stack);
  const { cells, w, h } = sheetLayout(cuts, 8);
  return svgDoc(w, h, cells.map(({ c, x, y }) => `<g id="${c.file.replace('.svg', '')}" transform="translate(${(x - c.minX).toFixed(3)} ${(y - c.minY).toFixed(3)})"><path d="${pathD(c.cut, 3)}" fill="${c.color}" fill-rule="evenodd"/></g>`).join(''));
}

/** Black line art of the assembled piece (hidden lines stay hidden) — a colouring page. */
export function coloringSvg(stack: BuiltLayer[], px?: number): string {
  const bb = bbox(stack.flatMap((l) => l.shapes)) ?? { minX: -50, minY: -50, maxX: 50, maxY: 50 };
  const m = Math.max(bb.maxX - bb.minX, bb.maxY - bb.minY) * 0.05 + 2;
  const w = bb.maxX - bb.minX + m * 2, h = bb.maxY - bb.minY + m * 2;
  const size = px ? `width="${px}" height="${Math.round((px * h) / w)}"` : `width="${w.toFixed(2)}mm" height="${h.toFixed(2)}mm"`;
  const sw = (Math.max(w, h) * 0.0035).toFixed(2);
  return `<svg xmlns="http://www.w3.org/2000/svg" ${size} viewBox="${(bb.minX - m).toFixed(2)} ${(bb.minY - m).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}"><rect x="${bb.minX - m}" y="${bb.minY - m}" width="${w}" height="${h}" fill="#ffffff"/>` +
    stack.map((l) => `<path d="${pathD(l.shapes)}" fill="#ffffff" stroke="#111111" stroke-width="${sw}" stroke-linejoin="round" fill-rule="evenodd"/>`).join('') + '</svg>';
}

const esc = (s: string) => s.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]!);

/** A printable page: one picture per step, each adding the next sheet. */
export function assemblyGuide(d: Design, stack: BuiltLayer[]): string {
  const steps = stack.map((l, i) => `<section><h2>Step ${i + 1} — ${i === 0 ? 'start with' : 'add'} ${esc(l.name)}</h2><p>File ${String(i + 1).padStart(2, '0')} · ${l.shapes.length} piece${l.shapes.length > 1 ? 's' : ''}${i ? ' · glue onto the previous sheet' : ''}</p>${previewSvg(stack.slice(0, i + 1), 420)}</section>`).join('');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><title>${esc(d.name)} — assembly guide</title><style>body{font:14px/1.5 system-ui,sans-serif;max-width:900px;margin:24px auto;padding:0 16px;color:#171719}h1{font-size:22px}h2{font-size:15px;margin:0}p{margin:2px 0 8px;color:#3d3e42}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:24px}section{break-inside:avoid}svg{width:100%;height:auto;background:#f6f6f7;border-radius:8px}@media print{svg{background:none}}</style><h1>${esc(d.name)} — assembly guide</h1><p>${stack.length} sheets of ${d.thickness} mm. Dry-fit first, then glue from the bottom up.${d.holes?.pins ? ' Push two 3 mm pins or toothpicks through the alignment holes to keep the sheets registered.' : ''}</p><main>${steps}</main></html>`;
}

const mm = (n: number) => n.toFixed(1);

export function readme(d: Design, stack: BuiltLayer[], cuts: CutLayer[]): string {
  const W = Math.max(...cuts.map((c) => c.w)), H = Math.max(...cuts.map((c) => c.h));
  return [
    `${d.name} — laser layer pack`, 'Made with Mandala Stack Studio', '',
    `Finished size : ${mm(W)} x ${mm(H)} mm, ${mm(stack.length * d.thickness)} mm tall`,
    `Material      : ${stack.length} sheets of ${d.thickness} mm`,
    `Kerf offset   : ${d.kerf ? d.kerf + ' mm (already applied)' : 'none'}`, '',
    'FILES', ...cuts.map((c, i) => `  ${c.file}  ${mm(c.w)} x ${mm(c.h)} mm   ${i === 0 ? '(bottom)' : i === cuts.length - 1 ? '(top)' : ''}`),
    '  all-layers.svg   every sheet on one page', '  cutting-machine-layers.svg   filled colour layers for Cricut / Silhouette', '  assembly-guide.html   printable step-by-step pictures', ...(d.sheet && d.sheet.w > 0 ? ['  material-plan/   layers arranged on your stock sheets'] : []), '  preview.svg      assembled, coloured reference', '  project.mandala.json   re-open in the app to keep editing', '',
    'LINE COLOURS', `  red  ${CUT}  cut through`, ...(d.guides || stack.some((l) => l.score.length) ? [`  blue ${SCORE}  score / engrave lightly — glue guides and engraved detail`] : []),
    '', 'ASSEMBLY', '  1. Cut every file from the same thickness. Files are 1:1 in millimetres — do not rescale.',
    '  2. Stack in file order, 01 at the bottom. Dry-fit before gluing.',
    '  3. Glue from the bottom up; a thin, even coat of wood glue, kept 2 mm inside the edges.',
    '  4. Press flat under a book while it dries.', '',
  ].join('\n');
}

export async function laserZip(d: Design, stack: BuiltLayer[]): Promise<Blob> {
  const cuts = cutLayers(d, stack);
  const zip = new JSZip();
  cuts.forEach((c) => zip.file(c.file, layerSvg(c)));
  zip.file('all-layers.svg', sheetSvg(cuts));
  zip.file('cutting-machine-layers.svg', craftSvg(stack));
  zip.file('assembly-guide.html', assemblyGuide(d, stack));
  if (d.sheet && d.sheet.w > 0 && d.sheet.h > 0) nestSheets(cuts, d.sheet.w, d.sheet.h).sheets.forEach((cells, i) => zip.file(`material-plan/sheet-${i + 1}.svg`, nestSvg(cells, d.sheet!.w, d.sheet!.h)));
  zip.file('preview.svg', previewSvg(stack));
  zip.file('project.mandala.json', JSON.stringify(d));
  zip.file('README.txt', readme(d, stack, cuts));
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

/** Per-layer SVG files, for "Open in Studio". */
export function laserFiles(d: Design, stack: BuiltLayer[]): { filename: string; blob: Blob }[] {
  return cutLayers(d, stack).map((c) => ({ filename: c.file, blob: new Blob([layerSvg(c)], { type: 'image/svg+xml' }) }));
}

export const slugName = (d: Design) => d.name.trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'mandala';

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
