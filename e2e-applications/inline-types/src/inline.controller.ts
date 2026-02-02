import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@Controller('inline')
@ApiTags('inline')
export class InlineController {
  @Get('simple')
  @ApiOperation({ summary: 'Get simple inline object' })
  getSimple(): { name: string; email: string } {
    return { name: 'John', email: 'john@example.com' };
  }

  @Get('optional')
  @ApiOperation({ summary: 'Get object with optional properties' })
  getOptional(): { id: number; nickname?: string } {
    return { id: 1 };
  }

  @Get('nested')
  @ApiOperation({ summary: 'Get nested inline object' })
  getNested(): { user: { name: string; age: number } } {
    return { user: { name: 'John', age: 30 } };
  }

  @Get('array')
  @ApiOperation({ summary: 'Get array of inline objects' })
  getArray(): { id: number; value: string }[] {
    return [{ id: 1, value: 'test' }];
  }
}
