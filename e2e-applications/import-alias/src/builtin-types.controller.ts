import { Controller, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { UserDto } from './dto/user.dto';

@ApiTags('BuiltinTypes')
@Controller('builtin-types')
export class BuiltinTypesController {
  /**
   * Test that Array<string> is preserved, not converted to just "Array"
   */
  @Post('string-array')
  @ApiOperation({ summary: 'Accept array of strings' })
  processStringArray(@Body() ids: Array<string>): string[] {
    return ids;
  }

  /**
   * Test that Array<UserDto> preserves the full generic type
   */
  @Post('dto-array')
  @ApiOperation({ summary: 'Accept array of DTOs' })
  @ApiResponse({ status: 200, type: [UserDto] })
  processDtoArray(@Body() users: Array<UserDto>): UserDto[] {
    return users;
  }

  /**
   * Test that string[] syntax works
   */
  @Post('string-array-bracket')
  @ApiOperation({ summary: 'Accept array of strings (bracket syntax)' })
  processStringArrayBracket(@Body() ids: string[]): string[] {
    return ids;
  }

  /**
   * Test Record<string, number> utility type
   */
  @Post('record-type')
  @ApiOperation({ summary: 'Accept record type' })
  processRecord(@Body() data: Record<string, number>): Record<string, number> {
    return data;
  }

  /**
   * Test Map<string, UserDto> type
   */
  @Post('map-type')
  @ApiOperation({ summary: 'Accept map type' })
  processMap(@Body() _data: Map<string, UserDto>): void {
    // Process map
  }

  /**
   * Test Partial<UserDto> utility type
   */
  @Post('partial-type')
  @ApiOperation({ summary: 'Accept partial DTO' })
  @ApiResponse({ status: 200, type: UserDto })
  processPartial(@Body() data: Partial<UserDto>): UserDto {
    return { id: '1', name: data.name ?? '', email: data.email ?? '' };
  }
}
