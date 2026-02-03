import { Data } from 'effect';

// Project Errors

export class ProjectInitError extends Data.TaggedError('ProjectInitError')<{
  readonly tsconfig: string;
  readonly message: string;
  readonly cause?: unknown;
}> {
  static make(tsconfig: string, cause?: unknown): ProjectInitError {
    return new ProjectInitError({
      tsconfig,
      message: `Failed to initialize project with tsconfig: ${tsconfig}`,
      cause,
    });
  }
}

export class EntryNotFoundError extends Data.TaggedError('EntryNotFoundError')<{
  readonly entry: string;
  readonly className: string;
  readonly message: string;
}> {
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

export class ConfigNotFoundError extends Data.TaggedError(
  'ConfigNotFoundError',
)<{
  readonly path?: string;
  readonly searchDir?: string;
  readonly message: string;
}> {
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

export class ConfigLoadError extends Data.TaggedError('ConfigLoadError')<{
  readonly path: string;
  readonly message: string;
  readonly cause?: unknown;
}> {
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

export class ConfigValidationError extends Data.TaggedError(
  'ConfigValidationError',
)<{
  readonly path: string;
  readonly message: string;
  readonly issues: readonly string[];
}> {
  static fromIssues(
    path: string,
    issues: readonly string[],
  ): ConfigValidationError {
    const issuesList = issues.length > 0 ? `\n  ${issues.join('\n  ')}` : '';
    return new ConfigValidationError({
      path,
      message: `Configuration validation failed: ${path}${issuesList}`,
      issues,
    });
  }
}

export type ConfigError =
  | ConfigNotFoundError
  | ConfigLoadError
  | ConfigValidationError;

// Analysis Errors

export class InvalidMethodError extends Data.TaggedError('InvalidMethodError')<{
  readonly controllerName: string;
  readonly methodName: string;
  readonly message: string;
}> {
  static make(
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
