import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';

export class UserDto {
  id: string;
  email: string;
  name: string;
}

export class CreateUserDto {
  email: string;
  name: string;
  password: string;
}

/**
 * Controller with @ApiBearerAuth at class level.
 * All methods inherit bearer auth requirement.
 */
@ApiTags('Users')
@Controller('users')
@ApiBearerAuth() // Uses default scheme name 'bearer'
export class BearerController {
  @Get()
  @ApiOperation({ summary: 'List all users' })
  @ApiResponse({ status: 200, description: 'List of users', type: [UserDto] })
  findAll(): UserDto[] {
    return [];
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiResponse({ status: 200, description: 'User found', type: UserDto })
  @ApiResponse({ status: 404, description: 'User not found' })
  findOne(@Param('id') id: string): UserDto {
    return { id, email: 'user@example.com', name: 'User' };
  }

  @Post()
  @ApiOperation({ summary: 'Create new user' })
  @ApiResponse({ status: 201, description: 'User created', type: UserDto })
  create(@Body() dto: CreateUserDto): UserDto {
    return { id: '1', email: dto.email, name: dto.name };
  }
}
