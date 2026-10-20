import { surface } from '../harness.js';

const contract = surface(import.meta.url);

contract('api-property-enum', {
  spec: 'https://spec.openapis.org/oas/v3.0.3#schema-object',
  fixture: 'api-property-enum',
  config: {
    openapi: {
      info: {
        title: 'ApiProperty Enum Test',
        version: '1.0.0',
        description: 'Tests @ApiProperty({ enum: ... }) extraction',
      },
    },
  },
});
