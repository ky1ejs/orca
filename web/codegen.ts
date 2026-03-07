import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  schema: '../shared/src/schema.graphql',
  documents: ['src/renderer/graphql/**/*.ts', '!src/renderer/graphql/__generated__/**'],
  generates: {
    'src/renderer/graphql/__generated__/generated.ts': {
      plugins: ['typescript', 'typescript-operations', 'typed-document-node'],
    },
  },
};

export default config;
