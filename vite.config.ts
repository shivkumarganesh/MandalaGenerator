import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'node:url';

// Two products from one source:
//   VITE_TARGET=atomm      -> dist-atomm/       code-split build for the Atomm platform (laser only)
//   VITE_TARGET=standalone -> dist-standalone/  one self-contained index.html (laser + 3D print)
const target = process.env.VITE_TARGET === 'atomm' ? 'atomm' : 'standalone';

const SDK = 'https://static-res.makextool.com/scripts/js/generator-sdk/platform-sdk.js';

function atommSdk(): Plugin {
  return {
    name: 'atomm-sdk',
    transformIndexHtml(html) {
      return target === 'atomm'
        ? html.replace('<!--atomm-sdk-->', `<script src="${SDK}"></script>`)
        : html.replace('<!--atomm-sdk-->', '');
    },
  };
}

export default defineConfig({
  base: './',
  // each build bundles only the Guide screenshots taken from that build
  resolve: { alias: { 'guide-shots': fileURLToPath(new URL(`./src/guide/index.${target}.ts`, import.meta.url)) } },
  define: { 'import.meta.env.VITE_TARGET': JSON.stringify(target) },
  plugins: [react(), atommSdk(), ...(target === 'standalone' ? [viteSingleFile()] : [])],
  // The source entry is app.html: the repository root index.html is the BUILT standalone app,
  // so GitHub Pages works even in "deploy from a branch" mode. Builds rename app.html → index.html.
  build: {
    rollupOptions: { input: 'app.html' },
    outDir: target === 'atomm' ? 'dist-atomm' : 'dist-standalone',
    chunkSizeWarningLimit: 1500,
  },
});
