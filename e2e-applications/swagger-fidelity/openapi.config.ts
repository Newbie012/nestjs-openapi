import { defineConfig } from '../../src/config.js';
import { typeRef } from '../../src/decorators.js';

export default defineConfig({
  output: 'openapi.generated.json',

  files: {
    entry: 'src/app.module.ts',
    tsconfig: '../tsconfig.json',
    dtoGlob: 'src/**/*.dto.ts',
  },

  openapi: {
    info: {
      title: 'Swagger Fidelity API',
      version: '1.0.0',
    },
  },

  options: {
    enums: 'nest',
    // Decorators from a compiled library cannot be followed statically
    decorators: {
      LibOptional: [{ name: 'ApiPropertyOptional' }, { name: 'IsOptional' }],
      LibHidden: [{ name: 'ApiExcludeEndpoint' }],
      LibPaged: ({ args: [itemType] }) => [
        {
          name: 'ApiOkResponse',
          args: [{ type: itemType ?? typeRef('ItemDto'), isArray: true }],
        },
      ],
    },
  },
});
