import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { NodePgDatabase, NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;
export type Transaction = PgTransaction<
  NodePgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;
/** Repositories accept either, so the caller decides the transaction boundary. */
export type Executor = Database | Transaction;

export type OrderRow = typeof schema.orders.$inferSelect;
export type MailboxRow = typeof schema.mailboxes.$inferSelect;
export type AuditLogRow = typeof schema.auditLogs.$inferSelect;
export type UserRow = typeof schema.users.$inferSelect;
