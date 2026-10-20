import { surface } from '../harness.js';

const contract = surface(import.meta.url);

const FILES = { entry: 'src/app.module.ts', dtoGlob: 'src/**/*.dto.ts' };

contract('nested-subschemas', {
  spec: 'https://spec.openapis.org/oas/v3.1.0#schema-object',
  config: { files: FILES },
  source: {
    'src/maps.dto.ts': `
export class UserDto {
  id: string;
}

export class MapsDto {
  labels: Record<string, string | null>;
  owners: Record<string, UserDto | null>;
  counts: Record<string, number>;
}
`,
    'src/maps.controller.ts': `
import { Controller, Get } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { MapsDto } from './maps.dto.js';

@Controller('maps')
export class MapsController {
  @Get()
  @ApiResponse({ status: 200, type: MapsDto })
  get(): MapsDto {
    return new MapsDto();
  }
}
`,
    'src/app.module.ts': `
import { Module } from '@nestjs/common';
import { MapsController } from './maps.controller.js';

@Module({ controllers: [MapsController] })
export class AppModule {}
`,
  },
});
