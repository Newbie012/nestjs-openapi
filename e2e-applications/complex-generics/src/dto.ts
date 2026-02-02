/**
 * Complex generics test DTOs
 *
 * This module tests various generic type patterns that are common
 * in real-world NestJS applications.
 */

/**
 * Generic API response wrapper
 */
export class ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

/**
 * Generic paginated response
 */
export class PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Generic error response
 */
export class ErrorResponse<TCode extends string = string> {
  code: TCode;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Base entity with common fields
 */
export class BaseEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * User entity extending base
 */
export class UserEntity extends BaseEntity {
  email: string;
  name: string;
  role: 'admin' | 'user' | 'guest';
}

/**
 * Article entity extending base
 */
export class ArticleEntity extends BaseEntity {
  title: string;
  content: string;
  authorId: string;
  tags: string[];
  published: boolean;
}

/**
 * Comment entity extending base
 */
export class CommentEntity extends BaseEntity {
  articleId: string;
  authorId: string;
  text: string;
}

/**
 * Create DTO for articles
 */
export class CreateArticleDto {
  title: string;
  content: string;
  tags?: string[];
  published?: boolean;
}

/**
 * Update DTO for articles (partial)
 */
export class UpdateArticleDto {
  title?: string;
  content?: string;
  tags?: string[];
  published?: boolean;
}

/**
 * Nested generic - article with embedded author
 */
export class ArticleWithAuthor {
  article: ArticleEntity;
  author: UserEntity;
}

/**
 * Nested generic - article with comments
 */
export class ArticleWithComments {
  article: ArticleEntity;
  comments: CommentEntity[];
}

/**
 * Complex nested response - paginated articles with authors
 */
export class PaginatedArticlesWithAuthors {
  items: ArticleWithAuthor[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Union type response
 */
export class SearchResult {
  type: 'user' | 'article' | 'comment';
  id: string;
  score: number;
}

/**
 * Tuple-like response
 */
export class RangeResponse {
  min: number;
  max: number;
  values: number[];
}

/**
 * Generic key-value pair
 */
export class KeyValuePair<K extends string, V> {
  key: K;
  value: V;
}

/**
 * Settings with typed keys
 */
export class UserSettings {
  theme: 'light' | 'dark' | 'system';
  notifications: boolean;
  language: string;
}

/**
 * Batch operation result
 */
export class BatchResult<T> {
  succeeded: T[];
  failed: Array<{ item: T; error: string }>;
  totalProcessed: number;
}

/**
 * Generic select rule for filtering (similar to real-world SelectRule pattern)
 */
export class SelectRule<T> {
  include?: T[];
  exclude?: T[];
}

/**
 * Filter rules with inline object types - tests structure ref normalization
 * These inline types should be normalized to readable names based on property keys
 */
export class FilterRules {
  /** Should normalize to "NamespaceLabels" */
  namespaceLabels?: SelectRule<{ key: string; value: string }>;

  /** Should normalize to "K8sLabels" */
  k8sLabels?: SelectRule<{ name: string; value: string }>;

  /** Direct inline object (not wrapped in SelectRule) - should normalize to "Metadata" */
  metadata?: { version: string; timestamp: number };

  /** Clean generic - should remain as-is */
  tags?: SelectRule<string>;

  /** Another clean generic */
  severity?: SelectRule<'low' | 'medium' | 'high' | 'critical'>;
}
