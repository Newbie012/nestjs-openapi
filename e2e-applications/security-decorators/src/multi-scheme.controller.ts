import { Controller, Get, Post, Body } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiSecurity,
  ApiResponse,
} from '@nestjs/swagger';

export class AdminActionDto {
  action: string;
  performedBy: string;
  timestamp: string;
}

export class PerformActionDto {
  action: string;
}

/**
 * Controller demonstrating multiple security schemes (AND logic).
 * Requires BOTH bearer auth AND api key.
 */
@ApiTags('Admin')
@Controller('admin')
@ApiBearerAuth('jwt')
@ApiSecurity('admin-key')
export class MultiSchemeController {
  @Get('actions')
  @ApiOperation({ summary: 'List admin actions (requires JWT AND admin key)' })
  @ApiResponse({
    status: 200,
    description: 'List of admin actions',
    type: [AdminActionDto],
  })
  listActions(): AdminActionDto[] {
    return [];
  }

  @Post('actions')
  @ApiOperation({ summary: 'Perform admin action' })
  @ApiResponse({
    status: 201,
    description: 'Action performed',
    type: AdminActionDto,
  })
  performAction(@Body() dto: PerformActionDto): AdminActionDto {
    return {
      action: dto.action,
      performedBy: 'admin',
      timestamp: new Date().toISOString(),
    };
  }

  /** Method-level security overrides controller-level */
  @Get('public-stats')
  @ApiSecurity('stats-key') // Only requires stats-key, not jwt + admin-key
  @ApiOperation({ summary: 'Get public stats (only requires stats key)' })
  @ApiResponse({ status: 200, description: 'Statistics' })
  publicStats(): { totalActions: number } {
    return { totalActions: 100 };
  }
}
