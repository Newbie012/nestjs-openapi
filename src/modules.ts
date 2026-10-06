import { Effect } from 'effect';
import type { ClassDeclaration } from 'ts-morph';
import { isModuleClass, getModuleMetadata } from './nest-ast.js';

export interface ModuleWithControllers {
  readonly declaration: ClassDeclaration;
  readonly controllers: readonly ClassDeclaration[];
}

const moduleKey = (mod: ClassDeclaration): string =>
  `${mod.getSourceFile().getFilePath()}::${mod.getName() ?? '<anonymous>'}`;

/** Iterative BFS to avoid stack overflow on deep module graphs */
export const getModules = Effect.fn('Modules.getModules')(function* (
  root: ClassDeclaration,
) {
  if (!isModuleClass(root)) {
    yield* Effect.logWarning('Root is not a NestJS module').pipe(
      Effect.annotateLogs({
        className: root.getName() ?? '<anonymous>',
        file: root.getSourceFile().getFilePath(),
      }),
    );
    return [] as readonly ModuleWithControllers[];
  }

  yield* Effect.logDebug('Starting module traversal').pipe(
    Effect.annotateLogs({
      root: root.getName() ?? '<anonymous>',
      file: root.getSourceFile().getFilePath(),
    }),
  );

  const results: ModuleWithControllers[] = [];
  const visited = new Set<string>();
  const stack: ClassDeclaration[] = [root];

  while (stack.length > 0) {
    const mod = stack.pop()!;
    const key = moduleKey(mod);

    if (visited.has(key)) continue;
    visited.add(key);

    const { controllers, imports } = getModuleMetadata(mod);

    if (controllers.length > 0) {
      results.push({ declaration: mod, controllers });
    }

    stack.push(...imports);
  }

  yield* Effect.logDebug('Module traversal complete').pipe(
    Effect.annotateLogs({
      modulesWithControllers: results.length,
      totalVisited: visited.size,
    }),
  );

  return results as readonly ModuleWithControllers[];
});

export const getAllControllers = Effect.fn('Modules.getAllControllers')(
  function* (root: ClassDeclaration) {
    const modules = yield* getModules(root);
    return modules.flatMap((m) => m.controllers);
  },
);

export type ModuleScope = {
  readonly include?: readonly string[];
  readonly deepScanRoutes?: boolean;
};

const isGlobalModule = (mod: ClassDeclaration) =>
  mod.getDecorators().some((decorator) => decorator.getName() === 'Global');

const collectModules = (root: ClassDeclaration) => {
  const modules: ClassDeclaration[] = [];
  const visited = new Set<string>();
  const stack: ClassDeclaration[] = [root];

  while (stack.length > 0) {
    const mod = stack.pop()!;
    const key = moduleKey(mod);
    if (visited.has(key)) continue;
    visited.add(key);
    modules.push(mod);
    stack.push(...getModuleMetadata(mod).imports);
  }

  return modules;
};

// SwaggerModule.createDocument()'s rules: with `include`, only controllers
// declared in the included modules, plus, with `deepScanRoutes`, those of
// their direct, non-global imports
export const getDocumentedControllers = Effect.fn(
  'Modules.getDocumentedControllers',
)(function* (root: ClassDeclaration, scope: ModuleScope = {}) {
  const include = scope.include ?? [];
  if (include.length === 0) {
    return yield* getAllControllers(root);
  }

  const wanted = new Set(include);
  const included = isModuleClass(root)
    ? collectModules(root).filter((mod) => wanted.has(mod.getName() ?? ''))
    : [];

  const found = new Set(included.map((mod) => mod.getName()));
  const missing = include.filter((name) => !found.has(name));
  if (missing.length > 0) {
    yield* Effect.logWarning(
      'Modules listed in options.include were not found in the module graph',
    ).pipe(Effect.annotateLogs({ modules: missing.join(', ') }));
  }

  const controllers = included.flatMap((mod) => {
    const { controllers: own, imports } = getModuleMetadata(mod);
    const fromImports = scope.deepScanRoutes
      ? imports
          .filter((imported) => !isGlobalModule(imported))
          .flatMap((imported) => getModuleMetadata(imported).controllers)
      : [];
    return [...fromImports, ...own];
  });

  return [...new Set(controllers)] as readonly ClassDeclaration[];
});

const serviceGetModules = Effect.fn('ModuleTraversalService.getModules')(
  function* (root: ClassDeclaration) {
    return yield* getModules(root);
  },
);

const serviceGetAllControllers = Effect.fn(
  'ModuleTraversalService.getAllControllers',
)(function* (root: ClassDeclaration) {
  return yield* getAllControllers(root);
});

export class ModuleTraversalService extends Effect.Service<ModuleTraversalService>()(
  'ModuleTraversalService',
  {
    accessors: true,
    effect: Effect.succeed({
      getModules: serviceGetModules,
      getAllControllers: serviceGetAllControllers,
      getDocumentedControllers,
    }),
  },
) {}
