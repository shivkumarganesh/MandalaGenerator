// Non-DOM pipeline test: every template and a batch of random designs go through the real
// build → validate → laser SVG → mesh code, with assertions on the output.
import { TEMPLATES, fromTemplate, generate } from '../src/lib/recipes';
import { buildStack, validate, computeStats, scaleDesign, designDiameter } from '../src/lib/build';
import { cutLayers, layerSvg, sheetSvg } from '../src/lib/exportLaser';
import { printTiers } from '../src/lib/export3d';
import { fusedBody, slab } from '../src/lib/mesh';
import { parseDesign } from '../src/lib/share';
import { area, difference } from '../src/lib/geom';

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

const designs = [...TEMPLATES.map(fromTemplate), ...Array.from({ length: 30 }, (_, i) => generate(1000 + i))];
let worst = 0;
for (const d0 of designs) {
  for (const d of [d0, { ...d0, plate: 'round' as const, solidStack: false, kerf: 0.15, guides: true }]) {
    const t0 = performance.now();
    const stack = buildStack(d);
    const ms = performance.now() - t0; worst = Math.max(worst, ms);
    check(stack.length >= 3, `${d.name}: expected ≥3 sheets`);
    check(stack.every((l) => l.shapes.length > 0 && l.shapes.every((s) => s.outer.length >= 3 && s.outer.every((p) => isFinite(p.x) && isFinite(p.y)))), `${d.name}: invalid geometry`);
    const issues = validate(stack);
    if (d.solidStack) {
      check(!issues.some((i) => i.level === 'error'), `${d.name}: template has blocking issues: ${issues.map((i) => i.message).join(' | ')}`);
      for (let i = 1; i < stack.length; i++) check(area(difference(stack[i].shapes, stack[i - 1].shapes)) < 0.5, `${d.name}: sheet ${i} overhangs the one below despite solid stack`);
    }
    const cuts = cutLayers(d, stack);
    check(cuts.every((c) => /^<\?xml[^]*viewBox="0 0 [\d.]+ [\d.]+"[^]*#FE0002/.test(layerSvg(c))), `${d.name}: layer SVG malformed`);
    check(sheetSvg(cuts).includes('mm"'), `${d.name}: sheet SVG not in mm`);
    const stats = computeStats(d, stack);
    check(stats.sizeX > 150 && stats.sizeX < 260, `${d.name}: unexpected size ${stats.sizeX}`);
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
check(parseDesign('{"v":2,"layers":[{"elements":[{"kind":"ring","count":1e9,"motif":"x","radius":"NaN"}]}]}')!.layers[0].elements[0].kind === 'ring', 'hostile JSON should be clamped, not crash');
check(parseDesign('<svg>') === null, 'non-JSON must be rejected');
console.log(`${designs.length * 2} designs · slowest build ${worst.toFixed(0)} ms · ${failed ? failed + ' FAILED' : 'all checks passed'}`);
process.exit(failed ? 1 : 0);
