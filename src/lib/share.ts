// A design is small (it is parameters, not geometry), so it fits in a link.
import type { Design } from './types';

const b64url = (u8: Uint8Array) => {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function pipe(data: Uint8Array, stream: TransformStream<Uint8Array, Uint8Array>): Promise<Uint8Array> {
  const out = new Response(new Blob([data as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

export async function encodeDesign(d: Design): Promise<string> {
  const raw = new TextEncoder().encode(JSON.stringify(d));
  return b64url(await pipe(raw, new CompressionStream('deflate-raw') as unknown as TransformStream<Uint8Array, Uint8Array>));
}

export async function decodeDesign(s: string): Promise<Design | null> {
  try {
    const raw = await pipe(unb64url(s), new DecompressionStream('deflate-raw') as unknown as TransformStream<Uint8Array, Uint8Array>);
    return parseDesign(new TextDecoder().decode(raw));
  } catch { return null; }
}

/** Validate untrusted JSON (a share link or an opened file) before it becomes state. */
export function parseDesign(text: string): Design | null {
  try {
    const d = JSON.parse(text);
    if (!d || d.v !== 2 || !Array.isArray(d.layers)) return null;
    const num = (v: unknown, def: number, lo: number, hi: number) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : def);
    const col = (v: unknown, def: string) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : def);
    const layers = d.layers.slice(0, 12).map((l: any, i: number) => ({
      id: String(l.id ?? 'l' + i), name: String(l.name ?? `Layer ${i + 1}`).slice(0, 40), color: col(l.color, '#cccccc'), visible: l.visible !== false,
      elements: (Array.isArray(l.elements) ? l.elements : []).slice(0, 60).filter((e: any) => e && ['ring', 'disc', 'stroke'].includes(e.kind)).map((e: any, k: number) => {
        const base = { id: String(e.id ?? `e${i}-${k}`), op: e.op === 'cut' ? 'cut' : 'add' };
        if (e.kind === 'ring') return { ...base, kind: 'ring', motif: String(e.motif), count: Math.round(num(e.count, 8, 1, 96)), radius: num(e.radius, 0, 0, 2000), length: num(e.length, 10, 0.2, 4000), width: num(e.width, 10, 0.2, 4000), rotate: num(e.rotate, 0, -3600, 3600), spin: num(e.spin, 0, -3600, 3600), outline: num(e.outline, 0, 0, 500) };
        if (e.kind === 'disc') return { ...base, kind: 'disc', outer: num(e.outer, 10, 0.2, 2000), inner: num(e.inner, 0, 0, 2000), edge: ['plain', 'scallop', 'pointed', 'wave', 'zigzag'].includes(e.edge) ? e.edge : 'plain', lobes: Math.round(num(e.lobes, 12, 2, 200)), depth: num(e.depth, 0, 0, 500), rotate: num(e.rotate, 0, -3600, 3600) };
        return { ...base, kind: 'stroke', size: num(e.size, 3, 0.2, 200), fold: Math.round(num(e.fold, 1, 1, 48)), mirror: !!e.mirror, pts: (Array.isArray(e.pts) ? e.pts : []).slice(0, 4000).map((p: any) => [num(p?.[0], 0, -4000, 4000), num(p?.[1], 0, -4000, 4000), num(p?.[2], 0.5, 0, 1)]) };
      }),
    }));
    const ring = (r: any) => (Array.isArray(r) ? r.slice(0, 20000).map((p: any) => ({ x: num(p?.x, 0, -10, 10), y: num(p?.y, 0, -10, 10) })) : []);
    const customMotifs = (Array.isArray(d.customMotifs) ? d.customMotifs : []).slice(0, 40).map((m: any, i: number) => ({
      id: String(m.id ?? 'c' + i), name: String(m.name ?? 'Artwork').slice(0, 40), aspect: num(m.aspect, 1, 0.01, 100),
      shapes: (Array.isArray(m.shapes) ? m.shapes : []).slice(0, 4000).map((s: any) => ({ outer: ring(s?.outer), holes: (Array.isArray(s?.holes) ? s.holes : []).map(ring) })),
    }));
    const mmRing = (r: any) => (Array.isArray(r) ? r.slice(0, 20000).map((p: any) => ({ x: num(p?.x, 0, -4000, 4000), y: num(p?.y, 0, -4000, 4000) })) : []);
    const frame = d.frame && Array.isArray(d.frame.shapes) && d.frame.shapes.length
      ? { name: String(d.frame.name ?? 'Shape').slice(0, 40), step: num(d.frame.step, 2.5, 0, 50), shapes: d.frame.shapes.slice(0, 200).map((s: any) => ({ outer: mmRing(s?.outer), holes: (Array.isArray(s?.holes) ? s.holes : []).map(mmRing) })).filter((s: any) => s.outer.length >= 3) }
      : null;
    return {
      frame,
      v: 2, name: String(d.name ?? 'My mandala').slice(0, 60), layers, customMotifs,
      thickness: num(d.thickness, 3, 0.2, 30), solidStack: d.solidStack !== false,
      plate: ['none', 'round', 'square', 'hexagon', 'outline'].includes(d.plate) ? d.plate : 'none',
      plateMargin: num(d.plateMargin, 5, 0, 200), plateColor: col(d.plateColor, '#3b2616'),
      kerf: num(d.kerf, 0, 0, 2), guides: !!d.guides,
      finish: ['wood', 'painted', 'plastic'].includes(d.finish) ? d.finish : 'wood',
      print: { layer: num(d.print?.layer, 0.8, 0.1, 20), base: num(d.print?.base, 1.2, 0.1, 20) },
    };
  } catch { return null; }
}
