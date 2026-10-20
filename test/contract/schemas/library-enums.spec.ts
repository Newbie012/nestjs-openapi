import { surface } from '../harness.js';

const contract = surface(import.meta.url);

const SCHEMA_OBJECT = 'https://spec.openapis.org/oas/v3.1.0#schema-object';

const FILES = { entry: 'src/app.module.ts', dtoGlob: 'src/**/*.dto.ts' };

const MODULE = `
import { Module } from '@nestjs/common';
import { ResultController } from './result.controller.js';

@Module({ controllers: [ResultController] })
export class AppModule {}
`;

contract('library-enum-in-dto', {
  spec: SCHEMA_OBJECT,
  config: { files: FILES },
  source: {
    'src/result.dto.ts': `
import { HttpStatus } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';

export class ResultDto {
  code: HttpStatus;

  @ApiProperty({ enum: HttpStatus })
  declared: HttpStatus;
}
`,
    'src/result.controller.ts': `
import { Controller, Get } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { ResultDto } from './result.dto.js';

@Controller('results')
export class ResultController {
  @Get()
  @ApiResponse({ status: 200, type: ResultDto })
  find(): ResultDto {
    return new ResultDto();
  }
}
`,
    'src/app.module.ts': MODULE,
  },
});

contract('library-enum-outside-dtos', {
  spec: SCHEMA_OBJECT,
  config: { files: FILES },
  source: {
    'src/result.dto.ts': `
export class ResultDto {
  name: string;
}
`,
    'src/result.controller.ts': `
import { Controller, Get, HttpStatus, Query } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { ResultDto } from './result.dto.js';

@Controller('results')
export class ResultController {
  @Get()
  @ApiResponse({ status: 200, type: ResultDto })
  find(@Query('status') status: HttpStatus): ResultDto {
    return new ResultDto();
  }
}
`,
    'src/app.module.ts': MODULE,
  },
});
