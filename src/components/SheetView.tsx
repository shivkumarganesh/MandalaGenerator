// "Cut sheets": exactly what the export contains — every sheet 1:1, red cut lines, blue guides.
import { useMemo, type MutableRefObject } from 'react';
import { buildStack } from '../lib/build';
import { CUT, SCORE, cutLayers, sheetLayout } from '../lib/exportLaser';
import { pathD } from '../lib/geom';
import { useStore } from '../lib/store';
import { usePanZoom, type ZoomApi } from './panzoom';

export function fmtLen(mm: number, unit: 'mm' | 'in', dp = 0): string {
  return unit === 'in' ? (mm / 25.4).toFixed(2) + ' in' : mm.toFixed(dp) + ' mm';
}

export default function SheetView({ zoomRef, onPct }: { zoomRef: MutableRefObject<ZoomApi | null>; onPct: (p: number) => void }) {
  const design = useStore((s) => s.design);
  const unit = useStore((s) => s.ui.unit);
  const layout = useMemo(() => sheetLayout(cutLayers(design, buildStack(design)), 16), [design]);
  const content = useMemo(() => ({ cx: layout.w / 2, cy: layout.h / 2 + 4, w: Math.max(layout.w, 40), h: Math.max(layout.h + 14, 40) }), [layout]);
  const pz = usePanZoom(content, zoomRef, onPct);
  const fs = Math.max(3.2, content.w / 62);
  return (
    <div className="gen-canvas-stage canvas-ltr">
      <svg ref={pz.svgRef} className="canvas-svg" viewBox={pz.viewBox} onPointerDown={(e) => pz.startPan(e)} role="img" aria-label="Cut sheets">
        {layout.cells.map(({ c, x, y }, i) => (
          <g key={c.file}>
            <rect className="sheet-bg" x={x - 2} y={y - 2} width={c.w + 4} height={c.h + 4} rx="1" />
            <g transform={`translate(${x - c.minX} ${y - c.minY})`}>
              {c.score.length > 0 && <path d={pathD(c.score)} fill="none" stroke={SCORE} className="cut-line" />}
              <path d={pathD(c.cut)} fill={c.color} fillOpacity="0.14" fillRule="evenodd" stroke={CUT} className="cut-line" />
            </g>
            <text className="sheet-label" x={x + c.w / 2} y={y + c.h + 2 + fs * 1.6} fontSize={fs} textAnchor="middle">
              {i + 1}. {c.name} · {fmtLen(c.w, unit)} × {fmtLen(c.h, unit)}
            </text>
          </g>
        ))}
      </svg>
      {!layout.cells.length && <p className="gen-canvas-hint canvas-empty">Nothing to cut yet</p>}
    </div>
  );
}
