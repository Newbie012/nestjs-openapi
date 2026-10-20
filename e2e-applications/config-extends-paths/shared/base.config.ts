import { defineConfig } from '../../../src/config/config.js';

export default defineConfig({
  output: '../app/out/base.generated.json',
  files: {
    entry: '../app/src/app.module.ts',
    tsconfig: '../../tsconfig.json',
    dtoGlob: ['../app/src/**/*.dto.ts', '!../app/src/**/*.skip.dto.ts'],
  },
  openapi: {
    info: { title: 'Shared API', version: '1.0.0' },
  },
  options: {
    overlay: 'overlay.json',
  },
});
