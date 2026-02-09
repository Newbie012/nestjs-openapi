import { describe, it, expect } from 'vitest';
import { Option } from 'effect';
import {
  createDecoratorFilter,
  createPathFilter,
  combineFilters,
  createFilterPipeline,
  filterMethods,
} from './filter.js';
import type { MethodInfo } from './domain.js';

// Test helper to create method info with defaults
function createMethodInfo(overrides: Partial<MethodInfo> = {}): MethodInfo {
  return {
    httpMethod: 'GET',
    path: '/test',
    methodName: 'testMethod',
    controllerName: 'TestController',
    controllerTags: ['test'],
    returnType: {
      type: Option.some('TestDto'),
      inline: Option.none(),
      container: Option.none(),
      filePath: Option.none(),
    },
    parameters: [],
    decorators: [],
    operation: {
      summary: Option.none(),
      description: Option.none(),
      operationId: Option.none(),
      deprecated: Option.none(),
    },
    responses: [],
    httpCode: Option.none(),
    consumes: [],
    produces: [],
    security: [],
    ...overrides,
  };
}

describe('createDecoratorFilter', () => {
  it('should include methods without excluded decorators', () => {
    const filter = createDecoratorFilter(['Internal', 'ApiExcludeEndpoint']);
    const method = createMethodInfo({
      decorators: ['Get', 'ApiOperation'],
    });

    expect(filter(method)).toBe(true);
  });

  it('should exclude methods with excluded decorators', () => {
    const filter = createDecoratorFilter(['Internal', 'ApiExcludeEndpoint']);
    const method = createMethodInfo({
      decorators: ['Get', 'Internal'],
    });

    expect(filter(method)).toBe(false);
  });

  it('should be case-sensitive', () => {
    const filter = createDecoratorFilter(['Internal']);
    const method = createMethodInfo({
      decorators: ['internal'], // lowercase
    });

    expect(filter(method)).toBe(true);
  });

  it('should include all methods when exclude list is empty', () => {
    const filter = createDecoratorFilter([]);
    const method = createMethodInfo({
      decorators: ['Internal', 'ApiExcludeEndpoint'],
    });

    expect(filter(method)).toBe(true);
  });

  it('should handle methods with no decorators', () => {
    const filter = createDecoratorFilter(['Internal']);
    const method = createMethodInfo({
      decorators: [],
    });

    expect(filter(method)).toBe(true);
  });
});

