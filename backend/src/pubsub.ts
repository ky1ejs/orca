import { createPubSub } from 'graphql-yoga';
import type { Task, Project, Initiative } from '@prisma/client';

export const pubsub = createPubSub<{
  taskChanged: [Task];
  /** A task was deleted (by the public API's purge). */
  taskDeleted: [{ id: string; workspaceId: string }];
  projectChanged: [Project];
  initiativeChanged: [Initiative];
}>();
