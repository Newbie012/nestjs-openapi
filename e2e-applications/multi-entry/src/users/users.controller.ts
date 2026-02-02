import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@Controller('users')
@ApiTags('users')
export class UsersController {
  @Get()
  @ApiOperation({ summary: 'Get all users' })
  findAll(): string[] {
    return [];
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID' })
  findOne(@Param('id') id: string): string {
    return id;
  }
}
