// Renders named templates as layered SVGs with soft shadows, for listing artwork.
// usage: tsx scripts/listing-art.ts <out dir> "Label one" "Label two" …
import { writeFileSync } from 'node:fs';
import { TEMPLATES } from '../src/lib/recipes';
import { buildStack } from '../src/lib/build';
import { templateDesign } from '../src/lib/frame';
import { pathD, bbox } from '../src/lib/geom';
const [, , out, ...labels] = process.argv;
if (!labels.length) { console.log(TEMPLATES.map((t) => `${t.group ?? '-'} | ${t.label}`).join('\n')); process.exit(0); }
labels.forEach((label, i) => {
  const t = TEMPLATES.find((x) => x.label === label); if (!t) throw new Error('no template ' + label);
  const stack = buildStack(templateDesign(t));
  const bb = bbox(stack.flatMap((l) => l.shapes))!; const p = 8;
  const w = bb.maxX - bb.minX + p * 2, h = bb.maxY - bb.minY + p * 2;
  writeFileSync(`${out}/art${i}.svg`, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bb.minX - p} ${bb.minY - p} ${w} ${h}"><defs><filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0.5" dy="1.4" stdDeviation="1.1" flood-color="#2a1608" flood-opacity=".55"/></filter></defs>` +
    stack.map((l) => `<path d="${pathD(l.shapes, 2)}" fill="${l.color}" fill-rule="evenodd" filter="url(#sh)"/>`).join('') + '</svg>');
  console.log(i, label, stack.length, 'layers');
});
