// Contact sheet of generated designs, to eyeball the generator without a browser.
// usage: tsx scripts/render-test.ts out.svg [style,style…] [frameId|free,…]
import { writeFileSync } from 'node:fs';
import { generate, type Style } from '../src/lib/recipes';
import { buildStack, validate } from '../src/lib/build';
import { fitToFrame, presetFrame } from '../src/lib/frame';
import { pathD, bbox } from '../src/lib/geom';

const out = process.argv[2] ?? 'sheet.svg';
const styles = (process.argv[3] ?? 'filigree,swirl,gothic,starlace').split(',') as Style[];
const frames = (process.argv[4] ?? 'free,free,circle,square,rect').split(',');
let body = '', i = 0;
for (const st of styles)
  for (const fr of frames) {
    let d = generate(200 + i * 7, st);
    if (fr !== 'free') d = fitToFrame(d, presetFrame(fr, 200));
    const t0 = performance.now();
    const stack = buildStack(d);
    const ms = performance.now() - t0;
    const issues = validate(stack);
    const bb = bbox(stack.flatMap((l) => l.shapes))!;
    const k = 200 / Math.max(bb.maxX - bb.minX, bb.maxY - bb.minY);
    const x = (i % frames.length) * 230 + 115, y = Math.floor(i / frames.length) * 250 + 115;
    body += `<g transform="translate(${x} ${y})"><g transform="scale(${k.toFixed(3)})">` +
      stack.map((l) => `<path d="${pathD(l.shapes, 1)}" fill="${l.color}" fill-rule="evenodd" filter="url(#sh)"/>`).join('') +
      `</g><text y="122" text-anchor="middle" font-size="8" font-family="sans-serif">${d.name} ${fr} · ${stack.length}L · ${ms.toFixed(0)}ms · ${issues.map((x) => x.id.split('-')[0]).join(',')}</text></g>`;
    i++;
  }
const W = frames.length * 230, H = styles.length * 250;
writeFileSync(out, `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W * 1.5}" height="${H * 1.5}"><defs><filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="1" stdDeviation="1" flood-opacity=".5"/></filter></defs><rect width="${W}" height="${H}" fill="#e7e8ea"/>${body}</svg>`);
