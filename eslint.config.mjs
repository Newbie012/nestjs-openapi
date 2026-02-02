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
      'no-console': ['warn', { allow: ['warn', 'error'] }],
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
