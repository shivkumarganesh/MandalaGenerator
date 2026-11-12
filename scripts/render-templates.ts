// Contact sheet of templates. usage: tsx scripts/render-templates.ts out.svg [group]
import { writeFileSync } from 'node:fs';
import { TEMPLATES } from '../src/lib/recipes';
import { buildStack, validate } from '../src/lib/build';
import { templateDesign } from '../src/lib/frame';
import { pathD, bbox } from '../src/lib/geom';
const list = TEMPLATES.filter((t) => (process.argv[3] ? t.group === process.argv[3] : true));
const cols = 4; let body = '';
list.forEach((t, i) => {
  const d = templateDesign(t); const stack = buildStack(d); const issues = validate(stack, 1.2, d.solidStack);
  const bb = bbox(stack.flatMap((l) => l.shapes))!; const k = 200 / Math.max(bb.maxX - bb.minX, bb.maxY - bb.minY);
  const cx = (bb.minX + bb.maxX) / 2, cy = (bb.minY + bb.maxY) / 2;
  const x = (i % cols) * 230 + 115, y = Math.floor(i / cols) * 250 + 115;
  body += `<g transform="translate(${x} ${y})"><g transform="scale(${k.toFixed(3)}) translate(${-cx} ${-cy})">` + stack.map((l) => `<path d="${pathD(l.shapes, 1)}" fill="${l.color}" fill-rule="evenodd" filter="url(#sh)"/>`).join('') +
    `</g><text y="122" text-anchor="middle" font-size="9" font-family="sans-serif">${t.label} · ${stack.length}L · ${issues.map((x) => x.id.split('-')[0]).join(',')}</text></g>`;
});
const W = cols * 230, H = Math.ceil(list.length / cols) * 250;
writeFileSync(process.argv[2], `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W * 1.5}" height="${H * 1.5}"><defs><filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="1" stdDeviation="1" flood-opacity=".5"/></filter></defs><rect width="${W}" height="${H}" fill="#e7e8ea"/>${body}</svg>`);
