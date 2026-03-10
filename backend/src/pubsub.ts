import { createPubSub } from 'graphql-yoga';
import type { Task, Project, Initiative } from '@prisma/client';

export const pubsub = createPubSub<{
  taskChanged: [Task];
  projectChanged: [Project];
  initiativeChanged: [Initiative];
}>();
