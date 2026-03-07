import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  schema: '../shared/src/schema.graphql',
  documents: 'src/renderer/graphql/**/*.ts',
  generates: {
    'src/renderer/graphql/generated.ts': {
      plugins: ['typescript', 'typescript-operations', 'typed-document-node'],
    },
  },
};

export default config;
