// Translation bookkeeping.
//   npm run i18n            list every English sentence in the app → src/locales/en.json, report gaps
//   npm run i18n -- --check same, but exit 1 if any language is incomplete (used before a release)
//   npm run i18n -- --todo <code> [from] [count]   print the sentences a language still lacks, as id<TAB>English
//   npm run i18n -- --merge <code> <file.tsv>      add translations given as id<TAB>translation lines
// Sentences are found two ways: text passed to t()/rich()/toast() and to the labelled controls in
// the components, and the names in the data tables (templates, motifs, presets…), read by running them.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { LOCALES, tid } from '../src/lib/i18n';
import { PALETTES, STYLE_LABELS, TEMPLATES } from '../src/lib/recipes';
import { MOTIFS } from '../src/lib/motifs';
import { PATTERNS } from '../src/lib/curves';
import { MACHINES, PRODUCTS } from '../src/lib/presets';
import { DIALS } from '../src/lib/dial';
import { PRESET_FRAMES } from '../src/lib/frame';
import { FONTS } from '../src/lib/importArt';

const DIR = 'src/locales';
const found = new Map<string, string>(); // id → English, in order of first appearance
const add = (s: string | undefined) => {
  if (!s) return;
  const v = s.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\n/g, '\n');
  if (!/[A-Za-z]{2}/.test(v)) return; // nothing to translate in "×" or "12 · 3 · 6 · 9"
  if (/^(sel-|guide-|btn|field-|select-|dialog-|icon|segmented)/.test(v)) return; // class names
  if (['dialog guide', 'input wide', 'mp4', 'eyeOff', '{name} ', 'Could not encode PNG', '3D view not ready', 'This browser cannot record video.', 'Esc'].includes(v) || v.startsWith('Ctrl / ')) return;
  if (/^[a-z]+$/.test(v) && !['start', 'bottom', 'top', 'inch'].includes(v)) return; // ids and keywords
  const id = tid(v);
  if (found.has(id) && found.get(id) !== v) throw new Error(`hash collision: "${v}" / "${found.get(id)}"`);
  found.set(id, v);
};

const STR = `'((?:[^'\\\\\\n]|\\\\.)*)'|"((?:[^"\\\\\\n]|\\\\.)*)"`;
const each = (src: string, re: RegExp, groups = [1, 2]) => { for (const m of src.matchAll(re)) for (const g of groups) add(m[g]); };

