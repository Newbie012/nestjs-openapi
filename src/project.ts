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

export class ProjectService extends Context.Tag('ProjectService')<
  ProjectService,
  {
    readonly context: ProjectContext;
  }
>() {}

const initProject = (
  options: ProjectOptions,
): Effect.Effect<Project, ProjectInitError> =>
  Effect.try({
    try: () =>
      new Project({
        tsConfigFilePath: options.tsconfig,
        skipAddingFilesFromTsConfig: true,
      }),
    catch: (error) => ProjectInitError.make(options.tsconfig, error),
  });

const addSourceFiles = (
  project: Project,
  entry: string,
): Effect.Effect<void, ProjectInitError> =>
  Effect.try({
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

const getEntrySourceFile = (
  project: Project,
  entry: string,
): Effect.Effect<SourceFile, EntryNotFoundError> =>
  Effect.gen(function* () {
    const sourceFile = project.getSourceFile(entry);
    if (!sourceFile) {
      return yield* EntryNotFoundError.fileNotFound(entry);
    }
    return sourceFile;
  });

const getEntryClass = (
  sourceFile: SourceFile,
  entry: string,
  className: string = 'AppModule',
): Effect.Effect<ClassDeclaration, EntryNotFoundError> =>
  Effect.gen(function* () {
    const entryClass = sourceFile.getClass(className);
    if (!entryClass) {
      return yield* EntryNotFoundError.classNotFound(entry, className);
    }
    return entryClass;
  });

export const makeProjectContext = (
  options: ProjectOptions,
): Effect.Effect<ProjectContext, ProjectError> =>
  Effect.gen(function* () {
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
