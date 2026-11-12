// Layout 5 of the atomm Generator UI: tool rail · lead panel · canvas · parameters rail.
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { buildStack } from './lib/build';
import { IS_ATOMM, platformToast, useAtommExport, useAtommStatus, type ExportResult } from './lib/atomm';
import { download, laserFiles, laserZip, slugName } from './lib/exportLaser';
import { decodeDesign } from './lib/share';
import { duplicateElement, getState, loadDesign, redo, removeElement, setUI, toast, undo, useStore, type Tool, type View } from './lib/store';
import Canvas2D from './components/Canvas2D';
import SheetView from './components/SheetView';
import LeadPanel from './components/LeadPanel';
import ParamsRail from './components/ParamsRail';
import { PrintDialog, TipsDialog } from './components/Dialogs';
import { Icon, Segmented } from './components/ui';
import type { ZoomApi } from './components/panzoom';

const Preview3D = lazy(() => import('./components/Preview3D'));

const TOOLS: { id: Tool; label: string; icon: string }[] = [
  { id: 'templates', label: 'Start', icon: 'sparkle' },
  { id: 'motifs', label: 'Motifs', icon: 'petal' },
  { id: 'draw', label: 'Draw', icon: 'brush' },
  { id: 'import', label: 'Import', icon: 'upload' },
  { id: 'project', label: 'Project', icon: 'folder' },
];

const VIEWS: { id: View; label: string }[] = [{ id: '2d', label: '2D design' }, { id: '3d', label: '3D preview' }, { id: 'sheets', label: 'Cut sheets' }];
const ZOOMS = [50, 100, 200, 400];

async function buildExport(intent?: string): Promise<ExportResult> {
  const d = getState().design; // always the latest design, never a cached blob
  const stack = buildStack(d);
  if (intent === 'openInStudio') return laserFiles(d, stack);
  return { filename: `${slugName(d)}-laser.zip`, blob: await laserZip(d, stack) };
}

export default function App() {
  const tool = useStore((s) => s.ui.tool);
  const leadOpen = useStore((s) => s.ui.leadOpen);
  const view = useStore((s) => s.ui.view);
  const toastMsg = useStore((s) => s.ui.toast);
  const atomm = useAtommStatus();
  const [tips, setTips] = useState(false);
  const [print, setPrint] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [pct, setPct] = useState(100);
  const [zoomMenu, setZoomMenu] = useState(false);
  const zoomRef = useRef<ZoomApi | null>(null);
  const onPct = useCallback((p: number) => setPct(p), []);
  const lastToast = useRef('');
  if (toastMsg) lastToast.current = toastMsg; // keep the words while the toast fades out

  useAtommExport(async (intent) => {
    const r = await buildExport(intent);
    platformToast(intent === 'openInStudio' ? 'Sent to Studio' : 'Layer pack exported', 'success');
    return r;
  });

  const exportNow = useCallback(async () => {
    setExporting(true);
    try {
      const r = (await buildExport()) as { filename: string; blob: Blob };
      download(r.blob, r.filename);
      toast('Laser files downloaded');
    } catch { toast('Export failed — try again'); }
    setExporting(false);
  }, []);

  // a shared design arrives in the URL hash
  useEffect(() => {
    const m = /^#d=(.+)$/.exec(location.hash);
    if (!m) return;
    decodeDesign(m[1]).then((d) => {
      if (d) { loadDesign(d); toast('Opened a shared design'); } else toast('That share link could not be read');
      history.replaceState(null, '', location.pathname + location.search);
    });
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') { if (typing && (t as HTMLInputElement).type !== 'range') return; e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
      if (typing) return;
      const sel = getState().ui.selected;
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel) { e.preventDefault(); removeElement(sel); }
      else if (mod && e.key.toLowerCase() === 'd' && sel) { e.preventDefault(); duplicateElement(sel); }
      else if (e.key === 'Escape') setUI({ selected: null });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!zoomMenu) return;
    const close = () => setZoomMenu(false);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [zoomMenu]);

  return (
    <div className="gen-app">
      <div className="gen-body">
        <nav className="gen-rail gen-rail-tools" aria-label="Tools">
          {TOOLS.map((t) => (
            <button key={t.id} type="button" className="rail-item" aria-pressed={tool === t.id && leadOpen}
              onClick={() => (tool === t.id ? setUI({ leadOpen: !leadOpen }) : setUI({ tool: t.id, leadOpen: true }))}>
              <span className="plate"><Icon name={t.icon} /></span>{t.label}
            </button>
          ))}
        </nav>

        {leadOpen && <LeadPanel />}

        <main className="gen-canvas" aria-label="Canvas">
          {view === '2d' && <Canvas2D zoomRef={zoomRef} onPct={onPct} />}
          {view === 'sheets' && <SheetView zoomRef={zoomRef} onPct={onPct} />}
          {view === '3d' && (
            <Suspense fallback={<div className="gen-canvas-stage"><p className="gen-canvas-hint">Loading 3D preview…</p></div>}>
              <Preview3D zoomRef={zoomRef} onPct={onPct} />
            </Suspense>
          )}
          <div className="gen-canvas-top">
            <Segmented tabs label="View" value={view} options={VIEWS} onChange={(v) => setUI({ view: v })} />
            <button type="button" className="btn-tips gen-tips" onClick={() => setTips(true)}>
              <svg className="icon icon-20" viewBox="0 0 20 20" aria-hidden="true"><path d="M7.5 15.5h5M8.5 17.8h3M10 2.2a5 5 0 0 1 3 9c-.6.5-.9 1.1-.9 1.8H7.9c0-.7-.3-1.3-.9-1.8a5 5 0 0 1 3-9Z" /></svg>Tips
            </button>
          </div>
          <div className="gen-canvas-bottom">
            <div className="zoom-cluster" role="group" aria-label="Zoom">
              <button type="button" aria-label="Zoom out" onClick={() => zoomRef.current?.zoomBy(1 / 1.25)}><Icon name="minus" /></button>
              <span className="zoom-pop">
                <button type="button" className="zoom-readout" aria-haspopup="true" aria-expanded={zoomMenu} onPointerDown={(e) => e.stopPropagation()} onClick={() => setZoomMenu(!zoomMenu)}>{pct}%</button>
                {zoomMenu && (
                  <div className="select-list zoom-menu zoom-menu-pop" role="menu" aria-label="Zoom level" onPointerDown={(e) => e.stopPropagation()}>
                    {ZOOMS.map((z) => <button key={z} type="button" className="select-option" role="menuitem" onClick={() => { zoomRef.current?.zoomTo(z); setZoomMenu(false); }}>{z}%</button>)}
                  </div>
                )}
              </span>
              <button type="button" aria-label="Zoom in" onClick={() => zoomRef.current?.zoomBy(1.25)}><Icon name="plus" /></button>
              <button type="button" aria-label="Fit to canvas" onClick={() => zoomRef.current?.fit()}><Icon name="fit" /><span className="tooltip" aria-hidden="true">Fit to canvas</span></button>
            </div>
          </div>
        </main>

        <ParamsRail atomm={atomm} exporting={exporting} onExport={exportNow} onPrint={() => setPrint(true)} />
      </div>

      <TipsDialog open={tips} onClose={() => setTips(false)} />
      {!IS_ATOMM && <PrintDialog open={print} onClose={() => setPrint(false)} />}
      <div className="toast" role="status" data-show={toastMsg ? '' : undefined}>{toastMsg ?? lastToast.current}</div>
    </div>
  );
}
