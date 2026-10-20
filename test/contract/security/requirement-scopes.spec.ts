import { surface } from '../harness.js';

const contract = surface(import.meta.url);

contract('api-key-scopes', {
  spec: 'https://spec.openapis.org/oas/v3.0.3#security-requirement-object',
  config: {
    files: { entry: 'src/app.module.ts' },
    openapi: {
      info: { title: 'Scopes API', version: '1.0.0' },
      security: {
        schemes: [
          {
            name: 'api-key',
            type: 'apiKey',
            in: 'header',
            parameterName: 'X-API-Key',
          },
        ],
      },
    },
  },
  source: {
    'src/reports.controller.ts': `
import { Controller, Get } from '@nestjs/common';
import { ApiSecurity } from '@nestjs/swagger';

@Controller('reports')
export class ReportsController {
  @Get()
  @ApiSecurity('api-key', ['read'])
  list(): string[] {
    return [];
  }
}
`,
    'src/app.module.ts': `
import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller.js';

@Module({ controllers: [ReportsController] })
export class AppModule {}
`,
  },
});
