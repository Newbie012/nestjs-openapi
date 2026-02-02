import { ApiProperty } from '@nestjs/swagger';

export class HealthCheckDto {
  @ApiProperty({
    description: 'Overall system status',
    example: 'healthy',
  })
  status: 'healthy' | 'degraded' | 'unhealthy';

  @ApiProperty({
    description: 'Current server timestamp',
    example: '2025-09-18T14:30:00Z',
  })
  timestamp: Date;

  @ApiProperty({
    description: 'System uptime in seconds',
    example: 3600,
  })
  uptime: number;

  @ApiProperty({
    description: 'Service dependencies health status',
  })
  services: ServiceHealthDto[];
}

export class ServiceHealthDto {
  @ApiProperty({
    description: 'Service name',
    example: 'user-service',
  })
  name: string;

  @ApiProperty({
    description: 'Service status',
    example: 'healthy',
  })
  status: 'healthy' | 'degraded' | 'unhealthy';

  @ApiProperty({
    description: 'Response time in milliseconds',
    example: 45,
  })
  responseTime: number;

  @ApiProperty({
    description: 'Last check timestamp',
    example: '2025-09-18T14:29:30Z',
  })
  lastCheck: Date;
}

export class ApiInfoDto {
  @ApiProperty({
    description: 'API name',
    example: 'Microservices API Gateway',
  })
  name: string;

  @ApiProperty({
    description: 'API version',
    example: '1.0.0',
  })
  version: string;

  @ApiProperty({
    description: 'Environment',
    example: 'production',
  })
  environment: string;

  @ApiProperty({
    description: 'Available endpoints documentation URL',
    example: '/api/docs',
  })
  docsUrl: string;

  @ApiProperty({
    description: 'Available microservices',
  })
  services: string[];
}
