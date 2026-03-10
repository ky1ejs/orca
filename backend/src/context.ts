import type { PrismaClient } from '@prisma/client';
import type { pubsub } from './pubsub.js';

export type PubSubLike = typeof pubsub;

export interface ServerContext {
  prisma: PrismaClient;
  pubsub: PubSubLike;
  userId: string;
}
