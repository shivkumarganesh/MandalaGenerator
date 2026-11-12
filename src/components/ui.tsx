// The atomm control set as React components. Markup and class names follow the layout-5
// template so the platform stylesheet (styles/atomm.css) applies unchanged.
import { useId, useRef, useState, type ReactNode } from 'react';
import { useStore } from '../lib/store';

const ICONS: Record<string, ReactNode> = {
  chevron: <path d="m4 6 4 4 4-4" />,
  right: <path d="m6 4 4 4-4 4" />,
  panel: <><rect x="2" y="3" width="12" height="10" rx="1.5" /><path d="M6 3v10" /></>,
  sparkle: <><path d="M8 2l1.4 3.6L13 7l-3.6 1.4L8 12 6.6 8.4 3 7l3.6-1.4Z" /><path d="M12.5 11.5l.5 1.3 1.3.5-1.3.5-.5 1.3-.5-1.3-1.3-.5 1.3-.5z" /></>,
  grid: <><rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" /><rect x="9" y="2.5" width="4.5" height="4.5" rx="1" /><rect x="2.5" y="9" width="4.5" height="4.5" rx="1" /><rect x="9" y="9" width="4.5" height="4.5" rx="1" /></>,
  petal: <><path d="M8 1.8c2.6 2.2 2.6 5.2 0 7.4-2.6-2.2-2.6-5.2 0-7.4Z" /><path d="M2.6 12.6c.4-3.2 2.5-5 5.4-3.4M13.4 12.6c-.4-3.2-2.5-5-5.4-3.4M8 9.2v5" /></>,
  brush: <><path d="M10.5 2.5 13.5 5.5 7 12 4 9z" /><path d="M4 9c-1.6.4-1.8 2.2-2 4 1.8-.2 3.6-.4 4-2" /></>,
  upload: <path d="M8 10V3M5 6l3-3 3 3M3 11v2h10v-2" />,
  folder: <path d="M2 4.5h4l1.5 1.5H14v6.5H2z" />,
  undo: <path d="M5 4 2.5 6.5 5 9M2.5 6.5H10a3.5 3.5 0 0 1 0 7H7" />,
  redo: <path d="M11 4l2.5 2.5L11 9M13.5 6.5H6a3.5 3.5 0 0 0 0 7h3" />,
  reset: <path d="M3 8a5 5 0 1 0 1.5-3.6M3 3v3h3" />,
  eye: <><path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z" /><circle cx="8" cy="8" r="1.8" /></>,
  eyeOff: <><path d="M2 2l12 12M6.2 4A6 6 0 0 1 8 3.5c4 0 6.5 4.5 6.5 4.5a11 11 0 0 1-1.8 2.3M10 12a6 6 0 0 1-2 .5C4 12.5 1.5 8 1.5 8a11 11 0 0 1 2.3-2.7" /></>,
  up: <path d="M8 13V3M4 7l4-4 4 4" />,
  down: <path d="M8 3v10M4 9l4 4 4-4" />,
  trash: <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.5 8.5h6l.5-8.5M6.8 7v4M9.2 7v4" />,
  plus: <path d="M8 3.5v9M3.5 8h9" />,
  minus: <path d="M4 8h8" />,
  copy: <><rect x="5.5" y="5.5" width="8" height="8" rx="1.5" /><path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" /></>,
  fit: <path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" />,
  close: <path d="m4 4 8 8M12 4l-8 8" />,
  check: <path d="m3.5 8.5 3 3 6-7" />,
  warn: <><path d="M8 2.5 14 13H2Z" /><path d="M8 6.5v3M8 11.3h.01" /></>,
  info: <><circle cx="8" cy="8" r="6" /><path d="M8 7.4v3.4M8 5.3h.01" /></>,
  link: <path d="M6.8 9.2a2.6 2.6 0 0 0 3.7 0l2-2a2.6 2.6 0 0 0-3.7-3.7l-.7.7M9.2 6.8a2.6 2.6 0 0 0-3.7 0l-2 2a2.6 2.6 0 0 0 3.7 3.7l.7-.7" />,
  image: <><rect x="2" y="3" width="12" height="10" rx="1.5" /><circle cx="5.6" cy="6.4" r="1.1" /><path d="m2.5 11.5 3.5-3 2.5 2 2-1.6 3 2.6" /></>,
  download: <path d="M8 2.5v7M5 6.5l3 3 3-3M3 11v2h10v-2" />,
  cube: <><path d="M8 1.8 13.5 5v6L8 14.2 2.5 11V5Z" /><path d="M2.5 5 8 8.2 13.5 5M8 8.2v6" /></>,
  text: <path d="M3.5 4.5v-1h9v1M8 3.5v9M6.3 12.5h3.4" />,
  circle: <circle cx="8" cy="8" r="5.5" />,
};

export function Icon({ name, size }: { name: string; size?: 20 }) {
  return <svg className={size === 20 ? 'icon icon-20' : 'icon'} viewBox="0 0 16 16" aria-hidden="true">{ICONS[name]}</svg>;
}

export function Card({ title, children, defaultOpen = true, action }: { title: string; children: ReactNode; defaultOpen?: boolean; action?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <section className="prop-card" aria-labelledby={id + 't'}>
      <button type="button" className="prop-card-header" id={id + 't'} aria-expanded={open} aria-controls={id + 'b'} onClick={() => setOpen(!open)}>
        {title}<Icon name="chevron" />
      </button>
      <div className="prop-card-body" id={id + 'b'} hidden={!open}>{children}{action}</div>
    </section>
  );
}

