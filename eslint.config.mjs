import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import { FlatCompat } from '@eslint/eslintrc';
import eslintConfigPrettier from 'eslint-config-prettier';
import communityNodesPlugin from '@n8n/eslint-plugin-community-nodes';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

const compat = new FlatCompat({
  baseDirectory: __dirname,
  resolvePluginsRelativeTo: __dirname,
});

export default [
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  // Apply @typescript-eslint flat configs
  ...tsPlugin.configs['flat/recommended'],
  ...tsPlugin.configs['flat/recommended-type-checked'],
  // Apply n8n-nodes-base via FlatCompat (legacy plugin without flat config support)
  ...compat.extends('plugin:n8n-nodes-base/nodes', 'plugin:n8n-nodes-base/credentials'),
  // Apply n8n community nodes plugin (checks against published package rules)
  communityNodesPlugin.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: __dirname,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      // TypeScript strict rules
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/strict-boolean-expressions': 'warn',
      // n8n specific rules
      'n8n-nodes-base/node-class-description-credentials-name-unsuffixed': 'error',
      'n8n-nodes-base/node-class-description-display-name-unsuffixed-trigger-node': 'off',
      'n8n-nodes-base/cred-class-field-documentation-url-miscased': 'off',
      // These two conflict with @n8n/community-nodes/node-connection-type-literal:
      // the legacy rules want the string literal ['main'], the current community-nodes
      // rule wants [NodeConnectionTypes.Main]. The community-nodes plugin reflects the
      // current n8n guidance, so the literal rules are turned off. If
      // node-connection-type-literal is ever disabled, re-enable these so the inputs/
      // outputs shape stays checked by *some* rule.
      'n8n-nodes-base/node-class-description-inputs-wrong-regular-node': 'off',
      'n8n-nodes-base/node-class-description-outputs-wrong': 'off',
      // no-credential-reuse parses compiled dist/*.js files and checks for `implements ICredentialType`,
      // which TypeScript removes during compilation — causing false positives for all local credentials.
      '@n8n/community-nodes/no-credential-reuse': 'off',
      // General code quality
      'no-console': 'warn',
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
  eslintConfigPrettier,
];
