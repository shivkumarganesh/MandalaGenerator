// Walks the app in the full-width test language (?lang=qps) and lists every piece of on-screen
// text that did not come through the translation layer. usage: node scripts/i18n-sweep.cjs <app url>
// With a real language (?lang=de …) pass it as the second argument to list text still in English.
const { chromium } = require('playwright');
const [, , URL = 'http://localhost:5181/app.html', LANG = 'qps'] = process.argv;
const fs = require('fs');

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  const en = LANG === 'qps' ? null : new Set(Object.values(JSON.parse(fs.readFileSync('src/locales/en.json', 'utf8'))));
  const seen = new Map();
  const scan = async (where) => {
    const texts = await page.evaluate(() => {
      const out = [];
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = w.nextNode(); n; n = w.nextNode()) { const p = n.parentElement; if (p && !p.closest('script,style,[data-atomm-export-button]')) out.push(n.textContent); }
      for (const el of document.querySelectorAll('[aria-label],[title],[placeholder],[alt],optgroup[label]')) for (const a of ['aria-label', 'title', 'placeholder', 'alt', 'label']) if (el.hasAttribute(a)) out.push(el.getAttribute(a));
      for (const el of document.querySelectorAll('input:not([type=file]):not([type=color]):not([type=range]):not([type=checkbox]):not([type=number])')) if (el.value) out.push(el.value);
      return out;
    });
    for (const raw of texts) {
      const s = raw.trim(); if (!s) continue;
      const bad = LANG === 'qps'
        ? /[A-Za-z]{2}/.test(s.replace(/\b(mm|in|min|px|SVG|PNG|JPG|STL|3MF|ZIP|xTool|Ctrl|Shift|Alt|Esc|Space|Delete|README)\b/g, ''))
        : en.has(s) && /[a-z]{3}/.test(s);
      if (bad && !seen.has(s)) seen.set(s, where);
    }
  };
  const click = async (sel, wait = 250) => { await page.locator(sel).first().click(); await page.waitForTimeout(wait); };
  const tool = async (i) => { const it = page.locator('.rail-item').nth(i); if ((await it.getAttribute('aria-pressed')) !== 'true') await it.click(); await page.waitForTimeout(300); };
  const openCards = async () => { for (let i = 0; i < 8 && (await page.locator('.prop-card-header[aria-expanded="false"]').count()); i++) await page.locator('.prop-card-header[aria-expanded="false"]').first().click(); await page.waitForTimeout(200); };
  const thumb = async (i) => { await tool(0); await page.locator('.thumb-grid .thumb').nth(i).click(); await page.waitForTimeout(600); };

  await page.goto(`${URL}?lang=${LANG}`); await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForSelector('.canvas-svg path'); await page.waitForTimeout(6000);
  await openCards(); await scan('start');
  await click('.gen-rail-lead .btn-secondary'); await scan('more shapes'); // More shapes
  for (let i = 1; i < 5; i++) { await tool(i); await scan('tool ' + i); }
  // every kind of shape, selected
  await tool(1);
  for (const [name, n] of [['ring', 0], ['disc', 2], ['curve', 3]]) {
    await page.locator('.rail-section').nth(n === 0 ? 1 : n === 2 ? 4 : 5).locator('.thumb').first().click(); await page.waitForTimeout(400); await openCards(); await scan('selected ' + name);
  }
  await page.locator('.rail-section').nth(4).locator('.thumb').nth(2).click(); await page.waitForTimeout(300); await scan('shaped disc');
  await page.locator('.field-row:has(.segmented) button').nth(2).click().catch(() => {}); await scan('engrave role');
  // drawing a stroke
  await tool(2); const box = await page.locator('.canvas-svg').boundingBox(); const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx + 40, cy); await page.mouse.down(); await page.mouse.move(cx + 90, cy + 30, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(400);
  await tool(1); await page.mouse.click(cx + 65, cy + 15); await page.waitForTimeout(300); await scan('selected stroke');
  // import: a picture to trace, a word, a bad file
  await tool(3);
  const png = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#000'; g.beginPath(); g.arc(32, 32, 20, 0, 7); g.fill(); return c.toDataURL().split(',')[1]; });
  await page.locator('.dropzone input').setInputFiles({ name: 'dot.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') }); await page.waitForTimeout(600); await scan('trace');
  await page.locator('.dropzone input').setInputFiles({ name: 'x.txt', mimeType: 'text/plain', buffer: Buffer.from('x') }); await page.waitForTimeout(300); await scan('bad file');
  await page.locator('.dropzone input').setInputFiles({ name: 'a.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M1 1L9 9" stroke="#000" fill="none"/></svg>') }); await page.waitForTimeout(400); await scan('svg outline');
  await page.locator('.dropzone input').setInputFiles({ name: 'b.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<p>no</p>') }); await page.waitForTimeout(300); await scan('bad svg');
  // products, clock, christmas, panels, plan
  await thumb(20); await openCards(); await scan('christmas template');
  await page.selectOption('#preset-product', 'clock'); await page.waitForTimeout(500); await scan('clock');
  await page.locator('.field-row:has(#preset-clock-dial) ~ .field-row .switch input').first().check().catch(() => {}); await scan('clock back');
  for (const id of ['wall', 'coaster', 'ornament', 'earring', 'trivet']) { await page.selectOption('#preset-product', id); await page.waitForTimeout(300); await scan('product ' + id); }
  await page.selectOption('#preset-preset', 'diode3'); await page.waitForTimeout(400); await scan('plan');
  await thumb(45); await openCards(); await scan('panel');
  for (const v of [1, 2, 0]) { await page.locator('.segmented-tabs button').nth(v).click(); await page.waitForTimeout(v === 1 ? 4000 : 500); await scan('view ' + v); }
  // problems: a blank canvas, then loose pieces
  await tool(4); await click('.gen-rail-lead .rail-section:last-of-type .btn'); await page.waitForTimeout(500); await scan('blank');
  await tool(1); await page.locator('.rail-section').nth(1).locator('.thumb').first().click(); await page.waitForTimeout(700); await scan('loose pieces');
  await page.locator('.segmented-tabs button').nth(2).click(); await page.waitForTimeout(300); await scan('sheets'); await page.locator('.segmented-tabs button').nth(0).click();
  // dialogs
  await click('.canvas-help .btn-tips >> nth=1'); for (let i = 0; i < 8; i++) { await scan('tips ' + i); const n = page.locator('dialog[open] .btn-primary'); await n.click(); await page.waitForTimeout(150); if (!(await page.locator('dialog[open]').count())) break; }
  await click('.canvas-help .btn-tips >> nth=0', 500);
  const pages = await page.locator('dialog[open] .guide-link').count();
  for (let i = 0; i < pages; i++) { await page.locator('dialog[open] .guide-link').nth(i).click(); await page.waitForTimeout(350); await scan('guide ' + i); }
  await page.locator('dialog[open] input[type=search]').fill('zzzz'); await page.waitForTimeout(200); await scan('guide search');
  await click('dialog[open] .dialog-header .btn-icon', 400);
  if (await page.locator('.gen-rail-footer .btn-secondary').count()) { await click('.gen-rail-footer .btn-secondary', 600); for (let i = 0; i < 3; i++) { await page.locator('dialog[open] .choice').nth(i).click(); await page.waitForTimeout(250); await scan('print ' + i); } }

  console.log(`${seen.size} untranslated`);
  for (const [s, where] of seen) console.log(`  [${where}] ${s.slice(0, 150)}`);
  if (errs.length) console.log('page errors:', errs.slice(0, 5));
  await b.close();
  process.exit(seen.size || errs.length ? 1 : 0);
})();
