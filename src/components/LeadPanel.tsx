// The lead rail: one panel per tool — Templates, Motifs, Draw, Import, Project.
import { useMemo, useRef, useState, type ReactNode } from 'react';
import type { CustomMotif, Design, Shape } from '../lib/types';
import { buildStack, designDiameter } from '../lib/build';
import { bbox, pathD } from '../lib/geom';
import { MOTIFS } from '../lib/motifs';
import { PATTERNS, curveShapes } from '../lib/curves';
import { PALETTES, STYLES, STYLE_LABELS, TEMPLATES, applyPalette, curve, disc, emptyDesign, generate, ring, type Style, type Template } from '../lib/recipes';
import { FONTS, importSvg, loadBitmap, photoLevels, textToMotif, toMotif, traceImageData } from '../lib/importArt';
import { coloringSvg } from '../lib/exportLaser';
import { turntable } from '../lib/turntable';
import { layer as mkLayer, paletteColors } from '../lib/recipes';
import { download, previewSvg, slugName, svgToPng } from '../lib/exportLaser';
import { encodeDesign, parseDesign } from '../lib/share';
import { IS_ATOMM } from '../lib/atomm';
import { addElement, getState, loadDesign, patchDesign, setDesign, setUI, toast, useStore, type Tool } from '../lib/store';
import { fitToFrame, makeFrame, presetFrame, templateDesign, PRESET_FRAMES } from '../lib/frame';
import { Alert, Icon, Segmented, Slider } from './ui';

const TITLES: Record<Tool, string> = { templates: 'Start', motifs: 'Motifs', draw: 'Draw', import: 'Import', project: 'Project' };

function Header({ tool }: { tool: Tool }) {
  return (
    <div className="gen-rail-header">
      <span className="gen-rail-title">{TITLES[tool]}</span>
      <button type="button" className="btn-plate" aria-label="Collapse panel" onClick={() => setUI({ leadOpen: false })}><Icon name="panel" /></button>
    </div>
  );
}

const thumbCache = new Map<string, { box: string; paths: { d: string; color: string }[] }>();
function templatePaths(t: Template) {
  let v = thumbCache.get(t.id);
  if (!v) {
    const stack = buildStack(templateDesign(t));
    const bb = bbox(stack.flatMap((l) => l.shapes)) ?? { minX: -100, minY: -100, maxX: 100, maxY: 100 };
    const half = Math.max(bb.maxX - bb.minX, bb.maxY - bb.minY) / 2 + 3;
    const cx = (bb.minX + bb.maxX) / 2, cy = (bb.minY + bb.maxY) / 2;
    v = { box: `${cx - half} ${cy - half} ${half * 2} ${half * 2}`, paths: stack.map((l) => ({ d: pathD(l.shapes, 1), color: l.color })) };
    thumbCache.set(t.id, v);
  }
  return v;
}

function ShapeThumb({ shapes, box = 1.16, aspect = 1 }: { shapes: Shape[]; box?: number; aspect?: number }) {
  const sx = aspect >= 1 ? 1 : aspect, sy = aspect >= 1 ? 1 / aspect : 1;
  return <svg viewBox={`${-box / 2} ${-box / 2} ${box} ${box}`} aria-hidden="true"><path d={pathD(shapes, 4)} transform={`scale(${sx} ${sy})`} fill="currentColor" fillRule="evenodd" /></svg>;
}

function OpToggle() {
  const op = useStore((s) => s.ui.addOp);
  return (
    <div className="rail-section">
      <Segmented label="New shapes" value={op} onChange={(v) => setUI({ addOp: v })} options={[{ id: 'add', label: 'Add material' }, { id: 'cut', label: 'Cut a window' }]} />
      <p className="field-note flush">{op === 'add' ? 'New shapes become part of the selected layer.' : 'New shapes are cut out of the selected layer, so the layer below shows through.'}</p>
    </div>
  );
}

/** Half the current design, or a sensible default for an empty canvas. */
const designR = (d: Design) => designDiameter(d) / 2 || 100;

const LAYER_CHOICES = [0, 3, 4, 5, 6, 7, 8];
const LAYOUTS = ['free', 'circle', 'square', 'rect'];

