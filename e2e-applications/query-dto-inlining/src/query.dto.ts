import {
  IsOptional,
  IsInt,
  Min,
  Max,
  IsString,
  MinLength,
  IsEnum,
} from 'class-validator';

/**
 * Sort order enum for testing enum validation
 */
export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

/**
 * Pagination DTO for testing query param inlining
 */
export class PaginationQueryDto {
  page?: number;
  limit?: number;
  sortBy?: string;
}

/**
 * Filter DTO with required and optional fields
 */
export class FilterQueryDto {
  /** Required search term */
  search: string;
  /** Optional category filter */
  category?: string;
  /** Optional status filter */
  status?: 'active' | 'inactive' | 'pending';
  /** Optional date range */
  dateFrom?: string;
  dateTo?: string;
}

/**
 * Combined query params DTO
 */
export class CombinedQueryDto {
  search?: string;
  page?: number;
  limit?: number;
  includeDeleted?: boolean;
}

/**
 * DTO with validation decorators - tests that @IsOptional and constraints are preserved
 */
export class ValidatedQueryDto {
  /**
   * Required search term (no @IsOptional, no ?)
   * Should be required in OpenAPI
   */
  @IsString()
  @MinLength(1)
  search: string;

  /**
   * Optional via @IsOptional decorator (no ? token)
   * Should be optional in OpenAPI due to @IsOptional
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  page: number;

  /**
   * Optional via both @IsOptional and ? token
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number;

  /**
   * Enum with @IsEnum decorator
   * Should extract enum values
   */
  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder;
}
