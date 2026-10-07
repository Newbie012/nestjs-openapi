import { defineConfig } from '../../src/config/config.js';

export default defineConfig({
  output: 'openapi.function.generated.json',

  files: {
    entry: 'src/app.module.ts',
    tsconfig: '../tsconfig.json',
    dtoGlob: 'src/**/*.dto.ts',
  },

  openapi: {
    info: {
      title: 'Schema Collisions API',
      version: '1.0.0',
    },
  },

  options: {
    // src/<feature>/... → <Feature><Name>, e.g. OrdersAddressDto
    schemaNameCollision: ({ name, relativePath }) => {
      const feature = relativePath.split('/')[1] ?? '';
      const folder = relativePath.split('/').at(-2) ?? '';
      const prefix = feature === 'plugins' ? folder : feature;
      return `${prefix.charAt(0).toUpperCase()}${prefix.slice(1)}${name}`;
    },
  },
});
