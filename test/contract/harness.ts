import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Effect, Either, Layer, Schema } from 'effect';
import { Validator } from '@seriousme/openapi-schema-validator';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConfigService } from '../../src/config/config.js';
import type { OpenApiSpec } from '../../src/config/types.js';
import { OutputService } from '../../src/document/output-service.js';
import { generateEffect } from '../../src/document/generate.js';
import {
  OpenApiGeneratorConfig,
  type OpenApiConfig,
  type OpenApiVersion,
} from '../../src/model/domain.js';
import { runtimeLayerFor } from '../../src/runtime/runtime-layer.js';
import { MethodExtractionService } from '../../src/analysis/methods.js';
import { ModuleTraversalService } from '../../src/analysis/modules.js';
import { ProjectService } from '../../src/analysis/project.js';
import { SchemaService } from '../../src/schema/schema-service.js';
import { TransformerService } from '../../src/document/transformer.js';
import { ValidationMapperService } from '../../src/analysis/validation-mapper.js';

/** Every OpenAPI version the generator supports, oldest first */
export const OPENAPI_VERSIONS = ['3.0.3', '3.1.0', '3.2.0'] as const;

type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;

/** Fails typecheck when `OPENAPI_VERSIONS` and the domain's `OpenApiVersion` drift apart */
export const versionsCoverDomain: Exact<
  (typeof OPENAPI_VERSIONS)[number],
  OpenApiVersion
> = true;

/** Set by the release diff: record each document, skip every other assertion */
const RECORD_ONLY = process.env['CONTRACT_RECORD_ONLY'] === '1';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const CONTRACT_TMP = join(REPO_ROOT, '.contract-tmp');
const SHARED_TSCONFIG = join(REPO_ROOT, 'e2e-applications/tsconfig.json');

type EncodedConfig = typeof OpenApiGeneratorConfig.Encoded;

/** The generator config's `files`, `options` and `openapi` parts, minus version */
export interface ContractConfig {
  readonly files?: EncodedConfig['files'];
  readonly options?: EncodedConfig['options'];
  readonly openapi?: Partial<Omit<typeof OpenApiConfig.Encoded, 'version'>>;
}

export interface ContractInput {
  /** URL of the spec section this case pins, e.g. https://spec.openapis.org/oas/v3.1.0#schema-object */
  readonly spec: string;
  /** Case files: path relative to the case dir to TypeScript source */
  readonly source?: Readonly<Record<string, string>>;
  /** An existing fixture directory under e2e-applications/, instead of source */
  readonly fixture?: string;
  /** The generator config's `files`, `options` and `openapi` parts (minus version) */
  readonly config?: ContractConfig;
  /** Versions in this range must fail generation with this error tag */
  readonly rejects?: {
    readonly min?: OpenApiVersion;
    readonly max?: OpenApiVersion;
    readonly error: string;
  };
  /** Versions whose document is known to fail validation, and the plan that fixes it */
  readonly knownInvalid?: ReadonlyArray<{
    readonly version: OpenApiVersion;
    readonly reason: string;
    readonly plan: string;
  }>;
}

const versionIndex = (version: OpenApiVersion): number =>
  OPENAPI_VERSIONS.indexOf(version);

const isRejected = (
  version: OpenApiVersion,
  rejects: ContractInput['rejects'],
): rejects is NonNullable<ContractInput['rejects']> =>
  rejects !== undefined &&
  versionIndex(version) >= versionIndex(rejects.min ?? OPENAPI_VERSIONS[0]) &&
  versionIndex(version) <=
    versionIndex(rejects.max ?? OPENAPI_VERSIONS[OPENAPI_VERSIONS.length - 1]);

