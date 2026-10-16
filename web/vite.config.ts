import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { brotliCompressSync, gzipSync, constants } from 'zlib';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

// Versiones comprimidas (.br y .gz) de los JS, CSS y SVG del build: el servidor las envía
// tal cual, sin comprimir en cada petición (ver server/index.js). Brotli para HTTPS, gzip para el resto
const precompress = (): Plugin => ({
  name: 'precompress',
  apply: 'build',
  // Sobre los archivos ya escritos: en generateBundle Vite aún puede retocar algunos chunks
  writeBundle(options, bundle) {
    const outDir = options.dir ?? 'dist';
    for (const fileName of Object.keys(bundle)) {
      if (!/\.(js|css|svg)$/.test(fileName)) continue;
      const path = join(outDir, fileName);
      const data = readFileSync(path);
      if (data.length < 1024) continue;
      writeFileSync(
        `${path}.br`,
        brotliCompressSync(data, {
          params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: data.length },
        })
      );
      writeFileSync(`${path}.gz`, gzipSync(data, { level: 9 }));
    }
  },
});

export default defineConfig({
  plugins: [react(), precompress()],
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.1.0'),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
