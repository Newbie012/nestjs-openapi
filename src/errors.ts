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

export type GeneratorError = ProjectError | ConfigError | AnalysisError;