/** Load a generated design, keeping the shape the user is working inside (if any). */
function loadGenerated(d: Design) {
  loadDesign(fitToFrame(d, getState().design.frame));
}

/** New design. `like` keeps the current design's style, layer count and colours. */
function surprise(like = false) {
  const { genLayers, genStyle } = getState().ui;
  const cur = getState().design;
  const style = like ? cur.gen?.style ?? genStyle : genStyle;
  const layers = like ? cur.layers.length : genLayers;
  let d = generate(Math.floor(Math.random() * 2 ** 31), (style || undefined) as Style | undefined, undefined, layers || undefined);
  if (like && cur.layers.length) {
    const cols = cur.layers.map((l) => l.color);
    d = { ...d, finish: cur.finish, plateColor: cur.plateColor, layers: d.layers.map((l, i) => ({ ...l, color: cols[Math.min(i, cols.length - 1)] })) };
  }
  // finishing choices belong to the project, not to one roll of the dice
  d = { ...d, holes: cur.holes, sheet: cur.sheet, minFeature: cur.minFeature, thickness: cur.thickness, kerf: cur.kerf };
  loadGenerated(d);
}

function FrameIcon({ id }: { id: string }) {
  if (id === 'free') return <svg viewBox="-0.58 -0.58 1.16 1.16" aria-hidden="true"><path d={pathD(MOTIFS.find((m) => m.id === 'flower')!.shapes, 4)} fill="currentColor" /></svg>;
  const f = presetFrame(id, 1);
  const far = Math.max(...f.shapes.flatMap((sh) => sh.outer.map((q) => Math.max(Math.abs(q.x), Math.abs(q.y))))) * 2.3;
  return <svg viewBox={`${-far / 2} ${-far / 2} ${far} ${far}`} aria-hidden="true"><path d={pathD(f.shapes, 4)} fill="none" stroke="currentColor" strokeWidth="0.07" strokeLinejoin="round" /><path d={pathD(f.shapes, 4)} fill="currentColor" opacity="0.18" /></svg>;
}

