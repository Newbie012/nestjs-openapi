import { defineConfig } from '../../src/config/config.js';

export default defineConfig({
  output: 'openapi.stale.generated.json',

  files: {
    entry: 'src/app.module.ts',
    tsconfig: '../tsconfig.json',
  },

  openapi: {
    info: { title: 'Books API', version: '1.0.0' },
  },

  options: {
    overlay: {
      overlay: '1.0.0',
      info: { title: 'Public books API', version: '1.0.0' },
      actions: [
        {
          target: "$.paths['/novels'].get",
          description: 'Describe the novel listing',
          update: { summary: 'List novels' },
        },
      ],
    },
  },
});
