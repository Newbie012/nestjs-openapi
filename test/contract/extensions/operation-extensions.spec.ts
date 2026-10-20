import { surface } from '../harness.js';

const contract = surface(import.meta.url);

const spec = 'https://spec.openapis.org/oas/v3.0.3#specification-extensions';
const files = {
  entry: ['src/users/users.module.ts', 'src/orders/orders.module.ts'],
  tsconfig: '../tsconfig.json',
};
const openapi = {
  info: { title: 'Operation Extensions API', version: '1.0.0' },
};

contract('operation-extensions', {
  spec,
  fixture: 'operation-extensions',
  config: {
    files,
    openapi,
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
  },
});

contract('operation-extensions-class-args', {
  spec,
  fixture: 'operation-extensions',
  config: {
    files,
    openapi,
    options: {
      operationExtensions: ({ decorators }) => ({ 'x-decorators': decorators }),
    },
  },
});
