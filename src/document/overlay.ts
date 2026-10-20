import { Effect } from 'effect';
import { readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import yaml from 'js-yaml';
import { OverlayError } from '../config/errors.js';
import type { OverlayAction, OverlayDocument } from '../config/types.js';

type Segment = string | number;
type Container = Record<string, unknown> | unknown[];

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const clone = <T>(value: T): T =>
  value === undefined ? value : JSON.parse(JSON.stringify(value));

const describeAction = (action: OverlayAction, index: number) =>
  `action ${index + 1} (target ${JSON.stringify(action.target)}${action.description ? `, "${action.description}"` : ''})`;

const shapeIssues = (value: unknown): readonly string[] => {
  if (!isPlainObject(value)) return ['must be an object'];
  const issues: string[] = [];
  if (typeof value.overlay !== 'string' || !/^1\.0\.\d+$/.test(value.overlay)) {
    issues.push('"overlay" must be a 1.0.x version string, e.g. "1.0.0"');
  }
  const info = value.info;
  if (
    !isPlainObject(info) ||
    typeof info.title !== 'string' ||
    typeof info.version !== 'string'
  ) {
    issues.push('"info" must be an object with a string "title" and "version"');
  }
  if (!Array.isArray(value.actions) || value.actions.length === 0) {
    issues.push('"actions" must be a non-empty array');
    return issues;
  }
  value.actions.forEach((action: unknown, index) => {
    if (!isPlainObject(action) || typeof action.target !== 'string') {
      issues.push(
        `action ${index + 1} must be an object with a string "target"`,
      );
    } else if (
      action.remove !== undefined &&
      typeof action.remove !== 'boolean'
    ) {
      issues.push(`action ${index + 1}: "remove" must be a boolean`);
    }
  });
  return issues;
};

const loadOverlay = (overlay: string | OverlayDocument, configDir: string) =>
  Effect.gen(function* () {
    if (typeof overlay !== 'string') {
      return { document: overlay as unknown, source: 'options.overlay' };
    }
    const filePath = resolve(configDir, overlay);
    const document = yield* Effect.try({
      try: () => {
        const text = readFileSync(filePath, 'utf-8');
        return extname(filePath).toLowerCase() === '.json'
          ? JSON.parse(text)
          : yaml.load(text);
      },
      catch: (cause) =>
        new OverlayError({
          message: `Could not read the overlay ${filePath}: ${cause instanceof Error ? cause.message : String(cause)}`,
          source: filePath,
          cause,
        }),
    });
    return { document: document as unknown, source: filePath };
  });

const nodeAt = (root: unknown, segments: readonly Segment[]) =>
  segments.reduce<unknown>(
    (node, segment) =>
      node === null || typeof node !== 'object'
        ? undefined
        : (node as Record<Segment, unknown>)[segment],
    root,
  );

const mergeInto = (
  target: Record<string, unknown>,
  update: Record<string, unknown>,
) => {
  for (const [key, value] of Object.entries(update)) {
    const current = target[key];
    if (isPlainObject(current) && isPlainObject(value)) {
      mergeInto(current, value);
    } else {
      target[key] = clone(value);
    }
  }
};

const removalOrder = (a: readonly Segment[], b: readonly Segment[]) => {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const left = a[i]!;
    const right = b[i]!;
    if (left === right) continue;
    if (typeof left === 'number' && typeof right === 'number') {
      return right - left;
    }
    return String(left) < String(right) ? -1 : 1;
  }
  return b.length - a.length;
};

/**
 * Applies an OpenAPI Overlay 1.0 document to the generated spec. Actions run
 * in order, each on the result of the previous one. An action whose target
 * matches nothing fails, or only warns with `unmatched: 'warn'`.
 */
export const applyOverlay = Effect.fn('Generate.applyOverlay')(function* <T>(
  spec: T,
  overlay: string | OverlayDocument,
  configDir: string,
  unmatched: 'error' | 'warn' = 'error',
) {
  const { document, source } = yield* loadOverlay(overlay, configDir);
  const issues = shapeIssues(document);
  if (issues.length > 0) {
    return yield* new OverlayError({
      message: `Invalid overlay ${source}:\n  ${issues.join('\n  ')}`,
      source,
    });
  }

  const { evaluate, NormalizedPath } = yield* Effect.promise(
    () => import('@swaggerexpert/jsonpath'),
  );
  const result: unknown = clone(spec);
  const fail = (message: string) =>
    Effect.fail(
      new OverlayError({ message: `Overlay ${source}: ${message}`, source }),
    );

  const { actions } = document as unknown as OverlayDocument;
  for (const [index, action] of actions.entries()) {
    const name = describeAction(action, index);
    const matches = yield* Effect.try({
      try: () => {
        const found: (readonly Segment[])[] = [];
        evaluate(result, action.target, {
          callback: (_value: unknown, path: string) => {
            found.push(NormalizedPath.to(path));
          },
        });
        return found;
      },
      catch: (cause) =>
        new OverlayError({
          message: `Overlay ${source}: ${name} is not a valid JSONPath: ${cause instanceof Error ? cause.message : String(cause)}`,
          source,
          cause,
        }),
    });

    if (matches.length === 0) {
      if (unmatched === 'warn') {
        yield* Effect.logWarning(
          `Overlay ${source}: ${name} matched nothing and was skipped`,
        );
        continue;
      }
      return yield* fail(
        `${name} matched nothing. Fix the target, or set options.overlayUnmatchedTarget to 'warn'`,
      );
    }

    if (action.remove === true) {
      for (const segments of [...matches].sort(removalOrder)) {
        if (segments.length === 0) {
          return yield* fail(`${name} cannot remove the whole document`);
        }
        const parent = nodeAt(result, segments.slice(0, -1)) as
          | Container
          | undefined;
        const key = segments[segments.length - 1]!;
        if (Array.isArray(parent) && typeof key === 'number') {
          parent.splice(key, 1);
        } else if (isPlainObject(parent)) {
          delete parent[key];
        }
      }
      continue;
    }

    if (action.update === undefined) continue;
    for (const segments of matches) {
      const node = nodeAt(result, segments);
      if (Array.isArray(node)) {
        node.push(clone(action.update));
      } else if (isPlainObject(node) && isPlainObject(action.update)) {
        mergeInto(node, action.update);
      } else {
        return yield* fail(
          isPlainObject(node)
            ? `${name}: "update" must be an object to merge into the object it selects`
            : `${name} selects a ${node === null ? 'null' : typeof node}; "update" needs an object or array target, so select the object that contains it`,
        );
      }
    }
  }

  return result as T;
});
