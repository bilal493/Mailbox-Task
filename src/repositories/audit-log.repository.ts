import { asc, eq } from "drizzle-orm";
import { auditLogs } from "@/db/schema";
import type { AuditLogRow, Executor } from "@/db/types";
import type { Actor } from "@/domain/types";
import type { OrderStatus } from "@/domain/order-status";

export interface AuditEntry {
  orderId: string;
  from: OrderStatus | null;
  to: OrderStatus;
  actor: Actor;
  note?: string | null;
}

export const auditLogRepository = {
  async append(ex: Executor, entry: AuditEntry): Promise<void> {
    await ex.insert(auditLogs).values({
      orderId: entry.orderId,
      fromStatus: entry.from,
      toStatus: entry.to,
      actorType: entry.actor.type,
      actorId: entry.actor.id,
      note: entry.note ?? null,
    });
  },

  async listForOrder(ex: Executor, orderId: string): Promise<AuditLogRow[]> {
    return ex
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.orderId, orderId))
      .orderBy(asc(auditLogs.createdAt), asc(auditLogs.id));
  },
};
