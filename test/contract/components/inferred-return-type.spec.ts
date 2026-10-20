import { surface } from '../harness.js';

const contract = surface(import.meta.url);

const files = { entry: 'src/app.module.ts', dtoGlob: 'src/dtos/*.dto.ts' };
const openapi = { info: { title: 'Inferred return API', version: '1.0.0' } };

/**
 * A controller method with no return annotation takes its type from the
 * service call, and the alias it returns is declared in a file the
 * controller imports only for its body classes
 */
contract('inferred-return-from-service', {
  spec: 'https://spec.openapis.org/oas/v3.0.3#components-object',
  config: { files, openapi },
  source: {
    'src/sso/sso.dto.ts': `
export class SamlPostDto {
  entryPoint: string;
  certificate: string;
}

export class OidcPostDto {
  issuer: string;
  clientId: string;
}

export type SamlConfigDto = SamlPostDto & { type: 'saml' };
export type OidcConfigDto = OidcPostDto & { type: 'oidc' };
export type SsoConfigDto = SamlConfigDto | OidcConfigDto;
`,
    'src/sso/sso.service.ts': `
import { Injectable } from '@nestjs/common';
import { SsoConfigDto } from './sso.dto.js';

@Injectable()
export class SsoService {
  async getConfiguration(realm: string): Promise<SsoConfigDto | null> {
    return null;
  }
}
`,
    'src/sso/sso.controller.ts': `
import { Body, Controller, Get, Post } from '@nestjs/common';
import { OidcPostDto, SamlPostDto } from './sso.dto.js';
import { SsoService } from './sso.service.js';

@Controller('sso')
export class SsoController {
  constructor(private readonly service: SsoService) {}

  @Get()
  async isConfigured() {
    return await this.service.getConfiguration('r');
  }

  @Post('saml')
  saveSaml(@Body() body: SamlPostDto): void {}

  @Post('oidc')
  saveOidc(@Body() body: OidcPostDto): void {}
}
`,
    'src/sso/sso.module.ts': `
import { Module } from '@nestjs/common';
import { SsoController } from './sso.controller.js';
import { SsoService } from './sso.service.js';

@Module({ controllers: [SsoController], providers: [SsoService] })
export class SsoModule {}
`,
    'src/app.module.ts': `
import { Module } from '@nestjs/common';
import { SsoModule } from './sso/sso.module.js';

@Module({ imports: [SsoModule] })
export class AppModule {}
`,
  },
});
