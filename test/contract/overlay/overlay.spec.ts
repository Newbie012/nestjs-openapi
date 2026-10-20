import { surface } from '../harness.js';

const contract = surface(import.meta.url);

const spec = 'https://spec.openapis.org/overlay/v1.0.0';
const files = {
  entry: 'src/app.module.ts',
  tsconfig: '../tsconfig.json',
};
const openapi = { info: { title: 'Books API', version: '1.0.0' } };

contract('overlay-public', {
  spec,
  fixture: 'overlay',
  config: {
    files,
    openapi,
    options: {
      overlay: {
        overlay: '1.0.0',
        info: { title: 'Public books API', version: '1.0.0' },
        actions: [
          {
            target: "$.paths['/internal/health']",
            description: 'Hide internal routes',
            remove: true,
          },
          { target: "$.paths['/books/{id}'].delete", remove: true },
          { target: "$.paths['/books']", update: { summary: 'Books' } },
          {
            target: "$.paths['/books'].get",
            update: {
              summary: 'List books',
              'x-rate-limit': { perMinute: 100 },
            },
          },
        ],
      },
    },
  },
});

contract('overlay-no-paths', {
  spec,
  fixture: 'overlay',
  config: {
    files,
    openapi,
    options: {
      overlay: {
        overlay: '1.0.0',
        info: { title: 'Book schemas', version: '1.0.0' },
        actions: [{ target: '$.paths', remove: true }],
      },
    },
  },
  knownInvalid: [
    {
      version: '3.0.3',
      reason: 'OpenAPI 3.0 requires `paths`, and the overlay removed it',
      plan: 'none',
    },
  ],
});

contract('overlay-additional-operations', {
  spec,
  fixture: 'overlay',
  config: {
    files,
    openapi,
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
  },
  knownInvalid: [
    {
      version: '3.0.3',
      reason: 'additionalOperations is 3.2-only',
      plan: 'none',
    },
    {
      version: '3.1.0',
      reason: 'additionalOperations is 3.2-only',
      plan: 'none',
    },
  ],
});

contract('overlay-stale-target', {
  spec,
  fixture: 'overlay',
  config: {
    files,
    openapi,
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
  },
  rejects: { error: 'OverlayError' },
});
