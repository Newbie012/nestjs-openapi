import { defineConfig } from '../../src/config/config.js';

export default defineConfig({
  output: 'openapi.copy.generated.json',

  files: {
    entry: 'src/app.module.ts',
    tsconfig: '../tsconfig.json',
  },

  openapi: {
    version: '3.2.0',
    info: { title: 'Books API', version: '1.0.0' },
  },

  options: {
    overlay: {
      overlay: '1.0.0',
      info: { title: 'Book schemas', version: '1.0.0' },
      actions: [
        {
          target: '$.paths',
          update: {
            '/books/copy': {
              additionalOperations: {
                COPY: {
                  operationId: 'copyBooks',
                  responses: { '204': { description: 'Copied' } },
                },
              },
            },
          },
        },
      ],
    },
  },
});
