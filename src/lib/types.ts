// ─────────────────────────────────────────────────────────────────────────────
// Coordinate convention (documented once, used everywhere):
//   IR / design space : millimetres, origin at the mandala centre, Y DOWN (SVG-like), no Z.
//   3D (three.js)     : millimetres, Y up, Z is thickness. The flip happens ONCE, on the
//                       content group (scale.y = -1) for the preview, and once in the mesh
//                       exporter for STL/3MF.
// Every consumer — 2D canvas, 3D preview, laser SVG, STL/3MF — reads the same BuiltLayer[].
// ─────────────────────────────────────────────────────────────────────────────

export type Pt = { x: number; y: number };
export type Ring = Pt[]; // closed, implicit close
export type Shape = { outer: Ring; holes: Ring[] };

/** add = material, cut = window through the sheet, score = engraved outline on the sheet. */
export type Op = 'add' | 'cut' | 'score';

interface ElBase {
  id: string;
  op: Op;
}

/** `count` copies of a motif placed on a circle. count = 1 & radius = 0 is a centrepiece. */
export interface RingEl extends ElBase {
  kind: 'ring';
  motif: string; // built-in id, or `custom:<id>` for imported artwork
  count: number;
  radius: number; // mm, centre of each motif from the mandala centre
  length: number; // mm, radial size
  width: number; // mm, tangential size
  rotate: number; // deg, phase of the whole ring
  spin: number; // deg, each motif about its own centre
  outline: number; // mm wall; 0 = solid
}

export type EdgeStyle = 'plain' | 'scallop' | 'pointed' | 'wave' | 'zigzag';

/** A disc or band (inner > 0) with an optional decorative edge. */
export interface DiscEl extends ElBase {
  kind: 'disc';
  outer: number; // mm radius
  inner: number; // mm radius, 0 = solid
  edge: EdgeStyle;
  lobes: number;
  depth: number; // mm
  rotate: number; // deg
}

/** A freehand stroke repeated by the symmetry it was drawn with. */
export interface StrokeEl extends ElBase {
  kind: 'stroke';
  pts: number[][]; // [x, y, pressure] in mm
  size: number; // mm
  fold: number;
  mirror: boolean;
}

/** A mathematical line pattern (spirograph, rose curve, star polygon…) drawn as material `line` mm wide. */
export interface CurveEl extends ElBase {
  kind: 'curve';
  pattern: string;
  size: number; // mm radius
  a: number;
  b: number;
  c: number; // 0..1
  line: number; // mm
  rotate: number; // deg
}

export type Element = RingEl | DiscEl | StrokeEl | CurveEl;

export interface Layer {
  id: string;
  name: string;
  color: string;
  visible: boolean;
  elements: Element[];
}

/** Imported artwork, normalised so its larger side is 1 and it is centred on the origin. */
export interface CustomMotif {
  id: string;
  name: string;
  shapes: Shape[];
  aspect: number; // width / length
}

export type PlateShape = 'none' | 'round' | 'square' | 'hexagon' | 'outline';
export type Finish = 'wood' | 'painted' | 'plastic';

export interface Design {
  v: 2;
  name: string;
  layers: Layer[]; // bottom → top
  customMotifs: CustomMotif[];
  thickness: number; // mm, laser sheet thickness
  solidStack: boolean; // lower layers fill beneath upper ones → guaranteed glue contact
  plate: PlateShape;
  plateMargin: number; // mm
  plateColor: string;
  kerf: number; // mm, laser kerf compensation
  guides: boolean; // score the footprint of the next layer as a glue guide
  finish: Finish;
  print: { layer: number; base: number }; // mm, 3D-print thickness per tier / of the backplate
  /** Optional outline the whole mandala is grown inside: it becomes the bottom sheet and clips every layer. */
  frame?: Frame | null;
  /** Through-holes: centre (clock movement), hanging hole near the top, two alignment pins. Diameters in mm, 0 = none. */
  holes?: { centre: number; hang: number; pins: boolean };
  minFeature?: number; // mm, thinnest detail the machine can make
  /** Stock sheet for the material plan; w = 0 turns the plan off. */
  sheet?: { w: number; h: number; price: number; speed: number };
  /** How the design was generated, so "More like this" can make a sibling. */
  gen?: { style: string };
}

export interface Frame {
  name: string;
  shapes: Shape[]; // mm, centred on the origin
  step: number; // mm each layer steps in from the one below
  rim?: number; // mm border kept on every layer along the outline (0 = none)
}

/** One physical sheet, ready for every output. */
export interface BuiltLayer {
  id: string;
  name: string;
  color: string;
  shapes: Shape[]; // final geometry
  own: Shape[]; // before solid-stack fill
  score: Shape[]; // engraved outlines on this sheet
  isPlate: boolean;
  srcIndex: number; // index into design.layers, -1 for the backplate
}

export interface Issue {
  id: string;
  level: 'error' | 'warn';
  message: string;
  fix?: { label: string; action: 'plate' | 'solid' };
}

export interface Stats {
  sizeX: number;
  sizeY: number;
  layers: number;
  pieces: number;
  cutLength: number; // mm
  height: number; // mm, assembled
}