const writeCaseFiles = (
  caseDir: string,
  source: Readonly<Record<string, string>>,
): void => {
  rmSync(caseDir, { recursive: true, force: true });
  for (const [path, content] of Object.entries(source)) {
    const target = join(caseDir, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
  writeFileSync(
    join(caseDir, 'tsconfig.json'),
    JSON.stringify(
      {
        extends: relative(caseDir, SHARED_TSCONFIG),
        include: ['**/*.ts'],
      },
      null,
      2,
    ),
  );
};

const generateDocument = (
  caseDir: string,
  config: OpenApiGeneratorConfig,
  captured: { spec?: OpenApiSpec },
) => {
  const configLayer = Layer.succeed(
    ConfigService,
    ConfigService.make({
      findConfigFile: () => Effect.die('not used by contracts'),
      loadConfigFromFile: () => Effect.succeed(config),
      loadConfig: () => Effect.die('not used by contracts'),
      resolveConfig: () => Effect.die('not used by contracts'),
      loadAndResolveConfig: () => Effect.die('not used by contracts'),
    }),
  );
  const outputLayer = Layer.succeed(
    OutputService,
    OutputService.make({
      ensureOutputDirectory: () => Effect.void,
      serializeSpec: (spec) =>
        Effect.sync(() => {
          captured.spec = spec;
          return JSON.stringify(spec, null, 2);
        }),
      writeOutput: () => Effect.void,
    }),
  );
  const servicesLayer = Layer.mergeAll(
    configLayer,
    outputLayer,
    ProjectService.Default,
    ModuleTraversalService.Default,
    MethodExtractionService.Default,
    SchemaService.Default,
    TransformerService.Default,
    ValidationMapperService.Default,
  );

  return generateEffect(join(caseDir, 'openapi.config.ts')).pipe(
    Effect.provide(servicesLayer),
    Effect.provide(runtimeLayerFor(false, undefined)),
  );
};

/**
 * Pins one behavior: real NestJS source in, one committed full OpenAPI
 * document per supported version out. Every version is generated, compared to
 * its expected file and validated against the official schema.
 */
export const contract = (
  name: string,
  input: ContractInput,
  surfaceDir: string = process.cwd(),
  specBasename: string = 'contract',
): void => {
  const caseDir = input.fixture
    ? join(REPO_ROOT, 'e2e-applications', input.fixture)
    : join(CONTRACT_TMP, specBasename, name);

  describe(name, () => {
    beforeAll(() => {
      if (input.source) writeCaseFiles(caseDir, input.source);
    });

    afterAll(() => {
      if (input.source) rmSync(caseDir, { recursive: true, force: true });
    });

    for (const version of OPENAPI_VERSIONS) {
      it(`${name} @ ${version}`, async () => {
        const files = input.fixture
          ? input.config?.files
          : { tsconfig: 'tsconfig.json', ...input.config?.files };
        const encoded: EncodedConfig = {
          output: 'contract.json',
          files,
          options: input.config?.options,
          openapi: {
            ...input.config?.openapi,
            version,
            info: input.config?.openapi?.info ?? {
              title: name,
              version: '1.0.0',
            },
          },
        };
        const config = await Effect.runPromise(
          Schema.decodeUnknown(OpenApiGeneratorConfig)(encoded),
        );
        const captured: { spec?: OpenApiSpec } = {};

        const outcome = await Effect.runPromise(
          Effect.either(generateDocument(caseDir, config, captured)),
        );

        if (RECORD_ONLY && isRejected(version, input.rejects)) return;
        if (isRejected(version, input.rejects)) {
          expect(Either.isLeft(outcome)).toBe(true);
          if (Either.isLeft(outcome)) {
            expect((outcome.left as { _tag: string })._tag).toBe(
              input.rejects.error,
            );
          }
          return;
        }

        if (RECORD_ONLY && Either.isLeft(outcome)) return;
        if (Either.isLeft(outcome)) throw outcome.left;
        const spec = captured.spec;
        if (!spec) throw new Error(`${name} @ ${version} captured no document`);

        const serialized = JSON.stringify(spec, null, 2);
        await expect(serialized + '\n').toMatchFileSnapshot(
          join(surfaceDir, '__contracts__', `${name}.${version}.json`),
        );

        if (RECORD_ONLY) return;

        const result = await new Validator().validate(JSON.parse(serialized));
        const known = input.knownInvalid?.find((k) => k.version === version);
        if (known) {
          expect(
            result.valid,
            `${name} @ ${version} now passes validation: remove its knownInvalid entry (plan ${known.plan})`,
          ).toBe(false);
          return;
        }
        expect(result.errors ?? []).toEqual([]);
        expect(outcome.right.validation.valid).toBe(true);
      });
    }
  });
};

/**
 * Binds `contract` to the calling spec file: expected documents go to the
 * `__contracts__` directory beside it and temporary sources to a directory
 * named after it.
 */
export const surface = (specUrl: string) => {
  const specPath = fileURLToPath(specUrl);
  return (name: string, input: ContractInput): void =>
    contract(
      name,
      input,
      dirname(specPath),
      basename(specPath).replace(/\.spec\.ts$/, ''),
    );
};
