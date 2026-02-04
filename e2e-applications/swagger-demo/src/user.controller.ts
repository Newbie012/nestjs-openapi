import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import type { UserDto, CreateUserDto, UpdateUserDto } from './user.dto';

@ApiTags('users')
@Controller('users')
export class UserController {
  @Get()
  @ApiOperation({ summary: 'Get all users' })
  @ApiResponse({ status: 200, description: 'List of users' })
  findAll(): UserDto[] {
    return [];
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a user by ID' })
  @ApiResponse({ status: 200, description: 'The user' })
  @ApiResponse({ status: 404, description: 'User not found' })
  findOne(@Param('id') id: string): UserDto {
    return {
      id,
      email: 'user@example.com',
      name: 'Sample User',
      role: 'user',
      createdAt: new Date().toISOString(),
    };
  }

  @Post()
  @ApiOperation({ summary: 'Create a new user' })
  @ApiResponse({ status: 201, description: 'User created' })
  create(@Body() createUserDto: CreateUserDto): UserDto {
    return {
      id: '1',
      email: createUserDto.email,
      name: createUserDto.name,
      role: createUserDto.role ?? 'user',
      createdAt: new Date().toISOString(),
    };
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a user' })
  @ApiResponse({ status: 200, description: 'User updated' })
  @ApiResponse({ status: 404, description: 'User not found' })
  update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
  ): UserDto {
    return {
      id,
      email: updateUserDto.email ?? 'user@example.com',
      name: updateUserDto.name ?? 'Sample User',
      role: updateUserDto.role ?? 'user',
      createdAt: new Date().toISOString(),
    };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a user' })
  @ApiResponse({ status: 200, description: 'User deleted' })
  @ApiResponse({ status: 404, description: 'User not found' })
  remove(@Param('id') _id: string): void {
    // Delete user
  }
}
