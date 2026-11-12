// Non-DOM pipeline test: every template and a batch of random designs go through the real
// build → validate → laser SVG → mesh code, with assertions on the output.
import { TEMPLATES, STYLES, generate } from '../src/lib/recipes';
import { buildStack, validate, computeStats, scaleDesign, designDiameter } from '../src/lib/build';
import { assemblyGuide, coloringSvg, craftSvg, cutLayers, layerSvg, materialPlan, nestSheets, sheetSvg } from '../src/lib/exportLaser';
import { pointInShapes } from '../src/lib/geom';
const pointIn = (s: Parameters<typeof pointInShapes>[1]) => pointInShapes({ x: 0, y: 0 }, s);
import { printTiers } from '../src/lib/export3d';
import { fusedBody, slab } from '../src/lib/mesh';
import { parseDesign } from '../src/lib/share';
import { area, difference } from '../src/lib/geom';
import { fitToFrame, presetFrame, templateDesign } from '../src/lib/frame';

let failed = 0;
const check = (ok: boolean, msg: string) => { if (!ok) { failed++; console.log('  FAIL', msg); } };

/** Watertight = every directed edge is matched by exactly one opposite edge. Returns unmatched count. */
function openEdges(tris: number[]): number {
  const m = new Map<string, number>();
  const k = (i: number) => `${Math.round(tris[i] * 1000)},${Math.round(tris[i + 1] * 1000)},${Math.round(tris[i + 2] * 1000)}`;
  for (let t = 0; t < tris.length; t += 9) {
    const v = [k(t), k(t + 3), k(t + 6)];
    for (let e = 0; e < 3; e++) {
      const a = v[e], b = v[(e + 1) % 3];
      if (a === b) continue;
      const rev = b + '|' + a, n = m.get(rev) ?? 0;
      if (n > 0) m.set(rev, n - 1); else m.set(a + '|' + b, (m.get(a + '|' + b) ?? 0) + 1);
    }
  }
  let open = 0; m.forEach((n) => (open += n));
  return open;
}

function volume(tris: number[]): number {
  let v = 0;
  for (let t = 0; t < tris.length; t += 9)
    v += (tris[t] * (tris[t + 4] * tris[t + 8] - tris[t + 5] * tris[t + 7]) - tris[t + 1] * (tris[t + 3] * tris[t + 8] - tris[t + 5] * tris[t + 6]) + tris[t + 2] * (tris[t + 3] * tris[t + 7] - tris[t + 4] * tris[t + 6])) / 6;
  return v;
}

