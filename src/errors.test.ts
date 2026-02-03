import { describe, it, expect } from 'vitest';
import {
  ProjectInitError,
  EntryNotFoundError,
  ConfigNotFoundError,
  ConfigLoadError,
  ConfigValidationError,
  InvalidMethodError,
} from './errors.js';

describe('Error Classes', () => {
  describe('ProjectInitError', () => {
    it('should create error with create factory', () => {
      const error = ProjectInitError.create('/path/to/tsconfig.json');

      expect(error._tag).toBe('ProjectInitError');
      expect(error.tsconfig).toBe('/path/to/tsconfig.json');
      expect(error.message).toBe(
        'Failed to initialize project with tsconfig: /path/to/tsconfig.json',
      );
      expect(error.cause).toBeUndefined();
    });

    it('should create error with cause', () => {
      const cause = new Error('Original error');
      const error = ProjectInitError.create('/path/to/tsconfig.json', cause);

      expect(error.cause).toBe(cause);
    });
  });

  describe('EntryNotFoundError', () => {
    it('should create fileNotFound error', () => {
      const error = EntryNotFoundError.fileNotFound('/src/app.module.ts');

      expect(error._tag).toBe('EntryNotFoundError');
      expect(error.entry).toBe('/src/app.module.ts');
      expect(error.className).toBe('AppModule');
      expect(error.message).toBe('Source file not found: /src/app.module.ts');
    });

    it('should create classNotFound error', () => {
      const error = EntryNotFoundError.classNotFound(
        '/src/app.module.ts',
        'CustomModule',
      );

      expect(error._tag).toBe('EntryNotFoundError');
      expect(error.entry).toBe('/src/app.module.ts');
      expect(error.className).toBe('CustomModule');
      expect(error.message).toBe(
        "Entry class 'CustomModule' not found in /src/app.module.ts",
      );
    });
  });

  describe('ConfigNotFoundError', () => {
    it('should create notFound error', () => {
      const error = ConfigNotFoundError.notFound('/project/dir');

      expect(error._tag).toBe('ConfigNotFoundError');
      expect(error.searchDir).toBe('/project/dir');
      expect(error.message).toContain('No configuration file found');
    });

    it('should create pathNotFound error', () => {
      const error = ConfigNotFoundError.pathNotFound(
        '/path/to/openapi.config.ts',
      );

      expect(error._tag).toBe('ConfigNotFoundError');
      expect(error.path).toBe('/path/to/openapi.config.ts');
      expect(error.message).toBe(
        'Configuration file not found: /path/to/openapi.config.ts',
      );
    });
  });

  describe('ConfigLoadError', () => {
    it('should create importFailed error', () => {
      const cause = new Error('Module not found');
      const error = ConfigLoadError.importFailed(
        '/path/to/openapi.config.ts',
        cause,
      );

      expect(error._tag).toBe('ConfigLoadError');
      expect(error.path).toBe('/path/to/openapi.config.ts');
      expect(error.message).toBe(
        'Failed to load configuration from /path/to/openapi.config.ts',
      );
      expect(error.cause).toBe(cause);
    });

    it('should create noExport error', () => {
      const error = ConfigLoadError.noExport('/path/to/openapi.config.ts');

      expect(error._tag).toBe('ConfigLoadError');
      expect(error.path).toBe('/path/to/openapi.config.ts');
      expect(error.message).toContain('must export a default config');
    });
  });

  describe('ConfigValidationError', () => {
    it('should create fromIssues error with issues in message', () => {
      const issues = ['Missing required field: output', 'Invalid format'];
      const error = ConfigValidationError.fromIssues(
        '/path/to/openapi.config.ts',
        issues,
      );

      expect(error._tag).toBe('ConfigValidationError');
      expect(error.path).toBe('/path/to/openapi.config.ts');
      expect(error.issues).toEqual(issues);
      expect(error.message).toContain('Configuration validation failed');
      expect(error.message).toContain('Missing required field: output');
      expect(error.message).toContain('Invalid format');
    });

    it('should handle empty issues array', () => {
      const error = ConfigValidationError.fromIssues(
        '/path/to/openapi.config.ts',
        [],
      );

      expect(error._tag).toBe('ConfigValidationError');
      expect(error.message).toBe(
        'Configuration validation failed: /path/to/openapi.config.ts',
      );
    });
  });

  describe('InvalidMethodError', () => {
    it('should create error with create factory', () => {
      const error = InvalidMethodError.create(
        'UserController',
        'getUser',
        'Missing return type',
      );

      expect(error._tag).toBe('InvalidMethodError');
      expect(error.controllerName).toBe('UserController');
      expect(error.methodName).toBe('getUser');
      expect(error.message).toBe(
        'Invalid method UserController.getUser: Missing return type',
      );
    });
  });
});
