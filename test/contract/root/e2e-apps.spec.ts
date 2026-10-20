import { surface } from '../harness.js';

const contract = surface(import.meta.url);

const spec = 'https://spec.openapis.org/oas/v3.0.3#openapi-object';

contract('monolith-todo-app', {
  spec,
  fixture: 'monolith-todo-app',
  config: {
    openapi: {
      info: {
        title: 'Monolith Todo API',
        version: '1.0.0',
        description: 'Monolith todo app used for E2E coverage',
      },
    },
  },
});

for (const service of ['user-service', 'notification-service', 'api-gateway']) {
  contract(service, {
    spec,
    fixture: `microservices/apps/${service}`,
    config: {
      files: {
        entry: 'src/app.module.ts',
        tsconfig: '../../../tsconfig.json',
      },
      openapi: { info: { title: service, version: '1.0.0' } },
    },
  });
}
