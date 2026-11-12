// One small store: the design (with undo history) and the transient UI state.
import { useSyncExternalStore } from 'react';
import type { Design, Element, Layer } from './types';
import { TEMPLATES, fromTemplate, layer as mkLayer, uid, PALETTES, paletteColors } from './recipes';

export type Tool = 'templates' | 'motifs' | 'draw' | 'import' | 'project';
export type View = '2d' | '3d' | 'sheets';

export interface UI {
  tool: Tool;
  leadOpen: boolean;
  view: View;
  activeLayer: string | null;
  selected: string | null;
  unit: 'mm' | 'in';
  solo: boolean;
  explode: number; // 0..1
  addOp: 'add' | 'cut';
  brush: { size: number; fold: number; mirror: boolean };
  toast: string | null;
}

interface State { design: Design; origin: Design; ui: UI; past: Design[]; future: Design[] }

const KEY = 'mandala-stack-studio:v2';
const listeners = new Set<() => void>();

function initialDesign(): Design {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw) as Design;
      if (d && d.v === 2 && Array.isArray(d.layers)) return d;
    }
  } catch { /* storage unavailable — start fresh */ }
  return fromTemplate(TEMPLATES[0]);
}

const first = initialDesign();
let state: State = {
  design: first, origin: first, past: [], future: [],
  ui: {
    tool: 'templates', leadOpen: true, view: '2d',
    activeLayer: first.layers[first.layers.length - 1]?.id ?? null, selected: null,
    unit: 'mm', solo: false, explode: 0, addOp: 'add',
    brush: { size: 4, fold: 12, mirror: true }, toast: null,
  },
};

let saveTimer: ReturnType<typeof setTimeout> | undefined;
function emit() {
  listeners.forEach((l) => l());
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state.design)); } catch { /* ignore quota */ }
  }, 400);
}

export const getState = () => state;
const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };
export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => sel(state));
}

let lastKey = '', lastAt = 0;

/** Change the design. Calls sharing a `coalesce` key within 800 ms collapse into one undo step. */
export function setDesign(fn: (d: Design) => Design, coalesce?: string) {
  const next = fn(state.design);
  if (next === state.design) return;
  const now = Date.now();
  const merge = coalesce && coalesce === lastKey && now - lastAt < 800 && state.past.length > 0;
  lastKey = coalesce ?? ''; lastAt = now;
  state = { ...state, design: next, past: merge ? state.past : [...state.past.slice(-79), state.design], future: [] };
  fixSelection();
  emit();
}

export function setUI(patch: Partial<UI>) {
  state = { ...state, ui: { ...state.ui, ...patch } };
  emit();
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(msg: string) {
  setUI({ toast: msg });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => setUI({ toast: null }), 2600);
}

function fixSelection() {
  const { design, ui } = state;
  const layerOk = design.layers.some((l) => l.id === ui.activeLayer);
  const selOk = !ui.selected || design.layers.some((l) => l.elements.some((e) => e.id === ui.selected));
  if (!layerOk || !selOk)
    state = { ...state, ui: { ...ui, activeLayer: layerOk ? ui.activeLayer : design.layers[design.layers.length - 1]?.id ?? null, selected: selOk ? ui.selected : null } };
}

export function undo() {
  if (!state.past.length) return;
  const prev = state.past[state.past.length - 1];
  state = { ...state, design: prev, past: state.past.slice(0, -1), future: [state.design, ...state.future] };
  lastKey = ''; fixSelection(); emit();
}
export function redo() {
  if (!state.future.length) return;
  const next = state.future[0];
  state = { ...state, design: next, past: [...state.past, state.design], future: state.future.slice(1) };
  lastKey = ''; fixSelection(); emit();
}

/** Load a whole new design (template, surprise, file). Undoable. */
export function loadDesign(d: Design) {
  setDesign(() => d);
  state = { ...state, origin: d, ui: { ...state.ui, selected: null, activeLayer: d.layers[d.layers.length - 1]?.id ?? null } };
  emit();
}
export const resetDesign = () => setDesign(() => state.origin);

// ── design edits ─────────────────────────────────────────────────────────────

const mapLayers = (d: Design, f: (l: Layer) => Layer): Design => ({ ...d, layers: d.layers.map(f) });

