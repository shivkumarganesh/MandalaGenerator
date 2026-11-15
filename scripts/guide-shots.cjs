// Captures the annotated screenshots used by the in-app Guide.
// usage: node scripts/guide-shots.cjs <app url> <output dir>   (then scripts/guide-shots-pack.py)
// Each shot drives the real app, pins numbered markers on the controls the Guide talks about,
// and saves a cropped PNG. Re-run it whenever the interface changes.
const { chromium } = require('playwright');
const path = require('path'); const fs = require('fs');
const [, , URL = 'http://localhost:5173/app.html', OUT = 'shots'] = process.argv;

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 })).newPage();
  fs.mkdirSync(OUT, { recursive: true });
  const fresh = async () => { await page.goto(URL); await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForSelector('.canvas-svg path'); await page.waitForTimeout(4500); };
  const clear = () => page.evaluate(() => document.querySelectorAll('.gs-mark').forEach((n) => n.remove()));
  /** Pin marker `n` on the element. where: 'tl' | 'l' | 'c' | 'r'; box draws an outline round it. */
  const mark = async (sel, n, { where = 'l', box = false, dx = 0, dy = 0, nth = 0, text = false } = {}) => {
    const loc = typeof sel === 'string' ? page.locator(sel).nth(nth) : sel;
    // text: measure the words themselves, so the marker lands beside them, never over them
    const r = text ? await loc.evaluate((el) => { const g = document.createRange(); g.selectNodeContents(el); const q = g.getBoundingClientRect(); return { x: q.x, y: q.y, width: q.width, height: q.height }; }) : await loc.boundingBox();
    if (!r) throw new Error('not found: ' + sel);
    await page.evaluate(({ r, n, where, box, dx, dy }) => {
      const mk = (css, text) => { const d = document.createElement('div'); d.className = 'gs-mark'; d.style.cssText = 'position:fixed;z-index:99999;pointer-events:none;' + css; if (text) d.textContent = text; document.body.appendChild(d); };
      if (box) mk(`left:${r.x - 4}px;top:${r.y - 4}px;width:${r.width + 8}px;height:${r.height + 8}px;border:2px solid #3170d5;border-radius:8px;box-shadow:0 0 0 2px rgba(255,255,255,.85)`);
      const x = where === 'c' ? r.x + r.width / 2 - 12 : where === 'r' ? r.x + r.width - 6 : r.x - 18;
      const y = where === 'tl' ? r.y - 14 : r.y + r.height / 2 - 12;
      mk(`left:${x + dx}px;top:${y + dy}px;width:24px;height:24px;border-radius:50%;background:#3170d5;color:#fff;font:600 13px/20px Inter,system-ui,sans-serif;text-align:center;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35)`, String(n));
    }, { r, n, where, box, dx, dy });
  };
  const after = (sel, n) => mark(sel, n, { text: true, where: 'r', dx: 12 });
  const lab = (t) => `.field-row :is(label, .field-label):text-is("${t}")`;
  const snap = async (name, clip) => { await page.waitForTimeout(250); await page.screenshot({ path: path.join(OUT, name + '.png'), clip }); await clear(); console.log('  shot', name); };
  const boxOf = async (sel, pad = 10) => { const r = await page.locator(sel).first().boundingBox(); return { x: Math.max(0, r.x - pad - 14), y: Math.max(0, r.y - pad), width: r.width + pad * 2 + 14, height: Math.min(900 - Math.max(0, r.y - pad), r.height + pad * 2) }; };
  const card = (title) => `.prop-card:has(.prop-card-header:has-text("${title}"))`;
  const openCard = async (title) => { const h = page.locator(`.prop-card-header:has-text("${title}")`).first(); if ((await h.getAttribute('aria-expanded')) === 'false') await h.click(); await h.evaluate((e) => e.scrollIntoView({ block: 'start' })); await page.waitForTimeout(200); };
  const tool = async (name, title) => { if (!(await page.locator(`.gen-rail-title:text-is("${title}")`).count())) await page.click(`.rail-item:has-text("${name}")`); await page.waitForTimeout(250); };
  const tpl = async (label) => { await tool('Start', 'Start'); await page.click(`.thumb-grid .thumb:has-text("${label}") >> nth=0`); await page.waitForTimeout(600); await page.locator('.gen-rail-lead .gen-rail-scroll').evaluate((e) => (e.scrollTop = 0)); };
  const centre = async () => { const r = await page.locator('.canvas-svg').boundingBox(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; };

  // 1 ── the whole screen
  await fresh(); await tpl('Rose lattice');
  await mark('.gen-rail-tools', 1, { where: 'c', dy: 60 }); await mark('.gen-rail-lead', 2, { where: 'c', dy: 150 }); await mark('.gen-canvas', 3, { where: 'c', dx: -270, dy: -190 }); await mark('.gen-rail-params', 4, { where: 'c', dy: 150 });
  await mark('.segmented-tabs', 5, { where: 'l' }); await mark('.canvas-help', 6, { where: 'l' }); await mark('.zoom-cluster', 7, { where: 'r', dx: 14 }); await page.waitForSelector('.gen-rail-footer .btn-primary', { timeout: 15000 }); await mark('.gen-rail-footer', 8, { where: 'l', dx: 8, dy: -18 });
  await snap('screen', { x: 0, y: 0, width: 1440, height: 900 });

  // 2 ── Start panel
  await after('.gen-rail-lead h4:has-text("Layout")', 1); await after('.gen-rail-lead h4:has-text("Style")', 2); await after('.gen-rail-lead h4:has-text("Layers")', 3);
  await mark('button:has-text("Surprise me")', 4, { box: true }); await mark('button:has-text("More like this")', 5, { where: 'r', dx: -40 }); await after('.gen-rail-lead h4:text-is("Colours")', 6);
  await snap('start', { x: 60, y: 0, width: 330, height: 760 });

  // 3 ── Layers card
  await openCard('Layers');
  const row = '.layer-list >> nth=0 >> .layer-row >> nth=0';
  await mark(`${row} >> .swatch`, 1, { where: 'tl', dx: 16, dy: -2 }); await mark(`${row} >> .layer-name`, 2, { where: 'tl', dx: 40, dy: -2 }); await mark(`${row} >> [aria-label^="Hide"]`, 3, { where: 'tl', dx: 18, dy: -2 }); await mark(`${row} >> [aria-label$="down"]`, 4, { where: 'tl', dx: 6, dy: -2 }); await mark(`${row} >> [aria-label^="Delete"]`, 5, { where: 'tl', dx: 18, dy: -2 });
  await mark('button:has-text("Add layer on top")', 6, { where: 'r', dx: -44 }); await mark('.field-row:has-text("Hide layers above") .switch', 7, { where: 'l', dx: -8 }); await after('.sub-head', 8);
  await snap('layers', await boxOf(card('Layers')));

  // 4 ── selecting and editing a shape
  await tpl('Lotus tiers'); const c = await centre();
  await page.mouse.click(c.x, c.y - 150); await page.waitForTimeout(400); await openCard('Selected');
  await mark('.sel-outline', 1, { where: 'c', dy: -70 }); await mark(card('Selected') + ' .prop-card-header', 2, { where: 'c' }); await after(lab('Count'), 3); await after(lab('Distance from centre'), 4); await after(lab('Role'), 5);
  await snap('edit', { x: 430, y: 0, width: 1010, height: 640 });

  // 5 ── Motifs panel
  await tool('Motifs', 'Motifs');
  await mark('.gen-rail-lead .segmented', 1, { box: true }); await after('.gen-rail-lead h4:text-is("Motif rings")', 2);
  await snap('motifs', { x: 60, y: 0, width: 330, height: 620 });
  await page.locator('.gen-rail-lead .gen-rail-scroll').evaluate((e) => { const h = [...e.querySelectorAll('h4')].find((x) => x.textContent === 'Pattern curves'); e.scrollTop = h.offsetTop - 70; });
  await after('.gen-rail-lead h4:text-is("Pattern curves")', 3); await after('.gen-rail-lead h4:text-is("Harvest figures")', 4);
  await snap('motifs2', { x: 60, y: 0, width: 330, height: 620 });

  // 6 ── drawing
  await tpl('Dahlia'); await page.click('text=Add layer on top'); await tool('Draw', 'Draw');
  const d = await centre(); await page.mouse.move(d.x + 20, d.y - 250); await page.mouse.down();
  for (let i = 0; i < 26; i++) await page.mouse.move(d.x + 20 + i * 2.2, d.y - 250 + Math.sin(i / 4) * 22 + i * 3.4);
  await after('.gen-rail-lead h4:text-is("Brush")', 1); await mark('.gen-rail-lead .alert-info', 2, { where: 'r', dx: -14, dy: -26 }); await mark('.gen-canvas', 3, { where: 'c', dx: 100, dy: -240 });
  await snap('draw', { x: 60, y: 0, width: 1070, height: 700 }); await page.mouse.up();

  // 7 ── importing a picture
  await fresh(); await tool('Import', 'Import');
  const png = await page.evaluate(() => { const cv = document.createElement('canvas'); cv.width = 260; cv.height = 260; const g = cv.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 260, 260); g.fillStyle = '#111'; g.beginPath(); for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 48 : 112; g.lineTo(130 + r * Math.cos(a), 130 + r * Math.sin(a)); } g.fill(); return cv.toDataURL('image/png').split(',')[1]; });
  fs.writeFileSync(path.join(OUT, '_star.png'), Buffer.from(png, 'base64'));
  await page.setInputFiles('.dropzone input', path.join(OUT, '_star.png')); await page.waitForTimeout(600);
  await mark('.dropzone', 1, { where: 'tl', dx: 26, dy: 22 }); await mark('.trace-preview', 2, { where: 'tl', dx: 26, dy: 22 }); await after(lab('Darkness cut-off'), 3); await mark('button:has-text("Add to design")', 4, { where: 'r', dx: -40 }); await mark('button:has-text("Build a layered portrait")', 5, { where: 'r', dx: -34 }); await after('.gen-rail-lead h4:text-is("Name or word")', 6);
  await snap('import', { x: 60, y: 0, width: 330, height: 760 });

  // 8 ── Size & material
  await tpl('Square panel'); await openCard('Size & material');
  for (const [l, n] of [['Design size', 1], ['Sheet thickness', 2], ['Step per layer', 3], ['Border width', 4], ['Fill under upper layers', 5], ['Kerf compensation', 6], ['Score glue guides', 7]]) await after(lab(l), n);
  await snap('size', await boxOf(card('Size & material')));

  // 9 ── Make it a… (clock)
  await tpl('Lotus tiers'); await openCard('Make it a'); await page.selectOption('#preset-product', 'clock'); await page.waitForTimeout(500); await page.selectOption('#preset-clock-dial', 'roman'); await page.waitForTimeout(600); await openCard('Make it a');
  await after(lab('Product'), 1); await after(lab('Clock dial'), 2); await after(lab('Dial on the back layer only'), 3); await after(lab('Ring behind the dial'), 4); await after(lab('Show clock hands'), 5); await after(lab('Centre hole'), 6); await after(lab('Hanging hole'), 7); await after(lab('Alignment pin holes'), 8);
  await snap('make', { x: 430, y: 0, width: 1010, height: 880 });

  // 10 ── Machine & material plan
  await openCard('Machine & material plan'); await page.selectOption('#preset-preset', 'diode3'); await page.waitForTimeout(500); await openCard('Machine & material plan');
  await after(lab('Preset'), 1); await after(lab('Thinnest detail'), 2); await after(lab('Stock sheet width'), 3); await after(lab('Sheets needed'), 4);
  await snap('plan', await boxOf(card('Machine & material plan')));

  // 11 ── Ready to make?
  await fresh(); await tpl('Lotus tiers'); await openCard('Size & material'); await page.locator('.field-row:has-text("Fill under upper layers") input').uncheck({ force: true });
  await tool('Motifs', 'Motifs'); await page.click('.thumb:has-text("Heart")'); const f = page.getByRole('textbox', { name: 'Distance from centre', exact: true }); await f.click(); await f.fill('132'); await f.press('Enter'); await page.waitForTimeout(900);
  await openCard('Ready to make');
  await mark('.alert-error >> nth=0', 1, { where: 'r', dx: -22, dy: -22 }); await mark('.alert-error >> nth=0 >> .btn', 2, { where: 'r', dx: 10 }); await after(lab('Finished size'), 3);
  await snap('checks', await boxOf(card('Ready to make')));

  // 12 ── the three views
  await tpl('Round panel');
  const canvas = { x: 384, y: 0, width: 737, height: 640 };
  await snap('view-2d', canvas);
  await page.click('.segmented-tabs >> text=3D preview'); await page.waitForTimeout(3500); await openCard('Size & material'); await page.locator('.field-row:has-text("Explode") input').fill('45'); await page.waitForTimeout(900); await snap('view-3d', canvas);
  await page.click('.segmented-tabs >> text=Cut sheets'); await page.waitForTimeout(800); await snap('view-sheets', canvas);

  // 13 ── export
  await page.waitForSelector('.gen-rail-footer .btn-primary', { timeout: 15000 });
  await mark('.segmented-tabs', 1, { where: 'l' }); await mark('.gen-rail-footer .btn-primary', 2, { box: true });
  await snap('export', { x: 384, y: 0, width: 1056, height: 900 });

  // 14 ── Project panel
  await page.click('.segmented-tabs >> text=2D design'); await tool('Project', 'Project');
  const btns = ['Save a picture', 'Save a colouring page', 'Record a turntable video', 'Copy share link', 'Save project', 'Open project'];
  let k = 0; // numbered in order of the buttons that exist in this build
  for (const t of btns) if (await page.locator(`button:has-text("${t}")`).count()) await mark(`button:has-text("${t}")`, ++k, { where: 'r', dx: -40 });
  await snap('project', { x: 60, y: 0, width: 330, height: 500 });

  // 15 ── 3D print dialog (standalone only)
  if (await page.locator('.gen-rail-footer >> text=3D print files').count()) {
    await page.click('.gen-rail-footer >> text=3D print files'); await page.waitForTimeout(500);
    await snap('print', await (async () => { const r = await page.locator('dialog[open]').boundingBox(); return { x: r.x - 8, y: r.y - 8, width: r.width + 16, height: r.height + 16 }; })());
  }
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
