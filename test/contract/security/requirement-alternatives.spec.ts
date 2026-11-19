import { surface } from '../harness.js';

const contract = surface(import.meta.url);

const spec = 'https://spec.openapis.org/oas/v3.0.3#security-requirement-object';

const config = {
  files: { entry: 'src/app.module.ts' },
  openapi: {
    info: { title: 'Requirement Alternatives API', version: '1.0.0' },
    security: {
      schemes: [
        { name: 'bearer', type: 'http', scheme: 'bearer' },
        {
          name: 'apiKey',
          type: 'apiKey',
          in: 'header',
          parameterName: 'X-API-Key',
        },
        {
          name: 'clientId',
          type: 'apiKey',
          in: 'header',
          parameterName: 'X-Client-Id',
        },
      ],
    },
  },
} as const;

const appModule = (controller: string) => `
import { Module } from '@nestjs/common';
import { ${controller} } from './${controller.toLowerCase()}.js';

@Module({ controllers: [${controller}] })
export class AppModule {}
`;

contract('security-decorators-alternatives', {
  spec,
  config,
  source: {
    'src/reportscontroller.ts': `
import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiSecurity } from '@nestjs/swagger';

@ApiBearerAuth()
@ApiSecurity('apiKey')
@Controller('reports')
export class ReportsController {
  @Get()
  list(): string[] {
    return [];
  }

  @Get('archived')
  @ApiSecurity('apiKey')
  @ApiBearerAuth()
  archived(): string[] {
    return [];
  }
}
`,
    'src/app.module.ts': appModule('ReportsController'),
  },
});

contract('security-object-requirement', {
  spec,
  config,
  source: {
    'src/reportscontroller.ts': `
import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiSecurity } from '@nestjs/swagger';

@ApiSecurity({ apiKey: [], clientId: [] })
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  @Get()
  list(): string[] {
    return [];
  }
}
`,
    'src/app.module.ts': appModule('ReportsController'),
  },
});

contract('security-object-requirement-apply-decorators', {
  spec,
  config,
  source: {
    'src/client-auth.ts': `
import { applyDecorators } from '@nestjs/common';
import { ApiSecurity } from '@nestjs/swagger';

export const ClientAuth = () =>
  applyDecorators(ApiSecurity({ apiKey: [], clientId: [] }));
`,
    'src/reportscontroller.ts': `
import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { ClientAuth } from './client-auth.js';

@Controller('reports')
export class ReportsController {
  @Get()
  @ClientAuth()
  @ApiBearerAuth()
  list(): string[] {
    return [];
  }
}
`,
    'src/app.module.ts': appModule('ReportsController'),
  },
});
