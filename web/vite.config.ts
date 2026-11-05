import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { brotliCompressSync, gzipSync, constants } from 'zlib';
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// Variables del .env de la raíz del proyecto (el mismo que lee el servidor). Las del entorno
// del proceso tienen prioridad sobre el fichero
const rootEnv = loadEnv('', join(dirname(fileURLToPath(import.meta.url)), '..'), '');

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

// Las fuentes de @fontsource declaran woff2 y, como respaldo, woff. Todos los navegadores
// actuales usan woff2, así que se quita el woff: el build no copia esos archivos
const woff2Only = (): Plugin => ({
  name: 'woff2-only',
  enforce: 'pre',
  transform(code, id) {
    if (!/[\\/]@fontsource[\\/].*\.css$/.test(id)) return null;
    return { code: code.replace(/,\s*url\([^)]*\.woff\)\s*format\(['"]woff['"]\)/g, ''), map: null };
  },
});

export default defineConfig({
  plugins: [react(), woff2Only(), precompress()],
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.1.0'),
    // Diagramas mermaid de la vista de lectura. Desactivados por defecto (el build necesita
    // mucha menos memoria). Para incluirlos: OBSIDITA_MERMAID=1 en el .env o en el entorno
    __MERMAID__: JSON.stringify(['1', 'true'].includes((process.env.OBSIDITA_MERMAID ?? rootEnv.OBSIDITA_MERMAID ?? '').trim().toLowerCase())),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Mínimo a propósito: el trozo principal lo corta mejor Rollup respetando el orden de
        // carga. Solo se separa markdown-it, que pesa ~166 kB y únicamente hace falta para la
        // vista de lectura: así la pantalla principal no lo descarga (ni espera a él) hasta
        // abrir una nota en ese modo
        manualChunks(id) {
          if (/[\\/]node_modules[\\/](markdown-it|mdurl|uc\.micro|linkify-it|punycode\.js|entities)[\\/]/.test(id)) {
            return 'markdown';
          }
        },
      },
    },
  },
  server: {
    // server/wikilinks.js (código común con el servidor) queda fuera de web/
    fs: { allow: ['..'] },
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
