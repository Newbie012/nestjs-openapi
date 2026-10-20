import { typeRef } from '../../../src/analysis/decorators.js';
import { surface, type ContractConfig } from '../harness.js';

const contract = surface(import.meta.url);

const files = {
  entry: 'src/app.module.ts',
  tsconfig: '../tsconfig.json',
  dtoGlob: 'src/**/*.dto.ts',
};
const openapi = { info: { title: 'Swagger Fidelity API', version: '1.0.0' } };
const spec = 'https://spec.openapis.org/oas/v3.0.3#operation-object';

const options: NonNullable<ContractConfig['options']> = {
  enums: 'nest',
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
};

contract('swagger-fidelity', {
  spec,
  fixture: 'swagger-fidelity',
  config: { files, openapi, options },
});

contract('swagger-fidelity-forbid', {
  spec,
  fixture: 'swagger-fidelity',
  config: {
    files,
    openapi,
    options: { ...options, schemas: { additionalProperties: 'forbid' } },
  },
});
