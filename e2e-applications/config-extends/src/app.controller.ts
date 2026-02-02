import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@Controller('app')
@ApiTags('app')
export class AppController {
  @Get('health')
  @ApiOperation({ summary: 'Health check' })
  health(): { status: string } {
    return { status: 'ok' };
  }
}
