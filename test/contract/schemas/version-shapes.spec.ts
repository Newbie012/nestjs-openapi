import { surface } from '../harness.js';

const contract = surface(import.meta.url);

const SCHEMA_OBJECT_30 = 'https://spec.openapis.org/oas/v3.0.3#schema-object';

const FILES = { entry: 'src/app.module.ts', dtoGlob: 'src/**/*.dto.ts' };

/** A one-endpoint app that returns `ShapeDto`, declared in `dtoSource` */
const appWith = (dtoSource: string): Record<string, string> => ({
  'src/shape.dto.ts': dtoSource,
  'src/shape.controller.ts': `
import { Controller, Get } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { ShapeDto } from './shape.dto.js';

@Controller('shapes')
export class ShapeController {
  @Get()
  @ApiResponse({ status: 200, type: ShapeDto })
  get(): ShapeDto {
    return new ShapeDto();
  }
}
`,
  'src/app.module.ts': `
import { Module } from '@nestjs/common';
import { ShapeController } from './shape.controller.js';

@Module({ controllers: [ShapeController] })
export class AppModule {}
`,
});

contract('nullable-property', {
  spec: SCHEMA_OBJECT_30,
  config: { files: FILES },
  source: appWith(`
export class ShapeDto {
  nickname: string | null;
  age?: number | null;
}
`),
});

contract('const-literal', {
  spec: SCHEMA_OBJECT_30,
  config: { files: FILES },
  source: appWith(`
export class ShapeDto {
  kind: 'card';
}
`),
});

contract('multi-value-enum', {
  spec: SCHEMA_OBJECT_30,
  config: { files: FILES },
  source: appWith(`
export class ShapeDto {
  status: 'active' | 'disabled';
}
`),
});

contract('binary-and-base64', {
  spec: SCHEMA_OBJECT_30,
  config: { files: FILES },
  source: appWith(`
import { ApiProperty } from '@nestjs/swagger';

export class ShapeDto {
  @ApiProperty({ type: 'string', format: 'binary' })
  file: unknown;

  @ApiProperty({ type: 'string', format: 'byte' })
  payload: string;
}
`),
});

contract('exclusive-bounds', {
  spec: SCHEMA_OBJECT_30,
  config: { files: FILES },
  source: appWith(`
import { ApiProperty } from '@nestjs/swagger';

export class ShapeDto {
  @ApiProperty({ minimum: 0, exclusiveMinimum: true, maximum: 10, exclusiveMaximum: true })
  score: number;
}
`),
});

contract('examples', {
  spec: SCHEMA_OBJECT_30,
  config: { files: FILES },
  source: appWith(`
import { ApiProperty } from '@nestjs/swagger';

export class ShapeDto {
  @ApiProperty({ example: 'Ada' })
  name: string;

  @ApiProperty({ example: 36 })
  age: number;
}
`),
});

contract('primitive-union', {
  spec: SCHEMA_OBJECT_30,
  config: { files: FILES },
  source: appWith(`
export class ShapeDto {
  value: string | number;
}
`),
});

contract('record-nullable-values', {
  spec: SCHEMA_OBJECT_30,
  config: { files: FILES },
  source: appWith(`
export class ShapeDto {
  labels: Record<string, string | null>;
}
`),
});

contract('nullable-enum', {
  spec: SCHEMA_OBJECT_30,
  config: { files: FILES },
  source: appWith(`
import { ApiProperty } from '@nestjs/swagger';

export enum Color {
  Red = 'red',
  Blue = 'blue',
}

export class ShapeDto {
  @ApiProperty({ enum: Color, nullable: true })
  color: Color | null;

  @ApiProperty({ enum: ['small', 'large'], nullable: true })
  size: string | null;

  tier: 'free' | 'paid' | null;
}
`),
});

contract('tuple', {
  spec: SCHEMA_OBJECT_30,
  config: { files: FILES },
  source: appWith(`
export class ShapeDto {
  pair: [string, number];
}
`),
});
