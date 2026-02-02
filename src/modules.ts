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
export const getModules = (
  root: ClassDeclaration,
): Effect.Effect<readonly ModuleWithControllers[]> =>
  Effect.gen(function* () {
    if (!isModuleClass(root)) {
      yield* Effect.logWarning('Root is not a NestJS module').pipe(
        Effect.annotateLogs({
          className: root.getName() ?? '<anonymous>',
          file: root.getSourceFile().getFilePath(),
        }),
      );
      return [];
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

    return results;
  });

export const getAllControllers = (
  root: ClassDeclaration,
): Effect.Effect<readonly ClassDeclaration[]> =>
  Effect.map(getModules(root), (modules) =>
    modules.flatMap((m) => m.controllers),
  );
