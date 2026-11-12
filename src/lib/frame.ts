// "Grow the mandala inside a shape": the outline becomes the bottom sheet and clips every layer.
import type { Design, Frame, Shape } from './types';
import { bbox, mapShapes, union } from './geom';
import { scaleDesign, shapesFar, layerShapes } from './build';
import { builtinMotif } from './motifs';

/** Unit-box artwork → a filled, centred outline whose longer side is `size` mm. */
export function makeFrame(unit: Shape[], aspect: number, size: number, name: string): Frame {
  const w = aspect >= 1 ? size : size * aspect, h = aspect >= 1 ? size / aspect : size;
  // only the outer boundary matters: an outline drawing and a filled shape frame the same area
  const solid = union(mapShapes(unit, (p) => ({ x: p.x * w, y: p.y * h })).map((s) => ({ outer: s.outer, holes: [] })));
  const bb = bbox(solid)!;
  const cx = (bb.minX + bb.maxX) / 2, cy = (bb.minY + bb.maxY) / 2;
  return { name, step: Math.max(1.5, size * 0.0125), shapes: mapShapes(solid, (p) => ({ x: p.x - cx, y: p.y - cy })) };
}

export const PRESET_FRAMES: { id: string; label: string }[] = [
  { id: 'heart', label: 'Heart' }, { id: 'star', label: 'Star' }, { id: 'hexagon', label: 'Hexagon' },
  { id: 'square', label: 'Square' }, { id: 'teardrop', label: 'Drop' },
];

export function presetFrame(id: string, size: number): Frame {
  const m = builtinMotif(id)!;
  const aspect = id === 'heart' ? 1.08 : id === 'teardrop' ? 0.72 : id === 'hexagon' ? 1.1547 : 1;
  return makeFrame(m.shapes, aspect, size, m.label);
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
