// Renders every template to a contact-sheet SVG so the generator can be eyeballed without a browser.
import { writeFileSync } from 'node:fs';
import { TEMPLATES, fromTemplate, generate } from '../src/lib/recipes';
import { buildStack, validate } from '../src/lib/build';
import { pathD } from '../src/lib/geom';

const out = process.argv[2] ?? 'sheet.svg';
const designs = [...TEMPLATES.map(fromTemplate), ...Array.from({ length: 10 }, (_, i) => generate(100 + i))];
let body = '';
designs.forEach((d, i) => {
  const t0 = performance.now();
  const stack = buildStack(d);
  const ms = performance.now() - t0;
  const issues = validate(stack);
  const x = (i % 5) * 230 + 115, y = Math.floor(i / 5) * 250 + 115;
  body += `<g transform="translate(${x} ${y})">` +
    stack.map((l) => `<path d="${pathD(l.shapes, 1)}" fill="${l.color}" fill-rule="evenodd" filter="url(#sh)"/>`).join('') +
    `<text y="122" text-anchor="middle" font-size="9" font-family="sans-serif">${d.name} · ${ms.toFixed(0)}ms · ${issues.length} issues</text></g>`;
  if (issues.length) console.log(d.name, issues.map((x) => x.message));
});
writeFileSync(out, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1150 1000" width="1725" height="1500"><defs><filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="1" stdDeviation="1.2" flood-opacity=".45"/></filter></defs><rect width="1150" height="1000" fill="#e7e8ea"/>${body}</svg>`);
