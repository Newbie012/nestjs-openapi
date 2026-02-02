import { Controller, Get, Post, Put, Param, Query, Body } from '@nestjs/common';
import {
  CreateOrderDto,
  UserDto,
  UpdateUserDto,
  PaginatedResponse,
  CreateUserDto,
  DecoratedUserDto,
  ApiResponse as ApiResponseType,
  PetOwnerDto,
  IUserProfile,
} from './dto';

@Controller('api')
export class AppController {
  // =============================================
  // Test 1: Union Types - return type with union property
  // =============================================
  @Post('orders')
  createOrder(@Body() dto: CreateOrderDto): CreateOrderDto {
    return dto;
  }

  // =============================================
  // Test 2: Generic Types - PaginatedResponse<UserDto>
  // =============================================
  @Get('users')
  getUsers(
    @Query('page') page: number,
    @Query('limit') limit: number,
  ): PaginatedResponse<UserDto> {
    return {
      items: [],
      total: 0,
      page,
      limit,
    };
  }

  // =============================================
  // Test 3: Interface property - Address interface
  // =============================================
  @Get('users/:id')
  getUser(@Param('id') id: string): UserDto {
    return {
      id,
      name: 'Test',
      email: 'test@test.com',
      role: 'user' as any,
      address: { street: '', city: '', zipCode: '' },
    };
  }

  // =============================================
  // Test 4: Nullable Types - string | null
  // =============================================
  @Put('users/:id')
  updateUser(
    @Param('id') _id: string,
    @Body() dto: UpdateUserDto,
  ): UpdateUserDto {
    return dto;
  }

  // =============================================
  // Test 5: Enum - Role enum
  // =============================================
  @Post('users')
  createUser(@Body() dto: CreateUserDto): UserDto {
    return {
      id: '1',
      ...dto,
    };
  }

  // =============================================
  // Test 6: Discriminated Union - ApiResponse<UserDto>
  // =============================================
  @Get('users/:id/response')
  getUserResponse(@Param('id') id: string): ApiResponseType<UserDto> {
    return {
      status: 'success',
      data: {
        id,
        name: 'Test',
        email: 'test@test.com',
        role: 'user' as any,
        address: { street: '', city: '', zipCode: '' },
      },
    };
  }

  // =============================================
  // Test 7: Query parameters with types
  // =============================================
  @Get('search')
  search(
    @Query('q') _query: string,
    @Query('page') _page: number,
    @Query('limit') _limit: number,
    @Query('active') _active: boolean,
  ): UserDto[] {
    return [];
  }

  // =============================================
  // Test 8: Decorated DTO - Sanity check for @nestjs/swagger
  // This proves @nestjs/swagger DOES work with explicit @ApiProperty decorators
  // =============================================
  @Get('decorated-user')
  getDecoratedUser(): DecoratedUserDto {
    return {
      id: '1',
      name: 'Test',
      email: 'test@test.com',
      role: 'user' as any,
      bio: null,
    };
  }

  // =============================================
  // Test 9: Union of Objects - property is CatDto | DogDto
  // =============================================
  @Post('pet-owners')
  createPetOwner(@Body() dto: PetOwnerDto): PetOwnerDto {
    return dto;
  }

  // =============================================
  // Test 10: Interface as return type (not a class)
  // =============================================
  @Get('profile/:id')
  getUserProfile(@Param('id') id: string): IUserProfile {
    return {
      id,
      username: 'test',
      displayName: 'Test User',
      avatarUrl: null,
    };
  }
}