const designs = [...TEMPLATES.map((t) => templateDesign(t)), ...Array.from({ length: 20 }, (_, i) => generate(1000 + i))];
let worst = 0;
for (const d0 of designs) {
  for (const d of [d0, { ...d0, plate: 'round' as const, solidStack: false, kerf: 0.15, guides: true }]) {
    const t0 = performance.now();
    const stack = buildStack(d);
    const ms = performance.now() - t0; worst = Math.max(worst, ms);
    check(stack.length >= 3, `${d.name}: expected ≥3 sheets`);
    check(stack.every((l) => l.shapes.length > 0 && l.shapes.every((s) => s.outer.length >= 3 && s.outer.every((p) => isFinite(p.x) && isFinite(p.y)))), `${d.name}: invalid geometry`);
    const issues = validate(stack, 1.2, d.solidStack);
    if (d.solidStack) {
      check(!issues.some((i) => i.level === 'error'), `${d.name}: template has blocking issues: ${issues.map((i) => i.message).join(' | ')}`);
      for (let i = 1; i < stack.length; i++) check(area(difference(stack[i].shapes, stack[i - 1].shapes)) < 0.5, `${d.name}: sheet ${i} overhangs the one below despite solid stack`);
    }
    const cuts = cutLayers(d, stack);
    check(cuts.every((c) => /^<\?xml[^]*viewBox="0 0 [\d.]+ [\d.]+"[^]*#FE0002/.test(layerSvg(c))), `${d.name}: layer SVG malformed`);
    check(sheetSvg(cuts).includes('mm"'), `${d.name}: sheet SVG not in mm`);
    const stats = computeStats(d, stack);
    check(stats.sizeX > 130 && stats.sizeX < 260, `${d.name}: unexpected size ${stats.sizeX}`);
    // meshes
    const tiers = printTiers(d, stack, true);
    for (const t of tiers) {
      const s = slab(t.shapes, t.z0, t.z1); const tris = [...s.caps, ...s.sides];
      check(openEdges(tris) === 0, `${d.name}/${t.name}: slab not watertight (${openEdges(tris)} open edges)`);
      const expect = area(t.shapes) * t.h;
      check(Math.abs(volume(tris) - expect) < expect * 2e-3, `${d.name}/${t.name}: slab volume ${volume(tris).toFixed(1)} ≠ ${expect.toFixed(1)}`);
    }
    const fused = fusedBody(tiers.map((t) => ({ shapes: t.shapes, h: t.h })));
    const expectV = tiers.reduce((a, t) => a + area(t.shapes) * t.h, 0);
    check(Math.abs(volume(fused) - expectV) < expectV * 2e-3, `${d.name}: fused volume ${volume(fused).toFixed(1)} ≠ ${expectV.toFixed(1)}`);
    const oe = openEdges(fused);
    check(oe === 0, `${d.name}: fused body has ${oe} open edges of ${fused.length / 3}`);
  }
  // round-trips
  const back = parseDesign(JSON.stringify(d0));
  check(!!back && JSON.stringify(buildStack(back)) === JSON.stringify(buildStack(d0)), `${d0.name}: project file round-trip changed the geometry`);
  const big = scaleDesign(d0, 1.5);
  check(Math.abs(designDiameter(big) - designDiameter(d0) * 1.5) < 0.5, `${d0.name}: scaling is not proportional`);
}
// finishing, engraving and the material plan
{
  const base = generate(4242, 'filigree', 'wood', 5);
  const plain = buildStack(base);
  const holed = buildStack({ ...base, holes: { centre: 8, hang: 4, pins: true } });
  check(holed.every((l, i) => area(l.shapes) < area(plain[i].shapes) || !pointIn(plain[i].shapes)), 'holes should remove material from sheets that cover the centre');
  check(holed.every((l) => !pointIn(l.shapes)), 'centre hole must go through every sheet');
  const eng = { ...base, layers: base.layers.map((l, i) => (i === 0 ? { ...l, elements: [...l.elements, { id: 'sc', kind: 'ring' as const, op: 'score' as const, motif: 'star', count: 8, radius: 80, length: 10, width: 10, rotate: 0, spin: 0, outline: 0 }] } : l)) };
  const es = buildStack(eng);
  check(Math.abs(area(es[0].shapes) - area(plain[0].shapes)) < 0.01, 'engraving must not change the sheet outline');
  check(es[0].score.length > 0, 'engraved shapes should reach the built layer');
  check(cutLayers(eng, es)[0].score.length > 0 && layerSvg(cutLayers(eng, es)[0]).includes('#0000FF'), 'engraving should export as blue score lines');
  const cuts = cutLayers(base, plain);
  const nest = nestSheets(cuts, 400, 400);
  check(nest.sheets.flat().length === cuts.length && nest.tooBig.length === 0, 'every layer should be placed on a 400 mm sheet');
  check(nest.sheets.every((sh) => sh.every((c) => c.x + c.c.w <= 400 && c.y + c.c.h <= 400)), 'nested layers must stay inside the sheet');
  check(nest.sheets.every((sh) => sh.every((a, i) => sh.every((b, j) => i === j || a.x + a.c.w <= b.x || b.x + b.c.w <= a.x || a.y + a.c.h <= b.y || b.y + b.c.h <= a.y))), 'nested layers must not overlap');
  check(nestSheets(cuts, 100, 100).tooBig.length === cuts.length, 'layers larger than the sheet must be reported');
  const plan = materialPlan({ ...base, sheet: { w: 400, h: 400, price: 5, speed: 10 } }, plain)!;
  check(plan.sheets === nest.sheets.length && plan.cost === plan.sheets * 5 && plan.minutes > 1, 'material plan numbers');
  check(craftSvg(plain).includes('fill="#') && coloringSvg(plain).includes('stroke="#111111"') && assemblyGuide(base, plain).includes('Step ' + plain.length), 'extra outputs');
  const back = parseDesign(JSON.stringify({ ...eng, holes: { centre: 8, hang: 4, pins: true }, sheet: { w: 400, h: 400, price: 5, speed: 10 }, minFeature: 1 }))!;
  check(back.holes?.centre === 8 && back.sheet?.w === 400 && back.minFeature === 1 && back.layers[0].elements.some((e) => e.op === 'score'), 'new settings must survive a project round-trip');
}
// ornament loop: optional, Christmas only, bottom sheet only
for (const t of TEMPLATES.filter((x) => x.group === 'Christmas')) {
  const d = templateDesign(t);
  check(d.theme === 'christmas' && !d.loop, `${t.label}: should be a Christmas design with the loop off by default`);
  const plain = buildStack(d), looped = buildStack({ ...d, loop: true });
  const topOf = (s: typeof plain) => Math.min(...s[0].shapes.flatMap((p) => p.outer.map((q) => q.y)));
  check(looped[0].shapes.length === plain[0].shapes.length, `${t.label}: the loop must be attached to the bottom sheet, not a loose piece`);
  check(topOf(looped) < topOf(plain) - 1.5 || area(looped[0].shapes) !== area(plain[0].shapes), `${t.label}: loop should change the bottom sheet`);
  check(looped[0].shapes.some((p) => p.holes.length > plain[0].shapes.reduce((m, q) => Math.max(m, q.holes.length), 0) - 1 && p.holes.length >= 1), `${t.label}: loop needs a hole`);
  check(looped.slice(1).every((l, i) => Math.abs(area(l.shapes) - area(plain[i + 1].shapes)) < 0.01), `${t.label}: loop must not alter the upper sheets`);
  check(!validate(looped, 1.2, d.solidStack).some((x) => x.level === 'error'), `${t.label}: loop causes blocking issues`);
}
check(!templateDesign(TEMPLATES.find((x) => !x.group)!).theme, 'non-Christmas templates must not get the Christmas theme');
check(TEMPLATES.length >= 20 && new Set(TEMPLATES.map((t) => t.id)).size === TEMPLATES.length, 'expected 20+ unique templates');
// every style, many seeds: no two designs alike, none broken
for (const st of STYLES) {
  const seen = new Set<string>();
  for (let i = 0; i < 25; i++) {
    const d = generate(9000 + i * 13, st);
    const stack = buildStack(d);
    check(!validate(stack).some((x) => x.level === 'error'), `${st} #${i}: blocking issues`);
    seen.add(stack.map((l) => Math.round(area(l.shapes))).join(','));
  }
  check(seen.size >= 23, `${st}: only ${seen.size} distinct designs out of 25 seeds`);
}
// Surprise me with a fixed layer count, free and inside a shape
for (let n = 3; n <= 8; n++)
  for (let i = 0; i < 3; i++) {
    const d = generate(5000 + n * 100 + i, undefined, undefined, n);
    check(d.layers.length === n, `${d.name}: asked for ${n} layers, got ${d.layers.length}`);
    const stack = buildStack(d);
    check(stack.length === n, `${d.name}: ${n} layers built ${stack.length} sheets`);
    check(!validate(stack).some((x) => x.level === 'error'), `${d.name} (${n} layers): blocking issues`);
    for (const fid of ['heart', 'star', 'circle', 'square', 'rect']) {
      const f = fitToFrame(d, presetFrame(fid, 180));
      const fs = buildStack(f);
      check(fs.length === n + 1 && fs[0].isPlate, `${d.name} in ${fid}: expected shape sheet + ${n} layers, got ${fs.length}`);
      check(fs.every((l) => area(difference(l.shapes, fs[0].shapes)) < 0.5), `${d.name} in ${fid}: a layer pokes outside the shape`);
      check(!validate(fs).some((x) => x.level === 'error'), `${d.name} in ${fid}: blocking issues: ${validate(fs).filter((x) => x.level === 'error').map((x) => x.message).join(' | ')}`);
      check(area(fs[1].shapes) > area(fs[0].shapes) * 0.45, `${d.name} in ${fid}: mandala does not fill the shape`);
    }
  }
check(parseDesign('{"v":2,"layers":[{"elements":[{"kind":"ring","count":1e9,"motif":"x","radius":"NaN"}]}]}')!.layers[0].elements[0].kind === 'ring', 'hostile JSON should be clamped, not crash');
check(parseDesign('<svg>') === null, 'non-JSON must be rejected');
console.log(`${designs.length * 2} designs · slowest build ${worst.toFixed(0)} ms · ${failed ? failed + ' FAILED' : 'all checks passed'}`);
process.exit(failed ? 1 : 0);