export function patchDesign(patch: Partial<Design>, key?: string) {
  setDesign((d) => ({ ...d, ...patch }), key);
}

export function patchElement(id: string, patch: Partial<Element>, key?: string) {
  setDesign((d) => mapLayers(d, (l) => l.elements.some((e) => e.id === id)
    ? { ...l, elements: l.elements.map((e) => (e.id === id ? ({ ...e, ...patch } as Element) : e)) } : l), key ?? 'el:' + id + Object.keys(patch).join());
}

export function patchLayer(id: string, patch: Partial<Layer>, key?: string) {
  setDesign((d) => mapLayers(d, (l) => (l.id === id ? { ...l, ...patch } : l)), key);
}

export function findElement(d: Design, id: string | null): { el: Element; layer: Layer } | null {
  if (!id) return null;
  for (const l of d.layers) { const el = l.elements.find((e) => e.id === id); if (el) return { el, layer: l }; }
  return null;
}

export function addLayer(): string {
  const d = state.design;
  const cols = paletteColors(PALETTES[0], Math.max(6, d.layers.length + 1));
  const l = mkLayer(`Layer ${d.layers.length + 1}`, cols[Math.min(cols.length - 1, d.layers.length)], []);
  const at = d.layers.findIndex((x) => x.id === state.ui.activeLayer);
  setDesign((dd) => { const ls = dd.layers.slice(); ls.splice(at < 0 ? ls.length : at + 1, 0, l); return { ...dd, layers: ls }; });
  setUI({ activeLayer: l.id, selected: null });
  return l.id;
}

export function addElement(el: Element) {
  let lid = state.ui.activeLayer;
  if (!lid || !state.design.layers.some((l) => l.id === lid)) lid = addLayer();
  setDesign((d) => mapLayers(d, (l) => (l.id === lid ? { ...l, visible: true, elements: [...l.elements, el] } : l)));
  setUI({ selected: el.id, activeLayer: lid });
}

export function removeElement(id: string) {
  setDesign((d) => mapLayers(d, (l) => (l.elements.some((e) => e.id === id) ? { ...l, elements: l.elements.filter((e) => e.id !== id) } : l)));
}

export function duplicateElement(id: string) {
  const f = findElement(state.design, id);
  if (!f) return;
  const copy = { ...f.el, id: uid() } as Element;
  if (copy.kind === 'ring') copy.rotate = copy.rotate + 180 / Math.max(1, copy.count);
  setDesign((d) => mapLayers(d, (l) => {
    if (l.id !== f.layer.id) return l;
    const i = l.elements.findIndex((e) => e.id === id);
    const els = l.elements.slice(); els.splice(i + 1, 0, copy);
    return { ...l, elements: els };
  }));
  setUI({ selected: copy.id }); // duplicating means "I'm about to work on this one"
}

export function moveElementToLayer(id: string, layerId: string) {
  const f = findElement(state.design, id);
  if (!f || f.layer.id === layerId) return;
  setDesign((d) => mapLayers(d, (l) => l.id === f.layer.id ? { ...l, elements: l.elements.filter((e) => e.id !== id) }
    : l.id === layerId ? { ...l, elements: [...l.elements, f.el] } : l));
  setUI({ activeLayer: layerId });
}

export function reorderElement(id: string, dir: -1 | 1) {
  setDesign((d) => mapLayers(d, (l) => {
    const i = l.elements.findIndex((e) => e.id === id), j = i + dir;
    if (i < 0 || j < 0 || j >= l.elements.length) return l;
    const els = l.elements.slice(); [els[i], els[j]] = [els[j], els[i]];
    return { ...l, elements: els };
  }));
}

export function removeLayer(id: string) {
  setDesign((d) => ({ ...d, layers: d.layers.filter((l) => l.id !== id) }));
}

export function moveLayer(id: string, dir: -1 | 1) {
  setDesign((d) => {
    const i = d.layers.findIndex((l) => l.id === id), j = i + dir;
    if (i < 0 || j < 0 || j >= d.layers.length) return d;
    const ls = d.layers.slice(); [ls[i], ls[j]] = [ls[j], ls[i]];
    return { ...d, layers: ls };
  });
}
