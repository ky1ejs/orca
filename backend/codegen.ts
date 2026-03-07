import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  schema: 'src/schema/schema.graphql',
  generates: {
    'src/__generated__/graphql.ts': {
      plugins: ['typescript', 'typescript-resolvers'],
      config: {
        contextType: '../context.js#ServerContext',
        mappers: {
          Project: '@prisma/client#Project as ProjectModel',
          Task: '@prisma/client#Task as TaskModel',
        },
        useIndexSignature: true,
      },
    },
  },
};

export default config;
