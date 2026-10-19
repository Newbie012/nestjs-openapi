import { defineConfig } from '../../src/config/config.js';

export default defineConfig({
  output: 'openapi.class-args.generated.json',

  files: {
    entry: ['src/users/users.module.ts', 'src/orders/orders.module.ts'],
    tsconfig: '../tsconfig.json',
  },

  openapi: {
    info: { title: 'Operation Extensions API', version: '1.0.0' },
  },

  options: {
    operationExtensions: ({ decorators }) => ({ 'x-decorators': decorators }),
  },
});
