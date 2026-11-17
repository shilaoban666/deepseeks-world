// The block demo's build: index.html at the top of dist, every path relative, nothing from other hosts.
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));

export default {
  root: here,
  base: './',
  publicDir: 'public',
  resolve: { alias: [{ find: /^patch-block$/, replacement: `${here}lib/patch-block.js` }] },
  build: {
    target: 'es2022',
    outDir: `${here}dist`,
    emptyOutDir: true,
    assetsInlineLimit: 0,
    modulePreload: { polyfill: false },
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      input: {
        // 原来的山谷 demo
        main: `${here}index.html`,
        // 小鲸鱼的世界
        town: `${here}town.html`,
      },
    },
    // three's notice, and any other library's, into the release
    license: { fileName: 'THIRD-PARTY-NOTICES.md' },
  },
};
