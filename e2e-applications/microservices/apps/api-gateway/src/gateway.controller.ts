import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { HealthCheckDto, ApiInfoDto } from './dto';

@ApiTags('gateway')
@Controller()
export class GatewayController {
  private startTime = Date.now();

  @Get()
  @ApiOperation({
    summary: 'API Information',
    description: 'Get basic API information and available services',
  })
  @ApiResponse({
    status: 200,
    description: 'API information',
    type: ApiInfoDto,
  })
  getApiInfo(): ApiInfoDto {
    return {
      name: 'Microservices API Gateway',
      version: '1.0.0',
      environment: 'development',
      docsUrl: '/api/docs',
      services: ['user-service', 'notification-service'],
    };
  }

  @Get('health')
  @ApiOperation({
    summary: 'Health check',
    description: 'Get overall system health status including microservices',
  })
  @ApiResponse({
    status: 200,
    description: 'System health status',
    type: HealthCheckDto,
  })
  getHealth(): HealthCheckDto {
    const uptime = Math.floor((Date.now() - this.startTime) / 1000);

    return {
      status: 'healthy',
      timestamp: new Date(),
      uptime,
      services: [
        {
          name: 'user-service',
          status: 'healthy',
          responseTime: 45,
          lastCheck: new Date(),
        },
        {
          name: 'notification-service',
          status: 'healthy',
          responseTime: 32,
          lastCheck: new Date(),
        },
      ],
    };
  }

  @Get('version')
  @ApiOperation({
    summary: 'Get API version',
    description: 'Returns the current API version',
  })
  @ApiResponse({
    status: 200,
    description: 'API version information',
    schema: {
      type: 'object',
      properties: {
        version: { type: 'string', example: '1.0.0' },
        buildDate: { type: 'string', example: '2025-09-18T14:00:00Z' },
      },
    },
  })
  getVersion(): { version: string; buildDate: string } {
    return {
      version: '1.0.0',
      buildDate: '2025-09-18T14:00:00Z',
    };
  }
}

@ApiTags('proxy')
@Controller('api')
export class ProxyController {
  @Get('users/:id/profile')
  @ApiOperation({
    summary: 'Get user profile (proxied)',
    description: 'Proxy request to user service for user profile',
  })
  @ApiParam({
    name: 'id',
    description: 'User ID',
    type: 'string',
    example: 'usr_123',
  })
  @ApiResponse({
    status: 200,
    description: 'User profile data from user service',
    schema: {
      type: 'object',
      properties: {
        user: { type: 'object' },
        preferences: { type: 'object' },
        lastLogin: { type: 'string' },
      },
    },
  })
  getUserProfile(@Param('id') id: string): any {
    // In real implementation, this would proxy to user-service
    return {
      user: { id, name: 'John Doe' },
      preferences: { theme: 'dark' },
      lastLogin: new Date(),
    };
  }

  @Get('notifications/stats')
  @ApiOperation({
    summary: 'Get notification stats (proxied)',
    description: 'Proxy request to notification service for statistics',
  })
  @ApiResponse({
    status: 200,
    description: 'Notification statistics from notification service',
    schema: {
      type: 'object',
      properties: {
        totalSent: { type: 'number' },
        pending: { type: 'number' },
        delivered: { type: 'number' },
      },
    },
  })
  getNotificationStats(): any {
    // In real implementation, this would proxy to notification-service
    return {
      totalSent: 1542,
      pending: 23,
      delivered: 1450,
    };
  }
}
