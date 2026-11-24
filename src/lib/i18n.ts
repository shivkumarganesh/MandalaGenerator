// Translations. The source text is English and doubles as the key: `t('Surprise me')` looks the
// sentence up in the current language and falls back to itself. Locale files (src/locales/*.json)
// are keyed by a short hash of the English, so they stay small; `npm run i18n` lists what is missing.
//
// On Atomm the language is read once from the platform before the first render (a language change
// reloads the page, so there is nothing to subscribe to). There is no language switch in the app.
import type { ReactNode } from 'react';
import { createElement, Fragment } from 'react';

/** The 18 languages of the Atomm platform, in the platform's own order. */
export const LOCALES = ['zh', 'en', 'zh-hant', 'de', 'es', 'fr', 'it', 'ja', 'ko', 'ru', 'uk', 'sl', 'th', 'pl', 'cs', 'id', 'vi', 'pt-BR'] as const;

let dict: Record<string, string> = {};
let current = 'en';
const ids = new Map<string, string>();

/** FNV-1a, base 36: the key a sentence is filed under. */
export function tid(s: string): string {
  let id = ids.get(s);
  if (id === undefined) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    id = (h >>> 0).toString(36);
    ids.set(s, id);
  }
  return id;
}

export const locale = () => current;

/** Translate. `{name}` placeholders are filled from `vars`. */
export function t(s: string, vars?: Record<string, string | number>): string {
  let out = dict[tid(s)] ?? s;
  if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  return out;
}

/** Names the app made itself ("Layer 3") are stored in English and translated when shown; names the user typed pass through. */
export function tn(name: string): string {
  if (dict[tid(name)]) return dict[tid(name)];
  const m = /^(Layer|Tone) (\d+)$/.exec(name);
  if (m) return t(m[1] + ' {n}', { n: m[2] });
  const p = /^(.*) (mandala|portrait)$/.exec(name);
  if (p && dict[tid('{name} ' + p[2])]) return t('{name} ' + p[2], { name: t(p[1]) });
  return t(name);
}

/** Translate text that marks emphasis as **bold**. */
export function rich(s: string, vars?: Record<string, string | number>): ReactNode {
  const parts = t(s, vars).split('**');
  if (parts.length < 3) return parts.join('');
  return createElement(Fragment, null, ...parts.map((p, i) => (i % 2 ? createElement('strong', { key: i }, p) : p)));
}

let files: Record<string, () => Promise<{ default: Record<string, string> }>> = {};
// outside the bundler (the pipeline tests run in plain Node) there are no locale files to load
try { files = import.meta.glob('../locales/*.json') as typeof files; } catch { /* English only */ }

async function platformLocale(): Promise<string | null> {
  type App = { getLocale?: () => Promise<string> };
  const app = (): App | undefined => (window as unknown as { atomm?: { app?: App } }).atomm?.app;
  // the SDK script may land a moment after this module; outside the platform it never does
  for (let i = 0; i < 40 && !app()?.getLocale; i++) await new Promise((r) => setTimeout(r, 50));
  try { return (await app()?.getLocale?.()) ?? null; } catch { return null; }
}

/** Decide the language and load its text. Call before the first render. */
export async function initLocale(onPlatform: boolean): Promise<void> {
  const asked = new URLSearchParams(location.search).get('lang'); // for testing outside the platform
  const want = (onPlatform ? await platformLocale() : null) ?? asked ?? 'en';
  if (want === 'qps') {
    // pseudo-language for testing: every translated sentence is shown in ｆｕｌｌ－ｗｉｄｔｈ letters, so any
    // ordinary letters left on screen are text the translators never see
    const en = (await files['../locales/en.json']()).default;
    dict = Object.fromEntries(Object.entries(en).map(([k, v]) => [k, v.replace(/\{\w+\}|[A-Za-z]/g, (m) => (m.length > 1 ? m : String.fromCharCode(m.charCodeAt(0) + 0xfee0)))]));
    return;
  }
  const code = LOCALES.find((c) => c.toLowerCase() === want.toLowerCase()) ?? 'en';
  if (code !== 'en') {
    try { dict = (await files[`../locales/${code}.json`]()).default; current = code; } catch { dict = {}; current = 'en'; }
  }
  document.documentElement.lang = current;
}
