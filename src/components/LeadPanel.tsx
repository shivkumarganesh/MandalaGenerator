// The lead rail: one panel per tool — Templates, Motifs, Draw, Import, Project.
import { useMemo, useRef, useState, type ReactNode } from 'react';
import type { CustomMotif, Design, Shape } from '../lib/types';
import { buildStack, designDiameter } from '../lib/build';
import { pathD } from '../lib/geom';
import { MOTIFS } from '../lib/motifs';
import { PALETTES, TEMPLATES, applyPalette, disc, emptyDesign, fromTemplate, generate, ring, type Template } from '../lib/recipes';
import { importSvg, loadBitmap, textToMotif, toMotif, traceImageData } from '../lib/importArt';
import { download, previewSvg, slugName, svgToPng } from '../lib/exportLaser';
import { encodeDesign, parseDesign } from '../lib/share';
import { IS_ATOMM } from '../lib/atomm';
import { addElement, getState, loadDesign, patchDesign, setDesign, setUI, toast, useStore, type Tool } from '../lib/store';
import { fitToFrame, makeFrame, presetFrame, PRESET_FRAMES } from '../lib/frame';
import { MOTIFS as ALL_MOTIFS } from '../lib/motifs';
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

const thumbCache = new Map<string, { d: string; color: string }[]>();
function templatePaths(t: Template) {
  let v = thumbCache.get(t.id);
  if (!v) { v = buildStack(fromTemplate(t)).map((l) => ({ d: pathD(l.shapes, 1), color: l.color })); thumbCache.set(t.id, v); }
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

/** Load a generated design, keeping the shape the user is working inside (if any). */
function loadGenerated(d: Design) {
  loadDesign(fitToFrame(d, getState().design.frame));
}

function Templates() {
  const design = useStore((s) => s.design);
  const genLayers = useStore((s) => s.ui.genLayers);
  const [err, setErr] = useState<string | null>(null);
  const size = () => { const d = getState().design; return designDiameter(d) || 200; };
  const setFrame = (f: ReturnType<typeof presetFrame> | null) => {
    setDesign((d) => fitToFrame(d.layers.length ? d : generate(Date.now() % 1e6, undefined, undefined, getState().ui.genLayers || undefined), f));
  };
  async function onShapeFile(f: File | undefined) {
    if (!f) return;
    setErr(null);
    try {
      if (!/\.svg$/i.test(f.name) && f.type !== 'image/svg+xml') throw new Error('Upload the shape as an SVG file.');
      const { motif } = importSvg(await f.text(), f.name);
      setFrame(makeFrame(motif.shapes, motif.aspect, size(), motif.name));
      toast('Mandala fitted inside your shape');
    } catch (e) { setErr(e instanceof Error ? e.message : 'Could not read that shape.'); }
  }
  return (
    <>
      <div className="gen-rail-content">
        <div className="rail-section">
          <h4>Layers per design</h4>
          <Segmented label="Layers per design" value={String(genLayers)} onChange={(v) => setUI({ genLayers: +v })}
            options={LAYER_CHOICES.map((n) => ({ id: String(n), label: n ? String(n) : 'Any' }))} />
        </div>
        <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => loadGenerated(generate(Math.floor(Math.random() * 2 ** 31), undefined, undefined, genLayers || undefined))}>
          <Icon name="sparkle" />Surprise me
        </button>
        <p className="field-note flush">Every press is a new design{genLayers ? ` with ${genLayers} layers` : ''}{design.frame ? `, grown inside your ${design.frame.name.toLowerCase()}` : ''}. Undo brings the last one back.</p>
        <div className="rail-section">
          <h4>Grow it inside a shape</h4>
          <div className="thumb-grid-sm">
            <button type="button" className="thumb thumb-sm" aria-pressed={!design.frame} onClick={() => setFrame(null)}>
              <span className="thumb-card"><svg viewBox="-0.58 -0.58 1.16 1.16" aria-hidden="true"><circle r="0.42" fill="none" stroke="currentColor" strokeWidth="0.05" strokeDasharray="0.1 0.08" /></svg></span><span className="thumb-label">Free</span>
            </button>
            {PRESET_FRAMES.map((f) => (
              <button key={f.id} type="button" className="thumb thumb-sm" aria-pressed={design.frame?.name === ALL_MOTIFS.find((m) => m.id === f.id)?.label} onClick={() => setFrame(presetFrame(f.id, size()))}>
                <span className="thumb-card"><ShapeThumb shapes={presetFrame(f.id, 1).shapes} box={1.2} /></span><span className="thumb-label">{f.label}</span>
              </button>
            ))}
          </div>
          <label className="btn btn-secondary btn-block file-btn">
            <Icon name="upload" />Upload your own shape (SVG)
            <input type="file" accept=".svg,image/svg+xml" aria-label="Shape outline file" onChange={(e) => { onShapeFile(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          {design.frame && !PRESET_FRAMES.some((f) => ALL_MOTIFS.find((m) => m.id === f.id)?.label === design.frame!.name) && <p className="field-note flush">Growing inside “{design.frame.name}”.</p>}
          {err && <Alert kind="error">{err}</Alert>}
        </div>
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
        <h4>Templates</h4>
      </div>
      <div className="thumb-grid" role="listbox" aria-label="Templates">
        {TEMPLATES.map((t) => (
          <button key={t.id} type="button" className="thumb" role="option" aria-selected={design.name === t.label + ' mandala'} onClick={() => loadGenerated(genLayers ? { ...generate(t.seed, t.style, t.palette, genLayers), name: t.label + ' mandala' } : fromTemplate(t))}>
            <span className="thumb-card"><svg viewBox="-104 -104 208 208" aria-hidden="true">{templatePaths(t).map((p, i) => <path key={i} d={p.d} fill={p.color} fillRule="evenodd" />)}</svg></span>
            <span className="thumb-label">{t.label}</span>
          </button>
        ))}
      </div>
    </>
  );
}

function addMotif(motif: string) {
  const { design, ui } = getState();
  const R = designR(design);
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
              <span className="thumb-card"><ShapeThumb shapes={m.shapes} /></span><span className="thumb-label">{m.label}</span>
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
        </div>
      )}

      <div className="rail-section">
        <h4>Name or word</h4>
        <div className="inline-form">
          <input className="input grow" value={text} maxLength={24} placeholder="e.g. Maya" aria-label="Text to add" onChange={(e) => setText(e.target.value)} />
          <button type="button" className="btn btn-secondary" disabled={!text.trim()} onClick={() => { try { place(textToMotif(text.trim())); setText(''); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not add text.'); } }}>Add</button>
        </div>
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
