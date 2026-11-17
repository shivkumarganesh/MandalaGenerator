// Collage of templates, with names. usage: tsx scripts/listing-collage.ts out.svg [columns] [group] [product id] [title]
import { writeFileSync } from 'node:fs';
import { TEMPLATES } from '../src/lib/recipes';
import { buildStack } from '../src/lib/build';
import { templateDesign } from '../src/lib/frame';
import { pathD, bbox } from '../src/lib/geom';
import { PRODUCTS, applyProduct } from '../src/lib/presets';
const [, , , , group, productId, title] = process.argv;
const LIST = TEMPLATES.filter((t) => !group || t.group === group);
const product = PRODUCTS.find((p) => p.id === productId) ?? null;
const cols = +(process.argv[3] ?? 11), cw = 240, ch = 262, pad = 40, head = 110;
let body = '';
LIST.forEach((t, i) => {
  const d0 = templateDesign(t); const stack = buildStack(product ? applyProduct(d0, product) : d0);
  const bb = bbox(stack.flatMap((l) => l.shapes))!; const k = 196 / Math.max(bb.maxX - bb.minX, bb.maxY - bb.minY);
  const cx = (bb.minX + bb.maxX) / 2, cy = (bb.minY + bb.maxY) / 2;
  const x = pad + (i % cols) * cw + cw / 2, y = head + Math.floor(i / cols) * ch + 112;
  body += `<g transform="translate(${x} ${y})"><g transform="scale(${k.toFixed(3)}) translate(${-cx} ${-cy})">` +
    stack.map((l) => `<path d="${pathD(l.shapes, 1)}" fill="${l.color}" fill-rule="evenodd" filter="url(#sh)"/>`).join('') +
    `</g><text y="126" text-anchor="middle" font-size="15" fill="#4a3526" font-family="Inter,Helvetica,Arial,sans-serif">${t.label}</text></g>`;
});
const W = pad * 2 + cols * cw, H = head + Math.ceil(LIST.length / cols) * ch + pad;
writeFileSync(process.argv[2], `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><defs><radialGradient id="bg" cx="50%" cy="45%" r="75%"><stop offset="0" stop-color="#f7ecdb"/><stop offset="1" stop-color="#dcc09a"/></radialGradient><filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0.4" dy="1.2" stdDeviation="1" flood-color="#2a1608" flood-opacity=".5"/></filter></defs><rect width="${W}" height="${H}" fill="url(#bg)"/>` +
  `<text x="${W / 2}" y="68" text-anchor="middle" font-size="44" font-weight="700" fill="#3a2516" font-family="Inter,Helvetica,Arial,sans-serif">${title ?? `Mandala Stack Studio · ${LIST.length} templates`}</text>${body}</svg>`);
console.log(LIST.length, W, H);
