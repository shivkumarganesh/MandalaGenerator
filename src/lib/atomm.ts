// Atomm platform SDK glue. `window.atomm` is injected by the platform iframe; script order is
// not guaranteed, so it is polled for ~5 s. Outside the iframe the app falls back to its own button.
import { useEffect, useState } from 'react';

declare global {
  interface Window {
    atomm?: {
      lifecycle?: { on: (ev: string, cb: (arg: { intent?: string }) => unknown) => void };
      ui?: { toast?: (o: { type: string; message: string; duration?: number }) => void };
    };
  }
}

export const IS_ATOMM = import.meta.env.VITE_TARGET === 'atomm';

function whenReady(cb: () => void): () => void {
  if (window.atomm?.lifecycle) { cb(); return () => {}; }
  let tries = 0;
  const t = setInterval(() => {
    tries++;
    if (window.atomm?.lifecycle) { clearInterval(t); cb(); }
    else if (tries > 100) clearInterval(t);
  }, 50);
  return () => clearInterval(t);
}

export type AtommStatus = 'connecting' | 'connected' | 'unavailable';

export function useAtommStatus(): AtommStatus {
  const [s, set] = useState<AtommStatus>(IS_ATOMM ? 'connecting' : 'unavailable');
  useEffect(() => {
    if (!IS_ATOMM) return;
    const off = whenReady(() => set('connected'));
    const t = setTimeout(() => set((v) => (v === 'connecting' ? 'unavailable' : v)), 5500);
    return () => { off(); clearTimeout(t); };
  }, []);
  return s;
}

export type ExportResult = { filename: string; blob: Blob } | { filename: string; blob: Blob }[];

/** `build` is called fresh on every export click — never a cached blob. */
export function useAtommExport(build: (intent?: string) => Promise<ExportResult>) {
  useEffect(() => {
    if (!IS_ATOMM) return;
    let registered = false;
    return whenReady(() => {
      if (registered) return;
      registered = true;
      window.atomm!.lifecycle!.on('export', async ({ intent }) => build(intent));
    });
    // build is a stable callback reading the latest state itself
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export function platformToast(message: string, type: 'info' | 'success' | 'error' = 'info'): boolean {
  if (window.atomm?.ui?.toast) { window.atomm.ui.toast({ type, message, duration: 3 }); return true; }
  return false;
}
