// The parameters rail: header (units, undo/redo, reset) · property cards · pinned export footer.
import { useEffect, useMemo, useState } from 'react';
import type { CurveEl, DiscEl, EdgeStyle, Element, Finish, Issue, PlateShape, RingEl, StrokeEl } from '../lib/types';
import { MIN_FEATURE, buildStack, computeStats, designDiameter, scaleDesign, validate } from '../lib/build';
import { MOTIFS } from '../lib/motifs';
import { PATTERNS, patternDef } from '../lib/curves';
import { IS_ATOMM, type AtommStatus } from '../lib/atomm';
import { materialPlan } from '../lib/exportLaser';
import { MACHINES, PRODUCTS, applyMachine, applyProduct } from '../lib/presets';
import {
  addLayer, breakApart, duplicateElement, findElement, moveElementToLayer, moveLayer, patchDesign, patchElement, patchLayer,
  redo, removeElement, removeLayer, reorderElement, resetDesign, setDesign, setUI, undo, useStore,
} from '../lib/store';
import { Alert, Card, Icon, Note, Num, Row, SegRow, Segmented, Select, Slider, Swatch, Switch } from './ui';
import { fmtLen } from './SheetView';

function elementLabel(el: Element, motifName: (id: string) => string): string {
  if (el.kind === 'ring') return el.count > 1 ? `${el.count} × ${motifName(el.motif)}` : motifName(el.motif);
  if (el.kind === 'disc') return el.inner > 0 ? 'Ring band' : el.edge === 'plain' ? 'Disc' : 'Shaped disc';
  if (el.kind === 'curve') return patternDef(el.pattern).label;
  return `Brush stroke ×${el.fold * (el.mirror ? 2 : 1)}`;
}

