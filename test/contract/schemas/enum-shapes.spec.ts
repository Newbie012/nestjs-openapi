import { surface } from '../harness.js';

const contract = surface(import.meta.url);

const SCHEMA_OBJECT = 'https://spec.openapis.org/oas/v3.1.0#schema-object';

const FILES = { entry: 'src/app.module.ts', dtoGlob: 'src/**/*.dto.ts' };

const MODULE = `
import { Module } from '@nestjs/common';
import { ShapeController } from './shape.controller.js';

@Module({ controllers: [ShapeController] })
export class AppModule {}
`;

const CONTROLLER = `
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
`;

const appWith = (dtoSource: string): Record<string, string> => ({
  'src/shape.dto.ts': dtoSource,
  'src/shape.controller.ts': CONTROLLER,
  'src/app.module.ts': MODULE,
});

contract('enum-shapes-numeric', {
  spec: SCHEMA_OBJECT,
  config: { files: FILES },
  source: appWith(`
export enum Level {
  Low = 1,
  Mid = 2,
  High = 3,
}

export class ShapeDto {
  byLevel: Record<Level, string>;
  maybeByLevel: Partial<Record<Level, string>>;
  levels: Level.Low | Level.Mid;
  single: Level.High;
}
`),
});

contract('enum-shapes-string', {
  spec: SCHEMA_OBJECT,
  config: { files: FILES },
  source: appWith(`
export enum Color {
  Red = 'red',
  Green = 'green',
  Blue = 'blue',
}

export class ShapeDto {
  byColor: Record<Color, number>;
  maybeByColor: Partial<Record<Color, number>>;
  colors: Color.Red | Color.Green;
  single: Color.Blue;
}
`),
});

contract('enum-shapes-library', {
  spec: SCHEMA_OBJECT,
  config: { files: FILES },
  source: appWith(`
import { HttpStatus } from '@nestjs/common';

export class ShapeDto {
  byStatus: Record<HttpStatus, string>;
  maybeByStatus: Partial<Record<HttpStatus, string>>;
  statuses: HttpStatus.OK | HttpStatus.CREATED;
  single: HttpStatus.NOT_FOUND;
}
`),
});

contract('enum-shapes-in-operations', {
  spec: SCHEMA_OBJECT,
  config: { files: FILES },
  source: {
    'src/shape.dto.ts': `
export class ShapeDto {
  name: string;
}
`,
    'src/color.ts': `
export enum Color {
  Red = 'red',
  Green = 'green',
  Blue = 'blue',
}
`,
    'src/shape.controller.ts': `
import { Body, Controller, Get, HttpStatus, Post, Query } from '@nestjs/common';
import { Color } from './color.js';

@Controller('shapes')
export class ShapeController {
  @Get('by-color')
  byColor(): Record<Color, number> {
    return { red: 1, green: 2, blue: 3 };
  }

  @Get('maybe-by-color')
  maybeByColor(): Partial<Record<Color, number>> {
    return {};
  }

  @Get('colors')
  colors(@Query('c') c: Color.Red | Color.Green): Color.Red | Color.Green {
    return c;
  }

  @Get('single')
  single(): Color.Blue {
    return Color.Blue;
  }

  @Get('by-status')
  byStatus(): Record<HttpStatus, string> {
    return {} as Record<HttpStatus, string>;
  }

  @Get('maybe-by-status')
  maybeByStatus(): Partial<Record<HttpStatus, string>> {
    return {};
  }

  @Get('statuses')
  statuses(): HttpStatus.OK | HttpStatus.CREATED {
    return HttpStatus.OK;
  }

  @Post('single-status')
  singleStatus(@Body() body: HttpStatus.NOT_FOUND): HttpStatus.NOT_FOUND {
    return body;
  }
}
`,
    'src/app.module.ts': MODULE,
  },
});
