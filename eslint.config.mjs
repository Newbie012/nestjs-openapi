import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['src/**/*.ts'],
    ignores: ['src/**/*.test.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ThrowStatement',
          message:
            'Do not throw in source modules. Use Effect.fail(...) with a Schema.TaggedError.',
        },
        {
          selector: "NewExpression[callee.name='Error']",
          message:
            'Do not use generic Error in source modules. Use a Schema.TaggedError type.',
        },
        {
          selector:
            "CallExpression[callee.object.name='Effect'][callee.property.name='catchAll']",
          message:
            'Prefer Effect.catchTag/Effect.catchTags for typed, specific error handling.',
        },
      ],
    },
  },
  {
    // Test files - allow any for flexibility in test assertions
    files: ['src/**/*.test.ts', 'test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  {
    // CLI entry point - console output is expected for user-facing messages
    files: ['src/cli.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    files: ['e2e-applications/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: './e2e-applications/tsconfig.json',
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      'no-console': 'off',
    },
  },
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'scripts/**',
      'e2e-applications/**/demo.ts',
      'e2e-applications/**/dist/**',
      'docs/.next/**',
      'docs/.source/**',
      'docs/node_modules/**',
      '*.config.*',
    ],
  },
);
