import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

/** Response for health check */
export class HealthDto {
  status: string;
  timestamp: string;
}

/** Public endpoints - no security decorators */
@ApiTags('Public')
@Controller('public')
export class PublicController {
  @Get('health')
  @ApiOperation({ summary: 'Health check endpoint (no auth required)' })
  health(): HealthDto {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('version')
  @ApiOperation({ summary: 'Get API version' })
  version(): { version: string } {
    return { version: '1.0.0' };
  }
}
