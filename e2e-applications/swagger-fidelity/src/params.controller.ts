import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiHeader,
  ApiHeaders,
  ApiParam,
  ApiProperty,
  ApiPropertyOptional,
  ApiQuery,
} from '@nestjs/swagger';
import { IsArray } from 'class-validator';
import { Priority } from './properties.dto';

export class PageQueryDto {
  @ApiPropertyOptional({ description: 'Page size', example: 20, minimum: 1 })
  limit?: number;

  @ApiProperty({ description: 'Sort field', enum: ['name', 'createdAt'] })
  sortBy: string;

  // Sent as `?tags=red,blue` and split by a pipe: the declared type wins
  @ApiPropertyOptional({ type: String, example: 'red,blue' })
  @IsArray()
  tags?: string[];

  // Schema examples, not a Parameter Object's examples map
  @ApiPropertyOptional({ examples: ['red', 'blue'] })
  colors?: string[];

  @ApiPropertyOptional({ examples: ['2024-01-01', '2024-02-01'], type: Date })
  bornSince?: Date;
}

export class FilterQueryDto {
  @ApiPropertyOptional({ description: 'Free text search', example: 'nginx' })
  q?: string;
}

@Controller('params')
@ApiHeader({ name: 'x-workspace', description: 'Workspace id', required: true })
export class ParamsController {
  @Get(':imageBuildId')
  @ApiParam({
    name: 'imageBuildId',
    description: 'Image build id',
    example: 'build-1',
    format: 'uuid',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Max items',
    example: 50,
    type: Number,
    minimum: 1,
    default: 10,
  })
  @ApiQuery({ name: 'priority', enum: Priority, required: false })
  @ApiQuery({
    name: 'levels',
    enum: Priority,
    enumName: 'Priority',
    isArray: true,
  })
  @ApiQuery({
    name: 'ids',
    type: [String],
    format: 'uuid',
    style: 'form',
    explode: false,
    deprecated: true,
    allowEmptyValue: true,
  })
  @ApiQuery({
    name: 'filter',
    required: false,
    schema: { type: 'object', properties: { a: { type: 'string' } } },
    examples: { one: { value: { a: 'x' } } },
  })
  @ApiQuery({ type: FilterQueryDto })
  @ApiHeaders([
    { name: 'x-request-id', description: 'Request id' },
    { name: 'x-trace', required: true },
  ])
  get(
    @Param('imageBuildId') imageBuildId: string,
    @Query('limit') limit?: number,
  ): string {
    return `${imageBuildId}${limit}`;
  }

  @Get()
  @ApiQuery({
    name: 'bornSince',
    required: false,
    type: Date,
    example: '2024-01-01',
  })
  page(@Query() query: PageQueryDto): string {
    return String(query);
  }
}
