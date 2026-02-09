import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Effect } from 'effect';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  defineConfig,
  findConfigFile,
  resolveConfig,
  loadConfigFromFile,
} from './config.js';
import type { Config } from './types.js';

describe('Config', () => {
  describe('defineConfig', () => {
    it('should return the same config object (identity function)', () => {
      const config: Config = {
        output: 'openapi.json',
        openapi: {
          info: {
            title: 'My API',
            version: '1.0.0',
          },
        },
      };

      const result = defineConfig(config);

      expect(result).toBe(config);
      expect(result.output).toBe('openapi.json');
      expect(result.openapi.info.title).toBe('My API');
    });

    it('should preserve all config properties', () => {
      const config: Config = {
        output: 'openapi.json',
        files: {
          entry: 'src/app.module.ts',
          dtoGlob: ['src/**/*.dto.ts'],
        },
        openapi: {
          info: {
            title: 'Test API',
            version: '2.0.0',
            description: 'A test API',
          },
          servers: [{ url: 'https://api.example.com' }],
        },
        options: {
          excludeDecorators: ['Internal'],
        },
      };

      const result = defineConfig(config);

      expect(result.files?.entry).toBe('src/app.module.ts');
      expect(result.files?.dtoGlob).toEqual(['src/**/*.dto.ts']);
      expect(result.options?.excludeDecorators).toEqual(['Internal']);
      expect(result.openapi.servers).toHaveLength(1);
    });
  });

  describe('findConfigFile', () => {
    const testDir = join(process.cwd(), '.test-config-dir');
    const nestedDir = join(testDir, 'nested', 'deep');

    beforeEach(() => {
      // Create test directory structure
      mkdirSync(nestedDir, { recursive: true });
    });

    afterEach(() => {
      // Clean up test directories
      rmSync(testDir, { recursive: true, force: true });
    });

    it('should find openapi.config.ts in current directory', async () => {
      const configPath = join(testDir, 'openapi.config.ts');
      writeFileSync(configPath, 'export default {}');

      const result = await Effect.runPromise(findConfigFile(testDir));

      expect(result).toBe(configPath);
    });

    it('should find openapi.config.js in current directory', async () => {
      const configPath = join(testDir, 'openapi.config.js');
      writeFileSync(configPath, 'module.exports = {}');

      const result = await Effect.runPromise(findConfigFile(testDir));

      expect(result).toBe(configPath);
    });

    it('should fail when no config file is found', async () => {
      const result = await Effect.runPromiseExit(findConfigFile(nestedDir));

      expect(result._tag).toBe('Failure');
    });

    it('should prefer openapi.config.ts over .js', async () => {
      const tsConfigPath = join(testDir, 'openapi.config.ts');
      const jsConfigPath = join(testDir, 'openapi.config.js');
      writeFileSync(tsConfigPath, 'export default {}');
      writeFileSync(jsConfigPath, 'module.exports = {}');

      const result = await Effect.runPromise(findConfigFile(testDir));

      expect(result).toBe(tsConfigPath);
    });

    it('should find config in ancestor directories', async () => {
      const configPath = join(testDir, 'openapi.config.ts');
      writeFileSync(configPath, 'export default {}');

      const result = await Effect.runPromise(findConfigFile(nestedDir));

      expect(result).toBe(configPath);
    });
  });

  describe('resolveConfig', () => {
    it('should apply defaults to minimal config', () => {
      const config = {
        output: 'openapi.json',
        files: {
          entry: 'src/app.module.ts',
          tsconfig: 'tsconfig.json',
        },
        openapi: {
          info: {
            title: 'My API',
            version: '1.0.0',
          },
        },
      };

      const resolved = resolveConfig(config as any);

      expect(resolved.entry).toEqual(['src/app.module.ts']);
      expect(resolved.include).toEqual([]);
      expect(resolved.exclude).toEqual([
        '**/*.spec.ts',
        '**/*.test.ts',
        '**/node_modules/**',
      ]);
      expect(resolved.excludeDecorators).toEqual([
        'ApiExcludeEndpoint',
        'ApiExcludeController',
      ]);
      expect(resolved.extractValidation).toBe(true);
      expect(resolved.format).toBe('json');
      expect(resolved.servers).toEqual([]);
      expect(resolved.securitySchemes).toEqual([]);
      expect(resolved.tags).toEqual([]);
    });

    it('should convert single entry to array', () => {
      const config = {
        output: 'openapi.json',
        files: {
          entry: 'src/app.module.ts',
          tsconfig: 'tsconfig.json',
        },
        openapi: {
          info: { title: 'API', version: '1.0' },
        },
      };

      const resolved = resolveConfig(config as any);

      expect(resolved.entry).toEqual(['src/app.module.ts']);
    });

    it('should preserve array entry', () => {
      const config = {
        output: 'openapi.json',
        files: {
          entry: ['src/app.module.ts', 'src/other.module.ts'],
          tsconfig: 'tsconfig.json',
        },
        openapi: {
          info: { title: 'API', version: '1.0' },
        },
      };

      const resolved = resolveConfig(config as any);

      expect(resolved.entry).toEqual([
        'src/app.module.ts',
        'src/other.module.ts',
      ]);
    });

    it('should convert single dtoGlob to array', () => {
      const config = {
        output: 'openapi.json',
        files: {
          entry: 'src/app.module.ts',
          tsconfig: 'tsconfig.json',
          dtoGlob: 'src/**/*.dto.ts',
        },
        openapi: {
          info: { title: 'API', version: '1.0' },
        },
      };

      const resolved = resolveConfig(config as any);

      expect(resolved.dtoGlob).toEqual(['src/**/*.dto.ts']);
    });

    it('should preserve array dtoGlob', () => {
      const config = {
        output: 'openapi.json',
        files: {
          entry: 'src/app.module.ts',
          tsconfig: 'tsconfig.json',
          dtoGlob: ['src/**/*.dto.ts', 'src/**/*.model.ts'],
        },
        openapi: {
          info: { title: 'API', version: '1.0' },
        },
      };

      const resolved = resolveConfig(config as any);

      expect(resolved.dtoGlob).toEqual([
        'src/**/*.dto.ts',
        'src/**/*.model.ts',
      ]);
    });

    it('should use provided values over defaults', () => {
      const config = {
        output: 'openapi.yaml',
        format: 'yaml' as const,
        files: {
          entry: 'src/app.module.ts',
          tsconfig: 'tsconfig.json',
          include: ['src/**/*.ts'],
          exclude: ['**/test/**'],
        },
        openapi: {
          info: { title: 'API', version: '1.0' },
          servers: [{ url: 'https://api.example.com' }],
        },
        options: {
          excludeDecorators: ['Internal', 'Private'],
          extractValidation: false,
        },
      };

      const resolved = resolveConfig(config as any);

      expect(resolved.include).toEqual(['src/**/*.ts']);
      expect(resolved.exclude).toEqual(['**/test/**']);
      expect(resolved.excludeDecorators).toEqual(['Internal', 'Private']);
      expect(resolved.extractValidation).toBe(false);
      expect(resolved.format).toBe('yaml');
      expect(resolved.servers).toHaveLength(1);
    });
  });

  describe('loadConfigFromFile with extends', () => {
    const testDir = join(process.cwd(), '.test-extends-dir');

    beforeEach(() => {
      mkdirSync(testDir, { recursive: true });
    });

    afterEach(() => {
      rmSync(testDir, { recursive: true, force: true });
    });

    it('should merge parent config with child config', async () => {
      // Create parent config
      const parentConfig = `
        export default {
          output: 'parent-output.json',
          files: {
            tsconfig: 'tsconfig.json',
          },
          openapi: {
            info: {
              title: 'Parent API',
              version: '1.0.0',
              description: 'Parent description',
            },
            servers: [{ url: 'https://parent.example.com' }],
          },
          options: {
            basePath: '/parent',
          },
        };
      `;
      writeFileSync(join(testDir, 'parent.config.ts'), parentConfig);

      // Create child config that extends parent
      const childConfig = `
        export default {
          extends: './parent.config.ts',
          output: 'child-output.json',
          openapi: {
            info: {
              title: 'Child API',
              version: '2.0.0',
            },
          },
        };
      `;
      writeFileSync(join(testDir, 'child.config.ts'), childConfig);

      const result = await Effect.runPromise(
        loadConfigFromFile(join(testDir, 'child.config.ts')),
      );

      // Child values override parent
      expect(result.output).toBe('child-output.json');
      expect(result.openapi.info.title).toBe('Child API');
      expect(result.openapi.info.version).toBe('2.0.0');

      // Parent values are inherited
      expect(result.openapi.info.description).toBe('Parent description');
      expect(result.openapi.servers).toEqual([
        { url: 'https://parent.example.com' },
      ]);
      expect(result.options?.basePath).toBe('/parent');
      expect(result.files?.tsconfig).toBe('tsconfig.json');
    });

    it('should support chained extends (grandparent -> parent -> child)', async () => {
      // Create grandparent config
      const grandparentConfig = `
        export default {
          output: 'grandparent.json',
          openapi: {
            info: {
              title: 'Grandparent',
              version: '0.1.0',
              description: 'Grandparent description',
            },
          },
          options: {
            basePath: '/grandparent',
          },
        };
      `;
      writeFileSync(join(testDir, 'grandparent.config.ts'), grandparentConfig);

      // Create parent config
      const parentConfig = `
        export default {
          extends: './grandparent.config.ts',
          openapi: {
            info: {
              title: 'Parent',
              version: '1.0.0',
            },
          },
          files: {
            tsconfig: 'tsconfig.json',
          },
        };
      `;
      writeFileSync(join(testDir, 'parent.config.ts'), parentConfig);

      // Create child config
      const childConfig = `
        export default {
          extends: './parent.config.ts',
          openapi: {
            info: {
              title: 'Child',
            },
          },
        };
      `;
      writeFileSync(join(testDir, 'child.config.ts'), childConfig);

      const result = await Effect.runPromise(
        loadConfigFromFile(join(testDir, 'child.config.ts')),
      );

      // Child overrides
      expect(result.openapi.info.title).toBe('Child');

      // Parent overrides grandparent
      expect(result.openapi.info.version).toBe('1.0.0');

      // Grandparent values inherited
      expect(result.openapi.info.description).toBe('Grandparent description');
      expect(result.output).toBe('grandparent.json');
      expect(result.options?.basePath).toBe('/grandparent');

      // Parent added values
      expect(result.files?.tsconfig).toBe('tsconfig.json');
    });

    it('should detect circular extends and fail', async () => {
      // Create configs that reference each other
      const configA = `
        export default {
          extends: './config-b.config.ts',
          output: 'a.json',
          openapi: {
            info: { title: 'A', version: '1.0' },
          },
        };
      `;
      writeFileSync(join(testDir, 'config-a.config.ts'), configA);

      const configB = `
        export default {
          extends: './config-a.config.ts',
          output: 'b.json',
          openapi: {
            info: { title: 'B', version: '1.0' },
          },
        };
      `;
      writeFileSync(join(testDir, 'config-b.config.ts'), configB);

      const result = await Effect.runPromiseExit(
        loadConfigFromFile(join(testDir, 'config-a.config.ts')),
      );

      expect(result._tag).toBe('Failure');
    });

    it('should work without extends (no parent)', async () => {
      const config = `
        export default {
          output: 'standalone.json',
          files: {
            tsconfig: 'tsconfig.json',
          },
          openapi: {
            info: {
              title: 'Standalone API',
              version: '1.0.0',
            },
          },
        };
      `;
      writeFileSync(join(testDir, 'standalone.config.ts'), config);

      const result = await Effect.runPromise(
        loadConfigFromFile(join(testDir, 'standalone.config.ts')),
      );

      expect(result.output).toBe('standalone.json');
      expect(result.openapi.info.title).toBe('Standalone API');
    });
  });

  describe('security scheme config validation', () => {
    const testDir = join(process.cwd(), '.test-security-config-dir');

    beforeEach(() => {
      mkdirSync(testDir, { recursive: true });
    });

    afterEach(() => {
      rmSync(testDir, { recursive: true, force: true });
    });

    it('should preserve oauth2 flows when loading config', async () => {
      const config = `
        export default {
          output: 'openapi.json',
          openapi: {
            info: { title: 'Security API', version: '1.0.0' },
            security: {
              schemes: [
                {
                  name: 'oauth2',
                  type: 'oauth2',
                  flows: {
                    authorizationCode: {
                      authorizationUrl: 'https://example.com/oauth/authorize',
                      tokenUrl: 'https://example.com/oauth/token',
                      scopes: { read: 'Read access' },
                    },
                  },
                },
              ],
            },
          },
        };
      `;

      const configPath = join(testDir, 'oauth.config.ts');
      writeFileSync(configPath, config);

      const result = await Effect.runPromise(loadConfigFromFile(configPath));

      expect(result.openapi.security?.schemes?.[0]).toEqual(
        expect.objectContaining({
          flows: expect.objectContaining({
            authorizationCode: expect.objectContaining({
              authorizationUrl: 'https://example.com/oauth/authorize',
              tokenUrl: 'https://example.com/oauth/token',
            }),
          }),
        }),
      );
    });

    it('should preserve openIdConnectUrl when loading config', async () => {
      const config = `
        export default {
          output: 'openapi.json',
          openapi: {
            info: { title: 'Security API', version: '1.0.0' },
            security: {
              schemes: [
                {
                  name: 'oidc',
                  type: 'openIdConnect',
                  openIdConnectUrl: 'https://issuer.example.com/.well-known/openid-configuration',
                },
              ],
            },
          },
        };
      `;

      const configPath = join(testDir, 'oidc.config.ts');
      writeFileSync(configPath, config);

      const result = await Effect.runPromise(loadConfigFromFile(configPath));

      expect(result.openapi.security?.schemes?.[0]).toEqual(
        expect.objectContaining({
          openIdConnectUrl:
            'https://issuer.example.com/.well-known/openid-configuration',
        }),
      );
    });

    it('should reject apiKey scheme without in and parameterName', async () => {
      const config = `
        export default {
          output: 'openapi.json',
          openapi: {
            info: { title: 'Security API', version: '1.0.0' },
            security: {
              schemes: [
                {
                  name: 'apiKey',
                  type: 'apiKey',
                },
              ],
            },
          },
        };
      `;

      const configPath = join(testDir, 'invalid-apikey.config.ts');
      writeFileSync(configPath, config);

      const result = await Effect.runPromiseExit(loadConfigFromFile(configPath));

      expect(result._tag).toBe('Failure');
    });

    it('should reject http scheme without scheme field', async () => {
      const config = `
        export default {
          output: 'openapi.json',
          openapi: {
            info: { title: 'Security API', version: '1.0.0' },
            security: {
              schemes: [
                {
                  name: 'httpAuth',
                  type: 'http',
                },
              ],
            },
          },
        };
      `;

      const configPath = join(testDir, 'invalid-http.config.ts');
      writeFileSync(configPath, config);

      const result = await Effect.runPromiseExit(loadConfigFromFile(configPath));

      expect(result._tag).toBe('Failure');
    });
  });
});
