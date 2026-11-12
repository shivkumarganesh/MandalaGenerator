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

const mm = (n: number) => n.toFixed(1);

export function readme(d: Design, stack: BuiltLayer[], cuts: CutLayer[]): string {
  const W = Math.max(...cuts.map((c) => c.w)), H = Math.max(...cuts.map((c) => c.h));
  return [
    `${d.name} — laser layer pack`, 'Made with Mandala Stack Studio', '',
    `Finished size : ${mm(W)} x ${mm(H)} mm, ${mm(stack.length * d.thickness)} mm tall`,
    `Material      : ${stack.length} sheets of ${d.thickness} mm`,
    `Kerf offset   : ${d.kerf ? d.kerf + ' mm (already applied)' : 'none'}`, '',
    'FILES', ...cuts.map((c, i) => `  ${c.file}  ${mm(c.w)} x ${mm(c.h)} mm   ${i === 0 ? '(bottom)' : i === cuts.length - 1 ? '(top)' : ''}`),
    '  all-layers.svg   every sheet on one page', '  preview.svg      assembled, coloured reference', '  project.mandala.json   re-open in the app to keep editing', '',
    'LINE COLOURS', `  red  ${CUT}  cut through`, ...(d.guides ? [`  blue ${SCORE}  score lightly — shows where the next sheet sits`] : []),
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
