import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import { generateAsync } from '../src/internal.js';

const apps = [
  ['monolith-todo-app', 'e2e-applications/monolith-todo-app/src/app.module.ts'],
  [
    'user-service',
    'e2e-applications/microservices/apps/user-service/src/app.module.ts',
  ],
  [
    'notification-service',
    'e2e-applications/microservices/apps/notification-service/src/app.module.ts',
  ],
  [
    'api-gateway',
    'e2e-applications/microservices/apps/api-gateway/src/app.module.ts',
  ],
  ['complex-generics', 'e2e-applications/complex-generics/src/app.module.ts'],
];

describe('OpenAPI generation for E2E apps', () => {
  it.each(apps)(
    'should generate OpenAPI spec for %s that matches snapshot',
    async (name, entry) => {
      const openApi = await generateAsync({
        tsconfig: resolve(process.cwd(), 'tsconfig.json'),
        entry: resolve(process.cwd(), entry),
      });

      expect(openApi).toMatchSnapshot(`${name}-openapi`);
    },
  );
});
