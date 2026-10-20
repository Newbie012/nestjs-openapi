import { surface } from '../harness.js';

const contract = surface(import.meta.url);

const files = {
  entry: ['src/users/users.module.ts', 'src/products/products.module.ts'],
  tsconfig: '../tsconfig.json',
};
const spec = 'https://spec.openapis.org/oas/v3.0.3#paths-object';

contract('multi-entry', {
  spec,
  fixture: 'multi-entry',
  config: {
    files,
    openapi: {
      info: {
        title: 'Multi-Entry API',
        version: '1.0.0',
        description: 'API with multiple entry modules',
      },
    },
  },
});

contract('multi-entry-include', {
  spec,
  fixture: 'multi-entry',
  config: {
    files,
    openapi: { info: { title: 'Multi-Entry API', version: '1.0.0' } },
    options: { include: ['UsersModule', 'ProductsModule', 'OrdersModule'] },
  },
});
