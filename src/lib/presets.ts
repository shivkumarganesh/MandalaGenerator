// Machine and product presets: plain bundles of settings, applied in one click.
import type { Design } from './types';
import { designDiameter, scaleDesign } from './build';

export interface Machine { id: string; label: string; thickness: number; kerf: number; minFeature: number; sheet: { w: number; h: number }; speed: number }

// Typical starting values — always confirm kerf and speed with a test cut on your own machine.
export const MACHINES: Machine[] = [
  { id: 'diode3', label: 'Diode laser · 3 mm plywood', thickness: 3, kerf: 0.15, minFeature: 1.2, sheet: { w: 400, h: 400 }, speed: 6 },
  { id: 'co2-3', label: 'CO₂ laser · 3 mm plywood', thickness: 3, kerf: 0.2, minFeature: 1.0, sheet: { w: 600, h: 300 }, speed: 20 },
  { id: 'co2-acr', label: 'CO₂ laser · 3 mm acrylic', thickness: 3, kerf: 0.2, minFeature: 1.5, sheet: { w: 600, h: 300 }, speed: 12 },
  { id: 'card', label: 'Laser · 1 mm card / veneer', thickness: 1, kerf: 0.1, minFeature: 0.8, sheet: { w: 297, h: 210 }, speed: 40 },
  { id: 'cricut', label: 'Cutting machine · cardstock', thickness: 0.3, kerf: 0, minFeature: 1.5, sheet: { w: 305, h: 305 }, speed: 30 },
];

export function applyMachine(d: Design, m: Machine): Design {
  return { ...d, thickness: m.thickness, kerf: m.kerf, minFeature: m.minFeature, sheet: { w: m.sheet.w, h: m.sheet.h, price: d.sheet?.price ?? 0, speed: m.speed } };
}

export interface Product { id: string; label: string; size: number; holes: { centre: number; hang: number; pins: boolean }; note: string }

export const PRODUCTS: Product[] = [
  { id: 'wall', label: 'Wall art · 300 mm', size: 300, holes: { centre: 0, hang: 4, pins: true }, note: 'Hanging hole at the top, pins to keep the sheets aligned.' },
  { id: 'clock', label: 'Clock · 300 mm', size: 300, holes: { centre: 8, hang: 0, pins: true }, note: '8 mm centre hole for a standard quartz movement.' },
  { id: 'coaster', label: 'Coaster · 95 mm', size: 95, holes: { centre: 0, hang: 0, pins: false }, note: 'Use 3–4 layers and seal the top.' },
  { id: 'ornament', label: 'Ornament · 80 mm', size: 80, holes: { centre: 0, hang: 3, pins: false }, note: '3 mm hole for a ribbon.' },
  { id: 'earring', label: 'Earring · 45 mm', size: 45, holes: { centre: 0, hang: 1.6, pins: false }, note: '1.6 mm hole for a jump ring. Use 2–3 thin layers.' },
  { id: 'trivet', label: 'Trivet · 180 mm', size: 180, holes: { centre: 0, hang: 0, pins: true }, note: 'Thicker sheets (4–6 mm) cope better with heat.' },
];

export function applyProduct(d: Design, p: Product): Design {
  const dia = designDiameter(d);
  const scaled = dia > 0 ? scaleDesign(d, p.size / dia) : d;
  return { ...scaled, holes: { ...p.holes } };
}