export function Row({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return <div className="field-row">{htmlFor ? <label htmlFor={htmlFor}>{label}</label> : <span className="field-label">{label}</span>}{children}</div>;
}

const MM_PER_IN = 25.4;

interface NumProps {
  label: string; value: number; onChange: (v: number) => void;
  min?: number; max?: number; step?: number;
  /** 'mm' values follow the mm / inch toggle; anything else is shown as-is. */
  unit?: 'mm' | '°' | '×' | '';
  integer?: boolean;
}

/** Numeric field: type a value, or press and drag sideways (Shift ×10, Alt fine). */
export function Num({ label, value, onChange, min = -Infinity, max = Infinity, step = 1, unit = 'mm', integer }: NumProps) {
  const id = useId();
  const inches = useStore((s) => s.ui.unit) === 'in' && unit === 'mm';
  const k = inches ? MM_PER_IN : 1;
  const dp = integer ? 0 : inches ? 3 : step < 1 ? 2 : 1;
  const shown = (v: number) => String(+(v / k).toFixed(dp));
  const [text, setText] = useState<string | null>(null);
  const drag = useRef<{ x: number; v: number; moved: boolean } | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const clamp = (v: number) => Math.min(max, Math.max(min, integer ? Math.round(v) : v));
  const commit = (t: string) => {
    const n = parseFloat(t.replace(',', '.'));
    if (isFinite(n)) onChange(clamp(n * k));
    setText(null);
  };
  const bad = text !== null && !isFinite(parseFloat(text.replace(',', '.')));
  return (
    <div className="field-row">
      <label htmlFor={id}>{label}</label>
      <span className="input-number">
        <input
          id={id} ref={ref} inputMode="decimal" data-drag="" aria-invalid={bad || undefined}
          value={text ?? shown(value)}
          onChange={(e) => setText(e.target.value)}
          onBlur={(e) => text !== null && commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { commit((e.target as HTMLInputElement).value); (e.target as HTMLInputElement).select(); }
            else if (e.key === 'Escape') { setText(null); ref.current?.blur(); }
            else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
              e.preventDefault();
              const s = step * (e.shiftKey ? 10 : e.altKey ? 0.1 : 1) * (e.key === 'ArrowUp' ? 1 : -1);
              setText(null); onChange(clamp(+(value + s).toFixed(4)));
            }
          }}
          onPointerDown={(e) => {
            if (document.activeElement === ref.current) return;
            e.preventDefault();
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            drag.current = { x: e.clientX, v: value, moved: false };
          }}
          onPointerMove={(e) => {
            const d = drag.current; if (!d) return;
            let dx = e.clientX - d.x;
            if (getComputedStyle(e.currentTarget).direction === 'rtl') dx = -dx;
            if (!d.moved && Math.abs(dx) < 3) return;
            d.moved = true;
            const s = step * (e.shiftKey ? 10 : e.altKey ? 0.1 : 1);
            onChange(clamp(+(d.v + Math.round(dx / 2) * s).toFixed(4)));
          }}
          onPointerUp={(e) => {
            const d = drag.current; drag.current = null;
            if (d && !d.moved) { ref.current?.focus(); ref.current?.select(); }
            try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* not captured */ }
          }}
        />
        {unit && <span className="unit">{inches ? 'in' : unit}</span>}
      </span>
    </div>
  );
}

export function Slider({ label, value, onChange, min, max, step = 1, format }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number; format?: (v: number) => string }) {
  const id = useId();
  const fill = ((value - min) / (max - min)) * 100;
  return (
    <div className="field-row">
      <label htmlFor={id}>{label}</label>
      <div className="control">
        <input id={id} className="slider" type="range" min={min} max={max} step={step} value={value}
          style={{ ['--fill' as string]: fill + '%' }} onChange={(e) => onChange(+e.target.value)} />
        <span className="value">{format ? format(value) : value}</span>
      </div>
    </div>
  );
}

export function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  return (
    <div className="field-row">
      <label htmlFor={id}>{label}</label>
      <span className="switch">
        <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="track" aria-hidden="true" /><span className="knob" aria-hidden="true" />
      </span>
    </div>
  );
}

export function Segmented<T extends string>({ label, value, options, onChange, tabs }: { label: string; value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; tabs?: boolean }) {
  return (
    <div className={tabs ? 'segmented segmented-tabs' : 'segmented'} role="group" aria-label={label}>
      {options.map((o) => <button key={o.id} type="button" aria-pressed={value === o.id} onClick={() => onChange(o.id)}>{o.label}</button>)}
    </div>
  );
}

export function SegRow<T extends string>(p: { label: string; value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return <div className="field-row"><span className="field-label">{p.label}</span><Segmented {...p} /></div>;
}

/** Native select in the 28px shell — keeps the platform's keyboard and screen-reader contract for free. */
export function Select<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  const id = useId();
  return (
    <div className="field-row">
      <label htmlFor={id}>{label}</label>
      <span className="select-field">
        <select className="select" id={id} value={value} onChange={(e) => onChange(e.target.value as T)}>
          {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        <Icon name="chevron" />
      </span>
    </div>
  );
}

export function Swatch({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="swatch" title={label}>
      <input type="color" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />
      <i style={{ background: value }} />
    </label>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="field-note">{children}</p>;
}

export function Alert({ kind, children }: { kind: 'info' | 'success' | 'warning' | 'error'; children: ReactNode }) {
  return <div className={`alert alert-${kind}`}><Icon name={kind === 'success' ? 'check' : kind === 'info' ? 'info' : 'warn'} /><div className="alert-body">{typeof children === 'string' ? <p>{children}</p> : children}</div></div>;
}
