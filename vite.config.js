import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// base "./": Freenet serves the app from a sandboxed iframe under a contract path.
// --mode web: the web version (web/), whose server keeps the galaxy in SQLite; freenet/net.js becomes web/net.js.
export default defineConfig(({ mode }) => ({
  base: './',
  // the web build goes to dist-web/ so it can never overwrite the Freenet build in dist/ before a publish
  build: { target: 'es2022', assetsInlineLimit: 0, outDir: mode === 'web' ? 'dist-web' : 'dist' },
  plugins: mode === 'web' ? [{
    name: 'web-net',
    enforce: 'pre',
    async resolveId(id, importer) {
      const r = await this.resolve(id, importer, { skipSelf: true });
      if (r?.id.endsWith('/freenet/net.js')) return fileURLToPath(new URL('./web/net.js', import.meta.url));
    },
  }] : [],
  server: mode === 'web' ? { proxy: { '/api': 'http://localhost:8080' } } : {},
}));
