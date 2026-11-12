import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

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
  define: { 'import.meta.env.VITE_TARGET': JSON.stringify(target) },
  plugins: [react(), atommSdk(), ...(target === 'standalone' ? [viteSingleFile()] : [])],
  build: {
    outDir: target === 'atomm' ? 'dist-atomm' : 'dist-standalone',
    chunkSizeWarningLimit: 1500,
  },
});
