// Collects the two builds into release/: one zip to upload to Atomm, one HTML file to open anywhere.
import { copyFileSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import JSZip from 'jszip';

mkdirSync('release', { recursive: true });
copyFileSync('dist-standalone/index.html', 'release/mandala-stack-studio.html');
copyFileSync('dist-standalone/index.html', 'index.html'); // what GitHub Pages serves from the repository root

const zip = new JSZip();
const walk = (dir) => readdirSync(dir).forEach((f) => {
  const p = join(dir, f);
  if (statSync(p).isDirectory()) walk(p); else zip.file(relative('dist-atomm', p).replace(/\\/g, '/'), readFileSync(p));
});
walk('dist-atomm');
writeFileSync('release/mandala-stack-studio-atomm.zip', await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
for (const f of readdirSync('release')) console.log(`release/${f}  ${(statSync(join('release', f)).size / 1024).toFixed(0)} kB`);
