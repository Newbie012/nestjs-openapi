import { defineConfig } from '../../src/config.js';

export default defineConfig({
  output: 'openapi.generated.json',
  openapi: {
    info: {
      title: 'ApiProperty Enum Test',
      version: '1.0.0',
      description: 'Tests @ApiProperty({ enum: ... }) extraction',
    },
  },
});
