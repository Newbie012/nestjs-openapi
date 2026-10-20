import { surface } from '../harness.js';

const contract = surface(import.meta.url);

/**
 * As in @nestjs/swagger, the type `@ApiProperty` declares replaces the one
 * TypeScript infers: a `string[]` declared `type: String` is a string, while
 * `isArray` or `[String]` declare an array. A `T | null` stays nullable and a
 * property keeps the description from its doc comment.
 */
contract('declared-type-override', {
  spec: 'https://spec.openapis.org/oas/v3.0.3#schema-object',
  config: {
    files: { entry: 'src/app.module.ts', dtoGlob: 'src/**/*.dto.ts' },
    openapi: {
      info: { title: 'Declared Type Override API', version: '1.0.0' },
    },
  },
  source: {
    'src/thing.dto.ts': `
import { ApiProperty } from '@nestjs/swagger';

export class ThingDto {
  /** Display name */
  @ApiProperty({ type: String })
  name: string | null;

  @ApiProperty({ type: String })
  asString: string[];

  @ApiProperty({ type: String, isArray: true })
  withIsArray: string[];

  @ApiProperty({ type: [String] })
  withBrackets: string[];
}
`,
    'src/things.controller.ts': `
import { Controller, Get } from '@nestjs/common';
import { ThingDto } from './thing.dto.js';

@Controller('things')
export class ThingsController {
  @Get()
  find(): ThingDto {
    return new ThingDto();
  }
}
`,
    'src/app.module.ts': `
import { Module } from '@nestjs/common';
import { ThingsController } from './things.controller.js';

@Module({ controllers: [ThingsController] })
export class AppModule {}
`,
  },
});
