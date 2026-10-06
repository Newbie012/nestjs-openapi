import { Controller, Get, Module, Param } from '@nestjs/common';

@Controller('api/v1/audit-logs')
export class AuditLogsController {
  @Get()
  list(): string[] {
    return [];
  }

  @Get(':id')
  get(@Param('id') id: string): string {
    return id;
  }
}

@Controller('health')
export class HealthController {
  @Get()
  check(): string {
    return 'ok';
  }
}

@Module({ controllers: [AuditLogsController, HealthController] })
export class AppModule {}
