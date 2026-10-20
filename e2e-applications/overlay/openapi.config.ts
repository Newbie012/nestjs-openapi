import { defineConfig } from '../../src/config/config.js';

export default defineConfig({
  output: 'openapi.generated.json',

  files: {
    entry: 'src/app.module.ts',
    tsconfig: '../tsconfig.json',
  },

  openapi: {
    info: { title: 'Books API', version: '1.0.0' },
  },

  options: {
    overlay: 'public.overlay.yaml',
  },
});
