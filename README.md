# Mandala Stack Studio

Design a layered mandala in the browser, then cut it on a laser or print it in 3D.
A ground-up rebuild of the "Stacked Mandala Layer Generator" — no backend, everything runs client-side.

| Build | What it is | Output |
|---|---|---|
| **Atomm** | Generator for the Atomm / xTool platform. Laser only — no 3D-print button. Export goes through the platform button and `atomm.lifecycle.on('export')`. | `release/mandala-stack-studio-atomm.zip` |
| **Standalone** | One self-contained HTML file. Adds **3D print files** (STL / 3MF) and share links. | `release/mandala-stack-studio.html` |

Same source; `VITE_TARGET` decides which one is built.

## What you can do

- **Thanksgiving** – 13 templates in their own section: turkey, pumpkin, harvest wreath, autumn leaves and wheat sunburst as free-form, round, square and rectangular panels, plus lace grown inside a maple leaf, a pumpkin and a tall panel. A *Thanksgiving* style for Surprise me, harvest motifs (maple leaf, oak leaf, acorn, wheat ear, stackable pumpkin and turkey parts) and two autumn palettes.
- **Christmas** – 18 festive templates (reindeer, Santa, snowman, gingerbread, stocking and holly-bell medallions, snow crystal, holly wreath, fir tree ring, poinsettia, jingle bells, Christmas star, tree / bauble / bell ornaments with hanging holes, frost window, Nordic tile, peppermint), a *Christmas* style for Surprise me, six festive motifs, six figures as line art and silhouette (converted from supplied artwork by `scripts/make-figure.ts` and `scripts/make-figures-svg.ts`) and three seasonal palettes. Christmas designs also offer an optional **ornament loop** (a tab with a hole on top of the bottom sheet).
- **Pattern algorithms** – eight mathematical patterns as editable shapes (spirograph, rose curve, guilloché braid, star polygon, flower of life, spiral arms, web, sunflower dots) and seven Surprise me styles built on them, with nine templates.
- **Start in one click** – 66 templates, or *Surprise me*: pick a **layout** (free form, circle, square, rectangle, more shapes or your own SVG outline), a **style** (23, or Any) and a **layer count** (3–8, or Any); every press gives a new design. Seeds are random 31-bit numbers, so repeats are practically never seen.
- **Line-work styles** – Filigree lotus, Gothic tracery, Star lace and Swirl build each layer as an open lattice of outlined petals tied by thin rings, nested smaller on every lower layer: the look of classic multilayer mandala cut files. The original solid-tier styles (Lotus tiers, Sunburst, Lace, …) are still there.
- **Panels** – in a circle, square or rectangle layout the outline is the bottom sheet, every layer is clipped to it and keeps a border, each stepping in from the one below.
- **Build with rings** – 20 parametric motifs and 6 disc/band edges. Each shape either *adds material* or *cuts a window* so the layer below shows through.
- **Edit directly** – click a shape to select it, drag to slide it in/out, Shift-drag to turn it; every number is also a drag-to-scrub field.
- **Draw** – freehand brush with live radial symmetry (1–24 repeats, optional mirror).
- **Bring your own art** – SVG (filled shapes *and* stroke-only outlines), PNG/JPG (traced to a silhouette), or type a name. Imports become motifs you can repeat around the mandala.
- **Edit one copy** – break a ring into separate shapes and move, restyle or re-layer any single one.
- **Engrave** – any shape can be a blue score line on its layer instead of a cut.
- **More like this** – a new design that keeps the current style, layer count and colours.
- **Photo portrait** – split a photo into 2–6 tonal layers that stack into a picture.
- **Make it a…** – wall art, clock, coaster, ornament, earring or trivet presets; centre hole, hanging hole and alignment-pin holes through every sheet.
- **Machine & material plan** – machine presets (kerf, thinnest detail, sheet size), layers arranged on your stock sheets, sheets needed, cutting time and cost.
- **See it** – 2D design, a three.js 3D preview with real thickness and an explode slider, and *Cut sheets* (exactly what will be exported).
- **Trust it** – "Ready to make?" checks for loose pieces, weak glue contact and details too thin to cut, with one-click fixes.
- **Make it**
  - Laser: one SVG per sheet (1:1 mm, red `#FE0002` cut hairlines, blue score lines for engraving and glue guides, kerf compensation), an all-in-one sheet, the material-plan sheets, a filled-colour SVG for Cricut / Silhouette, a printable assembly guide, a preview, a README and the project file.
  - Share: a shaded picture, a colouring page, and a 6-second turntable video of the 3D model.
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

The source entry page is `app.html` (the dev server opens it). The `index.html` at the repository root is the **built** standalone app, refreshed by `npm run release`, so GitHub Pages can serve the repository directly.

`npm run release` type-checks, builds both targets (`dist-atomm/`, `dist-standalone/`) and refreshes `release/`.

To try the Atomm build inside the real platform iframe:
`https://www.atomm.com/creativetools/community/generator/<name>?local=http://localhost:5173/app.html` with `npm run dev:atomm` running.

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
| `src/lib/curves.ts` | Pattern algorithms (spirograph, rose, guilloché, star polygon, flower of life, spiral, web, phyllotaxis) |
| `src/lib/build.ts` | Elements → layers → stack, validation, stats |
| `src/lib/recipes.ts` | Palettes, seeded generator, templates |
| `src/lib/frame.ts` | Fit and clip a mandala inside a preset or uploaded outline |
| `src/lib/importArt.ts` | SVG / bitmap / text → motif |
| `src/lib/mesh.ts` | Watertight slab mesher, STL writer |
| `src/lib/exportLaser.ts`, `export3d.ts` | Output packages |
| `src/lib/atomm.ts` | Platform SDK status + export hook |
| `src/lib/store.ts` | State, undo/redo, autosave |
| `src/components/*` | Layout-5 UI (tool rail · panel · canvas · parameters) |
| `src/styles/atomm.css` | Atomm Generator UI stylesheet, verbatim from the platform template |
| `scripts/pipeline-test.ts` | Non-DOM test: 80 designs through build, SVG and mesh checks |

See [docs/PRODUCT-REVIEW.md](docs/PRODUCT-REVIEW.md) for the review of the previous app, the competitor scan and the roadmap.
