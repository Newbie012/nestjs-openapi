import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// =============================================
// Types (inlined to avoid module resolution issues at runtime)
// =============================================

// Union Types (string literals)
export type OrderStatus = 'pending' | 'shipped' | 'delivered';

// Enums
export enum Role {
  Admin = 'admin',
  User = 'user',
  Guest = 'guest',
}

// Interfaces
export interface Address {
  street: string;
  city: string;
  zipCode: string;
}

// Discriminated Union
export type ApiResponse<T> =
  | { status: 'success'; data: T }
  | { status: 'error'; message: string; code: number };

// =============================================
// Test Case: Union of Objects (not just string literals)
// =============================================
export class CatDto {
  name: string;
  meow: boolean;
}

export class DogDto {
  name: string;
  bark: boolean;
}

// A property that is a union of different object types
export class PetOwnerDto {
  ownerName: string;
  pet: CatDto | DogDto; // Union of objects
}

// =============================================
// Test Case: Interface as return type (not a class)
// =============================================
export interface IUserProfile {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

// =============================================
// DTOs for testing comparison claims
// =============================================

// Basic DTO with union type property
export class CreateOrderDto {
  status: OrderStatus;
  notes?: string; // optional
}

// =============================================
// DECORATED DTO - Sanity check that @nestjs/swagger works with explicit decorators
// =============================================
export class DecoratedUserDto {
  @ApiProperty({ description: 'User ID' })
  id: string;

  @ApiProperty({ description: 'User name' })
  name: string;

  @ApiProperty({ description: 'User email', format: 'email' })
  email: string;

  @ApiProperty({ enum: ['admin', 'user', 'guest'], description: 'User role' })
  role: Role;

  @ApiPropertyOptional({ description: 'User bio', nullable: true })
  bio?: string | null;
}

// DTO with interface property
export class UserDto {
  id: string;
  name: string;
  email: string;
  role: Role;
  address: Address;
}

// DTO with nullable property
export class UpdateUserDto {
  name?: string; // optional
  bio: string | null; // nullable
  age: number | null;
}

// Generic wrapper
export class PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

// DTO for query params
export class PaginationQueryDto {
  page: number;
  limit: number;
  search?: string;
}

// DTO for testing @Body
export class CreateUserDto {
  name: string;
  email: string;
  role: Role;
  address: Address;
}
