import { Schema } from 'effect';

// Project Errors

export class ProjectInitError extends Schema.TaggedError<ProjectInitError>()(
  'ProjectInitError',
  {
    tsconfig: Schema.String,
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),
  },
) {
  static create(tsconfig: string, cause?: unknown): ProjectInitError {
    return new ProjectInitError({
      tsconfig,
      message: `Failed to initialize project with tsconfig: ${tsconfig}`,
      cause,
    });
  }
}

export class EntryNotFoundError extends Schema.TaggedError<EntryNotFoundError>()(
  'EntryNotFoundError',
  {
    entry: Schema.String,
    className: Schema.String,
    message: Schema.String,
  },
) {
  static fileNotFound(entry: string): EntryNotFoundError {
    return new EntryNotFoundError({
      entry,
      className: 'AppModule',
      message: `Source file not found: ${entry}`,
    });
  }

  static classNotFound(entry: string, className: string): EntryNotFoundError {
    return new EntryNotFoundError({
      entry,
      className,
      message: `Entry class '${className}' not found in ${entry}`,
    });
  }
}

export type ProjectError = ProjectInitError | EntryNotFoundError;

// Config Errors

export class ConfigNotFoundError extends Schema.TaggedError<ConfigNotFoundError>()(
  'ConfigNotFoundError',
  {
    path: Schema.optional(Schema.String),
    searchDir: Schema.optional(Schema.String),
    message: Schema.String,
  },
) {
  static notFound(searchDir: string): ConfigNotFoundError {
    return new ConfigNotFoundError({
      searchDir,
      message:
        'No configuration file found. Create an openapi.config.ts file or specify a path.',
    });
  }

  static pathNotFound(path: string): ConfigNotFoundError {
    return new ConfigNotFoundError({
      path,
      message: `Configuration file not found: ${path}`,
    });
  }
}

export class ConfigLoadError extends Schema.TaggedError<ConfigLoadError>()(
  'ConfigLoadError',
  {
    path: Schema.String,
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),
  },
) {
  static importFailed(path: string, cause?: unknown): ConfigLoadError {
    return new ConfigLoadError({
      path,
      message: `Failed to load configuration from ${path}`,
      cause,
    });
  }

  static noExport(path: string): ConfigLoadError {
    return new ConfigLoadError({
      path,
      message: `Configuration file must export a default config or named 'config' export: ${path}`,
    });
  }

  static circularExtends(path: string): ConfigLoadError {
    return new ConfigLoadError({
      path,
      message: `Circular extends detected: ${path}`,
    });
  }
}

export class ConfigValidationError extends Schema.TaggedError<ConfigValidationError>()(
  'ConfigValidationError',
  {
    path: Schema.String,
    message: Schema.String,
    issues: Schema.Array(Schema.String),
  },
) {
  static fromIssues(
    path: string,
    issues: readonly string[],
  ): ConfigValidationError {
    const issuesList = issues.length > 0 ? `\n  ${issues.join('\n  ')}` : '';
    return new ConfigValidationError({
      path,
      message: `Configuration validation failed: ${path}${issuesList}`,
      issues: [...issues],
    });
  }
}

export type ConfigError =
  | ConfigNotFoundError
  | ConfigLoadError
  | ConfigValidationError;

// Analysis Errors

export class InvalidMethodError extends Schema.TaggedError<InvalidMethodError>()(
  'InvalidMethodError',
  {
    controllerName: Schema.String,
    methodName: Schema.String,
    message: Schema.String,
  },
) {
  static create(
    controllerName: string,
    methodName: string,
    reason: string,
  ): InvalidMethodError {
    return new InvalidMethodError({
      controllerName,
      methodName,
      message: `Invalid method ${controllerName}.${methodName}: ${reason}`,
    });
  }
}

export type AnalysisError = InvalidMethodError;

// Schema / Validation Errors

export class SchemaGenerationError extends Schema.TaggedError<SchemaGenerationError>()(
  'SchemaGenerationError',
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),
  },
) {
  static fromError(error: unknown, context?: string): SchemaGenerationError {
    const baseMessage =
      error && typeof error === 'object' && 'message' in error
        ? String(error.message)
        : 'Unknown schema generation error';
    const message = context ? `${baseMessage} (${context})` : baseMessage;

    return new SchemaGenerationError({
      message,
      cause: error,
    });
  }

  static noFilesFound(patterns: readonly string[]): SchemaGenerationError {
    return new SchemaGenerationError({
      message: `No DTO files found matching patterns: ${patterns.join(', ')}`,
    });
  }
}

export class ValidationMappingError extends Schema.TaggedError<ValidationMappingError>()(
  'ValidationMappingError',
  {
    className: Schema.String,
    filePath: Schema.String,
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),
  },
) {
  static create(
    className: string,
    filePath: string,
    cause?: unknown,
  ): ValidationMappingError {
    return new ValidationMappingError({
      className,
      filePath,
      message: `Failed to extract validation metadata for class ${className} in ${filePath}`,
      cause,
    });
  }
}

export class MissingGenericSchemaTempFileWriteError extends Schema.TaggedError<MissingGenericSchemaTempFileWriteError>()(
  'MissingGenericSchemaTempFileWriteError',
  {
    filePath: Schema.String,
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),
  },
) {
  static create(
    filePath: string,
    cause?: unknown,
  ): MissingGenericSchemaTempFileWriteError {
    return new MissingGenericSchemaTempFileWriteError({
      filePath,
      message: `Failed to write temporary schema file: ${filePath}`,
      cause,
    });
  }
}

