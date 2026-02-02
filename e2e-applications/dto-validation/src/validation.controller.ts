import { Controller, Get, Post, Put, Body, Param, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import {
  CreateUserDto,
  UpdateUserDto,
  UserResponseDto,
  CreateProductDto,
  ProductResponseDto,
  PaginationDto,
} from './user.dto';

@ApiTags('Users')
@Controller('users')
export class UserController {
  @Get()
  @ApiOperation({ summary: 'Get all users with pagination' })
  @ApiQuery({ name: 'page', description: 'Page number', required: false })
  @ApiQuery({
    name: 'limit',
    description: 'Items per page (max 100)',
    required: false,
  })
  @ApiResponse({
    status: 200,
    description: 'List of users',
    type: [UserResponseDto],
  })
  findAll(@Query() _pagination: PaginationDto): UserResponseDto[] {
    return [];
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a user by ID' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({
    status: 200,
    description: 'User found',
    type: UserResponseDto,
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  findOne(@Param('id') _id: string): UserResponseDto {
    return {} as UserResponseDto;
  }

  @Post()
  @ApiOperation({ summary: 'Create a new user with validation' })
  @ApiResponse({
    status: 201,
    description: 'User created',
    type: UserResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  create(@Body() _createUserDto: CreateUserDto): UserResponseDto {
    return {} as UserResponseDto;
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a user' })
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiResponse({
    status: 200,
    description: 'User updated',
    type: UserResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 404, description: 'User not found' })
  update(
    @Param('id') _id: string,
    @Body() _updateUserDto: UpdateUserDto,
  ): UserResponseDto {
    return {} as UserResponseDto;
  }
}

@ApiTags('Products')
@Controller('products')
export class ProductController {
  @Get()
  @ApiOperation({ summary: 'Get all products' })
  @ApiResponse({
    status: 200,
    description: 'List of products',
    type: [ProductResponseDto],
  })
  findAll(): ProductResponseDto[] {
    return [];
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a product by ID' })
  @ApiParam({ name: 'id', description: 'Product UUID' })
  @ApiResponse({
    status: 200,
    description: 'Product found',
    type: ProductResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Product not found' })
  findOne(@Param('id') _id: string): ProductResponseDto {
    return {} as ProductResponseDto;
  }

  @Post()
  @ApiOperation({ summary: 'Create a new product with validation' })
  @ApiResponse({
    status: 201,
    description: 'Product created',
    type: ProductResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  create(@Body() _createProductDto: CreateProductDto): ProductResponseDto {
    return {} as ProductResponseDto;
  }
}