const files = ['src/App.tsx', ...readdirSync('src/components').map((f) => 'src/components/' + f), ...readdirSync('src/lib').map((f) => 'src/lib/' + f)].filter((f) => /\.tsx?$/.test(f));
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  // calls: t('…'), rich('…'), toast('…'), and both arms of a choice inside them
  each(src, new RegExp(`(?<![\\w.])(?:t|rich|toast|setErr|Error)\\(\\s*(?:${STR})`, 'g'));
  each(src, new RegExp(`\\?\\s*(?:t\\()?(?:${STR})\\)?\\s*:\\s*(?:t\\()?(?:${STR})`, 'g'), [1, 2, 3, 4]);
  each(src, new RegExp(`e\\.message : (?:${STR})`, 'g'));
  // labelled controls translate what they are given
  each(src, new RegExp(`\\b(?:label|title|none|placeholder|alt|caption|time|need)=(?:\\{)?(?:${STR})`, 'g'));
  each(src, new RegExp(`\\b(?:label|title|body|note|msg)\\s*:\\s*(?:${STR})`, 'g'));
  each(src, /<Note>([^<{]+)<\/Note>/g, [1]);
  each(src, /<Alert kind="\w+">([^<{]+)<\/Alert>/g, [1]);
  if (f.endsWith('Guide.tsx')) {
    // the Guide is prose: every sentence-like literal in it is shown
    const body = src.slice(src.indexOf('function pages()'));
    for (const m of body.matchAll(new RegExp(STR, 'g'))) { const v = m[1] ?? m[2]; if (/^[A-Z“]/.test(v) || (v.includes(' ') && /[a-z]{3}/.test(v))) add(v); }
  }
}
// names the app generates, and section titles kept in plain tables
['Layer {n}', 'Tone {n}', '{name} mandala', '{name} portrait', 'Paper', 'Backplate', 'Dial ring', 'Clock dial', 'My mandala', 'Motif',
  'Start', 'Motifs', 'Draw', 'Import', 'Project', 'Thanksgiving', 'Christmas', 'Pattern algorithms', 'All styles', 'Free form',
  'Any', 'Selected: motif ring', 'Selected: disc', 'Selected: pattern curve', 'Selected: brush stroke', 'Dot size', 'Line width'].forEach(add);
Object.values(STYLE_LABELS).forEach(add);
[TEMPLATES, MOTIFS, PALETTES, PATTERNS, MACHINES, PRODUCTS, DIALS, PRESET_FRAMES, FONTS].forEach((list) => (list as { label: string }[]).forEach((x) => add(x.label)));
PATTERNS.forEach((p) => { add(p.a); add(p.b); add(p.c); });
PRODUCTS.forEach((p) => add(p.note));

const en = Object.fromEntries(found);
writeFileSync(`${DIR}/en.json`, JSON.stringify(en, null, 0).replace(/","/g, '",\n"') + '\n');
const words = [...found.values()].join(' ').split(/\s+/).length;
console.log(`${found.size} sentences, ${words} words`);

const load = (code: string): Record<string, string> => (existsSync(`${DIR}/${code}.json`) ? JSON.parse(readFileSync(`${DIR}/${code}.json`, 'utf8')) : {});
const save = (code: string, d: Record<string, string>) => {
  const kept = Object.fromEntries([...found.keys()].filter((id) => d[id]).map((id) => [id, d[id]])); // English order, stale ids dropped
  writeFileSync(`${DIR}/${code}.json`, JSON.stringify(kept, null, 0).replace(/","/g, '",\n"') + '\n');
};
const marks = (s: string) => [(s.match(/\{\w+\}/g) ?? []).sort().join(), (s.match(/\*\*/g) ?? []).length].join('|');

const [, , mode, code, a, b] = process.argv;
if (mode === '--todo') {
  const d = load(code);
  const todo = [...found].filter(([id]) => !d[id]);
  const from = +(a ?? 0), n = +(b ?? todo.length);
  console.log(todo.slice(from, from + n).map(([id, s]) => id + '\t' + s).join('\n'));
  console.error(`${todo.length} to do`);
} else if (mode === '--merge') {
  const d = load(code);
  let n = 0;
  for (const line of readFileSync(a, 'utf8').split('\n')) {
    const i = line.indexOf('\t'); if (i < 0) continue;
    const id = line.slice(0, i).trim(), v = line.slice(i + 1).trim();
    if (!found.has(id)) { console.log('unknown id', id); continue; }
    if (marks(found.get(id)!) !== marks(v)) { console.log(`placeholders differ in ${id}: ${found.get(id)} → ${v}`); continue; }
    d[id] = v; n++;
  }
  save(code, d);
  console.log(`${code}: merged ${n}, missing ${[...found.keys()].filter((id) => !d[id]).length}`);
} else {
  let bad = 0;
  for (const c of LOCALES) {
    if (c === 'en') continue;
    const d = load(c);
    const missing = [...found.keys()].filter((id) => !d[id]);
    const broken = [...found].filter(([id, s]) => d[id] && marks(s) !== marks(d[id])).map(([id]) => id);
    if (existsSync(`${DIR}/${c}.json`)) save(c, d);
    if (missing.length || broken.length) { bad++; console.log(`${c}: ${missing.length} missing${broken.length ? ', placeholders differ in ' + broken.join(' ') : ''}`); }
  }
  if (!bad) console.log('all 17 languages complete');
  if (mode === '--check' && bad) process.exit(1);
}
