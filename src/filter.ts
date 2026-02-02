/**
 * Filtering System for OpenAPI Generation
 *
 * Provides filters for excluding endpoints based on:
 * - Decorator names (e.g., @Internal, @ApiExcludeEndpoint)
 * - Path patterns (regex or predicate function)
 *
 * All filters return true to INCLUDE an endpoint, false to EXCLUDE it.
 */

import type { MethodInfo } from './domain.js';

/**
 * Filter function type for MethodInfo
 * Returns true to include the method, false to exclude it
 */
export type MethodFilter = (method: MethodInfo) => boolean;

/**
 * Options for filtering methods
 */
export interface FilterOptions {
  /**
   * Decorator names to exclude endpoints for.
   * Endpoints with any of these decorators will be filtered out.
   */
  readonly excludeDecorators?: readonly string[];

  /**
   * Filter paths using a regex pattern or predicate function.
   * - If a RegExp is provided, paths matching the pattern are INCLUDED.
   * - If a function is provided, paths returning true are INCLUDED.
   */
  readonly pathFilter?: RegExp | ((path: string) => boolean);
}

/**
 * Creates a filter that excludes methods with specific decorators.
 *
 * Supports "composed decorators" - if a decorator name matches any of the
 * exclude list (exact match, case-sensitive), the method is excluded.
 *
 * @param excludeDecorators - List of decorator names to exclude
 * @returns A filter function that returns true if the method should be included
 *
 * @example
 * ```typescript
 * const filter = createDecoratorFilter(['Internal', 'ApiExcludeEndpoint']);
 * const included = methods.filter(filter);
 * ```
 */
export const createDecoratorFilter = (
  excludeDecorators: readonly string[],
): MethodFilter => {
  if (excludeDecorators.length === 0) {
    return () => true;
  }

  const excludeSet = new Set(excludeDecorators);

  return (method: MethodInfo): boolean => {
    // Check if any of the method's decorators are in the exclude set
    const hasExcludedDecorator = method.decorators.some((decorator) =>
      excludeSet.has(decorator),
    );
    return !hasExcludedDecorator;
  };
};

/**
 * Creates a filter that includes/excludes methods based on path patterns.
 *
 * @param pathFilter - A RegExp that paths must match to be INCLUDED,
 *                     or a predicate function returning true to INCLUDE
 * @returns A filter function that returns true if the method should be included
 *
 * @example
 * ```typescript
 * // Exclude paths containing /internal/
 * const filter = createPathFilter(/^(?!.*\/internal\/).* /);
 *
 * // Using a function
 * const filter = createPathFilter(path => !path.includes('/internal/'));
 * ```
 */
export const createPathFilter = (
  pathFilter: RegExp | ((path: string) => boolean),
): MethodFilter => {
  if (typeof pathFilter === 'function') {
    return (method: MethodInfo): boolean => pathFilter(method.path);
  }

  return (method: MethodInfo): boolean => pathFilter.test(method.path);
};

/**
 * Combines multiple filters into a single filter using AND logic.
 * A method is included only if ALL filters return true.
 *
 * @param filters - Array of filter functions to combine
 * @returns A combined filter function
 *
 * @example
 * ```typescript
 * const combinedFilter = combineFilters([
 *   createDecoratorFilter(['Internal']),
 *   createPathFilter(/^(?!.*\/internal\/).* /),
 * ]);
 * ```
 */
export const combineFilters = (
  filters: readonly MethodFilter[],
): MethodFilter => {
  if (filters.length === 0) {
    return () => true;
  }

  if (filters.length === 1) {
    return filters[0];
  }

  return (method: MethodInfo): boolean =>
    filters.every((filter) => filter(method));
};

/**
 * Creates a filter pipeline from FilterOptions.
 *
 * @param options - Filter configuration options
 * @returns A combined filter function, or undefined if no filters are configured
 *
 * @example
 * ```typescript
 * const filter = createFilterPipeline({
 *   excludeDecorators: ['Internal', 'ApiExcludeEndpoint'],
 *   pathFilter: /^(?!.*\/internal\/).* /,
 * });
 *
 * if (filter) {
 *   methods = methods.filter(filter);
 * }
 * ```
 */
export const createFilterPipeline = (
  options: FilterOptions,
): MethodFilter | undefined => {
  const filters: MethodFilter[] = [];

  if (options.excludeDecorators && options.excludeDecorators.length > 0) {
    filters.push(createDecoratorFilter(options.excludeDecorators));
  }

  if (options.pathFilter) {
    filters.push(createPathFilter(options.pathFilter));
  }

  if (filters.length === 0) {
    return undefined;
  }

  return combineFilters(filters);
};

/**
 * Applies filters to a list of methods.
 *
 * @param methods - Methods to filter
 * @param options - Filter options
 * @returns Filtered methods
 *
 * @example
 * ```typescript
 * const filtered = filterMethods(methods, {
 *   excludeDecorators: ['Internal'],
 *   pathFilter: path => !path.startsWith('/admin'),
 * });
 * ```
 */
export const filterMethods = (
  methods: readonly MethodInfo[],
  options: FilterOptions,
): readonly MethodInfo[] => {
  const filter = createFilterPipeline(options);

  if (!filter) {
    return methods;
  }

  return methods.filter(filter);
};