function Templates() {
  const design = useStore((s) => s.design);
  const genLayers = useStore((s) => s.ui.genLayers);
  const genStyle = useStore((s) => s.ui.genStyle);
  const [err, setErr] = useState<string | null>(null);
  const [moreShapes, setMoreShapes] = useState(false);
  const size = () => { const d = getState().design; return designDiameter(d) || 200; };
  const frameId = !design.frame ? 'free' : PRESET_FRAMES.find((f) => f.label === design.frame!.name)?.id ?? 'custom';
  const setFrame = (f: ReturnType<typeof presetFrame> | null) => {
    const { genLayers: n, genStyle: st } = getState().ui;
    setDesign((d) => fitToFrame(d.layers.length ? d : generate(Date.now() % 1e6, (st || undefined) as Style | undefined, undefined, n || undefined), f));
  };
  async function onShapeFile(f: File | undefined) {
    if (!f) return;
    setErr(null);
    try {
      if (!/\.svg$/i.test(f.name) && f.type !== 'image/svg+xml') throw new Error('Upload the shape as an SVG file.');
      const { motif } = importSvg(await f.text(), f.name);
      setFrame({ ...makeFrame(motif.shapes, motif.aspect, size(), motif.name), rim: Math.max(2, size() * 0.016) });
      toast('Mandala fitted inside your shape');
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not read that shape.'); }
  }
  const shapeTile = (id: string, label: string) => (
    <button key={id} type="button" className="thumb thumb-sm" aria-pressed={frameId === id} onClick={() => setFrame(id === 'free' ? null : presetFrame(id, size()))}>
      <span className="thumb-card"><FrameIcon id={id} /></span><span className="thumb-label">{label}</span>
    </button>
  );
  const extra = PRESET_FRAMES.filter((f) => !LAYOUTS.includes(f.id));
  return (
    <>
      <div className="gen-rail-content">
        <div className="rail-section">
          <h4>1 · Layout</h4>
          <div className="thumb-grid-sm">
            {shapeTile('free', 'Free form')}
            {PRESET_FRAMES.filter((f) => LAYOUTS.includes(f.id)).map((f) => shapeTile(f.id, f.label))}
            {(moreShapes || extra.some((f) => f.id === frameId)) && extra.map((f) => shapeTile(f.id, f.label))}
          </div>
          <div className="inline-form">
            <button type="button" className="btn btn-secondary grow" onClick={() => setMoreShapes(!moreShapes)}>{moreShapes ? 'Fewer shapes' : 'More shapes'}</button>
            <label className="btn btn-secondary file-btn grow">
              <Icon name="upload" />Your SVG
              <input type="file" accept=".svg,image/svg+xml" aria-label="Shape outline file" onChange={(e) => { onShapeFile(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
          </div>
          {frameId === 'custom' && <p className="field-note flush">Growing inside “{design.frame!.name}”.</p>}
          {err && <Alert kind="error">{err}</Alert>}
        </div>
        <div className="rail-section">
          <h4>2 · Style</h4>
          <span className="select-field block">
            <select className="select" aria-label="Style" value={genStyle} onChange={(e) => setUI({ genStyle: e.target.value })}>
              <option value="">Any style</option>
              {STYLES.map((st) => <option key={st} value={st}>{STYLE_LABELS[st]}</option>)}
            </select>
            <Icon name="chevron" />
          </span>
        </div>
        <div className="rail-section">
          <h4>3 · Layers</h4>
          <Segmented label="Layers per design" value={String(genLayers)} onChange={(v) => setUI({ genLayers: +v })}
            options={LAYER_CHOICES.map((n) => ({ id: String(n), label: n ? String(n) : 'Any' }))} />
        </div>
        <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => surprise()}><Icon name="sparkle" />Surprise me</button>
        <button type="button" className="btn btn-secondary btn-block" disabled={!design.layers.length} onClick={() => surprise(true)}>More like this</button>
        <p className="field-note flush">Every press is a new {genStyle ? STYLE_LABELS[genStyle as Style].toLowerCase() : 'design'}{genLayers ? ` with ${genLayers} layers` : ''}{design.frame ? ` inside your ${design.frame.name.toLowerCase()}` : ''}. “More like this” keeps the style, layer count and colours. Undo brings the last one back.</p>
        <div className="rail-section">
          <h4>Colours</h4>
          <div className="palette-grid" role="group" aria-label="Colour palette">
            {PALETTES.map((p) => (
              <button key={p.id} type="button" className="palette" title={p.label} aria-label={p.label} onClick={() => setDesign((d) => applyPalette(d, p))}>
                {p.colors.map((c, i) => <i key={i} style={{ background: c }} />)}
              </button>
            ))}
          </div>
        </div>
      </div>
      {[['Christmas', TEMPLATES.filter((t) => t.group === 'Christmas')], ['Pattern algorithms', TEMPLATES.filter((t) => t.group === 'Pattern algorithms')], ['All styles', TEMPLATES.filter((t) => !t.group)]].map(([title, list]) => (
        <div key={title as string}>
          <div className="gen-rail-content"><h4>{title as string} ({(list as Template[]).length})</h4></div>
          <div className="thumb-grid" role="listbox" aria-label={`${title} templates`}>
            {(list as Template[]).map((t) => (
              <button key={t.id} type="button" className="thumb" role="option" aria-selected={design.name === t.label} onClick={() => loadDesign(templateDesign(t, genLayers || undefined))}>
                <span className="thumb-card"><svg viewBox={templatePaths(t).box} aria-hidden="true">{templatePaths(t).paths.map((p, i) => <path key={i} d={p.d} fill={p.color} fillRule="evenodd" />)}</svg></span>
                <span className="thumb-label">{t.label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

function addMotif(motif: string) {
  const { design, ui } = getState();
  const R = designR(design);
  const fig = MOTIFS.find((m) => m.id === motif && m.figure);
  if (fig) {
    // a figure keeps its proportions and arrives as one centrepiece
    const w = R * 1.2, a = fig.aspect ?? 1;
    addElement(ring({ motif, op: ui.addOp, count: 1, radius: 0, width: +(a >= 1 ? w : w * a).toFixed(1), length: +(a >= 1 ? w / a : w).toFixed(1) }));
    return;
  }
  const count = 12, radius = R * 0.55, length = R * 0.24;
  const width = Math.min(((2 * Math.PI * radius) / count) * 0.8, length * 0.75);
  addElement(ring({ motif, op: ui.addOp, count, radius, length: +length.toFixed(1), width: +width.toFixed(1) }));
}

export function addCustom(m: CustomMotif) {
  const { design, ui } = getState();
  const size = designR(design) * 0.7;
  const length = m.aspect >= 1 ? size / m.aspect : size, width = m.aspect >= 1 ? size : size * m.aspect;
  addElement(ring({ motif: 'custom:' + m.id, op: ui.addOp, count: 1, radius: 0, length: +length.toFixed(1), width: +width.toFixed(1) }));
}

const DISCS: { label: string; make: (R: number) => Parameters<typeof disc>[0]; icon: ReactNode }[] = [
  { label: 'Disc', make: (R) => ({ outer: R * 0.5 }), icon: <circle r="0.42" fill="currentColor" /> },
  { label: 'Ring', make: (R) => ({ outer: R * 0.6, inner: R * 0.5 }), icon: <circle r="0.36" fill="none" stroke="currentColor" strokeWidth="0.12" /> },
  { label: 'Scalloped', make: (R) => ({ outer: R * 0.55, edge: 'scallop', lobes: 12, depth: R * 0.06 }), icon: null },
  { label: 'Pointed', make: (R) => ({ outer: R * 0.55, edge: 'pointed', lobes: 12, depth: R * 0.08 }), icon: null },
  { label: 'Wavy', make: (R) => ({ outer: R * 0.55, edge: 'wave', lobes: 10, depth: R * 0.05 }), icon: null },
  { label: 'Zigzag', make: (R) => ({ outer: R * 0.55, edge: 'zigzag', lobes: 16, depth: R * 0.07 }), icon: null },
];

function edgeIcon(edge: string, lobes: number) {
  const pts: string[] = [];
  for (let i = 0; i < 180; i++) {
    const a = (i / 180) * Math.PI * 2, t = (lobes * a) / 2;
    const k = edge === 'scallop' ? 1 - Math.abs(Math.cos(t)) : edge === 'pointed' ? Math.abs(Math.sin(t)) : edge === 'wave' ? 0.5 - 0.5 * Math.cos(2 * t) : (() => { const u = (t / Math.PI) % 1; return u < 0.5 ? u * 2 : 2 - u * 2; })();
    const r = 0.46 - 0.09 * k;
    pts.push(`${(r * Math.sin(a)).toFixed(3)},${(-r * Math.cos(a)).toFixed(3)}`);
  }
  return <polygon points={pts.join(' ')} fill="currentColor" />;
}

function Motifs() {
  const custom = useStore((s) => s.design.customMotifs);
  return (
    <div className="gen-rail-content">
      <OpToggle />
      <div className="rail-section">
        <h4>Motif rings</h4>
        <div className="thumb-grid-sm">
          {MOTIFS.map((m) => (
            <button key={m.id} type="button" className="thumb thumb-sm" onClick={() => addMotif(m.id)}>
              <span className="thumb-card"><ShapeThumb shapes={m.shapes} aspect={m.aspect} /></span><span className="thumb-label">{m.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="rail-section">
        <h4>Discs &amp; bands</h4>
        <div className="thumb-grid-sm">
          {DISCS.map((d) => (
            <button key={d.label} type="button" className="thumb thumb-sm" onClick={() => { const s = getState(); addElement(disc({ ...d.make(designR(s.design)), op: s.ui.addOp })); }}>
              <span className="thumb-card"><svg viewBox="-0.58 -0.58 1.16 1.16" aria-hidden="true">{d.icon ?? edgeIcon(d.make(100).edge!, d.make(100).lobes!)}</svg></span><span className="thumb-label">{d.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="rail-section">
        <h4>Pattern curves</h4>
        <div className="thumb-grid-sm">
          {PATTERNS.map((p) => (
            <button key={p.id} type="button" className="thumb thumb-sm" onClick={() => { const st = getState(); const R = designR(st.design); addElement(curve({ pattern: p.id, op: st.ui.addOp, size: +(R * 0.8).toFixed(1), ...p.defaults, line: p.id === 'phyllo' ? +(R * 0.04).toFixed(1) : +(Math.max(1.8, R * 0.022)).toFixed(1) })); }}>
              <span className="thumb-card"><svg viewBox="-0.58 -0.58 1.16 1.16" aria-hidden="true"><path d={pathD(curveShapes(p.id, 0.5, p.defaults.a, p.defaults.b, p.defaults.c, p.id === 'phyllo' ? 0.1 : p.id === 'flowerlife' || p.id === 'web' || p.id === 'starpoly' || p.id === 'guilloche' ? 0.012 : 0.02), 4)} fill="currentColor" fillRule="evenodd" /></svg></span><span className="thumb-label">{p.label}</span>
            </button>
          ))}
        </div>
      </div>
      {custom.length > 0 && <Artwork custom={custom} />}
    </div>
  );
}

function Artwork({ custom }: { custom: CustomMotif[] }) {
  return (
    <div className="rail-section">
      <h4>Your artwork</h4>
      <div className="thumb-grid-sm">
        {custom.map((m) => (
          <button key={m.id} type="button" className="thumb thumb-sm" onClick={() => addCustom(m)}>
            <span className="thumb-card"><ShapeThumb shapes={m.shapes} box={1.1} aspect={m.aspect} /></span><span className="thumb-label clip">{m.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Draw() {
  const brush = useStore((s) => s.ui.brush);
  const set = (p: Partial<typeof brush>) => setUI({ brush: { ...brush, ...p } });
  const copies = brush.fold * (brush.mirror ? 2 : 1);
  return (
    <div className="gen-rail-content">
      <Alert kind="info"><p>Draw on the canvas — every stroke repeats <strong>{copies}×</strong> around the centre as you go.</p></Alert>
      <OpToggle />
      <div className="rail-section">
        <h4>Brush</h4>
        <div className="rail-fields">
          <Slider label="Thickness" value={brush.size} min={1.5} max={20} step={0.5} onChange={(v) => set({ size: v })} format={(v) => v + ' mm'} />
          <Slider label="Repeats" value={brush.fold} min={1} max={24} onChange={(v) => set({ fold: v })} format={(v) => v + '×'} />
          <div className="field-row"><span className="field-label">Mirror each repeat</span>
            <Segmented label="Mirror" value={brush.mirror ? 'on' : 'off'} onChange={(v) => set({ mirror: v === 'on' })} options={[{ id: 'on', label: 'On' }, { id: 'off', label: 'Off' }]} /></div>
        </div>
      </div>
      <p className="field-note flush">Hold Space and drag to move the view. Strokes land on the selected layer; pick another tool to select and edit them.</p>
    </div>
  );
}

function Import() {
  const custom = useStore((s) => s.design.customMotifs);
  const [err, setErr] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [bitmap, setBitmap] = useState<{ img: ImageData; name: string } | null>(null);
  const [threshold, setThreshold] = useState(50);
  const [invert, setInvert] = useState(false);
  const [text, setText] = useState('');
  const [font, setFont] = useState('bold');
  const [tones, setTones] = useState(4);

  const traced = useMemo(() => (bitmap ? traceImageData(bitmap.img, { threshold: threshold / 100, invert }) : []), [bitmap, threshold, invert]);

  const place = (m: CustomMotif) => {
    setDesign((d) => ({ ...d, customMotifs: [...d.customMotifs, m] }));
    addCustom(m);
    toast('Added as a centrepiece — raise Count to repeat it around');
  };

  async function onFile(f: File | undefined) {
    if (!f) return;
    setErr(null); setNotes([]); setBitmap(null);
    try {
      if (f.size > 12 * 1024 * 1024) throw new Error('That file is over 12 MB — try a smaller one.');
      if (/\.svg$/i.test(f.name) || f.type === 'image/svg+xml') {
        const r = importSvg(await f.text(), f.name);
        setNotes(r.notes); place(r.motif);
      } else if (/^image\/(png|jpeg|webp|gif)$/.test(f.type) || /\.(png|jpe?g|webp)$/i.test(f.name)) {
        setBitmap({ img: await loadBitmap(f), name: f.name });
      } else throw new Error('Use an SVG, PNG or JPG file.');
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not read that file.'); }
  }

  return (
    <div className="gen-rail-content">
      <label className="dropzone" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files[0]); }}>
        <span className="plate"><Icon name="upload" /></span>
        <strong>Click or drop your artwork</strong>
        <small>SVG shapes or outlines · PNG / JPG silhouettes</small>
        <input type="file" accept=".svg,.png,.jpg,.jpeg,.webp,image/svg+xml,image/png,image/jpeg,image/webp" aria-label="Artwork file" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
      </label>
      {err && <Alert kind="error">{err}</Alert>}
      {notes.map((n) => <Alert key={n} kind="info">{n}</Alert>)}

      {bitmap && (
        <div className="rail-section">
          <h4>Trace “{bitmap.name}”</h4>
          <div className="trace-preview">
            {traced.length ? <svg viewBox={`0 0 ${bitmap.img.width} ${bitmap.img.height}`} aria-label="Traced preview"><path d={pathD(traced, 1)} fill="currentColor" fillRule="evenodd" /></svg> : <span>Nothing dark enough — move the slider</span>}
          </div>
          <div className="rail-fields">
            <Slider label="Darkness cut-off" value={threshold} min={5} max={95} onChange={setThreshold} format={(v) => v + '%'} />
            <div className="field-row"><span className="field-label">Keep</span>
              <Segmented label="Keep" value={invert ? 'light' : 'dark'} onChange={(v) => setInvert(v === 'light')} options={[{ id: 'dark', label: 'Dark areas' }, { id: 'light', label: 'Light areas' }]} /></div>
          </div>
          <button type="button" className="btn btn-primary btn-block" disabled={!traced.length} onClick={() => { try { place(toMotif(traced, bitmap.name)); setBitmap(null); } catch (e) { setErr(e instanceof Error ? e.message : 'Trace failed.'); } }}>Add to design</button>
          <div className="rail-fields">
            <Slider label="Photo tones" value={tones} min={2} max={6} onChange={setTones} format={(v) => v + ' layers'} />
          </div>
          <button type="button" className="btn btn-secondary btn-block" onClick={() => {
            try {
              const motifs = photoLevels(bitmap.img, tones, bitmap.name);
              if (motifs.length < 2) throw new Error('This picture has too little contrast to split into tones.');
              const aspect = bitmap.img.width / bitmap.img.height, size = 160;
              const w = aspect >= 1 ? size : size * aspect, h = aspect >= 1 ? size / aspect : size;
              const cols = paletteColors(PALETTES.find((p) => p.id === 'mono')!, motifs.length + 1).reverse();
              const layers = [mkLayer('Paper', cols[0], [ring({ motif: 'square', count: 1, radius: 0, length: h, width: w })]),
                ...motifs.map((m, i) => mkLayer(`Tone ${i + 1}`, cols[i + 1], [ring({ motif: 'custom:' + m.id, count: 1, radius: 0, length: h, width: w })]))];
              loadDesign({ ...emptyDesign(), name: bitmap.name.replace(/\.[a-z0-9]+$/i, '') + ' portrait', layers, customMotifs: motifs, finish: 'painted', solidStack: false });
              setBitmap(null); toast('Layered portrait built — lightest sheet at the bottom');
            } catch (e) { setErr(e instanceof Error ? e.message : 'Could not build the portrait.'); }
          }}>Build a layered portrait instead</button>
          <p className="field-note flush">A portrait replaces the current design with one layer per tone, dark on top. Undo brings your design back.</p>
        </div>
      )}

      <div className="rail-section">
        <h4>Name or word</h4>
        <div className="inline-form">
          <input className="input grow" value={text} maxLength={24} placeholder="e.g. Maya" aria-label="Text to add" onChange={(e) => setText(e.target.value)} />
          <button type="button" className="btn btn-secondary" disabled={!text.trim()} onClick={() => { try { place(textToMotif(text.trim(), font)); setText(''); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not add text.'); } }}>Add</button>
        </div>
        <Segmented label="Lettering" value={font} onChange={setFont} options={FONTS.map((f) => ({ id: f.id, label: f.label }))} />
        <p className="field-note flush">Lettering uses fonts installed on this device, so Script looks different from one computer to the next.</p>
      </div>

      {custom.length > 0 && <Artwork custom={custom} />}
      <p className="field-note flush">Imported art behaves like any motif: select it, then change Count and Distance to repeat it around the mandala, or switch it to “Cut a window”.</p>
    </div>
  );
}

function Project() {
  const name = useStore((s) => s.design.name);
  const fileRef = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const cur = () => getState().design;
  return (
    <div className="gen-rail-content">
      <div className="rail-section">
        <h4>Name</h4>
        <input className="input wide" value={name} maxLength={60} aria-label="Project name" onChange={(e) => patchDesign({ name: e.target.value }, 'name')} />
      </div>
      <div className="rail-section">
        <h4>Share</h4>
        <button type="button" className="btn btn-secondary btn-block" onClick={async () => {
          try { download(await svgToPng(previewSvg(buildStack(cur()), 1600, '#f6f6f7')), slugName(cur()) + '.png'); toast('Picture saved'); }
          catch { toast('Could not render the picture'); }
        }}><Icon name="image" />Save a picture</button>
        <button type="button" className="btn btn-secondary btn-block" onClick={async () => {
          try { download(await svgToPng(coloringSvg(buildStack(cur()), 2000)), slugName(cur()) + '-colouring-page.png'); toast('Colouring page saved'); }
          catch { toast('Could not render the page'); }
        }}><Icon name="brush" />Save a colouring page</button>
        <button type="button" className="btn btn-secondary btn-block" disabled={recording} onClick={async () => {
          if (recording) return;
          setRecording(true);
          try {
            setUI({ view: '3d', explode: 0 });
            for (let i = 0; i < 40 && !turntable.record; i++) await new Promise((r) => setTimeout(r, 150)); // wait for the 3D view to load
            if (!turntable.record) throw new Error('3D view not ready');
            await new Promise((r) => setTimeout(r, 500));
            const blob = await turntable.record(6);
            download(blob, slugName(cur()) + '-turntable.' + (blob.type.includes('mp4') ? 'mp4' : 'webm'));
            toast('Turntable video saved');
          } catch { toast('This browser could not record the video'); }
          setRecording(false);
        }}><Icon name="cube" />{recording ? 'Recording 6 seconds…' : 'Record a turntable video'}</button>
        {!IS_ATOMM && (
          <button type="button" className="btn btn-secondary btn-block" onClick={async () => {
            try {
              const url = location.href.split('#')[0] + '#d=' + (await encodeDesign(cur()));
              await navigator.clipboard.writeText(url);
              toast(url.length > 8000 ? 'Link copied — it is long; a project file may travel better' : 'Share link copied');
            } catch { toast('Could not copy — save a project file instead'); }
          }}><Icon name="link" />Copy share link</button>
        )}
      </div>
      <div className="rail-section">
        <h4>Project file</h4>
        <button type="button" className="btn btn-secondary btn-block" onClick={() => download(new Blob([JSON.stringify(cur())], { type: 'application/json' }), slugName(cur()) + '.mandala.json')}><Icon name="download" />Save project</button>
        <button type="button" className="btn btn-secondary btn-block" onClick={() => fileRef.current?.click()}><Icon name="folder" />Open project</button>
        <input ref={fileRef} type="file" accept=".json,application/json" hidden aria-label="Project file" onChange={async (e) => {
          const f = e.target.files?.[0]; e.target.value = '';
          if (!f) return;
          const d = parseDesign(await f.text());
          if (d) { setErr(null); loadDesign(d); toast('Project opened'); } else setErr('That file is not a Mandala Stack Studio project.');
        }} />
        {err && <Alert kind="error">{err}</Alert>}
      </div>
      <div className="rail-section">
        <h4>Start over</h4>
        <button type="button" className="btn btn-secondary btn-block" onClick={() => { loadDesign({ ...emptyDesign(), name: 'My mandala' }); setUI({ tool: 'motifs' }); toast('Blank canvas — Undo brings the old design back'); }}><Icon name="plus" />Blank canvas</button>
      </div>
      <p className="field-note flush">Your work is saved in this browser as you go.</p>
    </div>
  );
}

export default function LeadPanel() {
  const tool = useStore((s) => s.ui.tool);
  return (
    <aside className="gen-rail gen-rail-lead" aria-label={TITLES[tool]}>
      <Header tool={tool} />
      <div className="gen-rail-scroll">
        {tool === 'templates' && <Templates />}
        {tool === 'motifs' && <Motifs />}
        {tool === 'draw' && <Draw />}
        {tool === 'import' && <Import />}
        {tool === 'project' && <Project />}
      </div>
    </aside>
  );
}
