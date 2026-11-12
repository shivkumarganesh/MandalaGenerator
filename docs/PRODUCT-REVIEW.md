# Product review: from "Stacked Mandala Layer Generator" to Mandala Stack Studio

## 1. What the previous app was

Upload an SVG → set scale and centre → hand-assign every detected shape to a layer → auto-generated
supports → checklist → ZIP. A draw mode was added later. It worked, but the path to a first nice
result was long, and the 10-persona analysis found:

| Finding in the old app | What the rebuild does |
|---|---|
| **P0** 12-second rebuild with 5 dense motifs + mount + bridges | Designs are parameters, not imported point clouds. Slowest stack build across 80 test designs: **under 100 ms**. Imported art is simplified and capped at 6 000 points. |
| **P1** 12-fold + mirror default produced 24 copies nobody chose | Every ring shows its count ("12 × Petal") and Count is a field. The brush panel states the copy count ("repeats 24×") before you draw. |
| **P2** Importer path untested (malformed SVG) | Import is rewritten: sanitised, `<use>` inlined, filled *and* stroke-only art, open paths reported instead of silently dropped; hostile project JSON is clamped. |
| **P2** Extra click after every Duplicate | Duplicate selects the copy (and only Duplicate does — a fresh placement from the library also selects, because you nearly always tune it next; brush strokes do not). |
| **P3** No cheap always-on manufacturability signal | "Ready to make?" is always visible, runs 220 ms after each edit, and offers one-click fixes. |
| Manual assignment of dozens of shapes | Gone. You build layer by layer; a shape is on the layer you added it to and can be moved with one select. |
| Supports/bridges/frames as separate concepts | One switch — *Fill under upper layers* — guarantees glue contact; an optional backplate holds everything. |

## 2. What else is out there

*(Web research, November 2026. atomm.com itself was not reachable from the build sandbox, so the
notes on the official generator come from search-result summaries, not a hands-on session.)*

| Product | What it does well | Gap we fill |
|---|---|---|
| **Atomm "Layered Mandala with Name"** (official) – 3–6 layers, 10 templates, 5 pattern styles, name in the centre, 3D preview, per-layer SVG, export unlocks when checks pass | Instant result, personalisation, gated export | Template-bound: no drawing, no own artwork, no free composition |
| **Mandala Maker (madegooddesigns / artincontext), Mandala Studio, Mandalagaba, Make it Mandala** – symmetry drawing, 2–24 repeats, mirror, PNG/SVG | Joyful, zero learning curve; time-lapse and collaboration in some | Flat line art only. No layers, thickness, kerf, or manufacturability |
| **Etsy / Sofontsy / CuttingPaths / Creative Fabrica** multilayer mandala files | Proven demand for the stacked look | Fixed designs, fixed sizes, paid per file |
| **MakerWorld / Thangs / HueForge-style** layered prints | Colour-by-height printing is mainstream; 3MF with colour plan is the expected format | No generator for stacked mandalas |

**Positioning:** the drawing apps' immediacy + the official generator's "it will actually assemble"
+ your own artwork + both fabrication routes.

## 3. What makes it shareable

1. **A good result in the first second** – the app opens on a finished design; *Surprise me* is the biggest button on screen.
2. **Ownership** – a name, a logo, a kid's drawing in the centre (SVG / photo / text import).
3. **A picture worth posting** – *Save a picture* renders the shaded stack; the 3D view is the hero shot.
4. **A link that reopens the design** (standalone) – designs are parameters, so they fit in a URL.
5. **It works on the machine** – real mm, classified cut lines, README with assembly order; a failed cut is the fastest way to lose a user.

## 4. Roadmap (not built yet)

| Priority | Item | Why |
|---|---|---|
| High | Real fonts for text (bundled open-licence faces, script styles) | Text is currently traced from a system bold face — fine for a name, limited for style |
| High | Per-copy edits (pull 2 of 12 petals to another layer) | The one thing the old manual-assignment UI could do that rings cannot |
| High | Sheet nesting + material presets from the Atomm library | Saves material; "Surface" card is the platform's standard block |
| Medium | Edit brush strokes after drawing (move/reshape), eraser | Today: undo and redraw |
| Medium | Engraved detail (score/fill patterns on a layer), layer numbers on the back | Richer finishes, easier assembly |
| Medium | Community gallery / remix, time-lapse export | Network effects; needs a backend or the platform's history API |
| Medium | Hanging hole / keyhole, stand, LED-backlit spacer layer | Finished-product features makers ask for |
| Low | AI prompt → motif | Needs a platform capability |
| Low | i18n | The official generator ships 17 languages |

## 5. Known limits

- The 3MF is spec-level core 3MF (objects + base materials). It has not been opened in Bambu Studio / OrcaSlicer / PrusaSlicer from this sandbox; slicer-specific colour mapping may need a manual filament pick per part.
- The Atomm build was exercised against a stand-in SDK implementing `lifecycle.on('export')`, `ui.toast` and the export-button slot, following the contract the previous build used. It has not run inside the live Atomm iframe.
- Bitmap tracing is a threshold silhouette (one colour). Multi-colour separation is not attempted.
- "Thin detail" is an area-based opening test; sharp tips are tolerated on purpose, so a few sub-millimetre points can pass.

## 6. Matching the commercial "multilayer mandala" look

Reference pieces (Etsy / Sofontsy cut files, wood wall art) share five traits. How the app covers each:

| Trait in the references | In the app |
|---|---|
| Layers are open line-work, not solid tiers | Filigree / Gothic / Star lace / Swirl styles: outlined motif rings tied by thin ring bands |
| The same petal nested smaller on each lower layer | Built into those styles (each lower layer repeats the petal at ~83 % and alternates half a step round) |
| Finer detail and beaded bands on the deeper layers | Filler motifs from the third layer down; beaded bands (ring pierced by a row of holes) |
| Round, square and rectangular framed panels | Layout selector; every layer keeps a border along the outline, stepped inward |
| Swirls and paisley spirals | Swirl style spins each motif off-axis |

Not matched yet: free-flowing asymmetric compositions (the wave and mountain panels), multi-panel triptychs, a crescent overlapping the mandala, and hand-drawn scrollwork. Those need a curve-based ornament generator rather than radial rings; the brush and SVG import are the current route to them.
