import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/__generated__/**'],
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'TSTypeReference[typeName.name="Record"] > TSTypeParameterInstantiation > TSUnknownKeyword',
          message:
            'Avoid Record<string, unknown>. Use a concrete type (e.g., Prisma.XxxUncheckedUpdateInput, Prisma.XxxWhereInput).',
        },
      ],
    },
  },
  {
    files: ['**/*.test.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
];