function Layers() {
  const design = useStore((s) => s.design);
  const ui = useStore((s) => s.ui);
  const active = design.layers.find((l) => l.id === ui.activeLayer);
  const motifName = (id: string) => MOTIFS.find((m) => m.id === id)?.label ?? design.customMotifs.find((m) => 'custom:' + m.id === id)?.name ?? 'Motif';
  return (
    <Card title="Layers">
      <div className="layer-list" role="list">
        {design.layers.map((l, i) => ({ l, i })).reverse().map(({ l, i }) => (
          <div key={l.id} role="listitem" className="layer-row" data-active={l.id === ui.activeLayer || undefined} onClick={() => setUI({ activeLayer: l.id, selected: null })}>
            <Swatch label={`${l.name} colour`} value={l.color} onChange={(v) => patchLayer(l.id, { color: v }, 'col' + l.id)} />
            <input className="layer-name" value={l.name} maxLength={40} aria-label="Layer name" aria-current={l.id === ui.activeLayer || undefined}
              onFocus={() => setUI({ activeLayer: l.id })} onChange={(e) => patchLayer(l.id, { name: e.target.value }, 'name' + l.id)} />
            <button type="button" className="btn-icon btn-icon-sm" aria-label={l.visible ? `Hide ${l.name}` : `Show ${l.name}`} aria-pressed={!l.visible} onClick={(e) => { e.stopPropagation(); patchLayer(l.id, { visible: !l.visible }); }}><Icon name={l.visible ? 'eye' : 'eyeOff'} /></button>
            <button type="button" className="btn-icon btn-icon-sm" aria-label={`Move ${l.name} up`} disabled={i === design.layers.length - 1} onClick={(e) => { e.stopPropagation(); moveLayer(l.id, 1); }}><Icon name="up" /></button>
            <button type="button" className="btn-icon btn-icon-sm" aria-label={`Move ${l.name} down`} disabled={i === 0} onClick={(e) => { e.stopPropagation(); moveLayer(l.id, -1); }}><Icon name="down" /></button>
            <button type="button" className="btn-icon btn-icon-sm" aria-label={`Delete ${l.name}`} onClick={(e) => { e.stopPropagation(); removeLayer(l.id); }}><Icon name="trash" /></button>
          </div>
        ))}
      </div>
      <div className="card-actions">
        <button type="button" className="btn btn-secondary btn-block" onClick={() => addLayer()}><Icon name="plus" />Add layer on top</button>
      </div>
      <Switch label="Hide layers above the selected one" checked={ui.solo} onChange={(v) => setUI({ solo: v })} />
      {active && (
        <>
          <div className="sub-head">Shapes on {active.name}</div>
          {active.elements.length === 0 && <Note>Empty — add a motif, a disc or a brush stroke from the left.</Note>}
          <div className="layer-list" role="list">
            {active.elements.map((el) => (
              <div key={el.id} role="listitem" className="layer-row el-row" data-active={el.id === ui.selected || undefined}>
                <button type="button" className="el-pick" aria-pressed={el.id === ui.selected} onClick={() => setUI({ selected: el.id === ui.selected ? null : el.id })}>
                  <span className="tag">{el.op === 'cut' ? 'Cut' : el.op === 'score' ? 'Engrave' : 'Add'}</span>{elementLabel(el, motifName)}
                </button>
                <button type="button" className="btn-icon btn-icon-sm" aria-label="Delete shape" onClick={() => removeElement(el.id)}><Icon name="trash" /></button>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

const EDGES: { id: EdgeStyle; label: string }[] = [
  { id: 'plain', label: 'Plain' }, { id: 'scallop', label: 'Scalloped' }, { id: 'pointed', label: 'Pointed' }, { id: 'wave', label: 'Wavy' }, { id: 'zigzag', label: 'Zigzag' },
];

function Selected() {
  const design = useStore((s) => s.design);
  const selected = useStore((s) => s.ui.selected);
  const f = findElement(design, selected);
  if (!f) return <Card title="Selected shape"><Note>Click any shape on the canvas to edit it. Drag it to slide it in or out; hold Shift to turn it.</Note></Card>;
  const { el, layer } = f;
  const set = (p: Partial<RingEl> | Partial<DiscEl> | Partial<StrokeEl> | Partial<CurveEl>) => patchElement(el.id, p as Partial<Element>);
  const R = Math.max(designDiameter(design), 100);
  const motifs = [...MOTIFS.map((m) => ({ id: m.id, label: m.label })), ...design.customMotifs.map((m) => ({ id: 'custom:' + m.id, label: m.name }))];
  return (
    <Card title={el.kind === 'ring' ? 'Selected: motif ring' : el.kind === 'disc' ? 'Selected: disc' : el.kind === 'curve' ? 'Selected: pattern curve' : 'Selected: brush stroke'}>
      <SegRow label="Role" value={el.op} onChange={(v) => set({ op: v })} options={[{ id: 'add', label: 'Material' }, { id: 'cut', label: 'Window' }, { id: 'score', label: 'Engrave' }]} />
      {el.op === 'score' && <Note>Engraved as a blue score line on this layer — visible in 2D design and Cut sheets, not in the 3D preview.</Note>}
      {el.kind === 'ring' && (
        <>
          <Select label="Motif" value={el.motif} options={motifs} onChange={(v) => set({ motif: v })} />
          <Num label="Count" value={el.count} min={1} max={96} integer unit="×" onChange={(v) => set({ count: v })} />
          <Num label="Distance from centre" value={el.radius} min={0} max={R * 2} step={0.5} onChange={(v) => set({ radius: v })} />
          <Num label="Length" value={el.length} min={0.5} max={R * 3} step={0.5} onChange={(v) => set({ length: v })} />
          <Num label="Width" value={el.width} min={0.5} max={R * 3} step={0.5} onChange={(v) => set({ width: v })} />
          <Num label="Turn ring" value={el.rotate} min={-360} max={360} step={1} unit="°" onChange={(v) => set({ rotate: v })} />
          <Num label="Spin each motif" value={el.spin} min={-360} max={360} step={5} unit="°" onChange={(v) => set({ spin: v })} />
          <Num label="Outline only" value={el.outline} min={0} max={Math.min(el.length, el.width) / 2} step={0.1} onChange={(v) => set({ outline: v })} />
          <Note>Outline 0 keeps the motif solid; any other value leaves just a frame that wide.</Note>
        </>
      )}
      {el.kind === 'disc' && (
        <>
          <Num label="Outer radius" value={el.outer} min={1} max={R * 2} step={0.5} onChange={(v) => set({ outer: v })} />
          <Num label="Hole radius" value={el.inner} min={0} max={el.outer - 0.5} step={0.5} onChange={(v) => set({ inner: v })} />
          <Select label="Edge" value={el.edge} options={EDGES} onChange={(v) => set({ edge: v })} />
          {el.edge !== 'plain' && (
            <>
              <Num label="Lobes" value={el.lobes} min={2} max={96} integer unit="×" onChange={(v) => set({ lobes: v })} />
              <Num label="Edge depth" value={el.depth} min={0} max={el.outer * 0.8} step={0.5} onChange={(v) => set({ depth: v })} />
              <Num label="Turn" value={el.rotate} min={-360} max={360} step={1} unit="°" onChange={(v) => set({ rotate: v })} />
            </>
          )}
        </>
      )}
      {el.kind === 'curve' && (() => {
        const def = patternDef(el.pattern);
        return (
          <>
            <Select label="Pattern" value={el.pattern} options={PATTERNS.map((p) => ({ id: p.id as string, label: p.label }))} onChange={(v) => set({ pattern: v, ...patternDef(v).defaults })} />
            <Num label="Radius" value={el.size} min={2} max={R * 2} step={0.5} onChange={(v) => set({ size: v })} />
            <Num label={def.a} value={el.a} min={def.aRange[0]} max={def.aRange[1]} integer unit="×" onChange={(v) => set({ a: v })} />
            <Num label={def.b} value={el.b} min={def.bRange[0]} max={def.bRange[1]} integer unit="×" onChange={(v) => set({ b: v })} />
            <Slider label={def.c} value={Math.round(el.c * 100)} min={0} max={100} onChange={(v) => set({ c: v / 100 })} format={(v) => v + '%'} />
            <Num label={el.pattern === 'phyllo' ? 'Dot size' : 'Line width'} value={el.line} min={0.3} max={30} step={0.1} onChange={(v) => set({ line: v })} />
            <Num label="Turn" value={el.rotate} min={-360} max={360} step={1} unit="°" onChange={(v) => set({ rotate: v })} />
          </>
        );
      })()}
      {el.kind === 'stroke' && (
        <>
          <Num label="Thickness" value={el.size} min={0.5} max={40} step={0.5} onChange={(v) => set({ size: v })} />
          <Num label="Repeats" value={el.fold} min={1} max={48} integer unit="×" onChange={(v) => set({ fold: v })} />
          <Switch label="Mirror each repeat" checked={el.mirror} onChange={(v) => set({ mirror: v })} />
        </>
      )}
      {design.layers.length > 1 && <Select label="On layer" value={layer.id} options={design.layers.map((l) => ({ id: l.id, label: l.name }))} onChange={(v) => moveElementToLayer(el.id, v)} />}
      <Row label="Order in layer">
        <div className="control">
          <button type="button" className="btn-icon btn-icon-sm" aria-label="Apply earlier" onClick={() => reorderElement(el.id, -1)}><Icon name="up" /></button>
          <button type="button" className="btn-icon btn-icon-sm" aria-label="Apply later" onClick={() => reorderElement(el.id, 1)}><Icon name="down" /></button>
        </div>
      </Row>
      {el.kind === 'ring' && el.count > 1 && (
        <div className="card-actions">
          <button type="button" className="btn btn-secondary btn-block" onClick={() => breakApart(el.id)}>Break into {el.count} separate shapes</button>
        </div>
      )}
      <div className="card-actions two">
        <button type="button" className="btn btn-secondary" onClick={() => duplicateElement(el.id)}><Icon name="copy" />Duplicate</button>
        <button type="button" className="btn btn-danger" onClick={() => removeElement(el.id)}><Icon name="trash" />Delete</button>
      </div>
    </Card>
  );
}

const PLATES: { id: PlateShape; label: string }[] = [
  { id: 'none', label: 'None' }, { id: 'round', label: 'Round' }, { id: 'square', label: 'Square' }, { id: 'hexagon', label: 'Hexagon' }, { id: 'outline', label: 'Follow shape' },
];

function Build() {
  const design = useStore((s) => s.design);
  const view = useStore((s) => s.ui.view);
  const explode = useStore((s) => s.ui.explode);
  const dia = useMemo(() => designDiameter(design), [design]);
  const finishes: { id: Finish; label: string }[] = [{ id: 'wood', label: 'Wood grain' }, { id: 'painted', label: 'Painted' }, ...(IS_ATOMM ? [] : [{ id: 'plastic' as Finish, label: '3D print' }])];
  return (
    <Card title="Size & material">
      <Num label="Design size" value={dia} min={20} max={1200} step={1} onChange={(v) => dia > 0 && setDesign((d) => scaleDesign(d, v / dia), 'scale')} />
      <Num label="Sheet thickness" value={design.thickness} min={0.5} max={12} step={0.1} onChange={(v) => patchDesign({ thickness: v }, 'thick')} />
      {design.frame && (
        <>
          <Num label="Step per layer" value={design.frame.step} min={0} max={30} step={0.1} onChange={(v) => patchDesign({ frame: { ...design.frame!, step: v } }, 'fstep')} />
          <Num label="Border width" value={design.frame.rim ?? 0} min={0} max={30} step={0.1} onChange={(v) => patchDesign({ frame: { ...design.frame!, rim: v } }, 'frim')} />
          <Row label="Shape colour"><Swatch label="Shape colour" value={design.plateColor} onChange={(v) => patchDesign({ plateColor: v }, 'pc')} /></Row>
          <Note>Your {design.frame.name.toLowerCase()} is the bottom sheet; each layer above steps in by this much.</Note>
        </>
      )}
      {!design.frame && <Select label="Backplate" value={design.plate} options={PLATES} onChange={(v) => patchDesign({ plate: v })} />}
      {!design.frame && design.plate !== 'none' && (
        <>
          <Num label="Backplate margin" value={design.plateMargin} min={0} max={100} step={0.5} onChange={(v) => patchDesign({ plateMargin: v }, 'pm')} />
          <Row label="Backplate colour"><Swatch label="Backplate colour" value={design.plateColor} onChange={(v) => patchDesign({ plateColor: v }, 'pc')} /></Row>
        </>
      )}
      <Switch label="Fill under upper layers" checked={design.solidStack} onChange={(v) => patchDesign({ solidStack: v })} />
      <Note>On: every sheet is solid beneath the ones above it, so each piece has something to glue to.</Note>
      {view !== '3d' && (
        <>
          <Num label="Kerf compensation" value={design.kerf} min={0} max={1} step={0.01} onChange={(v) => patchDesign({ kerf: v }, 'kerf')} />
          <Switch label="Score glue guides" checked={design.guides} onChange={(v) => patchDesign({ guides: v })} />
          <Note>Kerf and guides apply to the cut files — see them in the Cut sheets view.</Note>
        </>
      )}
      <Select label="Preview finish" value={design.finish} options={finishes} onChange={(v) => patchDesign({ finish: v })} />
      {view === '3d' && <Slider label="Explode" value={Math.round(explode * 100)} min={0} max={100} onChange={(v) => setUI({ explode: v / 100 })} format={(v) => v + '%'} />}
    </Card>
  );
}

/** A select that applies a preset when picked, then returns to its prompt. */
function Apply({ label, prompt, options, onPick }: { label: string; prompt: string; options: { id: string; label: string }[]; onPick: (id: string) => void }) {
  return (
    <div className="field-row">
      <span className="field-label">{label}</span>
      <span className="select-field">
        <select className="select wide-select" aria-label={label} value="" onChange={(e) => e.target.value && onPick(e.target.value)}>
          <option value="">{prompt}</option>
          {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        <Icon name="chevron" />
      </span>
    </div>
  );
}

function Finishing() {
  const design = useStore((s) => s.design);
  const h = design.holes ?? { centre: 0, hang: 0, pins: false };
  const set = (p: Partial<typeof h>) => patchDesign({ holes: { ...h, ...p } }, 'holes');
  const [note, setNote] = useState('');
  return (
    <Card title="Make it a…" defaultOpen={false}>
      <Apply label="Product" prompt="Choose…" options={PRODUCTS} onPick={(id) => { const p = PRODUCTS.find((x) => x.id === id)!; setDesign((d) => applyProduct(d, p)); setNote(p.note); }} />
      {note && <Note>{note}</Note>}
      <Num label="Centre hole" value={h.centre} min={0} max={60} step={0.5} onChange={(v) => set({ centre: v })} />
      <Num label="Hanging hole" value={h.hang} min={0} max={20} step={0.2} onChange={(v) => set({ hang: v })} />
      <Switch label="Alignment pin holes" checked={h.pins} onChange={(v) => set({ pins: v })} />
      <Note>Holes go through every sheet. Two 3 mm pins (or toothpicks) keep the layers lined up while the glue sets.</Note>
    </Card>
  );
}

function PlanCard() {
  const design = useStore((s) => s.design);
  const unit = useStore((s) => s.ui.unit);
  const sh = design.sheet ?? { w: 0, h: 0, price: 0, speed: 10 };
  const set = (p: Partial<typeof sh>) => patchDesign({ sheet: { ...sh, ...p } }, 'sheet');
  const plan = useMemo(() => materialPlan(design, buildStack(design)), [design]);
  return (
    <Card title="Machine & material plan" defaultOpen={false}>
      <Apply label="Preset" prompt="Choose…" options={MACHINES} onPick={(id) => setDesign((d) => applyMachine(d, MACHINES.find((m) => m.id === id)!))} />
      <Note>Presets are starting points — confirm kerf and speed with a test cut.</Note>
      <Num label="Thinnest detail" value={design.minFeature ?? MIN_FEATURE.laser} min={0.2} max={5} step={0.1} onChange={(v) => patchDesign({ minFeature: v }, 'minf')} />
      <Num label="Stock sheet width" value={sh.w} min={0} max={3000} step={10} onChange={(v) => set({ w: v })} />
      <Num label="Stock sheet height" value={sh.h} min={0} max={3000} step={10} onChange={(v) => set({ h: v })} />
      <Num label="Price per sheet" value={sh.price} min={0} max={100000} step={0.5} unit="" onChange={(v) => set({ price: v })} />
      <Num label="Cut speed (mm/s)" value={sh.speed} min={0.5} max={2000} step={1} unit="" onChange={(v) => set({ speed: v })} />
      {!plan && <Note>Enter your sheet size to see how many sheets the design needs.</Note>}
      {plan && (
        <>
          <Row label="Sheets needed"><span className="value">{plan.sheets}</span></Row>
          <Row label="Cutting time (approx.)"><span className="value">{plan.minutes < 90 ? Math.round(plan.minutes) + ' min' : (plan.minutes / 60).toFixed(1) + ' h'}</span></Row>
          {sh.price > 0 && <Row label="Material cost"><span className="value">{plan.cost.toFixed(2)}</span></Row>}
          {plan.tooBig.length > 0 && <div className="check-list"><Alert kind="error">{plan.tooBig.join(', ')} {plan.tooBig.length > 1 ? 'do' : 'does'} not fit a {fmtLen(sh.w, unit)} × {fmtLen(sh.h, unit)} sheet. Reduce Design size or use a larger sheet.</Alert></div>}
          <Note>The export adds a material-plan folder with the layers arranged on these sheets. Time counts cutting moves only.</Note>
        </>
      )}
    </Card>
  );
}

export function useChecks() {
  const design = useStore((s) => s.design);
  const [issues, setIssues] = useState<Issue[]>([]);
  useEffect(() => {
    // geometry checks trail the edit by a beat so dragging stays smooth
    const t = setTimeout(() => setIssues(validate(buildStack(design), design.minFeature ?? MIN_FEATURE.laser, design.solidStack)), 220);
    return () => clearTimeout(t);
  }, [design]);
  return issues;
}

function Checks({ issues }: { issues: Issue[] }) {
  const design = useStore((s) => s.design);
  const unit = useStore((s) => s.ui.unit);
  const stats = useMemo(() => computeStats(design, buildStack(design)), [design]);
  const fix = (a: 'plate' | 'solid') => (a === 'plate' ? patchDesign({ plate: 'round' }) : patchDesign({ solidStack: true }));
  return (
    <Card title="Ready to make?">
      <div className="check-list">
        {issues.length === 0 && <Alert kind="success">Every piece is supported and thick enough to cut.</Alert>}
        {issues.map((i) => (
          <Alert key={i.id} kind={i.level === 'error' ? 'error' : 'warning'}>
            <p>{i.message}</p>
            {i.fix && <button type="button" className="btn btn-secondary btn-sm" onClick={() => fix(i.fix!.action)}>{i.fix.label}</button>}
          </Alert>
        ))}
      </div>
      <Row label="Finished size"><span className="value">{fmtLen(stats.sizeX, unit)} × {fmtLen(stats.sizeY, unit)}</span></Row>
      <Row label="Stack height"><span className="value">{fmtLen(stats.height, unit, 1)}</span></Row>
      <Row label="Sheets · pieces"><span className="value">{stats.layers} · {stats.pieces}</span></Row>
      <Row label="Total cut length"><span className="value">{unit === 'in' ? (stats.cutLength / 25.4).toFixed(0) + ' in' : (stats.cutLength / 1000).toFixed(2) + ' m'}</span></Row>
    </Card>
  );
}

export default function ParamsRail({ atomm, onExport, onPrint, exporting }: { atomm: AtommStatus; onExport: () => void; onPrint: () => void; exporting: boolean }) {
  const unit = useStore((s) => s.ui.unit);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const empty = useStore((s) => s.design.layers.every((l) => l.elements.length === 0));
  const issues = useChecks();
  return (
    <aside className="gen-rail gen-rail-params" aria-label="Parameters">
      <div className="gen-params-header">
        <Segmented label="Units" value={unit} onChange={(v) => setUI({ unit: v })} options={[{ id: 'mm', label: 'mm' }, { id: 'in', label: 'inch' }]} />
        <div className="control">
          <button type="button" className="btn-icon" aria-label="Undo" disabled={!canUndo} onClick={undo}><Icon name="undo" /></button>
          <button type="button" className="btn-icon" aria-label="Redo" disabled={!canRedo} onClick={redo}><Icon name="redo" /></button>
          <button type="button" className="btn btn-secondary" onClick={resetDesign}><Icon name="reset" />Reset</button>
        </div>
      </div>
      <div className="gen-rail-scroll">
        <div className="gen-params-content">
          <Layers />
          <Selected />
          <Build />
          <Finishing />
          <PlanCard />
          <Checks issues={issues} />
        </div>
      </div>
      <div className="gen-rail-footer">
        {/* The platform SDK renders its export button into this slot; React never puts children in it. */}
        {IS_ATOMM && <div data-atomm-export-button="" hidden={atomm === 'unavailable'} />}
        {(!IS_ATOMM || atomm === 'unavailable') && (
          <button type="button" className="btn btn-primary btn-block" disabled={empty} aria-busy={exporting || undefined} onClick={onExport}><span>Export laser files</span></button>
        )}
        {!IS_ATOMM && <button type="button" className="btn btn-secondary btn-block" disabled={empty} onClick={onPrint}><Icon name="cube" />3D print files</button>}
      </div>
    </aside>
  );
}
