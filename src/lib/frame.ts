// "Grow the mandala inside a shape": the outline becomes the bottom sheet and clips every layer.
import type { Design, Frame, Shape } from './types';
import { bbox, mapShapes, union } from './geom';
import { scaleDesign, shapesFar, layerShapes } from './build';
import { builtinMotif } from './motifs';
import { fromTemplate, type Template } from './recipes';

/** Unit-box artwork → a filled, centred outline whose longer side is `size` mm. */
export function makeFrame(unit: Shape[], aspect: number, size: number, name: string): Frame {
  const w = aspect >= 1 ? size : size * aspect, h = aspect >= 1 ? size / aspect : size;
  // only the outer boundary matters: an outline drawing and a filled shape frame the same area
  const solid = union(mapShapes(unit, (p) => ({ x: p.x * w, y: p.y * h })).map((s) => ({ outer: s.outer, holes: [] })));
  const bb = bbox(solid)!;
  const cx = (bb.minX + bb.maxX) / 2, cy = (bb.minY + bb.maxY) / 2;
  return { name, step: Math.max(1.5, size * 0.0125), rim: 0, shapes: mapShapes(solid, (p) => ({ x: p.x - cx, y: p.y - cy })) };
}

export const PRESET_FRAMES: { id: string; label: string; motif: string; aspect: number }[] = [
  { id: 'circle', label: 'Circle', motif: 'circle', aspect: 1 },
  { id: 'square', label: 'Square', motif: 'square', aspect: 1 },
  { id: 'rect', label: 'Rectangle', motif: 'square', aspect: 1.5 },
  { id: 'tall', label: 'Tall', motif: 'square', aspect: 0.667 },
  { id: 'hexagon', label: 'Hexagon', motif: 'hexagon', aspect: 1.1547 },
  { id: 'heart', label: 'Heart', motif: 'heart', aspect: 1.08 },
  { id: 'star', label: 'Star', motif: 'star', aspect: 1 },
  { id: 'teardrop', label: 'Drop', motif: 'teardrop', aspect: 0.72 },
  { id: 'maple', label: 'Maple leaf', motif: 'maple', aspect: 1 },
  { id: 'pumpkin', label: 'Pumpkin', motif: 'pumpkin', aspect: 1.12 },
  { id: 'acorn', label: 'Acorn', motif: 'acorn', aspect: 0.85 },
  { id: 'tree', label: 'Fir tree', motif: 'tree', aspect: 0.8 },
  { id: 'bauble', label: 'Bauble', motif: 'bauble', aspect: 0.86 },
  { id: 'bell', label: 'Bell', motif: 'bell', aspect: 0.92 },
];

/** A built-in outline with a border on every layer (the stepped picture-frame look). */
export function presetFrame(id: string, size: number): Frame {
  const p = PRESET_FRAMES.find((f) => f.id === id) ?? PRESET_FRAMES[0];
  const f = makeFrame(builtinMotif(p.motif)!.shapes, p.aspect, size, p.label);
  return { ...f, rim: Math.max(2, size * 0.016) };
}

/** Put a design inside a frame: scale the mandala so it covers the outline, then let the build clip it. */
export function fitToFrame(d: Design, frame: Frame | null | undefined): Design {
  if (!frame) return { ...d, frame: null };
  let far = 0;
  for (const l of d.layers) far = Math.max(far, shapesFar(layerShapes(l, d.customMotifs)));
  const need = shapesFar(frame.shapes) * 1.04;
  const scaled = far > 0 ? scaleDesign({ ...d, frame: null }, need / far) : d;
  return { ...scaled, frame, plate: 'none' };
}

/** A template as a ready design, including its panel shape. */
export function templateDesign(t: Template, layers?: number): Design {
  const d = fromTemplate(t, layers);
  return t.shape ? fitToFrame(d, presetFrame(t.shape, 200)) : d;
}
