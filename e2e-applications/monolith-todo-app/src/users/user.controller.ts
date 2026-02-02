import {
  Controller,
  Get,
  Post,
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
import { CreateUserDto, UserDto } from './dto';

@ApiTags('users')
@Controller('api/users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @ApiOperation({ summary: 'Get all users' })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Search users by name or email',
    type: 'string',
  })
  @ApiResponse({
    status: 200,
    description: 'List of users',
    type: [UserDto],
  })
  findAll(@Query('search') search?: string): UserDto[] {
    let users = this.userService.findAll();

    if (search) {
      const searchLower = search.toLowerCase();
      users = users.filter(
        (user) =>
          user.name.toLowerCase().includes(searchLower) ||
          user.email.toLowerCase().includes(searchLower),
      );
    }

    return users;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a user by ID' })
  @ApiParam({
    name: 'id',
    description: 'User ID',
    type: 'string',
  })
  @ApiResponse({
    status: 200,
    description: 'The user',
    type: UserDto,
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
  })
  findOne(@Param('id') id: string): UserDto {
    return this.userService.findById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new user' })
  @ApiBody({
    description: 'User data',
    type: CreateUserDto,
  })
  @ApiResponse({
    status: 201,
    description: 'The created user',
    type: UserDto,
  })
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createUserDto: CreateUserDto): UserDto {
    return this.userService.create(createUserDto);
  }
}
