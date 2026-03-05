import { Effect, Layer } from 'effect';
import { Project, ClassDeclaration, SourceFile } from 'ts-morph';
import {
  ProjectInitError,
  EntryNotFoundError,
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
  tsconfig: string,
) {
  return yield* Effect.try({
    try: () => {
      project.addSourceFilesAtPaths(entry);
      project.resolveSourceFileDependencies();
    },
    catch: (error) => ProjectInitError.create(tsconfig, error),
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
  yield* addSourceFiles(project, options.entry, options.tsconfig);

  const entrySourceFile = yield* getEntrySourceFile(project, options.entry);
  const entryClass = yield* getEntryClass(entrySourceFile, options.entry);

  yield* Effect.logDebug('Project initialized successfully');

  return {
    project,
    entrySourceFile,
    entryClass,
  };
});

const serviceMakeProjectContext = Effect.fn(
  'ProjectService.makeProjectContext.service',
)(function* (options: ProjectOptions) {
  return yield* makeProjectContext(options);
});

export class ProjectService extends Effect.Service<ProjectService>()(
  'ProjectService',
  {
    accessors: true,
    effect: Effect.succeed({
      makeProjectContext: serviceMakeProjectContext,
    }),
  },
) {}

export const ProjectServiceLive = (
  _options: ProjectOptions,
): Layer.Layer<ProjectService, never> => ProjectService.Default;
