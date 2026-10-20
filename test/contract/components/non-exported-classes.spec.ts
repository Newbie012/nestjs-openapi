import { surface } from '../harness.js';

const contract = surface(import.meta.url);

/**
 * As in @nestjs/swagger, a schema is named after every class, exported or
 * not, `abstract` ones too
 */
contract('non-exported-classes', {
  spec: 'https://spec.openapis.org/oas/v3.0.3#components-object',
  config: {
    files: { entry: 'src/app.module.ts', dtoGlob: 'src/**/*.dto.ts' },
    openapi: { info: { title: 'Non-exported Classes API', version: '1.0.0' } },
  },
  source: {
    'src/outer.dto.ts': `
abstract class AuditedBase {
  createdAt: string;
}

class InnerDto extends AuditedBase {
  label: string;
}

export class OuterDto {
  inner: InnerDto;
  audit: AuditedBase;
}
`,
    'src/outer.controller.ts': `
import { Controller, Get } from '@nestjs/common';
import { OuterDto } from './outer.dto.js';

@Controller('outer')
export class OuterController {
  @Get()
  find(): OuterDto {
    return new OuterDto();
  }
}
`,
    'src/app.module.ts': `
import { Module } from '@nestjs/common';
import { OuterController } from './outer.controller.js';

@Module({ controllers: [OuterController] })
export class AppModule {}
`,
  },
});
