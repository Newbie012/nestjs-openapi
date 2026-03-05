import { describe, it, expect } from 'vitest';
import {
  ProjectInitError,
  EntryNotFoundError,
  ConfigNotFoundError,
  ConfigLoadError,
  ConfigValidationError,
  DtoGlobResolutionError,
  InvalidMethodError,
  MissingGenericSchemaTempFileCleanupError,
  MissingGenericSchemaTempFileWriteError,
  OutputDirectoryCreationError,
  OutputSerializationError,
  OutputWriteError,
  PublicApiError,
  SchemaGenerationError,
  ValidationMappingError,
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

  describe('MissingGenericSchemaTempFileWriteError', () => {
    it('should create temporary file write error', () => {
      const cause = new Error('write failed');
      const error = MissingGenericSchemaTempFileWriteError.create(
        '/tmp/.openapi-temp.ts',
        cause,
      );

      expect(error._tag).toBe('MissingGenericSchemaTempFileWriteError');
      expect(error.filePath).toBe('/tmp/.openapi-temp.ts');
      expect(error.message).toBe(
        'Failed to write temporary schema file: /tmp/.openapi-temp.ts',
      );
      expect(error.cause).toBe(cause);
    });
  });

  describe('MissingGenericSchemaTempFileCleanupError', () => {
    it('should create temporary file cleanup error', () => {
      const cause = new Error('unlink failed');
      const error = MissingGenericSchemaTempFileCleanupError.create(
        '/tmp/.openapi-temp.ts',
        cause,
      );

      expect(error._tag).toBe('MissingGenericSchemaTempFileCleanupError');
      expect(error.filePath).toBe('/tmp/.openapi-temp.ts');
      expect(error.message).toBe(
        'Failed to remove temporary schema file: /tmp/.openapi-temp.ts',
      );
      expect(error.cause).toBe(cause);
    });
  });

  describe('DtoGlobResolutionError', () => {
    it('should create dto glob resolution error', () => {
      const cause = new Error('glob failed');
      const error = DtoGlobResolutionError.create('src/**/*.dto.ts', cause);

      expect(error._tag).toBe('DtoGlobResolutionError');
      expect(error.pattern).toBe('src/**/*.dto.ts');
      expect(error.message).toBe(
        'Failed to resolve DTO glob pattern: src/**/*.dto.ts',
      );
      expect(error.cause).toBe(cause);
    });
  });

  describe('SchemaGenerationError', () => {
    it('should create schema generation error from unknown cause', () => {
      const cause = new Error('schema parser failed');
      const error = SchemaGenerationError.fromError(
        cause,
        'pattern: src/**/*.dto.ts',
      );

      expect(error._tag).toBe('SchemaGenerationError');
      expect(error.message).toContain('schema parser failed');
      expect(error.message).toContain('pattern: src/**/*.dto.ts');
      expect(error.cause).toBe(cause);
    });
  });

  describe('ValidationMappingError', () => {
    it('should create validation mapping error with class context', () => {
      const cause = new Error('AST traversal failed');
      const error = ValidationMappingError.create(
        'CreateUserDto',
        '/src/user.dto.ts',
        cause,
      );

      expect(error._tag).toBe('ValidationMappingError');
      expect(error.className).toBe('CreateUserDto');
      expect(error.filePath).toBe('/src/user.dto.ts');
      expect(error.message).toContain('CreateUserDto');
      expect(error.message).toContain('/src/user.dto.ts');
      expect(error.cause).toBe(cause);
    });
  });

  describe('OutputDirectoryCreationError', () => {
    it('should create output directory creation error', () => {
      const cause = new Error('permission denied');
      const error = OutputDirectoryCreationError.create('/tmp/output', cause);

      expect(error._tag).toBe('OutputDirectoryCreationError');
      expect(error.outputDir).toBe('/tmp/output');
      expect(error.message).toBe(
        'Failed to create output directory: /tmp/output',
      );
      expect(error.cause).toBe(cause);
    });
  });

  describe('OutputSerializationError', () => {
    it('should create json serialization error', () => {
      const cause = new Error('circular structure');
      const error = OutputSerializationError.json('/tmp/openapi.json', cause);

      expect(error._tag).toBe('OutputSerializationError');
      expect(error.outputPath).toBe('/tmp/openapi.json');
      expect(error.format).toBe('json');
      expect(error.message).toBe(
        'Failed to serialize OpenAPI spec to JSON for /tmp/openapi.json',
      );
      expect(error.cause).toBe(cause);
    });

    it('should create yaml serialization error', () => {
      const cause = new Error('dump failed');
      const error = OutputSerializationError.yaml('/tmp/openapi.yaml', cause);

      expect(error._tag).toBe('OutputSerializationError');
      expect(error.outputPath).toBe('/tmp/openapi.yaml');
      expect(error.format).toBe('yaml');
      expect(error.message).toBe(
        'Failed to serialize OpenAPI spec to YAML for /tmp/openapi.yaml',
      );
      expect(error.cause).toBe(cause);
    });
  });

  describe('OutputWriteError', () => {
    it('should create json write error', () => {
      const cause = new Error('write failed');
      const error = OutputWriteError.json('/tmp/openapi.json', cause);

      expect(error._tag).toBe('OutputWriteError');
      expect(error.outputPath).toBe('/tmp/openapi.json');
      expect(error.format).toBe('json');
      expect(error.message).toBe(
        'Failed to write JSON output to /tmp/openapi.json',
      );
      expect(error.cause).toBe(cause);
    });

    it('should create yaml write error', () => {
      const cause = new Error('write failed');
      const error = OutputWriteError.yaml('/tmp/openapi.yaml', cause);

      expect(error._tag).toBe('OutputWriteError');
      expect(error.outputPath).toBe('/tmp/openapi.yaml');
      expect(error.format).toBe('yaml');
      expect(error.message).toBe(
        'Failed to write YAML output to /tmp/openapi.yaml',
      );
      expect(error.cause).toBe(cause);
    });
  });

  describe('PublicApiError', () => {
    it('should map message from unknown error-like causes', () => {
      const cause = { message: 'Readable failure message' };
      const error = PublicApiError.fromUnknown(cause);

      expect(error._tag).toBe('PublicApiError');
      expect(error.message).toBe('Readable failure message');
      expect(error.cause).toBe(cause);
    });

    it('should use default message when cause is not error-like', () => {
      const error = PublicApiError.fromUnknown(undefined);

      expect(error._tag).toBe('PublicApiError');
      expect(error.message).toBe('OpenAPI generation failed');
      expect(error.cause).toBeUndefined();
    });
  });
});
