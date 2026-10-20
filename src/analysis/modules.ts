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

    const { controllers, imports, unresolved = [] } = getModuleMetadata(mod);

    if (unresolved.length > 0) {
      yield* Effect.logDebug(
        'Skipped module entries that cannot be resolved statically',
      ).pipe(
        Effect.annotateLogs({
          module: mod.getName() ?? '<anonymous>',
          entries: unresolved.join(', '),
        }),
      );
    }

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

const includedModules = (
  root: ClassDeclaration,
  include: readonly string[],
) => {
  const wanted = new Set(include);
  return isModuleClass(root)
    ? collectModules(root).filter((mod) => wanted.has(mod.getName() ?? ''))
    : [];
};

/**
 * Names in `include` that no module reachable from `root` has. With several
 * entries, a name is missing only when every entry misses it
 */
export const findMissingIncludes = (
  root: ClassDeclaration,
  include: readonly string[],
): readonly string[] => {
  const found = new Set(
    includedModules(root, include).map((mod) => mod.getName()),
  );
  return include.filter((name) => !found.has(name));
};

export interface DocumentedController {
  readonly controller: ClassDeclaration;
  /** The module declaring the controller */
  readonly module: ClassDeclaration;
}

const declaredIn = (mod: ClassDeclaration) =>
  getModuleMetadata(mod).controllers.map((controller) => ({
    controller,
    module: mod,
  }));

/**
 * SwaggerModule.createDocument()'s rules: with `include`, only controllers
 * declared in the included modules, plus, with `deepScanRoutes`, those of
 * their direct, non-global imports
 */
export const getDocumentedControllerModules = Effect.fn(
  'Modules.getDocumentedControllerModules',
)(function* (root: ClassDeclaration, scope: ModuleScope = {}) {
  const include = scope.include ?? [];
  if (include.length === 0) {
    const modules = yield* getModules(root);
    return modules.flatMap(({ declaration, controllers }) =>
      controllers.map((controller) => ({ controller, module: declaration })),
    ) as readonly DocumentedController[];
  }

  const included = includedModules(root, include);
  const documented = included.flatMap((mod) => {
    const fromImports = scope.deepScanRoutes
      ? getModuleMetadata(mod)
          .imports.filter((imported) => !isGlobalModule(imported))
          .flatMap(declaredIn)
      : [];
    return [...fromImports, ...declaredIn(mod)];
  });

  const seen = new Set<ClassDeclaration>();
  return documented.filter(({ controller }) => {
    if (seen.has(controller)) return false;
    seen.add(controller);
    return true;
  }) as readonly DocumentedController[];
});
