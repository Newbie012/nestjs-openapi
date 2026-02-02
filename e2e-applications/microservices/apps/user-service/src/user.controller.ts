import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { UserService } from './user.service';
import { CreateUserDto, UpdateUserDto, UserDto, UserProfileDto } from './dto';

@ApiTags('users')
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @ApiOperation({
    summary: 'Get all users',
    description:
      'Retrieve a list of users with optional filtering by role and active status',
  })
  @ApiQuery({
    name: 'role',
    required: false,
    description: 'Filter users by role',
    enum: ['admin', 'user', 'moderator'],
  })
  @ApiQuery({
    name: 'isActive',
    required: false,
    description: 'Filter users by active status',
    type: 'boolean',
  })
  @ApiResponse({
    status: 200,
    description: 'List of users',
    type: [UserDto],
  })
  findAll(
    @Query('role') role?: 'admin' | 'user' | 'moderator',
    @Query('isActive') isActive?: boolean,
  ): UserDto[] {
    return this.userService.findAll({ role, isActive });
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get user by ID',
    description: 'Retrieve a specific user by their unique identifier',
  })
  @ApiParam({
    name: 'id',
    description: 'User unique identifier',
    type: 'string',
    example: 'usr_123456789',
  })
  @ApiResponse({
    status: 200,
    description: 'User details',
    type: UserDto,
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  findOne(@Param('id') id: string): UserDto {
    return this.userService.findById(id);
  }

  @Get(':id/profile')
  @ApiOperation({
    summary: 'Get user profile',
    description:
      'Retrieve complete user profile including preferences and last login',
  })
  @ApiParam({
    name: 'id',
    description: 'User unique identifier',
    type: 'string',
    example: 'usr_123456789',
  })
  @ApiResponse({
    status: 200,
    description: 'User profile with preferences',
    type: UserProfileDto,
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  getProfile(@Param('id') id: string): UserProfileDto {
    return this.userService.findProfile(id);
  }

  @Post()
  @ApiOperation({
    summary: 'Create new user',
    description: 'Create a new user account in the system',
  })
  @ApiBody({
    description: 'User creation data',
    type: CreateUserDto,
  })
  @ApiResponse({
    status: 201,
    description: 'User created successfully',
    type: UserDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid user data provided',
  })
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createUserDto: CreateUserDto): UserDto {
    return this.userService.create(createUserDto);
  }

  @Put(':id')
  @ApiOperation({
    summary: 'Update user',
    description: "Update an existing user's information",
  })
  @ApiParam({
    name: 'id',
    description: 'User unique identifier',
    type: 'string',
    example: 'usr_123456789',
  })
  @ApiBody({
    description: 'User update data',
    type: UpdateUserDto,
  })
  @ApiResponse({
    status: 200,
    description: 'User updated successfully',
    type: UserDto,
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
  ): UserDto {
    return this.userService.update(id, updateUserDto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete user',
    description: 'Remove a user from the system',
  })
  @ApiParam({
    name: 'id',
    description: 'User unique identifier',
    type: 'string',
    example: 'usr_123456789',
  })
  @ApiResponse({
    status: 204,
    description: 'User deleted successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): void {
    this.userService.delete(id);
  }
}
