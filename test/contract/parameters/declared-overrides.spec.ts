import { surface } from '../harness.js';

const contract = surface(import.meta.url);

/**
 * As in @nestjs/swagger, what `@ApiQuery` declares about a parameter the
 * code already shows overrides the inferred fields, and the rest stay
 */
contract('declared-parameter-overrides', {
  spec: 'https://spec.openapis.org/oas/v3.0.3#parameter-object',
  config: {
    files: { entry: 'src/app.module.ts', dtoGlob: 'src/**/*.dto.ts' },
    openapi: { info: { title: 'Declared Overrides API', version: '1.0.0' } },
  },
  source: {
    'src/paging.dto.ts': `
import { ApiProperty } from '@nestjs/swagger';

export class PagingDto {
  @ApiProperty({ example: 10, description: 'Rows per page' })
  limit: number;

  @ApiProperty({ example: 1, description: 'Page number' })
  page: number;
}
`,
    'src/items.controller.ts': `
import { Controller, Get, Query } from '@nestjs/common';
import { ApiQuery } from '@nestjs/swagger';
import { PagingDto } from './paging.dto.js';

@Controller('items')
export class ItemsController {
  @Get()
  @ApiQuery({ name: 'limit', required: false, example: 25, deprecated: true })
  list(@Query() paging: PagingDto): string[] {
    return [];
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
