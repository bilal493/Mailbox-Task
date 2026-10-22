import { and, asc, eq, ne, sql } from "drizzle-orm";
import { mailboxes } from "@/db/schema";
import type { Executor, MailboxRow } from "@/db/types";

export const mailboxRepository = {
  async insertMany(ex: Executor, orderId: string, addresses: string[]): Promise<void> {
    if (addresses.length === 0) return;
    await ex.insert(mailboxes).values(addresses.map((address) => ({ orderId, address })));
  },

  async listForOrder(ex: Executor, orderId: string): Promise<MailboxRow[]> {
    return ex.select().from(mailboxes).where(eq(mailboxes.orderId, orderId)).orderBy(asc(mailboxes.address));
  },

  /** Mailboxes that still need work. Already ACTIVE ones are never provisioned twice. */
  async listUnprovisioned(ex: Executor, orderId: string): Promise<MailboxRow[]> {
    return ex
      .select()
      .from(mailboxes)
      .where(and(eq(mailboxes.orderId, orderId), ne(mailboxes.status, "ACTIVE")))
      .orderBy(asc(mailboxes.address));
  },

  async markActive(ex: Executor, id: string, externalId: string): Promise<void> {
    await ex
      .update(mailboxes)
      .set({ status: "ACTIVE", externalId, error: null, updatedAt: new Date() })
      .where(eq(mailboxes.id, id));
  },

  async markFailed(ex: Executor, id: string, error: string): Promise<void> {
    await ex
      .update(mailboxes)
      .set({ status: "FAILED", error, updatedAt: new Date() })
      .where(eq(mailboxes.id, id));
  },

  async countNotActive(ex: Executor, orderId: string): Promise<number> {
    const [row] = await ex
      .select({ n: sql<number>`count(*)::int` })
      .from(mailboxes)
      .where(and(eq(mailboxes.orderId, orderId), ne(mailboxes.status, "ACTIVE")));
    return row?.n ?? 0;
  },
};