describe('createPathFilter', () => {
  describe('with RegExp', () => {
    it('should include paths matching the pattern', () => {
      const filter = createPathFilter(/^\/api\//);
      const method = createMethodInfo({
        path: '/api/users',
      });

      expect(filter(method)).toBe(true);
    });

    it('should exclude paths not matching the pattern', () => {
      const filter = createPathFilter(/^\/api\//);
      const method = createMethodInfo({
        path: '/internal/health',
      });

      expect(filter(method)).toBe(false);
    });

    it('should work with negative lookahead to exclude patterns', () => {
      // Exclude paths containing /internal/
      const filter = createPathFilter(/^(?!.*\/internal\/).*/);

      expect(filter(createMethodInfo({ path: '/api/users' }))).toBe(true);
      expect(filter(createMethodInfo({ path: '/internal/health' }))).toBe(
        false,
      );
      expect(filter(createMethodInfo({ path: '/api/internal/endpoint' }))).toBe(
        false,
      );
    });

    it('should be deterministic when using global regex flags', () => {
      const filter = createPathFilter(/^\/api/g);

      const results = [
        filter(createMethodInfo({ path: '/api/users' })),
        filter(createMethodInfo({ path: '/api/posts' })),
        filter(createMethodInfo({ path: '/api/comments' })),
      ];

      expect(results).toEqual([true, true, true]);
    });
  });

  describe('with predicate function', () => {
    it('should include paths where predicate returns true', () => {
      const filter = createPathFilter((path) => path.startsWith('/api/'));
      const method = createMethodInfo({
        path: '/api/users',
      });

      expect(filter(method)).toBe(true);
    });

    it('should exclude paths where predicate returns false', () => {
      const filter = createPathFilter((path) => path.startsWith('/api/'));
      const method = createMethodInfo({
        path: '/internal/health',
      });

      expect(filter(method)).toBe(false);
    });

    it('should work with complex predicate logic', () => {
      const filter = createPathFilter(
        (path) => !path.includes('/internal/') && !path.includes('/v1/'),
      );

      expect(filter(createMethodInfo({ path: '/api/users' }))).toBe(true);
      expect(filter(createMethodInfo({ path: '/internal/health' }))).toBe(
        false,
      );
      expect(filter(createMethodInfo({ path: '/api/v1/users' }))).toBe(false);
    });
  });
});

describe('combineFilters', () => {
  it('should return true when all filters pass', () => {
    const filter1 = () => true;
    const filter2 = () => true;
    const combined = combineFilters([filter1, filter2]);

    expect(combined(createMethodInfo())).toBe(true);
  });

  it('should return false when any filter fails', () => {
    const filter1 = () => true;
    const filter2 = () => false;
    const combined = combineFilters([filter1, filter2]);

    expect(combined(createMethodInfo())).toBe(false);
  });

  it('should return true for empty filter list', () => {
    const combined = combineFilters([]);

    expect(combined(createMethodInfo())).toBe(true);
  });

  it('should return the single filter for list with one filter', () => {
    const filter = (m: MethodInfo) => m.path === '/test';
    const combined = combineFilters([filter]);

    expect(combined(createMethodInfo({ path: '/test' }))).toBe(true);
    expect(combined(createMethodInfo({ path: '/other' }))).toBe(false);
  });

  it('should short-circuit on first failing filter', () => {
    let secondFilterCalled = false;
    const filter1 = () => false;
    const filter2 = () => {
      secondFilterCalled = true;
      return true;
    };
    const combined = combineFilters([filter1, filter2]);

    combined(createMethodInfo());

    expect(secondFilterCalled).toBe(false);
  });
});

describe('createFilterPipeline', () => {
  it('should return undefined when no filters are configured', () => {
    const filter = createFilterPipeline({});

    expect(filter).toBeUndefined();
  });

  it('should return undefined for empty excludeDecorators', () => {
    const filter = createFilterPipeline({
      excludeDecorators: [],
    });

    expect(filter).toBeUndefined();
  });

  it('should create decorator filter when excludeDecorators is provided', () => {
    const filter = createFilterPipeline({
      excludeDecorators: ['Internal'],
    });

    expect(filter).toBeDefined();
    expect(filter!(createMethodInfo({ decorators: ['Get'] }))).toBe(true);
    expect(filter!(createMethodInfo({ decorators: ['Internal'] }))).toBe(false);
  });

  it('should create path filter when pathFilter is provided', () => {
    const filter = createFilterPipeline({
      pathFilter: /^\/api\//,
    });

    expect(filter).toBeDefined();
    expect(filter!(createMethodInfo({ path: '/api/users' }))).toBe(true);
    expect(filter!(createMethodInfo({ path: '/internal' }))).toBe(false);
  });

  it('should combine both filters when both are provided', () => {
    const filter = createFilterPipeline({
      excludeDecorators: ['Internal'],
      pathFilter: /^\/api\//,
    });

    expect(filter).toBeDefined();

    // Both pass
    expect(
      filter!(
        createMethodInfo({
          path: '/api/users',
          decorators: ['Get'],
        }),
      ),
    ).toBe(true);

    // Decorator fails
    expect(
      filter!(
        createMethodInfo({
          path: '/api/users',
          decorators: ['Internal'],
        }),
      ),
    ).toBe(false);

    // Path fails
    expect(
      filter!(
        createMethodInfo({
          path: '/internal/health',
          decorators: ['Get'],
        }),
      ),
    ).toBe(false);

    // Both fail
    expect(
      filter!(
        createMethodInfo({
          path: '/internal/health',
          decorators: ['Internal'],
        }),
      ),
    ).toBe(false);
  });
});

describe('filterMethods', () => {
  const methods: MethodInfo[] = [
    createMethodInfo({
      path: '/api/users',
      methodName: 'getUsers',
      decorators: ['Get'],
    }),
    createMethodInfo({
      path: '/api/admin',
      methodName: 'getAdmin',
      decorators: ['Get', 'Internal'],
    }),
    createMethodInfo({
      path: '/internal/health',
      methodName: 'healthCheck',
      decorators: ['Get'],
    }),
    createMethodInfo({
      path: '/api/products',
      methodName: 'getProducts',
      decorators: ['Get', 'ApiExcludeEndpoint'],
    }),
  ];

  it('should return all methods when no filters are configured', () => {
    const result = filterMethods(methods, {});

    expect(result).toHaveLength(4);
  });

  it('should filter by decorator', () => {
    const result = filterMethods(methods, {
      excludeDecorators: ['Internal'],
    });

    expect(result).toHaveLength(3);
    expect(result.map((m) => m.methodName)).toEqual([
      'getUsers',
      'healthCheck',
      'getProducts',
    ]);
  });

  it('should filter by path', () => {
    const result = filterMethods(methods, {
      pathFilter: /^\/api\//,
    });

    expect(result).toHaveLength(3);
    expect(result.map((m) => m.methodName)).toEqual([
      'getUsers',
      'getAdmin',
      'getProducts',
    ]);
  });

  it('should combine multiple filters', () => {
    const result = filterMethods(methods, {
      excludeDecorators: ['Internal', 'ApiExcludeEndpoint'],
      pathFilter: /^\/api\//,
    });

    expect(result).toHaveLength(1);
    expect(result[0].methodName).toBe('getUsers');
  });

  it('should preserve method order', () => {
    const result = filterMethods(methods, {
      excludeDecorators: ['ApiExcludeEndpoint'],
    });

    expect(result.map((m) => m.methodName)).toEqual([
      'getUsers',
      'getAdmin',
      'healthCheck',
    ]);
  });

  it('should return empty array when all methods are filtered', () => {
    const result = filterMethods(methods, {
      pathFilter: /^\/nonexistent\//,
    });

    expect(result).toHaveLength(0);
  });
});
