import type { PrismaClient } from '@prisma/client';

export interface PubSubLike {
  publish(topic: string, payload: unknown): void;
  subscribe(topic: string): AsyncIterable<unknown>;
}

export interface ServerContext {
  prisma: PrismaClient;
  pubsub: PubSubLike;
}
