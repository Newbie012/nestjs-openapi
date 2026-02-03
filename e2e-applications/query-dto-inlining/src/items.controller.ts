import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import {
  PaginationQueryDto,
  FilterQueryDto,
  CombinedQueryDto,
} from './query.dto';

@ApiTags('Items')
@Controller('items')
export class ItemsController {
  /**
   * Query DTO without explicit param name - should be inlined by default
   */
  @Get()
  @ApiOperation({ summary: 'Get items with pagination (DTO inlined)' })
  findAll(@Query() _pagination: PaginationQueryDto): string[] {
    return [];
  }

  /**
   * Query DTO with required fields - should inline with correct required flags
   */
  @Get('search')
  @ApiOperation({ summary: 'Search items with filters (DTO inlined)' })
  search(@Query() _filter: FilterQueryDto): string[] {
    return [];
  }

  /**
   * Multiple query params - DTO and explicit named param
   */
  @Get('combined')
  @ApiOperation({ summary: 'Combined query params' })
  combined(
    @Query() _query: CombinedQueryDto,
    @Query('format') _format?: string,
  ): string[] {
    return [];
  }

  /**
   * Explicit named param with DTO type - should NOT be inlined
   */
  @Get('named')
  @ApiOperation({ summary: 'Named query param (not inlined)' })
  @ApiQuery({ name: 'filter', description: 'Filter object as JSON' })
  namedFilter(@Query('filter') _filter: FilterQueryDto): string[] {
    return [];
  }

  /**
   * Primitive query params - should never be inlined
   */
  @Get('primitive')
  @ApiOperation({ summary: 'Primitive query params' })
  primitiveParams(
    @Query('id') _id: string,
    @Query('count') _count?: number,
    @Query('active') _active?: boolean,
  ): string[] {
    return [];
  }
}
