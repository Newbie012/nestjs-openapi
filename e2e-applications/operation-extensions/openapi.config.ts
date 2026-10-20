import { defineConfig } from '../../src/config/config.js';

export default defineConfig({
  output: 'openapi.generated.json',

  files: {
    entry: ['src/users/users.module.ts', 'src/orders/orders.module.ts'],
    tsconfig: '../tsconfig.json',
  },

  openapi: {
    info: { title: 'Operation Extensions API', version: '1.0.0' },
  },

  options: {
    basePath: 'api',
    operationExtensions: (context) => {
      const { controller, method } = context.decorators;
      const roles = [...controller, ...method]
        .filter((decorator) => decorator.name === 'Roles')
        .flatMap((decorator) => decorator.args);
      const rateLimit = method.find(
        (decorator) => decorator.name === 'RateLimit',
      );
      return {
        'x-context': context,
        'x-owner': 'platform',
        ...(roles.length > 0 && { 'x-roles': roles }),
        ...(rateLimit && { 'x-rate-limit': rateLimit.args[0] }),
      };
    },
  },
});
