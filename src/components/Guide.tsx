// The in-app Guide: feature chapters and step-by-step recipes. It lives inside the app (no separate
// page to host), remembers the page you were on, and recipes can load their own starting design.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { IS_ATOMM } from '../lib/atomm';
import { applyDial } from '../lib/dial';
import { fitToFrame, presetFrame, templateDesign } from '../lib/frame';
import { PRODUCTS, applyProduct } from '../lib/presets';
import { TEMPLATES, disc, emptyDesign, generate, layer, ring } from '../lib/recipes';
import { buildStack } from '../lib/build';
import { bbox, pathD } from '../lib/geom';
import { shots } from 'guide-shots';
import { loadDesign, setUI, toast } from '../lib/store';
import type { Design } from '../lib/types';
import { Icon } from './ui';

const tpl = (id: string): Design => templateDesign(TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0]);
const product = (d: Design, id: string): Design => applyProduct(d, PRODUCTS.find((p) => p.id === id) ?? null);

const P = ({ children }: { children: ReactNode }) => <p>{children}</p>;
const B = ({ children }: { children: ReactNode }) => <strong>{children}</strong>;
const Steps = ({ items }: { items: ReactNode[] }) => <ol className="guide-steps">{items.map((x, i) => <li key={i}>{x}</li>)}</ol>;
const List = ({ items }: { items: ReactNode[] }) => <ul className="guide-list">{items.map((x, i) => <li key={i}>{x}</li>)}</ul>;
const Tip = ({ children }: { children: ReactNode }) => <div className="alert alert-info guide-tip"><Icon name="info" /><div className="alert-body"><p>{children}</p></div></div>;
/** A screenshot with its numbered markers explained. `side` puts the key beside a narrow picture. */
function Fig({ src, alt, legend, side, caption }: { src: string; alt: string; legend?: ReactNode[]; side?: boolean; caption?: string }) {
  if (!src) return null;
  return (
    <figure className={side ? 'guide-fig side' : 'guide-fig'}>
      <img src={src} alt={alt} loading="lazy" />
      {(legend || caption) && (
        <figcaption>
          {caption && <p className="guide-cap">{caption}</p>}
          {legend && <ol className="guide-legend">{legend.map((x, i) => <li key={i}><span>{x}</span></li>)}</ol>}
        </figcaption>
      )}
    </figure>
  );
}

