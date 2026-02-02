import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resolve } from 'path';
import { readFileSync, existsSync, unlinkSync, writeFileSync } from 'fs';
import yaml from 'js-yaml';
import { generate } from '../src/generate.js';

const TEST_APP_DIR = 'e2e-applications/dto-validation';
const YAML_OUTPUT = 'openapi.generated.yaml';
const JSON_OUTPUT = 'openapi.generated.json';

describe('YAML output format', () => {
  const yamlConfigPath = resolve(
    process.cwd(),
    TEST_APP_DIR,
    'openapi.yaml.config.ts',
  );
  const yamlOutputPath = resolve(process.cwd(), TEST_APP_DIR, YAML_OUTPUT);

  // Create a temporary YAML config file
  beforeAll(() => {
    const yamlConfig = `import { defineConfig } from '../../src/config.js';

export default defineConfig({
  output: '${YAML_OUTPUT}',
  format: 'yaml',

  files: {
    entry: 'src/app.module.ts',
    tsconfig: '../../tsconfig.json',
    dtoGlob: 'src/**/*.dto.ts',
  },

  openapi: {
    info: {
      title: 'DTO Validation API (YAML)',
      version: '1.0.0',
      description: 'API demonstrating YAML output format',
    },
  },

  options: {
    extractValidation: true,
  },
});
`;
    writeFileSync(yamlConfigPath, yamlConfig, 'utf-8');
  });

  // Clean up temporary files
  afterAll(() => {
    if (existsSync(yamlConfigPath)) {
      unlinkSync(yamlConfigPath);
    }
    if (existsSync(yamlOutputPath)) {
      unlinkSync(yamlOutputPath);
    }
  });

  it('should generate valid YAML output when format is "yaml"', async () => {
    const result = await generate(yamlConfigPath);

    expect(result.outputPath).toBe(yamlOutputPath);
    expect(existsSync(yamlOutputPath)).toBe(true);

    const content = readFileSync(yamlOutputPath, 'utf-8');

    // Should be valid YAML
    const parsed = yaml.load(content) as Record<string, unknown>;
    expect(parsed).toBeDefined();
    expect(parsed.openapi).toBe('3.0.3');
    expect(parsed.info).toBeDefined();
  });

  it('should generate equivalent content in YAML and JSON formats', async () => {
    // Generate JSON with a separate config to avoid race conditions with other tests
    const jsonCompareConfigPath = resolve(
      process.cwd(),
      TEST_APP_DIR,
      'openapi.compare-json.config.ts',
    );
    const jsonCompareOutputPath = resolve(
      process.cwd(),
      TEST_APP_DIR,
      'openapi.compare.json',
    );

    const jsonConfig = `import { defineConfig } from '../../src/config.js';

export default defineConfig({
  output: 'openapi.compare.json',
  format: 'json',

  files: {
    entry: 'src/app.module.ts',
    tsconfig: '../../tsconfig.json',
    dtoGlob: 'src/**/*.dto.ts',
  },

  openapi: {
    info: {
      title: 'Compare Test API',
      version: '1.0.0',
    },
  },

  options: {
    extractValidation: true,
  },
});
`;
    writeFileSync(jsonCompareConfigPath, jsonConfig, 'utf-8');

    try {
      // Generate JSON
      await generate(jsonCompareConfigPath);

      // Generate YAML
      await generate(yamlConfigPath);

      // Parse both
      const jsonContent = JSON.parse(
        readFileSync(jsonCompareOutputPath, 'utf-8'),
      );
      const yamlContent = yaml.load(
        readFileSync(yamlOutputPath, 'utf-8'),
      ) as Record<string, unknown>;

      // Compare structures (excluding title which differs)
      expect(yamlContent.openapi).toBe(jsonContent.openapi);
      expect(yamlContent.paths).toEqual(jsonContent.paths);
      expect(yamlContent.components).toEqual(jsonContent.components);
    } finally {
      // Clean up
      if (existsSync(jsonCompareConfigPath)) {
        unlinkSync(jsonCompareConfigPath);
      }
      if (existsSync(jsonCompareOutputPath)) {
        unlinkSync(jsonCompareOutputPath);
      }
    }
  });

  it('should override config format via CLI overrides parameter', async () => {
    // Create a different output path for this test
    const overrideYamlPath = resolve(
      process.cwd(),
      TEST_APP_DIR,
      'openapi.override.yaml',
    );

    // Create a temp config that outputs to a different path
    const overrideConfigPath = resolve(
      process.cwd(),
      TEST_APP_DIR,
      'openapi.override.config.ts',
    );

    const overrideConfig = `import { defineConfig } from '../../src/config.js';

export default defineConfig({
  output: 'openapi.override.yaml',
  format: 'json', // This will be overridden

  files: {
    entry: 'src/app.module.ts',
    tsconfig: '../../tsconfig.json',
    dtoGlob: 'src/**/*.dto.ts',
  },

  openapi: {
    info: {
      title: 'Override Test API',
      version: '1.0.0',
    },
  },
});
`;
    writeFileSync(overrideConfigPath, overrideConfig, 'utf-8');

    try {
      // Generate with format override
      const result = await generate(overrideConfigPath, { format: 'yaml' });

      expect(result.outputPath).toBe(overrideYamlPath);
      expect(existsSync(overrideYamlPath)).toBe(true);

      const content = readFileSync(overrideYamlPath, 'utf-8');

      // Should be valid YAML (not JSON)
      expect(content.startsWith('{')).toBe(false);
      const parsed = yaml.load(content) as Record<string, unknown>;
      expect(parsed.openapi).toBe('3.0.3');
    } finally {
      // Clean up
      if (existsSync(overrideConfigPath)) {
        unlinkSync(overrideConfigPath);
      }
      if (existsSync(overrideYamlPath)) {
        unlinkSync(overrideYamlPath);
      }
    }
  });

  it('should handle special characters in YAML output correctly', async () => {
    await generate(yamlConfigPath);

    const content = readFileSync(yamlOutputPath, 'utf-8');
    const parsed = yaml.load(content) as Record<string, unknown>;

    // Should be parseable
    expect(parsed).toBeDefined();

    // Content should not have YAML anchors (e.g., &anchor_name) or aliases (*anchor_name)
    // Note: * can appear in regex patterns, so we check for YAML anchor syntax specifically
    // YAML anchors look like: &name or &name followed by space/newline
    expect(content).not.toMatch(/&[a-zA-Z_][a-zA-Z0-9_]*(?:\s|$)/);
    // YAML aliases look like: *name (but * in regex patterns like (?=.*) are fine)
    // We check for *name at word boundary, excluding common regex patterns
    expect(content).not.toMatch(/^\s*\*[a-zA-Z_][a-zA-Z0-9_]*\s*$/m);
  });
});

describe('JSON output format (default)', () => {
  const jsonConfigPath = resolve(
    process.cwd(),
    TEST_APP_DIR,
    'openapi.config.ts',
  );
  const jsonOutputPath = resolve(process.cwd(), TEST_APP_DIR, JSON_OUTPUT);

  it('should generate valid JSON output by default', async () => {
    const result = await generate(jsonConfigPath);

    expect(result.outputPath).toBe(jsonOutputPath);
    expect(existsSync(jsonOutputPath)).toBe(true);

    const content = readFileSync(jsonOutputPath, 'utf-8');

    // Should be valid JSON
    const parsed = JSON.parse(content);
    expect(parsed).toBeDefined();
    expect(parsed.openapi).toBe('3.0.3');
    expect(parsed.info).toBeDefined();
  });

  it('should format JSON with 2-space indentation', async () => {
    await generate(jsonConfigPath);

    const content = readFileSync(jsonOutputPath, 'utf-8');

    // Check for 2-space indentation
    expect(content).toContain('\n  "');
  });
});
