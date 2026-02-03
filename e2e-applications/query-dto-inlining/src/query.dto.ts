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
