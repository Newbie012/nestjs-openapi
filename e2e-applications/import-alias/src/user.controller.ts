import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
// Import with aliases - the schema refs should use original names (UserDto, CreateUserDto, UpdateUserDto)
import {
  UserDto as UserResponseDto,
  CreateUserDto as UserCreateRequest,
  UpdateUserDto as UserPatchRequest,
} from './dto/user.dto';

@ApiTags('Users')
@Controller('users')
export class UserController {
  @Get()
  @ApiOperation({ summary: 'Get all users' })
  @ApiResponse({
    status: 200,
    description: 'List of users',
    type: [UserResponseDto],
  })
  findAll(): UserResponseDto[] {
    return [];
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID' })
  @ApiResponse({
    status: 200,
    description: 'User found',
    type: UserResponseDto,
  })
  findOne(@Param('id') id: string): UserResponseDto {
    return { id, name: '', email: '' };
  }

  @Post()
  @ApiOperation({ summary: 'Create a new user' })
  @ApiResponse({
    status: 201,
    description: 'User created',
    type: UserResponseDto,
  })
  create(@Body() dto: UserCreateRequest): UserResponseDto {
    return { id: '1', name: dto.name, email: dto.email };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update user' })
  @ApiResponse({
    status: 200,
    description: 'User updated',
    type: UserResponseDto,
  })
  update(
    @Param('id') id: string,
    @Body() dto: UserPatchRequest,
  ): UserResponseDto {
    return { id, name: dto.name ?? '', email: dto.email ?? '' };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete user' })
  @ApiResponse({ status: 204, description: 'User deleted' })
  remove(@Param('id') _id: string): void {
    // Delete user
  }
}
