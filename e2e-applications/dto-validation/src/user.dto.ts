import {
  IsString,
  IsEmail,
  IsInt,
  IsBoolean,
  IsOptional,
  MinLength,
  MaxLength,
  Min,
  Max,
  IsUUID,
  IsUrl,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  Matches,
  IsPositive,
  IsDateString,
  IsEnum,
} from 'class-validator';

/**
 * User role enum for testing @IsEnum extraction
 */
export enum UserRole {
  Admin = 'admin',
  User = 'user',
  Guest = 'guest',
}

/**
 * User status with numeric values
 */
export enum UserStatus {
  Inactive = 0,
  Active = 1,
  Suspended = 2,
}

/**
 * DTO for creating a user - demonstrates various validation decorators
 */
export class CreateUserDto {
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
  password: string;

  @IsInt()
  @Min(0)
  @Max(150)
  age: number;

  @IsEnum(UserRole)
  role: UserRole;

  /**
   * This property type is string, but @IsEnum should extract the enum values.
   * This tests that our validation-mapper extracts enum from the decorator,
   * not just from the TypeScript type.
   */
  @IsEnum(UserRole)
  roleAsString: string;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  @IsUrl()
  website?: string;

  @IsOptional()
  @IsString()
  bio?: string;
}

/**
 * DTO for updating a user - all fields optional
 */
export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(150)
  age?: number;

  @IsOptional()
  @IsUrl()
  website?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/**
 * DTO representing a user response
 */
export class UserResponseDto {
  @IsUUID()
  id: string;

  @IsString()
  name: string;

  @IsEmail()
  email: string;

  @IsInt()
  age: number;

  @IsBoolean()
  isActive: boolean;

  @IsOptional()
  @IsUrl()
  website?: string;

  @IsDateString()
  createdAt: string;

  @IsDateString()
  updatedAt: string;
}

/**
 * DTO for creating a product with array validation
 */
export class CreateProductDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsPositive()
  price: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  tags: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  stock?: number;
}

/**
 * DTO for product response
 */
export class ProductResponseDto {
  @IsUUID()
  id: string;

  @IsString()
  name: string;

  @IsString()
  description: string;

  @IsPositive()
  price: number;

  @IsArray()
  tags: string[];

  @IsInt()
  @Min(0)
  stock: number;

  @IsDateString()
  createdAt: string;
}

/**
 * DTO for pagination query parameters
 */
export class PaginationDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
