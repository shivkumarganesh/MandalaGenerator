// Free zoom / pan for the SVG views: wheel and pinch anchor on the pointer, drag pans,
// and the view keeps auto-fitting until the user takes over.
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MutableRefObject } from 'react';
import type { Pt } from '../lib/types';

export interface ZoomApi { zoomBy: (f: number) => void; zoomTo: (pct: number) => void; fit: () => void }
export interface Content { cx: number; cy: number; w: number; h: number }
interface ViewState { z: number; cx: number; cy: number }

export function usePanZoom(content: Content, zoomRef: MutableRefObject<ZoomApi | null>, onPct: (p: number) => void) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<ViewState>({ z: 1, cx: 0, cy: 0 });
  const auto = useRef(true);
  const pinching = useRef(false);
  const fitZ = size.w > 0 ? Math.min(size.w / content.w, size.h / content.h) * 0.74 : 1;
  const live = useRef({ view, fitZ, size, content });
  live.current = { view, fitZ, size, content };

  useEffect(() => {
    const el = svgRef.current; if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (size.w > 0 && auto.current) setView({ z: fitZ, cx: content.cx, cy: content.cy });
  }, [size.w, size.h, content.cx, content.cy, content.w, content.h, fitZ]);

  useEffect(() => { if (size.w > 0) onPct(Math.round((view.z / fitZ) * 100)); }, [view.z, fitZ, size.w, onPct]);

  const toMm = useCallback((clientX: number, clientY: number): Pt => {
    const { view: v, size: s } = live.current;
    const r = svgRef.current!.getBoundingClientRect();
    return { x: v.cx + (clientX - r.left - s.w / 2) / v.z, y: v.cy + (clientY - r.top - s.h / 2) / v.z };
  }, []);

  const zoomAt = useCallback((factor: number, clientX?: number, clientY?: number) => {
    const { view: v, fitZ: f, size: s } = live.current;
    const r = svgRef.current?.getBoundingClientRect();
    if (!r) return;
    const px = (clientX ?? r.left + s.w / 2) - r.left - s.w / 2, py = (clientY ?? r.top + s.h / 2) - r.top - s.h / 2;
    const z = Math.min(f * 20, Math.max(f * 0.2, v.z * factor));
    const mx = v.cx + px / v.z, my = v.cy + py / v.z;
    auto.current = false;
    setView({ z, cx: mx - px / z, cy: my - py / z });
  }, []);

  useEffect(() => {
    zoomRef.current = {
      zoomBy: (f) => zoomAt(f),
      zoomTo: (pct) => zoomAt(((pct / 100) * live.current.fitZ) / live.current.view.z),
      fit: () => { auto.current = true; const c = live.current.content; setView({ z: live.current.fitZ, cx: c.cx, cy: c.cy }); },
    };
    return () => { zoomRef.current = null; };
  }, [zoomRef, zoomAt]);

  // wheel + touch pinch need native, non-passive listeners (React's are passive)
  useEffect(() => {
    const el = svgRef.current; if (!el) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX, e.clientY);
    };
    const touches = new Map<number, { x: number; y: number }>();
    let last: { d: number; mx: number; my: number } | null = null;
    const down = (e: PointerEvent) => { if (e.pointerType === 'touch') { touches.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (touches.size === 2) { pinching.current = true; last = null; } } };
    const move = (e: PointerEvent) => {
      if (!touches.has(e.pointerId)) return;
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size !== 2) return;
      const [a, b] = [...touches.values()];
      const cur = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
      if (last && last.d > 0) {
        zoomAt(cur.d / last.d, cur.mx, cur.my);
        const v = live.current.view;
        setView((p) => ({ ...p, cx: p.cx - (cur.mx - last!.mx) / v.z, cy: p.cy - (cur.my - last!.my) / v.z }));
      }
      last = cur;
    };
    const up = (e: PointerEvent) => { touches.delete(e.pointerId); if (touches.size < 2) { last = null; setTimeout(() => { if (touches.size === 0) pinching.current = false; }, 0); } };
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      el.removeEventListener('wheel', wheel); el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
    };
  }, [zoomAt]);

  /** Start a drag-to-pan gesture from a pointerdown. */
  const startPan = useCallback((e: { clientX: number; clientY: number }, onEnd?: (moved: boolean) => void) => {
    let x = e.clientX, y = e.clientY, moved = false;
    const el = svgRef.current?.parentElement;
    el?.setAttribute('data-panning', '');
    const move = (ev: PointerEvent) => {
      if (pinching.current) return;
      const dx = ev.clientX - x, dy = ev.clientY - y;
      if (!moved && Math.hypot(dx, dy) < 3) return;
      moved = true; x = ev.clientX; y = ev.clientY; auto.current = false;
      const z = live.current.view.z;
      setView((p) => ({ ...p, cx: p.cx - dx / z, cy: p.cy - dy / z }));
    };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      el?.removeAttribute('data-panning');
      onEnd?.(moved);
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  }, []);

  const viewBox = size.w > 0
    ? `${view.cx - size.w / 2 / view.z} ${view.cy - size.h / 2 / view.z} ${size.w / view.z} ${size.h / view.z}`
    : `${content.cx - content.w / 2} ${content.cy - content.h / 2} ${content.w} ${content.h}`;

  return { svgRef, viewBox, z: view.z, ready: size.w > 0, toMm, startPan, pinching };
}