export class MissingGenericSchemaTempFileCleanupError extends Schema.TaggedError<MissingGenericSchemaTempFileCleanupError>()(
  'MissingGenericSchemaTempFileCleanupError',
  {
    filePath: Schema.String,
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),
  },
) {
  static create(
    filePath: string,
    cause?: unknown,
  ): MissingGenericSchemaTempFileCleanupError {
    return new MissingGenericSchemaTempFileCleanupError({
      filePath,
      message: `Failed to remove temporary schema file: ${filePath}`,
      cause,
    });
  }
}

export class DtoGlobResolutionError extends Schema.TaggedError<DtoGlobResolutionError>()(
  'DtoGlobResolutionError',
  {
    pattern: Schema.String,
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),
  },
) {
  static create(pattern: string, cause?: unknown): DtoGlobResolutionError {
    return new DtoGlobResolutionError({
      pattern,
      message: `Failed to resolve DTO glob pattern: ${pattern}`,
      cause,
    });
  }
}

export class PublicApiError extends Schema.TaggedError<PublicApiError>()(
  'PublicApiError',
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),
  },
) {
  static fromUnknown(cause: unknown): PublicApiError {
    const message =
      cause &&
      typeof cause === 'object' &&
      'message' in cause &&
      typeof cause.message === 'string'
        ? cause.message
        : 'OpenAPI generation failed';
    return new PublicApiError({
      message,
      cause,
    });
  }
}

// Runtime Module / Output Errors

export class SpecFileNotFoundError extends Schema.TaggedError<SpecFileNotFoundError>()(
  'SpecFileNotFoundError',
  {
    filePath: Schema.String,
    message: Schema.String,
  },
) {
  static create(filePath: string): SpecFileNotFoundError {
    return new SpecFileNotFoundError({
      filePath,
      message:
        `OpenAPI spec file not found: ${filePath}. ` +
        `Make sure to run 'nestjs-openapi generate' first.`,
    });
  }
}

export class SpecFileReadError extends Schema.TaggedError<SpecFileReadError>()(
  'SpecFileReadError',
  {
    filePath: Schema.String,
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),
  },
) {
  static create(filePath: string, cause?: unknown): SpecFileReadError {
    const baseMessage =
      cause &&
      typeof cause === 'object' &&
      'message' in cause &&
      typeof cause.message === 'string'
        ? cause.message
        : 'unknown read error';
    return new SpecFileReadError({
      filePath,
      message: `Failed to load OpenAPI spec: ${baseMessage}`,
      cause,
    });
  }
}

export class SpecFileParseError extends Schema.TaggedError<SpecFileParseError>()(
  'SpecFileParseError',
  {
    filePath: Schema.String,
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),
  },
) {
  static create(filePath: string, cause?: unknown): SpecFileParseError {
    const baseMessage =
      cause &&
      typeof cause === 'object' &&
      'message' in cause &&
      typeof cause.message === 'string'
        ? cause.message
        : 'unknown parse error';
    return new SpecFileParseError({
      filePath,
      message: `Failed to load OpenAPI spec: ${baseMessage}`,
      cause,
    });
  }
}

export class OutputDirectoryCreationError extends Schema.TaggedError<OutputDirectoryCreationError>()(
  'OutputDirectoryCreationError',
  {
    outputDir: Schema.String,
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),
  },
) {
  static create(
    outputDir: string,
    cause?: unknown,
  ): OutputDirectoryCreationError {
    return new OutputDirectoryCreationError({
      outputDir,
      message: `Failed to create output directory: ${outputDir}`,
      cause,
    });
  }
}

export class OutputSerializationError extends Schema.TaggedError<OutputSerializationError>()(
  'OutputSerializationError',
  {
    outputPath: Schema.String,
    format: Schema.Literal('json', 'yaml'),
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),
  },
) {
  static json(
    outputPath: string,
    cause?: unknown,
  ): OutputSerializationError {
    return new OutputSerializationError({
      outputPath,
      format: 'json',
      message: `Failed to serialize OpenAPI spec to JSON for ${outputPath}`,
      cause,
    });
  }

  static yaml(
    outputPath: string,
    cause?: unknown,
  ): OutputSerializationError {
    return new OutputSerializationError({
      outputPath,
      format: 'yaml',
      message: `Failed to serialize OpenAPI spec to YAML for ${outputPath}`,
      cause,
    });
  }
}

export class OutputWriteError extends Schema.TaggedError<OutputWriteError>()(
  'OutputWriteError',
  {
    outputPath: Schema.String,
    format: Schema.Literal('json', 'yaml'),
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),
  },
) {
  static json(outputPath: string, cause?: unknown): OutputWriteError {
    return new OutputWriteError({
      outputPath,
      format: 'json',
      message: `Failed to write JSON output to ${outputPath}`,
      cause,
    });
  }

  static yaml(outputPath: string, cause?: unknown): OutputWriteError {
    return new OutputWriteError({
      outputPath,
      format: 'yaml',
      message: `Failed to write YAML output to ${outputPath}`,
      cause,
    });
  }
}

export type GeneratorError =
  | ProjectError
  | ConfigError
  | AnalysisError
  | SchemaGenerationError
  | ValidationMappingError
  | MissingGenericSchemaTempFileWriteError
  | MissingGenericSchemaTempFileCleanupError
  | DtoGlobResolutionError
  | PublicApiError
  | SpecFileNotFoundError
  | SpecFileReadError
  | SpecFileParseError
  | OutputDirectoryCreationError
  | OutputSerializationError
  | OutputWriteError;
