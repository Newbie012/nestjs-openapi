import { surface } from '../harness.js';

const contract = surface(import.meta.url);

/**
 * With `enums: 'nest'`, an enum or literal union used straight in an
 * operation (query parameter, body, response) is written in place, as it is
 * inside a DTO
 */
contract('nest-enums-in-paths', {
  spec: 'https://spec.openapis.org/oas/v3.1.0#schema-object',
  config: {
    files: { entry: 'src/app.module.ts', dtoGlob: 'src/**/*.dto.ts' },
    options: { enums: 'nest' },
  },
  source: {
    'src/status.dto.ts': `
export enum Status {
  On = 'on',
  Off = 'off',
}

export type Level = 'a' | 'b';

export class ItemDto {
  status: Status;
  level: Level;
  list: Status[];
}
`,
    'src/items.controller.ts': `
import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ItemDto, Level, Status } from './status.dto.js';

@Controller('items')
export class ItemsController {
  @Get('status')
  status(@Query('s') s: Status): Status {
    return s;
  }

  @Get('level')
  level(@Query('l') l: Level): Level[] {
    return [l];
  }

  @Get()
  get(): ItemDto {
    return new ItemDto();
  }

  @Post()
  post(@Body() body: Status): Status[] {
    return [body];
  }
}
`,
    'src/app.module.ts': `
import { Module } from '@nestjs/common';
import { ItemsController } from './items.controller.js';

@Module({ controllers: [ItemsController] })
export class AppModule {}
`,
  },
});
