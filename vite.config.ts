import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {viteSingleFile} from 'vite-plugin-singlefile';
import pkg from './package.json';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), viteSingleFile()],
    // package.json's "version" is the single source of truth for the app version
    // (Electron/electron-builder also read it for the About panel and Get Info) —
    // inject it as a build-time constant instead of duplicating it anywhere else.
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      // Inline all assets (images etc.) as data-URIs so the output is truly one file.
      assetsInlineLimit: 100 * 1024,
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
