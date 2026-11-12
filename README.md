# Mandala Stack Studio

Design a layered mandala in the browser, then cut it on a laser or print it in 3D.
A ground-up rebuild of the "Stacked Mandala Layer Generator" — no backend, everything runs client-side.

| Build | What it is | Output |
|---|---|---|
| **Atomm** | Generator for the Atomm / xTool platform. Laser only — no 3D-print button. Export goes through the platform button and `atomm.lifecycle.on('export')`. | `release/mandala-stack-studio-atomm.zip` |
| **Standalone** | One self-contained HTML file. Adds **3D print files** (STL / 3MF) and share links. | `release/mandala-stack-studio.html` |

Same source; `VITE_TARGET` decides which one is built.

## What you can do

- **Start in one click** – 10 templates, or *Surprise me* (a seeded generator: lotus, sunburst, lace, rose-window, snowflake… in 9 palettes).
- **Build with rings** – 20 parametric motifs and 6 disc/band edges. Each shape either *adds material* or *cuts a window* so the layer below shows through.
- **Edit directly** – click a shape to select it, drag to slide it in/out, Shift-drag to turn it; every number is also a drag-to-scrub field.
- **Draw** – freehand brush with live radial symmetry (1–24 repeats, optional mirror).
- **Bring your own art** – SVG (filled shapes *and* stroke-only outlines), PNG/JPG (traced to a silhouette), or type a name. Imports become motifs you can repeat around the mandala.
- **See it** – 2D design, a three.js 3D preview with real thickness and an explode slider, and *Cut sheets* (exactly what will be exported).
- **Trust it** – "Ready to make?" checks for loose pieces, weak glue contact and details too thin to cut, with one-click fixes.
- **Make it**
  - Laser: one SVG per sheet (1:1 mm, red `#FE0002` cut hairlines, optional blue glue guides, kerf compensation), an all-in-one sheet, a preview, a README and the project file.
  - 3D print (standalone): one STL with filament-swap heights, a multi-colour 3MF, or flat parts to glue. Meshes are watertight and need no supports.

## Develop

```bash
npm install
```

```bash
npm run dev
```

```bash
npm run dev:atomm
```

```bash
npm test
```

```bash
npm run release
```

`npm run release` type-checks, builds both targets (`dist-atomm/`, `dist-standalone/`) and refreshes `release/`.

To try the Atomm build inside the real platform iframe:
`https://www.atomm.com/creativetools/community/generator/<name>?local=http://localhost:5173/` with `npm run dev:atomm` running.

## How it is built

React 19 + TypeScript + Vite. `clipper-lib` for polygon booleans/offsets, `earcut` for triangulation, `three` for the preview (lazy-loaded), `perfect-freehand` for the brush, `dompurify` for untrusted SVG, `jszip` for packaging.

```
Design (parameters)  ──►  lib/build.ts  ──►  BuiltLayer[]  ──►  2D canvas
   layers → elements        one pipeline        (mm, Y-down)    3D preview (lib/mesh.ts)
                                                                laser SVG  (lib/exportLaser.ts)
                                                                STL / 3MF  (lib/export3d.ts)
```

There is exactly one geometry pipeline; every view and every exported file reads the same `BuiltLayer[]`.

| File | Role |
|---|---|
| `src/lib/types.ts` | Data model + the coordinate convention |
| `src/lib/geom.ts` | Clipper wrappers and polygon maths (mm floats) |
| `src/lib/motifs.ts` | Parametric motif library |
| `src/lib/build.ts` | Elements → layers → stack, validation, stats |
| `src/lib/recipes.ts` | Palettes, seeded generator, templates |
| `src/lib/importArt.ts` | SVG / bitmap / text → motif |
| `src/lib/mesh.ts` | Watertight slab mesher, STL writer |
| `src/lib/exportLaser.ts`, `export3d.ts` | Output packages |
| `src/lib/atomm.ts` | Platform SDK status + export hook |
| `src/lib/store.ts` | State, undo/redo, autosave |
| `src/components/*` | Layout-5 UI (tool rail · panel · canvas · parameters) |
| `src/styles/atomm.css` | Atomm Generator UI stylesheet, verbatim from the platform template |
| `scripts/pipeline-test.ts` | Non-DOM test: 80 designs through build, SVG and mesh checks |

See [docs/PRODUCT-REVIEW.md](docs/PRODUCT-REVIEW.md) for the review of the previous app, the competitor scan and the roadmap.
