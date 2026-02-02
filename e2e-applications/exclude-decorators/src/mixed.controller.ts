import { Controller, Get, Post, Delete, Body, Param } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiExcludeEndpoint,
} from '@nestjs/swagger';

// Custom decorator to mark internal endpoints
export function Internal(): ClassDecorator & MethodDecorator {
  return () => {
    // This is a marker decorator - the filtering happens at AST level
  };
}

// DTO classes
export class ItemDto {
  id: string;
  name: string;
  createdAt: string;
}

export class CreateItemDto {
  name: string;
}

/**
 * Controller with mixed public and internal endpoints
 */
@ApiTags('Items')
@Controller('items')
export class ItemsController {
  // PUBLIC ENDPOINT - should be included
  @Get()
  @ApiOperation({ summary: 'Get all items' })
  @ApiResponse({ status: 200, description: 'List of items', type: [ItemDto] })
  findAll(): ItemDto[] {
    return [];
  }

  // PUBLIC ENDPOINT - should be included
  @Get(':id')
  @ApiOperation({ summary: 'Get item by ID' })
  @ApiResponse({ status: 200, description: 'Item found', type: ItemDto })
  @ApiResponse({ status: 404, description: 'Item not found' })
  findOne(@Param('id') _id: string): ItemDto {
    return {} as ItemDto;
  }

  // PUBLIC ENDPOINT - should be included
  @Post()
  @ApiOperation({ summary: 'Create a new item' })
  @ApiResponse({ status: 201, description: 'Item created', type: ItemDto })
  create(@Body() _createItemDto: CreateItemDto): ItemDto {
    return {} as ItemDto;
  }

  // INTERNAL ENDPOINT - should be excluded by @Internal decorator
  @Get('internal/stats')
  @Internal()
  @ApiOperation({ summary: 'Get internal statistics' })
  @ApiResponse({ status: 200, description: 'Internal stats' })
  getInternalStats(): Record<string, number> {
    return { count: 0 };
  }

  // EXCLUDED ENDPOINT - should be excluded by @ApiExcludeEndpoint
  @Delete(':id')
  @ApiExcludeEndpoint()
  @ApiOperation({ summary: 'Delete item (hidden from docs)' })
  delete(@Param('id') _id: string): void {
    // This endpoint is excluded from OpenAPI docs
  }
}

/**
 * Internal admin controller - has some endpoints with @Internal
 */
@ApiTags('Admin')
@Controller('admin')
export class AdminController {
  // INTERNAL ENDPOINT - should be excluded by @Internal decorator
  @Get('health')
  @Internal()
  @ApiOperation({ summary: 'Health check for internal monitoring' })
  healthCheck(): { status: string } {
    return { status: 'ok' };
  }

  // INTERNAL ENDPOINT - should be excluded by @Internal decorator
  @Get('metrics')
  @Internal()
  @ApiOperation({ summary: 'Get internal metrics' })
  getMetrics(): Record<string, number> {
    return {};
  }

  // PUBLIC ADMIN ENDPOINT - should be included
  @Get('config')
  @ApiOperation({ summary: 'Get public configuration' })
  @ApiResponse({ status: 200, description: 'Configuration' })
  getConfig(): Record<string, string> {
    return {};
  }
}

/**
 * Controller for testing path filtering
 */
@ApiTags('Versioned')
@Controller('v2/legacy')
export class LegacyController {
  // This endpoint is at /v2/legacy/data
  // With pathFilter, versioned paths could be excluded
  @Get('data')
  @ApiOperation({ summary: 'Legacy data endpoint' })
  @ApiResponse({ status: 200, description: 'Legacy data' })
  getLegacyData(): Record<string, unknown> {
    return {};
  }
}

/**
 * Public API controller - all endpoints should be included
 */
@ApiTags('Public')
@Controller('api/public')
export class PublicApiController {
  // PUBLIC ENDPOINT - should be included
  @Get('info')
  @ApiOperation({ summary: 'Get public API info' })
  @ApiResponse({ status: 200, description: 'API info' })
  getInfo(): { version: string; name: string } {
    return { version: '1.0', name: 'Public API' };
  }

  // PUBLIC ENDPOINT - should be included
  @Get('status')
  @ApiOperation({ summary: 'Get API status' })
  @ApiResponse({ status: 200, description: 'API status' })
  getStatus(): { online: boolean } {
    return { online: true };
  }
}
