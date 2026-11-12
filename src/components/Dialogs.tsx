import { useEffect, useMemo, useRef, useState } from 'react';
import { MIN_FEATURE, buildStack, computeStats, validate } from '../lib/build';
import { printTiers, printZip, type PrintMode } from '../lib/export3d';
import { download, slugName } from '../lib/exportLaser';
import { IS_ATOMM } from '../lib/atomm';
import { patchDesign, toast, useStore } from '../lib/store';
import { Alert, Icon, Num } from './ui';

function useDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current; if (!d) return;
    if (open && !d.open) d.showModal(); // native modal: traps focus and returns it to the trigger
    if (!open && d.open) d.close();
  }, [open]);
  return { ref, onClose, onClick: (e: React.MouseEvent) => { if (e.target === ref.current) onClose(); } };
}

const TIPS: { title: string; body: string }[] = [
  { title: 'Build it in layers', body: 'Each layer is one sheet of material. “Material” shapes add to the sheet; “Window” shapes cut through it so the sheet below shows. Start from a template or Surprise me, then click any shape to change it.' },
  { title: 'Real-world size', body: 'Everything is in real millimetres (or inches) and exports 1:1 — set Design size to what you want to hang on the wall. Do not rescale the files in your laser software.' },
  { title: 'Cut lines', body: 'Red hairlines are cut through. Blue lines (only if you turn on “Score glue guides”) are scored lightly to show where the next sheet sits. Colours are read by the machine, not by the eye.' },
  { title: 'Made to hold together', body: 'With “Fill under upper layers” on, every piece has a full sheet beneath it to glue to. The “Ready to make?” card flags loose pieces and details too thin to survive the cut, with one-click fixes.' },
  { title: 'Assembly', body: 'Cut all sheets from the same thickness. Stack in file order, 01 at the bottom, dry-fit, then glue from the bottom up with a thin coat kept 2 mm inside the edges. Press flat while it dries.' },
  ...(IS_ATOMM ? [] : [{ title: '3D printing', body: '“3D print files” gives you the same stack as one STL with filament-swap heights, a multi-colour 3MF, or flat parts to print and glue. Nothing needs supports — every tier rests on the one below.' }]),
];

export function TipsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dlg = useDialog(open, onClose);
  const [i, setI] = useState(0);
  useEffect(() => { if (open) setI(0); }, [open]);
  return (
    <dialog className="dialog" {...dlg} aria-labelledby="tips-title">
      <div className="dialog-header"><span id="tips-title">Fabrication Tips</span><Icon name="info" size={20} /><span className="spacer" aria-hidden="true" />
        <span className="sr-only" aria-live="polite">{i + 1} / {TIPS.length}</span>
        <button type="button" className="btn-icon btn-icon-sm" aria-label="Close" onClick={onClose}><Icon name="close" /></button></div>
      <div className="dialog-body"><div className="tip-slide"><h3>{TIPS[i].title}</h3><p>{TIPS[i].body}</p></div></div>
      <div className="dialog-footer"><div className="dots" aria-hidden="true">{TIPS.map((_, k) => <i key={k} aria-current={k === i || undefined} />)}</div><span className="spacer" aria-hidden="true" />
        <button type="button" className="btn btn-secondary" disabled={i === 0} onClick={() => setI(i - 1)}>Back</button>
        {i < TIPS.length - 1 ? <button type="button" className="btn btn-primary" onClick={() => setI(i + 1)}>Next</button> : <button type="button" className="btn btn-primary" onClick={onClose}>Done</button>}</div>
    </dialog>
  );
}

const MODES: { id: PrintMode; label: string; note: string }[] = [
  { id: 'fused', label: 'One piece — swap filament by height', note: 'A single STL for any printer. The README lists the height of each colour change.' },
  { id: '3mf', label: 'Multi-colour 3MF', note: 'One model with a coloured part per tier, for AMS / MMU printers. Tiers are nested so nothing prints in mid-air.' },
  { id: 'parts', label: 'Separate parts to glue', note: 'One flat STL per tier. Print each in its own colour and stack them like the laser version.' },
];