/** A live sample: a small design drawn by the app itself, so it always matches what you will get. */
function Mini({ make, label }: { make: () => Design; label: string }) {
  const view = useMemo(() => {
    const stack = buildStack(make());
    const bb = bbox(stack.flatMap((l) => l.shapes)) ?? { minX: -50, minY: -50, maxX: 50, maxY: 50 };
    const half = Math.max(bb.maxX - bb.minX, bb.maxY - bb.minY) / 2 * 1.06, cx = (bb.minX + bb.maxX) / 2, cy = (bb.minY + bb.maxY) / 2;
    return { box: `${cx - half} ${cy - half} ${half * 2} ${half * 2}`, sw: half / 60, layers: stack.map((l) => ({ d: pathD(l.shapes, 1), score: l.score.length ? pathD(l.score, 1) : '', color: l.color })) };
    // a sample is fixed for the life of the page
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <figure className="guide-mini">
      <svg viewBox={view.box} role="img" aria-label={label}>
        {view.layers.map((l, i) => <g key={i}><path d={l.d} fill={l.color} fillRule="evenodd" stroke="rgba(0,0,0,.28)" strokeWidth={view.sw * 0.5} />{l.score && <path d={l.score} fill="none" stroke="rgba(0,0,0,.6)" strokeWidth={view.sw} />}</g>)}
      </svg>
      <figcaption>{label}</figcaption>
    </figure>
  );
}
const Samples = ({ children }: { children: ReactNode }) => <div className="guide-samples">{children}</div>;

/** The same two-layer design three times; only the Role of the hearts changes. */
const roleSample = (op: 'add' | 'cut' | 'score') => (): Design => ({
  ...emptyDesign(), finish: 'painted',
  layers: [layer('Bottom', '#6b4226', [disc({ outer: 50 })]), layer('Top', '#f1dcb6', [disc({ outer: 41, edge: 'scallop', lobes: 16, depth: 3 }), ring({ op, motif: 'heart', count: 8, radius: 27, length: 13, width: 13 })])],
});
const layoutSample = (shape: string | null) => (): Design => { const d = generate(207, 'filigree', 'forest', 4); return shape ? fitToFrame(d, presetFrame(shape, 200)) : d; };

const Facts = ({ time, need }: { time: string; need: string }) => <p className="guide-facts"><span className="tag">{time}</span><span className="tag">{need}</span></p>;

interface Page { id: string; group: string; title: string; body: ReactNode; start?: { label: string; run: () => void } }

function pages(): Page[] {
  // designs are made when the button is pressed (or the sample is shown), not when the Guide opens
  const load = (make: () => Design, msg: string, tool?: 'templates' | 'motifs' | 'draw' | 'import' | 'project') => () => { loadDesign(make()); setUI({ view: '2d', leadOpen: true, ...(tool ? { tool } : {}) }); toast(msg); };
  const all: (Page | false)[] = [
    // ── Basics ──
    { id: 'welcome', group: 'Basics', title: 'Welcome', body: <>
      <P>Mandala Stack Studio designs <B>layered mandalas</B>: several thin sheets, each cut to a different pattern and glued on top of each other, so the layers below show through and the piece has real depth.</P>
      <P>Every design goes through the same five steps:</P>
      <Steps items={[<><B>Start</B> from a template or press Surprise me.</>, <><B>Shape it</B>: change layers, colours and shapes until you like it.</>, <><B>Set it up</B>: real size, material thickness, holes.</>, <><B>Check it</B>: the “Ready to make?” card tells you if anything will not hold together.</>, <><B>Export</B> the cut files and build it.</>]} />
      <h3>The screen</h3>
      <Fig src={shots.screen} alt="The whole app with its areas numbered" legend={['Tool rail', 'Panel for the chosen tool', 'Canvas with your design', 'Settings', 'View tabs', 'Guide and Tips', 'Zoom', 'Export']} />
      <List items={[<><B>Tool rail (1)</B>: Start, Motifs, Draw, Import, Project. Click a tool to open its panel (2); click it again to hide the panel.</>, <><B>Canvas (3)</B>: your design. The tabs (5) switch between 2D design, 3D preview and Cut sheets; zoom (7) is bottom-left.</>, <><B>Settings (4)</B>: layers, the selected shape, size and material, with the export button (8) at the bottom.</>]} />
      <Tip>New here? Open <B>Recipes → Your first mandala</B> in the list on the left. It takes about a minute.</Tip>
    </> },
    { id: 'start', group: 'Basics', title: 'Starting a design', body: <>
      <P>The <B>Start</B> panel is the quickest way to something good. Work down it:</P>
      <Fig side src={shots.start} alt="The Start panel" legend={['Layout', 'Style', 'Layers', 'Surprise me', 'More like this', 'Colours']} />
      <Steps items={[<><B>Layout</B>: Free form lets the pattern set its own outline. Circle, Square and Rectangle make a framed panel. “More shapes” adds hearts, stars and seasonal outlines; “Your SVG” uses your own outline.</>, <><B>Style</B>: pick one of the styles, or leave “Any style”.</>, <><B>Layers</B>: how many sheets you want, 3 to 8, or Any.</>, <>Press <B>Surprise me</B>. Each press is a brand-new design. Press as often as you like.</>]} />
      <List items={[<><B>More like this</B> makes a new design but keeps the style, layer count and colours of the current one.</>, <><B>Colours</B>: click a palette strip to recolour every layer at once.</>, <><B>Templates</B> are finished designs grouped by theme. Click one to load it; everything in it can be changed.</>]} />
      <Tip>Did not like the result? <B>Undo</B> (the arrow at the top right, or Ctrl/⌘ + Z) brings the previous design back, even after Surprise me.</Tip>
    </> },
    { id: 'layers', group: 'Basics', title: 'Layers and shapes', body: <>
      <P>A design is a stack of <B>layers</B>. Each layer is one sheet of material, listed in the Layers card with the top sheet first.</P>
      <Fig side src={shots.layers} alt="The Layers card" legend={['Colour', 'Name (click to rename)', 'Show or hide', 'Move up or down', 'Delete', 'Add a layer', 'Hide the layers above', 'Shapes on the selected layer']} />
      <List items={[<>Click a layer to make it the <B>selected layer</B>. New shapes are added to it.</>, <>The colour square recolours it; the eye hides it; the arrows move it up or down the stack; the bin deletes it.</>, <>Click the name to rename it.</>, <><B>Add layer on top</B> adds an empty sheet above the selected one.</>, <><B>Hide layers above the selected one</B> lets you see and edit a sheet that is buried under others.</>]} />
      <h3>What a shape does</h3>
      <P>Each shape on a layer has a <B>Role</B>:</P>
      <List items={[<><B>Material</B>: the shape is part of the sheet.</>, <><B>Window</B>: the shape is cut out of the sheet, so the layer below shows through.</>, <><B>Engrave</B>: the outline is scored onto the sheet instead of cut through.</>]} />
      <Samples><Mini make={roleSample('add')} label="Material: hearts are part of the sheet" /><Mini make={roleSample('cut')} label="Window: hearts are cut out" /><Mini make={roleSample('score')} label="Engrave: hearts are scored" /></Samples>
      <P>Shapes are applied in the order listed under “Shapes on…”, so a Window only removes material from the shapes above it in that list.</P>
      <Tip>Keep <B>Fill under upper layers</B> switched on (Size & material). It makes every sheet solid beneath the sheets above it, so each piece always has something to be glued to.</Tip>
    </> },
    { id: 'edit', group: 'Basics', title: 'Editing shapes', body: <>
      <Fig src={shots.edit} alt="A selected ring of petals and its settings" legend={['The selected shape, outlined in blue', 'Its settings', 'Count', 'Distance from centre', 'Role']} />
      <Steps items={[<><B>Select</B>: click a shape on the canvas, or its row under “Shapes on…”. It is outlined in blue and its settings appear in the “Selected” card.</>, <><B>Move</B>: drag it in or out from the centre. Hold <B>Shift</B> while dragging to turn it as well.</>, <><B>Change numbers</B>: click a number and type, or press on it and drag left or right. Hold Shift for big steps, Alt for fine steps.</>, <><B>Deselect</B>: click an empty part of the canvas or press Esc.</>]} />
      <h3>For a ring of motifs</h3>
      <List items={[<><B>Count</B>: how many copies go round.</>, <><B>Distance from centre</B>, <B>Length</B> and <B>Width</B>: where they sit and how big they are.</>, <><B>Turn ring</B> rotates the whole ring; <B>Spin each motif</B> rotates every copy on the spot.</>, <><B>Outline only</B>: leave it at 0 for a solid shape, or enter a width to keep just a frame.</>]} />
      <h3>Useful buttons</h3>
      <List items={[<><B>Duplicate</B> copies the shape, turned half a step so you can see it.</>, <><B>Break into separate shapes</B> turns a ring into single shapes you can move or delete one by one.</>, <><B>On layer</B> moves the shape to another sheet.</>, <><B>Order in layer</B> changes when it is applied, which matters for Windows.</>, <><B>Delete</B>, or press the Delete key.</>]} />
    </> },
    // ── Features ──
    { id: 'motifs', group: 'Features', title: 'Motifs, patterns and figures', body: <>
      <P>Open <B>Motifs</B> to add things to the selected layer. First choose what new shapes should be: <B>Add material</B> or <B>Cut a window</B>.</P>
      <div className="guide-pair"><Fig src={shots.motifs} alt="The top of the Motifs panel" /><Fig src={shots.motifs2} alt="Further down the Motifs panel" /></div>
      <ol className="guide-legend wide"><li><span>Add material or cut a window</span></li><li><span>Motif rings</span></li><li><span>Pattern curves</span></li><li><span>Figures</span></li></ol>
      <List items={[<><B>Motif rings</B>: petals, leaves, stars, hearts and more, repeated round the centre.</>, <><B>Discs & bands</B>: a solid disc, a ring band, or a disc with a scalloped, pointed, wavy or zigzag edge.</>, <><B>Pattern curves</B>: mathematical line patterns such as Spirograph, Rose curve, Star polygon and Flower of life. Each has its own controls once selected.</>, <><B>Figures</B>: pictures such as the pumpkin, turkey, reindeer and Santa. They arrive as one centrepiece and keep their proportions.</>]} />
      <Tip>Figures come as a <B>line drawing</B> and a <B>filled shape</B>. Put the filled shape on one layer and the drawing on the layer above for a finished look.</Tip>
    </> },
    { id: 'draw', group: 'Features', title: 'Drawing freehand', body: <>
      <P>Open <B>Draw</B>, then draw on the canvas with the mouse, a finger or a pen. Each stroke is repeated round the centre as you draw.</P>
      <Fig src={shots.draw} alt="Drawing a stroke that repeats round the centre" legend={['Brush settings', 'How many copies each stroke makes', 'The stroke, repeated as you draw']} />
      <List items={[<><B>Thickness</B>: how wide the line is, in real millimetres.</>, <><B>Repeats</B>: how many times it is copied round.</>, <><B>Mirror each repeat</B>: adds a flipped copy, which gives petal shapes instead of a pinwheel.</>]} />
      <P>The panel shows the total number of copies before you draw. Strokes go on the selected layer. To change one afterwards, pick another tool and click the stroke.</P>
      <Tip>Hold <B>Space</B> and drag to move the view while the Draw tool is open.</Tip>
    </> },
    { id: 'import', group: 'Features', title: 'Using your own artwork', body: <>
      <P>Open <B>Import</B> to bring in pictures and words.</P>
      <Fig side src={shots.import} alt="The Import panel while tracing a picture" legend={['Drop a file here', 'Preview of the traced shape', 'Darkness cut-off', 'Add it to the design', 'Or build a layered portrait', 'Type a name or word']} />
      <List items={[<><B>SVG</B>: filled shapes are used as they are. Outline-only drawings are thickened into lines that can be cut.</>, <><B>PNG or JPG</B>: the picture is traced to a silhouette. Move “Darkness cut-off” until the preview looks right, then press Add to design.</>, <><B>Name or word</B>: type it, choose a lettering style and press Add.</>, <><B>Photo portrait</B>: after choosing a photo, “Build a layered portrait instead” splits it into 2 to 6 tones, one per layer.</>]} />
      <P>Imported art behaves like any motif. It arrives as a centrepiece; raise <B>Count</B> and <B>Distance from centre</B> to repeat it round the mandala, or switch its Role to Window.</P>
      <Tip>Pictures with clear, dark shapes on a light background trace best. Fine pencil lines usually do not.</Tip>
    </> },
    { id: 'shapes', group: 'Features', title: 'Panels and shapes', body: <>
      <P>A layout other than Free form puts the mandala <B>inside an outline</B>. The outline becomes the bottom sheet, and every layer above is trimmed to it.</P>
      <Samples><Mini make={layoutSample(null)} label="Free form" /><Mini make={layoutSample('circle')} label="Circle" /><Mini make={layoutSample('square')} label="Square" /><Mini make={layoutSample('rect')} label="Rectangle" /><Mini make={layoutSample('heart')} label="Heart" /></Samples>
      <P>These five are the same pattern in different layouts.</P>
      <List items={[<><B>Step per layer</B> (Size & material): how far each sheet steps in from the one below.</>, <><B>Border width</B>: the frame kept round every layer. Set it to 0 for no frame.</>, <><B>Shape colour</B>: the colour of the bottom sheet.</>]} />
      <P>For your own outline, press <B>Your SVG</B> in the Start panel. Only the outer edge of your file is used, so a simple silhouette works best. Surprise me keeps generating inside the same shape until you choose Free form again.</P>
    </> },
    { id: 'size', group: 'Features', title: 'Size and material', body: <>
      <Fig side src={shots.size} alt="The Size and material card for a square panel" legend={['Design size', 'Sheet thickness', 'Step per layer (panels)', 'Border width (panels)', 'Fill under upper layers', 'Kerf compensation', 'Score glue guides']} />
      <List items={[<><B>Design size</B>: the real size of the longest side. Changing it scales everything. Files are exported at exactly this size.</>, <><B>Sheet thickness</B>: the thickness of your material; it sets the height shown in 3D.</>, <><B>Backplate</B>: an extra solid sheet behind everything, round, square, hexagonal or following the outline.</>, <><B>Fill under upper layers</B>: keep on, so every piece has something beneath it.</>, <><B>Kerf compensation</B>: the width your laser burns away. The cut lines are moved outward by half of it.</>, <><B>Score glue guides</B>: adds a light line on each sheet showing where the next one sits.</>, <><B>Preview finish</B>: wood grain or painted; this changes the look only, not the files.</>]} />
      <P>Use the <B>mm / inch</B> switch at the top of the panel to work in either unit.</P>
    </> },
    { id: 'make', group: 'Features', title: 'Make it a…', body: <>
      <P>The <B>Make it a…</B> card turns a design into a product.</P>
      <Fig src={shots.make} alt="A clock with Roman numerals and the Make it a card" legend={['Product', 'Clock dial', 'Ring behind the dial', 'Centre hole', 'Hanging hole', 'Alignment pin holes']} />
      <List items={[<><B>Product</B>: Wall art, Clock, Coaster, Ornament, Earring or Trivet. Each sets a sensible size and the holes it needs. Your choice stays shown; pick “Custom” to clear it.</>, <><B>Clock dial</B> (clocks only): hour marks, minute marks, dots, Roman numerals, numbers, or just 12 · 3 · 6 · 9. “Ring behind the dial” adds a plain ring so the marks stay readable over a busy pattern.</>, <><B>Centre hole</B>: goes through every sheet. 8 mm fits a standard quartz clock movement.</>, <><B>Hanging hole</B>: a small hole near the top. If the top of the design is too thin to take a hole, it is placed a little lower, in solid material.</>, <><B>Alignment pin holes</B>: two 3 mm holes through the whole stack. Push pins or toothpicks through while the glue sets.</>, <><B>Ornament loop on top</B> (Christmas designs only): a small tab with a hole for a ribbon. It replaces the hanging hole.</>]} />
    </> },
    { id: 'plan', group: 'Features', title: 'Machine and material plan', body: <>
      <Fig side src={shots.plan} alt="The Machine and material plan card" legend={['Preset', 'Thinnest detail', 'Your stock sheet size', 'Sheets needed, time and cost']} />
      <List items={[<><B>Preset</B>: choose your type of machine and material to fill in thickness, kerf, thinnest detail and sheet size.</>, <><B>Thinnest detail</B>: anything narrower than this is flagged in “Ready to make?”.</>, <><B>Stock sheet width and height</B>: the size of the material you buy.</>, <><B>Price per sheet</B> and <B>Cut speed</B>: used for the cost and time estimate.</>]} />
      <P>The card then shows how many sheets you need, the approximate cutting time and the material cost. The export includes the layers arranged on those sheets.</P>
      <Tip>Presets are starting points. Always confirm kerf and speed with a small test cut on your own machine.</Tip>
    </> },
    // ── Making ──
    { id: 'checks', group: 'Making it', title: 'Ready to make?', body: <>
      <P>This card checks the real geometry after every change.</P>
      <Fig side src={shots.checks} alt="The Ready to make card showing a problem" legend={['What is wrong', 'One click to fix it', 'Size, height, sheets and cut length']} />
      <List items={[<><B>Green</B>: every piece is supported and thick enough.</>, <><B>Red</B>: something will not hold together, such as a piece with nothing underneath to glue to, or a bottom sheet in several loose pieces.</>, <><B>Orange</B>: a caution, such as details thinner than your machine can cut, or a layer made of many separate pieces.</>]} />
      <P>Most messages have a button that fixes the problem in one click: <B>Add backplate</B> or <B>Fill under layers</B>.</P>
      <P>For “details are thinner than…”, make the design larger, raise “Outline only” or the line width on that layer, or set the fine layer to Engrave.</P>
    </> },
    { id: 'views', group: 'Making it', title: 'The three views', body: <>
      <Fig src={shots.views} alt="The same design in 2D, in 3D with the layers pulled apart, and as cut sheets" caption="The same design as 2D design, 3D preview (exploded) and Cut sheets." />
      <List items={[<><B>2D design</B>: where you edit.</>, <><B>3D preview</B>: the stack with real thickness. Drag to turn it, scroll to zoom. The <B>Explode</B> slider in Size & material pulls the sheets apart.</>, <><B>Cut sheets</B>: exactly what will be exported, one sheet per layer. Red lines are cut, blue lines are scored.</>]} />
      <P>Zoom with the mouse wheel or a pinch; drag an empty area to move. The buttons at the bottom left zoom in and out, and the last one fits the design to the window.</P>
    </> },
    { id: 'export', group: 'Making it', title: 'Export and assembly', body: <>
      <P>{IS_ATOMM ? <>Press <B>Export</B> at the bottom right. “Open in Studio” sends one file per sheet straight to xTool Studio.</> : <>Press <B>Export laser files</B> at the bottom right to download one ZIP.</>}</P>
      <Fig src={shots.export} alt="The Cut sheets view and the export button" legend={['Check the sheets in Cut sheets first', 'Then press the export button']} />
      <h3>What is in the pack</h3>
      <List items={[<><B>One SVG per sheet</B>, numbered from the bottom up, at real size in millimetres.</>, <><B>all-layers.svg</B>: every sheet on one page.</>, <><B>material-plan</B>: the sheets arranged on your stock material, if you entered a sheet size.</>, <><B>cutting-machine-layers.svg</B>: filled colour layers for Cricut and Silhouette.</>, <><B>assembly-guide.html</B>: a printable page with one picture per step.</>, <><B>project.mandala.json</B>: reopen it later to keep editing.</>]} />
      <h3>Building it</h3>
      <Steps items={['Cut every sheet from the same thickness. Do not rescale the files.', 'Lay the sheets out in number order, 01 at the bottom, and dry-fit them.', 'Glue from the bottom up with a thin, even coat kept a couple of millimetres inside the edges.', 'Press flat under a book until dry.']} />
    </> },
    !IS_ATOMM && { id: 'print', group: 'Making it', title: '3D printing', body: <>
      <P>Press <B>3D print files</B> and choose how to print:</P>
      <Fig src={shots.print} alt="The 3D print files window" />
      <List items={[<><B>One piece, swap filament by height</B>: a single STL for any printer. The README lists the height of each colour change.</>, <><B>Multi-colour 3MF</B>: one model with a coloured part per layer, for printers that change filament automatically.</>, <><B>Separate parts to glue</B>: one flat STL per layer.</>]} />
      <P>Set the thickness of each tier in the same window. Nothing needs supports, because every tier rests on the one below.</P>
    </> },
    { id: 'save', group: 'Making it', title: 'Saving and sharing', body: <>
      <P>Your work is saved in this browser as you go, so it is still there when you come back. For anything you want to keep safely, open <B>Project</B>:</P>
      <Fig side src={shots.project} alt="The Project panel" legend={['Save a picture', 'Save a colouring page', 'Record a turntable video', ...(IS_ATOMM ? [] : ['Copy share link']), 'Save project', 'Open project']} />
      <List items={[<><B>Save project</B> downloads a small file; <B>Open project</B> loads it again, on any computer.</>, <><B>Save a picture</B>: a shaded image of the design.</>, <><B>Save a colouring page</B>: black outlines on white.</>, <><B>Record a turntable video</B>: a six-second spin of the 3D model.</>, ...(IS_ATOMM ? [] : [<><B>Copy share link</B>: a link that opens this exact design.</>]), <><B>Blank canvas</B>: start from nothing. Undo brings the old design back.</>]} />
    </> },
    { id: 'keys', group: 'Making it', title: 'Shortcuts', body: <>
      <table className="guide-keys"><tbody>
        {[['Ctrl / ⌘ + Z', 'Undo'], ['Ctrl / ⌘ + Shift + Z', 'Redo'], ['Delete', 'Delete the selected shape'], ['Ctrl / ⌘ + D', 'Duplicate the selected shape'], ['Esc', 'Deselect'], ['Shift + drag a shape', 'Turn it while moving'], ['Space + drag', 'Move the view'], ['Mouse wheel / pinch', 'Zoom'], ['Drag on a number', 'Change it (Shift = big steps, Alt = fine)'], ['↑ / ↓ in a number field', 'Step the value']].map(([k, v]) => <tr key={k}><th scope="row">{k}</th><td>{v}</td></tr>)}
      </tbody></table>
    </> },
    { id: 'help', group: 'Making it', title: 'If something looks wrong', body: <>
      <List items={[<><B>I clicked a shape and something else was selected.</B> Shapes overlap. Pick it from the list under “Shapes on…” instead, or switch on “Hide layers above the selected one”.</>, <><B>A shape I added is not visible.</B> It is probably under a higher layer. Select a higher layer before adding, or move the shape with “On layer”.</>, <><B>A Window does nothing.</B> Windows only cut shapes above them in the list. Use “Order in layer” to move it later.</>, <><B>My imported picture is a solid blob.</B> Lower “Darkness cut-off”, or try “Light areas”.</>, <><B>The design is too detailed to cut.</B> Make it larger, choose fewer layers, or use one of the solid styles such as Lotus tiers.</>, <><B>I lost my design.</B> Press Undo. It also steps back through Surprise me and templates.</>]} />
    </> },
    // ── Recipes ──
    { id: 'r-first', group: 'Recipes', title: 'Your first mandala', start: { label: 'Open the Start panel', run: () => { setUI({ tool: 'templates', leadOpen: true, view: '2d' }); } }, body: <>
      <Facts time="1 minute" need="Nothing to prepare" />
      <Samples><Mini make={() => (generate(1184, 'lotus', 'sunset', 5))} label="A five-layer design from Surprise me" /></Samples>
      <Steps items={[<>In the <B>Start</B> panel, leave Layout on Free form and Style on Any style.</>, <>Under Layers, click <B>5</B>.</>, <>Press <B>Surprise me</B> until you see one you like.</>, <>Click a palette under <B>Colours</B> to try other colours.</>, <>Switch to <B>3D preview</B> at the top of the canvas and drag to look around.</>, <>In Size & material, set <B>Design size</B> to the size you want.</>, <>Check that “Ready to make?” is green, then press the export button.</>]} />
    </> },
    { id: 'r-name', group: 'Recipes', title: 'A name plaque', start: { label: 'Load the starting design', run: load(() => fitToFrame(generate(321, 'filigree', 'wood', 4), presetFrame('circle', 200)), 'Round panel loaded — add the name from Import', 'import') }, body: <>
      <Facts time="5 minutes" need="A name" />
      <Samples><Mini make={() => (fitToFrame(generate(321, 'filigree', 'wood', 4), presetFrame('circle', 200)))} label="The round panel this recipe starts from" /></Samples>
      <Steps items={[<>Press the button below to load a round four-layer panel.</>, <>In the Layers card, click <B>Add layer on top</B>.</>, <>Open <B>Import</B>, type the name under “Name or word”, pick a lettering style and press <B>Add</B>.</>, <>The name appears in the centre and is selected. Change <B>Length</B> and <B>Width</B> until it fits.</>, <>Click the new layer's colour square and choose a colour that stands out.</>, <>For a neat background, select the layer just below, open <B>Motifs</B>, and add a <B>Disc</B> a little larger than the name.</>, <>Check “Ready to make?” and export.</>]} />
      <Tip>Short names in the Bold lettering cut most reliably. Thin script letters need a larger design.</Tip>
    </> },
    { id: 'r-ornament', group: 'Recipes', title: 'A Christmas ornament', start: { label: 'Load the Snow crystal', run: load(() => product(tpl('x-snow'), 'ornament'), 'Ornament loaded at 80 mm with a loop') }, body: <>
      <Facts time="3 minutes" need="Thin material, 2–3 mm" />
      <Samples><Mini make={() => (product(tpl('x-snow'), 'ornament'))} label="The Snow crystal as an ornament, with its loop" /></Samples>
      <Steps items={[<>Press the button below. It loads the Snow crystal at 80 mm with the ornament loop on.</>, <>Prefer another design? Open <B>Start</B> and pick any template under <B>Christmas</B>, then in <B>Make it a…</B> choose <B>Ornament · 80 mm</B>. On a Christmas design this switches on the <B>Ornament loop on top</B> for you.</>, <>If you would rather have a plain hole, switch the loop off and set <B>Hanging hole</B> to about 3 mm.</>, <>Look at “Ready to make?”. At this size thin details are common: if it warns, lower the layer count or pick a bolder template.</>, <>Export, cut, glue, and thread a ribbon through the loop.</>]} />
    </> },
    { id: 'r-clock', group: 'Recipes', title: 'A wall clock', start: { label: 'Load a clock', run: load(() => applyDial(product(generate(77, 'lotus', 'wood', 5), 'clock'), 'roman'), 'Clock loaded with Roman numerals') }, body: <>
      <Facts time="5 minutes" need="A quartz clock movement" />
      <Samples><Mini make={() => (applyDial(product(generate(77, 'lotus', 'wood', 5), 'clock'), 'roman'))} label="A clock with Roman numerals" /></Samples>
      <Steps items={[<>Press the button below, or start from any design you like.</>, <>In <B>Make it a…</B>, set Product to <B>Clock · 300 mm</B>. This adds the 8 mm centre hole and alignment pins.</>, <>Choose a <B>Clock dial</B>: hour marks, dots, Roman numerals or numbers.</>, <>If the marks are hard to read against the pattern, switch on <B>Ring behind the dial</B>.</>, <>Measure the shaft of your clock movement and adjust <B>Centre hole</B> to match.</>, <>The dial is its own layer at the top of the Layers card. Click its colour square to change the colour of the marks.</>, <>Export and build. Fit the movement through the centre hole last.</>]} />
      <Tip>Check that the stack is not thicker than the threaded part of your movement's shaft. Fewer layers, or thinner material, gives a thinner clock.</Tip>
    </> },
    { id: 'r-coaster', group: 'Recipes', title: 'A coaster set', start: { label: 'Load a coaster', run: load(() => product(fitToFrame(generate(402, 'lace', 'ocean', 3), presetFrame('circle', 200)), 'coaster'), 'Coaster loaded at 95 mm') }, body: <>
      <Facts time="5 minutes" need="3 mm material and a sealant" />
      <Samples><Mini make={() => (product(fitToFrame(generate(402, 'lace', 'ocean', 3), presetFrame('circle', 200)), 'coaster'))} label="A three-layer coaster" /></Samples>
      <Steps items={[<>Press the button below for a round three-layer coaster at 95 mm.</>, <>For a matching set, press <B>More like this</B> in the Start panel. It keeps the style, layers and colours and changes the pattern.</>, <>Export each one as you go. The file name follows the name in <B>Project</B>, so rename each design first, for example “Coaster 1”.</>, <>In <B>Machine & material plan</B>, enter your sheet size to see how many coasters fit on a sheet.</>, <>After gluing, seal the top so drinks do not mark it.</>]} />
    </> },
    { id: 'r-portrait', group: 'Recipes', title: 'A layered photo portrait', start: { label: 'Open Import', run: () => setUI({ tool: 'import', leadOpen: true, view: '2d' }) }, body: <>
      <Facts time="5 minutes" need="A clear, well-lit photo" />
      <Steps items={[<>Open <B>Import</B> and choose a photo. A face or pet against a plain background works best.</>, <>Set <B>Photo tones</B> to 4 to start.</>, <>Press <B>Build a layered portrait instead</B>. This replaces the current design with one layer per tone, darkest on top.</>, <>Look at it in <B>3D preview</B>. If it is too blotchy, press Undo and try 3 tones; if it is too plain, try 5.</>, <>Recolour the layers in the Layers card, light at the bottom to dark at the top.</>, <>Set the Design size and export.</>]} />
    </> },
    { id: 'r-shape', group: 'Recipes', title: 'A mandala inside your own shape', start: { label: 'Open the Start panel', run: () => setUI({ tool: 'templates', leadOpen: true, view: '2d' }) }, body: <>
      <Facts time="3 minutes" need="An SVG outline, such as a logo or initial" />
      <Samples><Mini make={() => (fitToFrame(generate(207, 'filigree', 'forest', 4), presetFrame('heart', 200)))} label="A pattern grown inside a heart outline" /></Samples>
      <Steps items={[<>In the <B>Start</B> panel under Layout, press <B>Your SVG</B> and choose your file.</>, <>The current design is fitted inside your outline, which becomes the bottom sheet.</>, <>Set Style to <B>Filigree lotus</B> or <B>Star lace</B>; line-work fills odd shapes best.</>, <>Press <B>Surprise me</B> until the pattern suits the shape.</>, <>In Size & material, adjust <B>Step per layer</B> and <B>Border width</B>.</>, <>Export.</>]} />
      <Tip>Shapes with thin arms, such as animal legs, leave too little room for a pattern. Compact outlines work much better.</Tip>
    </> },
    { id: 'r-thanks', group: 'Recipes', title: 'A Thanksgiving panel', start: { label: 'Load the Turkey panel', run: load(() => tpl('t-turkey-r'), 'Turkey panel loaded') }, body: <>
      <Facts time="3 minutes" need="Nothing to prepare" />
      <Samples><Mini make={() => (tpl('t-turkey-r'))} label="The Turkey panel" /></Samples>
      <Steps items={[<>Press the button below to load the rectangular Turkey panel.</>, <>Try the <B>Harvest</B> and <B>Autumn</B> palettes under Colours.</>, <>To add a family name, click <B>Add layer on top</B>, open <B>Import</B> and add the name. To put it under the turkey, set <B>Distance from centre</B> to about a third of the design size, <B>Turn ring</B> to 180 and <B>Spin each motif</B> to 180.</>, <>Set <B>Design size</B> to the width you want on the wall.</>, <>Other starting points are under <B>Thanksgiving</B> in the template list, including round and leaf-shaped panels.</>]} />
    </> },
    { id: 'r-spiro', group: 'Recipes', title: 'Spirograph wall art', start: { label: 'Load a spirograph', run: load(() => tpl('p-spiro'), 'Spirograph loaded — click a line to change it') }, body: <>
      <Facts time="5 minutes" need="Nothing to prepare" />
      <Samples><Mini make={() => (tpl('p-spiro'))} label="A spirograph design" /></Samples>
      <Steps items={[<>Press the button below.</>, <>Click a line on the canvas. The Selected card shows the pattern's controls.</>, <>Change <B>Lobes</B> and <B>Skip</B> and watch the pattern change. <B>Loop size</B> makes the loops tighter or wider.</>, <>Select another layer in the Layers card and change its pattern too, so each layer differs.</>, <>Keep <B>Line width</B> at 2 mm or more so the lines survive cutting.</>, <>For a framed piece, choose <B>Circle</B> under Layout in the Start panel.</>]} />
    </> },
    !IS_ATOMM && { id: 'r-print', group: 'Recipes', title: 'A multi-colour 3D print', start: { label: 'Load a design to print', run: load(() => ({ ...generate(58, 'sunburst', 'sunset', 4), finish: 'plastic' as const }), 'Loaded — press 3D print files') }, body: <>
      <Facts time="5 minutes" need="Any 3D printer" />
      <Samples><Mini make={() => ({ ...generate(58, 'sunburst', 'sunset', 4), finish: 'plastic' as const })} label="A four-colour design with solid shapes" /></Samples>
      <Steps items={[<>Press the button below, or use any design with solid shapes. Four layers keep filament changes manageable.</>, <>Set <B>Design size</B> to fit your print bed.</>, <>Press <B>3D print files</B> and choose <B>One piece, swap filament by height</B>.</>, <>Set <B>Each tier</B> to a multiple of your layer height, such as 0.8 mm for 0.2 mm layers.</>, <>Download. The README lists the height of each colour change.</>, <>In your slicer, add a filament change at each of those heights, then print.</>]} />
    </> },
  ];
  return all.filter(Boolean) as Page[];
}

let lastPage = 'welcome';

export default function Guide({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const all = useMemo(() => (open ? pages() : []), [open]);
  const [id, setId] = useState(lastPage);
  const [query, setQuery] = useState('');
  useEffect(() => {
    const d = ref.current; if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  const go = (next: string) => { lastPage = next; setId(next); bodyRef.current?.scrollTo({ top: 0 }); };
  if (!open) return <dialog ref={ref} className="dialog guide" onClose={onClose} />;
  const index = Math.max(0, all.findIndex((p) => p.id === id));
  const page = all[index];
  const q = query.trim().toLowerCase();
  const shown = q ? all.filter((p) => (p.title + ' ' + p.group).toLowerCase().includes(q)) : all;
  const groups = [...new Set(shown.map((p) => p.group))];
  return (
    <dialog ref={ref} className="dialog guide" aria-labelledby="guide-title" onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      <div className="dialog-header"><span id="guide-title">Guide</span><span className="spacer" aria-hidden="true" />
        <button type="button" className="btn-icon btn-icon-sm" aria-label="Close guide" onClick={onClose}><Icon name="close" /></button></div>
      <div className="guide-main">
        <nav className="guide-nav" aria-label="Guide contents">
          <input className="input wide" type="search" placeholder="Find a topic" aria-label="Find a topic" value={query} onChange={(e) => setQuery(e.target.value)} />
          {groups.map((g) => (
            <div key={g} className="guide-group">
              <h4>{g}</h4>
              {shown.filter((p) => p.group === g).map((p) => <button key={p.id} type="button" className="guide-link" aria-current={p.id === page.id ? 'page' : undefined} onClick={() => go(p.id)}>{p.title}</button>)}
            </div>
          ))}
          {!shown.length && <p className="field-note flush">No topic matches “{query}”.</p>}
        </nav>
        <span className="select-field guide-jump">
          <select className="select" aria-label="Guide page" value={page.id} onChange={(e) => go(e.target.value)}>
            {[...new Set(all.map((p) => p.group))].map((g) => <optgroup key={g} label={g}>{all.filter((p) => p.group === g).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</optgroup>)}
          </select><Icon name="chevron" />
        </span>
        <div className="guide-body" ref={bodyRef} tabIndex={-1}>
          <div className="guide-page" key={page.id}>
          <p className="guide-crumb">{page.group}</p>
          <h2>{page.title}</h2>
          {page.body}
          {page.start && (
            <div className="guide-start">
              <button type="button" className="btn btn-primary" onClick={() => { page.start!.run(); onClose(); }}>{page.start.label}</button>
              <span>The guide closes so you can work. Open it again and you will be back on this page.</span>
            </div>
          )}
          </div>
        </div>
      </div>
      <div className="dialog-footer guide-footer">
        <span className="guide-count" aria-hidden="true">{index + 1} / {all.length}</span><span className="spacer" aria-hidden="true" />
        <button type="button" className="btn btn-secondary" disabled={index === 0} onClick={() => go(all[index - 1].id)}>Back</button>
        <button type="button" className="btn btn-primary" disabled={index === all.length - 1} onClick={() => go(all[index + 1].id)}>Next{index < all.length - 1 ? ': ' + all[index + 1].title : ''}</button>
      </div>
    </dialog>
  );
}

