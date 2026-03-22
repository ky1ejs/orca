import type { AuditAction, AuditActorType, AuditEntityType, PrismaClient } from '@prisma/client';
import { z } from 'zod';

const auditChangeSchema = z.array(
  z.object({
    field: z.string(),
    oldValue: z.string().nullable(),
    newValue: z.string().nullable(),
  }),
);

interface AuditEventInput {
  entityType: AuditEntityType;
  entityId: string;
  action: AuditAction;
  actorType: AuditActorType;
  actorId?: string | null;
  workspaceId: string;
  changes?: Array<{ field: string; oldValue: string | null; newValue: string | null }>;
}

export async function recordAuditEvent(
  prisma: PrismaClient,
  input: AuditEventInput,
): Promise<void> {
  try {
    const changes = auditChangeSchema.parse(input.changes ?? []);
    await prisma.auditEvent.create({
      data: {
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        actorType: input.actorType,
        actorId: input.actorId ?? null,
        workspaceId: input.workspaceId,
        changes,
      },
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'audit_event_write_failed',
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}
