import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Effect, Either } from 'effect';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { applyOverlay } from './overlay.js';
import type { OverlayAction, OverlayDocument } from '../config/types.js';

const spec = () => ({
  openapi: '3.0.3',
  info: { title: 'Books API', version: '1.0.0' },
  paths: {
    '/books': {
      get: { operationId: 'BooksController_list', tags: ['books'] },
      post: { operationId: 'BooksController_create', tags: ['books'] },
    },
    '/books/{id}': {
      get: { operationId: 'BooksController_get', parameters: [] as unknown[] },
    },
    '/internal/health': { get: { operationId: 'HealthController_check' } },
  },
  tags: [{ name: 'books' }, { name: 'internal' }, { name: 'legacy' }],
});

const overlay = (actions: readonly OverlayAction[]): OverlayDocument => ({
  overlay: '1.0.0',
  info: { title: 'Public books API', version: '1.0.0' },
  actions,
});

const run = (
  document: unknown,
  options: { configDir?: string; unmatched?: 'error' | 'warn' } = {},
) =>
  Effect.runPromise(
    Effect.either(
      applyOverlay(
        spec(),
        document as OverlayDocument,
        options.configDir ?? process.cwd(),
        options.unmatched,
      ),
    ),
  );

describe('applyOverlay', () => {
  it('deep merges update into every object the target selects', async () => {
    const result = await run(
      overlay([
        {
          target: "$.paths['/books'][*]",
          update: { 'x-rate-limit': { perMinute: 60 }, tags: ['catalog'] },
        },
        {
          target: '$.info',
          update: { description: 'Books, publicly' },
        },
      ]),
    );

    const output = Either.getOrThrow(result);
    expect(output.paths['/books'].get).toEqual({
      operationId: 'BooksController_list',
      tags: ['catalog'],
      'x-rate-limit': { perMinute: 60 },
    });
    expect(output.paths['/books'].post).toMatchObject({
      'x-rate-limit': { perMinute: 60 },
    });
    expect(output.info).toEqual({
      title: 'Books API',
      version: '1.0.0',
      description: 'Books, publicly',
    });
  });

  it('appends update to a selected array', async () => {
    const result = await run(
      overlay([{ target: '$.tags', update: { name: 'catalog' } }]),
    );

    expect(Either.getOrThrow(result).tags.map((tag) => tag.name)).toEqual([
      'books',
      'internal',
      'legacy',
      'catalog',
    ]);
  });

  it('removes what the target selects, including several array items', async () => {
    const result = await run(
      overlay([
        { target: "$.paths['/internal/health']", remove: true },
        { target: "$.tags[?@.name != 'books']", remove: true },
        {
          target: "$.paths.*[?@.operationId == 'BooksController_create']",
          remove: true,
        },
      ]),
    );

    const output = Either.getOrThrow(result);
    expect(Object.keys(output.paths)).toEqual(['/books', '/books/{id}']);
    expect(Object.keys(output.paths['/books'])).toEqual(['get']);
    expect(output.tags).toEqual([{ name: 'books' }]);
  });

  it('applies actions in order, each on the result of the previous one', async () => {
    const result = await run(
      overlay([
        { target: '$.paths.*.get', update: { 'x-internal': true } },
        {
          target: '$.paths.*[?@["x-internal"] == true]',
          update: { deprecated: true },
        },
        { target: "$.paths['/books/{id}'].get", remove: true },
        { target: '$.paths.*.get', update: { 'x-internal': false } },
      ]),
    );

    const output = Either.getOrThrow(result);
    expect(output.paths['/books'].get).toMatchObject({
      'x-internal': false,
      deprecated: true,
    });
    expect(output.paths['/books/{id}']).toEqual({});
  });

  it('fails naming the action when its target matches nothing', async () => {
    const result = await run(
      overlay([
        { target: '$.info', update: { description: 'Books' } },
        {
          target: "$.paths['/novels'].get",
          description: 'Rate limit novels',
          update: { 'x-rate-limit': 10 },
        },
      ]),
    );

    expect(Either.isLeft(result) && result.left.message).toBe(
      `Overlay options.overlay: action 2 (target "$.paths['/novels'].get", "Rate limit novels") matched nothing. Fix the target, or set options.overlayUnmatchedTarget to 'warn'`,
    );
  });

  it('skips an unmatched action with overlayUnmatchedTarget warn', async () => {
    const result = await run(
      overlay([
        { target: "$.paths['/novels'].get", update: { 'x-rate-limit': 10 } },
        { target: '$.info', update: { description: 'Books' } },
      ]),
      { unmatched: 'warn' },
    );

    expect(Either.getOrThrow(result).info).toMatchObject({
      description: 'Books',
    });
  });

  it('rejects an overlay without a 1.0.x version, info or actions', async () => {
    const result = await run({ overlay: '2.0.0', actions: [] });

    expect(Either.isLeft(result) && result.left.message).toBe(
      [
        'Invalid overlay options.overlay:',
        '  "overlay" must be a 1.0.x version string, e.g. "1.0.0"',
        '  "info" must be an object with a string "title" and "version"',
        '  "actions" must be a non-empty array',
      ].join('\n'),
    );
  });

  it('rejects an update of a primitive value', async () => {
    const result = await run(
      overlay([{ target: '$.info.title', update: 'Novels API' }]),
    );

    expect(Either.isLeft(result) && result.left.message).toContain(
      'action 1 (target "$.info.title") selects a string; "update" needs an object or array target',
    );
  });

  it('does not change the spec it is given', async () => {
    const input = spec();

    await Effect.runPromise(
      applyOverlay(
        input,
        overlay([{ target: '$.info', update: { title: 'Changed' } }]),
        process.cwd(),
      ),
    );

    expect(input.info.title).toBe('Books API');
  });

  describe('from a file', () => {
    const dir = resolve(process.cwd(), '.test-tmp-overlay');

    beforeEach(() => mkdirSync(dir, { recursive: true }));
    afterEach(() => rmSync(dir, { recursive: true, force: true }));

    it('reads a YAML overlay relative to the config directory', async () => {
      writeFileSync(
        join(dir, 'public.overlay.yaml'),
        [
          'overlay: 1.0.0',
          'info:',
          '  title: Public books API',
          '  version: 1.0.0',
          'actions:',
          "  - target: $.paths['/internal/health']",
          '    remove: true',
        ].join('\n'),
      );

      const result = await run('public.overlay.yaml', { configDir: dir });

      expect(Object.keys(Either.getOrThrow(result).paths)).toEqual([
        '/books',
        '/books/{id}',
      ]);
    });

    it('reads a JSON overlay', async () => {
      writeFileSync(
        join(dir, 'public.overlay.json'),
        JSON.stringify(
          overlay([{ target: '$.info', update: { title: 'Public' } }]),
        ),
      );

      const result = await run('public.overlay.json', { configDir: dir });

      expect(Either.getOrThrow(result).info.title).toBe('Public');
    });

    it('names the file when its target matches nothing', async () => {
      writeFileSync(
        join(dir, 'public.overlay.json'),
        JSON.stringify(overlay([{ target: '$.webhooks', remove: true }])),
      );

      const result = await run('public.overlay.json', { configDir: dir });

      expect(Either.isLeft(result) && result.left.message).toContain(
        `Overlay ${join(dir, 'public.overlay.json')}: action 1 (target "$.webhooks") matched nothing`,
      );
    });
  });
});
