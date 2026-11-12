// 3D-print output (standalone build only). Three ways to print the same stack:
//   fused    — one STL; change filament at the listed heights (works on any single-nozzle printer)
//   3mf      — one model, one coloured part per tier, for AMS / MMU multi-material printers
//   parts    — one flat STL per tier, printed separately and glued like the laser version
import JSZip from 'jszip';
import type { BuiltLayer, Design, Shape } from './types';
import { union } from './geom';
import { flipY, fusedBody, indexed, slab, stlBinary } from './mesh';

export type PrintMode = 'fused' | '3mf' | 'parts';

export interface PrintTier { name: string; color: string; shapes: Shape[]; h: number; z0: number; z1: number }

/** Tiers in print orientation (Y-up), nested so nothing starts in mid-air. */
export function printTiers(d: Design, stack: BuiltLayer[], nest: boolean): PrintTier[] {
  const shapes = stack.map((l) => flipY(l.shapes));
  if (nest) for (let i = shapes.length - 2; i >= 0; i--) shapes[i] = union([...shapes[i], ...shapes[i + 1]]);
  let z = 0;
  return stack.map((l, i) => {
    const h = l.isPlate ? d.print.base : d.print.layer;
    const t = { name: l.name, color: l.color, shapes: shapes[i], h, z0: z, z1: z + h };
    z += h;
    return t;
  });
}

const xml = (s: string) => s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!);

function model3mf(tiers: PrintTier[], title: string): string {
  let res = `<basematerials id="1">${tiers.map((t) => `<base name="${xml(t.name)}" displaycolor="${t.color.toUpperCase()}FF"/>`).join('')}</basematerials>`;
  tiers.forEach((t, i) => {
    const s = slab(t.shapes, t.z0, t.z1);
    const { verts, idx } = indexed([...s.caps, ...s.sides]);
    let v = '', tr = '';
    for (let k = 0; k < verts.length; k += 3) v += `<vertex x="${verts[k]}" y="${verts[k + 1]}" z="${verts[k + 2]}"/>`;
    for (let k = 0; k < idx.length; k += 3) tr += `<triangle v1="${idx[k]}" v2="${idx[k + 1]}" v3="${idx[k + 2]}"/>`;
    res += `<object id="${i + 2}" type="model" name="${xml(t.name)}" pid="1" pindex="${i}"><mesh><vertices>${v}</vertices><triangles>${tr}</triangles></mesh></object>`;
  });
  const asm = tiers.length + 2;
  res += `<object id="${asm}" type="model" name="${xml(title)}"><components>${tiers.map((_, i) => `<component objectid="${i + 2}"/>`).join('')}</components></object>`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">` +
    `<metadata name="Title">${xml(title)}</metadata><metadata name="Application">Mandala Stack Studio</metadata>` +
    `<resources>${res}</resources><build><item objectid="${asm}"/></build></model>`;
}

function printReadme(d: Design, tiers: PrintTier[], mode: PrintMode): string {
  const top = tiers[tiers.length - 1].z1;
  const lines = [`${d.name} — 3D print files`, 'Made with Mandala Stack Studio', '', `Total height: ${top.toFixed(2)} mm`, ''];
  if (mode === 'fused') {
    lines.push('ONE PIECE, COLOUR BY HEIGHT', 'Slice the STL as usual (no supports needed — every tier sits on the one below).',
      'Add a filament change ("pause / change filament at layer") at each height:', '');
    tiers.forEach((t, i) => lines.push(i === 0 ? `  start        ${t.color}  ${t.name}` : `  at ${t.z0.toFixed(2).padStart(5)} mm  ${t.color}  ${t.name}`));
    lines.push('', 'Tip: pick a slicer layer height that divides the tier thickness evenly (e.g. 0.2 mm for 0.8 mm tiers).');
  } else if (mode === '3mf') {
    lines.push('MULTI-COLOUR 3MF', 'Open the .3mf in Bambu Studio / OrcaSlicer / PrusaSlicer. If asked, load it as ONE object with multiple parts.',
      'Each part is one tier — assign a filament to each:', '', ...tiers.map((t) => `  ${t.color}  ${t.name}  (${t.z0.toFixed(2)}–${t.z1.toFixed(2)} mm)`));
  } else {
    lines.push('SEPARATE PARTS', 'Print each STL flat in its own colour, then stack and glue in file order (01 at the bottom).',
      '', ...tiers.map((t, i) => `  ${String(i + 1).padStart(2, '0')}  ${t.color}  ${t.name}  ${t.h} mm thick`));
  }
  return lines.join('\n') + '\n';
}

export async function printZip(d: Design, stack: BuiltLayer[], mode: PrintMode, slug: string): Promise<Blob> {
  const zip = new JSZip();
  const tiers = printTiers(d, stack, mode !== 'parts');
  if (mode === 'fused') {
    zip.file(`${slug}.stl`, stlBinary(fusedBody(tiers.map((t) => ({ shapes: t.shapes, h: t.h })))));
  } else if (mode === '3mf') {
    const m = new JSZip();
    m.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>');
    m.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>');
    m.file('3D/3dmodel.model', model3mf(tiers, d.name));
    zip.file(`${slug}.3mf`, await m.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }));
  } else {
    tiers.forEach((t, i) => {
      const s = slab(t.shapes, 0, t.h);
      zip.file(`${String(i + 1).padStart(2, '0')}-${t.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.stl`, stlBinary([...s.caps, ...s.sides]));
    });
  }
  zip.file('README.txt', printReadme(d, tiers, mode));
  zip.file('project.mandala.json', JSON.stringify(d));
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}