export function PrintDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dlg = useDialog(open, onClose);
  const design = useStore((s) => s.design);
  const [mode, setMode] = useState<PrintMode>('fused');
  const [busy, setBusy] = useState(false);
  const info = useMemo(() => {
    if (!open) return null;
    const stack = buildStack(design);
    return { stack, stats: computeStats(design, stack, 'print'), tiers: printTiers(design, stack, mode !== 'parts'), thin: validate(stack, MIN_FEATURE.print, true).filter((i) => i.id.startsWith('thin')), loose: mode === 'parts' ? validate(stack).filter((i) => i.id.startsWith('float') || i.id === 'bottom') : [] };
  }, [open, design, mode]);
  const go = async () => {
    if (!info) return;
    setBusy(true);
    try {
      const slug = slugName(design);
      download(await printZip(design, info.stack, mode, slug), `${slug}-3d-print.zip`);
      toast('3D print files downloaded'); onClose();
    } catch { toast('Could not build the 3D files'); }
    setBusy(false);
  };
  return (
    <dialog className="dialog" {...dlg} aria-labelledby="print-title">
      <div className="dialog-header"><span id="print-title">3D print files</span><Icon name="cube" size={20} /><span className="spacer" aria-hidden="true" />
        <button type="button" className="btn-icon btn-icon-sm" aria-label="Close" onClick={onClose}><Icon name="close" /></button></div>
      <div className="dialog-body print-body">
        <div className="form-field">
          <span className="form-label">How do you want to print it?</span>
          <div className="choice-list" role="radiogroup" aria-label="Print method">
            {MODES.map((m) => (
              <button key={m.id} type="button" role="radio" aria-checked={mode === m.id} className="choice" onClick={() => setMode(m.id)}>
                <span className="choice-mark" aria-hidden="true">{mode === m.id && <Icon name="check" />}</span>
                <span><strong>{m.label}</strong><small>{m.note}</small></span>
              </button>
            ))}
          </div>
        </div>
        <div className="form-field">
          <span className="form-label">Thickness</span>
          <div className="print-fields">
            <Num label="Each tier" value={design.print.layer} min={0.2} max={10} step={0.1} onChange={(v) => patchDesign({ print: { ...design.print, layer: v } }, 'pl')} />
            {design.plate !== 'none' && <Num label="Backplate" value={design.print.base} min={0.2} max={10} step={0.1} onChange={(v) => patchDesign({ print: { ...design.print, base: v } }, 'pb')} />}
          </div>
        </div>
        {info && (
          <>
            <p className="print-summary">{info.stats.sizeX.toFixed(0)} × {info.stats.sizeY.toFixed(0)} mm, {info.stats.height.toFixed(1)} mm tall · {info.tiers.length} colours</p>
            <ol className="swap-list" aria-label="Colour order, bottom to top">
              {info.tiers.map((t, i) => <li key={i}><i style={{ background: t.color }} aria-hidden="true" /><span>{t.name}</span><span className="z">{mode === 'parts' ? `${t.h} mm` : i === 0 ? 'start' : `swap at ${t.z0.toFixed(2)} mm`}</span></li>)}
            </ol>
            {info.thin.length > 0 && <Alert kind="warning">Some details are thinner than {MIN_FEATURE.print} mm — a 0.4 mm nozzle may skip them. Scale the design up or simplify those layers.</Alert>}
            {info.loose.map((i) => <Alert key={i.id} kind="warning">{i.message}</Alert>)}
          </>
        )}
      </div>
      <div className="dialog-footer"><span className="spacer" aria-hidden="true" />
        <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-primary" aria-busy={busy || undefined} disabled={!info?.tiers.length} onClick={go}><span>Download</span></button></div>
    </dialog>
  );
}
