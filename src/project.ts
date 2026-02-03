import { Context, Effect, Layer } from 'effect';
import { Project, ClassDeclaration, SourceFile } from 'ts-morph';
import {
  ProjectInitError,
  EntryNotFoundError,
  type ProjectError,
} from './errors.js';

export interface ProjectContext {
  readonly project: Project;
  readonly entrySourceFile: SourceFile;
  readonly entryClass: ClassDeclaration;
}

export interface ProjectOptions {
  readonly tsconfig: string;
  readonly entry: string;
}

/**
 * ProjectService is an infrastructure context holder.
 * Context.Tag is appropriate here as it holds externally-provided resources.
 */
export class ProjectService extends Context.Tag('ProjectService')<
  ProjectService,
  {
    readonly context: ProjectContext;
  }
>() {}

const initProject = Effect.fn('ProjectService.initProject')(function* (
  options: ProjectOptions,
) {
  return yield* Effect.try({
    try: () =>
      new Project({
        tsConfigFilePath: options.tsconfig,
        skipAddingFilesFromTsConfig: true,
      }),
    catch: (error) => ProjectInitError.create(options.tsconfig, error),
  });
});

const addSourceFiles = Effect.fn('ProjectService.addSourceFiles')(function* (
  project: Project,
  entry: string,
) {
  return yield* Effect.try({
    try: () => {
      project.addSourceFilesAtPaths(entry);
      project.resolveSourceFileDependencies();
    },
    catch: (error) =>
      new ProjectInitError({
        tsconfig: '',
        message: `Failed to add source files: ${entry}`,
        cause: error,
      }),
  });
});

const getEntrySourceFile = Effect.fn('ProjectService.getEntrySourceFile')(
  function* (project: Project, entry: string) {
    const sourceFile = project.getSourceFile(entry);
    if (!sourceFile) {
      return yield* EntryNotFoundError.fileNotFound(entry);
    }
    return sourceFile;
  },
);

const getEntryClass = Effect.fn('ProjectService.getEntryClass')(function* (
  sourceFile: SourceFile,
  entry: string,
  className: string = 'AppModule',
) {
  const entryClass = sourceFile.getClass(className);
  if (!entryClass) {
    return yield* EntryNotFoundError.classNotFound(entry, className);
  }
  return entryClass;
});

export const makeProjectContext = Effect.fn(
  'ProjectService.makeProjectContext',
)(function* (options: ProjectOptions) {
  yield* Effect.logDebug('Initializing project').pipe(
    Effect.annotateLogs({ entry: options.entry }),
  );

  const project = yield* initProject(options);
  yield* addSourceFiles(project, options.entry);

  const entrySourceFile = yield* getEntrySourceFile(project, options.entry);
  const entryClass = yield* getEntryClass(entrySourceFile, options.entry);

  yield* Effect.logDebug('Project initialized successfully');

  return {
    project,
    entrySourceFile,
    entryClass,
  };
});

export const ProjectServiceLive = (
  options: ProjectOptions,
): Layer.Layer<ProjectService, ProjectError> =>
  Layer.effect(
    ProjectService,
    makeProjectContext(options).pipe(Effect.map((context) => ({ context }))),
  );
