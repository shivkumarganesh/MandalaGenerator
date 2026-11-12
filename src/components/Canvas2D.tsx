// The 2D design view: the assembled stack drawn from the shared BuiltLayer[], with direct
// manipulation — click a shape to select it, drag it to move its ring in or out, or draw
// freehand with live radial symmetry when the Draw tool is open.
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import type { Element, Pt } from '../lib/types';
import { buildStack, elementShapes, strokeOutline } from '../lib/build';
import { bbox, pathD, pointInShapes } from '../lib/geom';
import { uid } from '../lib/recipes';
import { addElement, findElement, getState, patchElement, setUI, useStore } from '../lib/store';
import { usePanZoom, type ZoomApi } from './panzoom';

export default function Canvas2D({ zoomRef, onPct }: { zoomRef: MutableRefObject<ZoomApi | null>; onPct: (p: number) => void }) {
  const design = useStore((s) => s.design);
  const ui = useStore((s) => s.ui);
  const stack = useMemo(() => buildStack(design), [design]);
  const activeIdx = design.layers.findIndex((l) => l.id === ui.activeLayer);
  const shown = ui.solo && activeIdx >= 0 ? stack.filter((l) => l.srcIndex <= activeIdx) : stack;
  const drawing = ui.tool === 'draw' && ui.leadOpen;

  const content = useMemo(() => {
    const bb = bbox(stack.flatMap((l) => l.shapes));
    const r = bb ? Math.max(Math.abs(bb.minX), Math.abs(bb.maxX), Math.abs(bb.minY), Math.abs(bb.maxY), 30) : 100;
    const q = Math.ceil(r / 10) * 10; // quantise so small edits do not re-fit the view
    return { cx: 0, cy: 0, w: q * 2, h: q * 2 };
  }, [stack]);
  const pz = usePanZoom(content, zoomRef, onPct);
  const [stroke, setStroke] = useState<number[][] | null>(null);
  const strokeRef = useRef<number[][] | null>(null);
  const [busy, setBusy] = useState(false); // drop the shadows while dragging for a steady frame rate
  const space = useRef(false);

  useEffect(() => {
    const kd = (e: KeyboardEvent) => { if (e.code === 'Space') space.current = true; };
    const ku = (e: KeyboardEvent) => { if (e.code === 'Space') space.current = false; };
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); };
  }, []);

  const sel = findElement(design, ui.selected);
  const selD = useMemo(() => (sel ? pathD(elementShapes(sel.el, design.customMotifs)) : ''), [sel?.el, design.customMotifs]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Topmost element under the point: layers top → bottom, later elements first. */
  function hit(p: Pt): { el: Element; layerId: string } | null {
    const d = getState().design;
    const top = ui.solo && activeIdx >= 0 ? activeIdx : d.layers.length - 1;
    for (let i = top; i >= 0; i--) {
      const l = d.layers[i];
      if (!l.visible) continue;
      for (let k = l.elements.length - 1; k >= 0; k--)
        if (pointInShapes(p, elementShapes(l.elements[k], d.customMotifs))) return { el: l.elements[k], layerId: l.id };
    }
    return null;
  }

  function onPointerDown(e: React.PointerEvent) {
    if (pz.pinching.current) return;
    if (e.button === 1 || space.current || e.button === 2) { pz.startPan(e); return; }
    if (e.button !== 0) return;
    const p = pz.toMm(e.clientX, e.clientY);

    if (drawing) {
      const pts = [[p.x, p.y, e.pressure || 0.5]];
      strokeRef.current = pts; setStroke(pts);
      const move = (ev: PointerEvent) => {
        if (pz.pinching.current) { strokeRef.current = null; setStroke(null); end(); return; }
        const q = pz.toMm(ev.clientX, ev.clientY);
        const cur = strokeRef.current; if (!cur) return;
        const last = cur[cur.length - 1];
        if (Math.hypot(q.x - last[0], q.y - last[1]) < 0.5) return;
        const next = [...cur, [q.x, q.y, ev.pressure || 0.5]];
        strokeRef.current = next; setStroke(next);
      };
      const end = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); };
      const up = () => {
        end();
        const cur = strokeRef.current; strokeRef.current = null; setStroke(null);
        if (!cur) return;
        const { brush, addOp } = getState().ui;
        addElement({ id: uid(), kind: 'stroke', op: addOp, pts: cur.map((q) => [+q[0].toFixed(2), +q[1].toFixed(2), +q[2].toFixed(2)]), size: brush.size, fold: brush.fold, mirror: brush.mirror });
        setUI({ selected: null }); // keep drawing; strokes are picked up again from the list or by clicking with another tool
      };
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
      return;
    }

    const h = hit(p);
    if (!h) { pz.startPan(e, (moved) => { if (!moved) setUI({ selected: null }); }); return; }
    setUI({ selected: h.el.id, activeLayer: h.layerId });
    const el = h.el;
    if (el.kind === 'stroke') return;
    const r0 = Math.hypot(p.x, p.y), a0 = Math.atan2(p.y, p.x);
    const key = 'drag:' + el.id + ':' + Date.now();
    let moved = false;
    const move = (ev: PointerEvent) => {
      const q = pz.toMm(ev.clientX, ev.clientY);
      const dr = Math.hypot(q.x, q.y) - r0;
      if (!moved && Math.abs(dr) * pz.z < 3 && !ev.shiftKey) return;
      if (!moved) { moved = true; setBusy(true); }
      const da = ((Math.atan2(q.y, q.x) - a0) * 180) / Math.PI;
      if (el.kind === 'ring') {
        // a centrepiece (radius 0, single copy) scales instead of sliding outward
        if (el.count === 1 && el.radius === 0) { const k = Math.max(0.05, (r0 + dr) / Math.max(r0, 0.5)); patchElement(el.id, { length: +(el.length * k).toFixed(2), width: +(el.width * k).toFixed(2), ...(ev.shiftKey ? { rotate: +(el.rotate + da).toFixed(1) } : {}) }, key); }
        else patchElement(el.id, { radius: Math.max(0, +(el.radius + dr).toFixed(2)), ...(ev.shiftKey ? { rotate: +(el.rotate + da).toFixed(1) } : {}) }, key);
      } else {
        const k = Math.max(0.05, (r0 + dr) / Math.max(r0, 0.5));
        patchElement(el.id, { outer: +(el.outer * k).toFixed(2), inner: +(el.inner * k).toFixed(2), ...(ev.shiftKey ? { rotate: +(el.rotate + da).toFixed(1) } : {}) }, key);
      }
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); setBusy(false); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  }

  const strokeD = useMemo(() => (stroke ? pathD(strokeOutline(stroke, ui.brush.size)) : ''), [stroke, ui.brush.size]);
  const fold = Math.max(1, ui.brush.fold);
  const guideR = content.w * 0.75;
  const blur = content.w * 0.004;

  return (
    <div className="gen-canvas-stage canvas-ltr" data-drawing={drawing || undefined}>
      <svg ref={pz.svgRef} className="canvas-svg" viewBox={pz.viewBox} onPointerDown={onPointerDown} onContextMenu={(e) => e.preventDefault()}
        role="img" aria-label={`${design.name}: ${stack.length} layers`}>
        <defs>
          <filter id="lift" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy={blur * 0.9} stdDeviation={blur} floodColor="#000" floodOpacity="0.4" />
          </filter>
        </defs>
        {drawing && (
          <g className="fold-guides">
            {Array.from({ length: fold }, (_, i) => {
              const a = (i / fold) * Math.PI * 2 - Math.PI / 2;
              return <line key={i} x1="0" y1="0" x2={Math.cos(a) * guideR} y2={Math.sin(a) * guideR} />;
            })}
            <circle r={content.w / 2} />
          </g>
        )}
        {shown.map((l) => (
          <g key={l.id}>
            <path d={pathD(l.shapes)} fill={l.color} fillRule="evenodd" filter={busy || stroke ? undefined : 'url(#lift)'} />
            {l.score.length > 0 && <path className="score-line" d={pathD(l.score)} />}
          </g>
        ))}
        {sel && selD && <path className={sel.el.op === 'cut' ? 'sel-outline sel-cut' : 'sel-outline'} d={selD} fillRule="evenodd" />}
        {stroke && Array.from({ length: fold }, (_, i) => (
          <g key={i} transform={`rotate(${(i * 360) / fold})`}>
            <path className="live-stroke" d={strokeD} />
            {ui.brush.mirror && <path className="live-stroke" d={strokeD} transform="scale(-1 1)" />}
          </g>
        ))}
      </svg>
      {!stack.length && <p className="gen-canvas-hint canvas-empty">Pick a template, or add a motif — your mandala appears here</p>}
    </div>
  );
}
