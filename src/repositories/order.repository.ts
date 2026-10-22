import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { orders, users } from "@/db/schema";
import type { Executor, OrderRow } from "@/db/types";
import { ConflictError } from "@/domain/errors";
import { assertTransition, type OrderStatus } from "@/domain/order-status";
import type { Actor, Provider } from "@/domain/types";
import { auditLogRepository } from "./audit-log.repository";

export interface NewOrder {
  userId: string;
  domain: string;
  provider: Provider;
  mailboxCount: number;
  idempotencyKey: string;
  requestHash: string;
}

export interface OrderFilters {
  userId?: string;
  status?: OrderStatus;
  provider?: Provider;
  page: number;
  pageSize: number;
}

export type OrderWithOwner = OrderRow & { userEmail: string };

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface TransitionInput {
  orderId: string;
  from: OrderStatus;
  to: OrderStatus;
  actor: Actor;
  note?: string;
  /** Extra columns to change in the same UPDATE (e.g. lastError). */
  patch?: Partial<Pick<OrderRow, "lastError" | "startedAt">>;
}

export const orderRepository = {
  /** Returns undefined when (userId, idempotencyKey) already exists: the caller replays. */
  async insertIfAbsent(ex: Executor, data: NewOrder): Promise<OrderRow | undefined> {
    const [row] = await ex
      .insert(orders)
      .values(data)
      .onConflictDoNothing({ target: [orders.userId, orders.idempotencyKey] })
      .returning();
    return row;
  },

  async findByIdempotencyKey(ex: Executor, userId: string, key: string): Promise<OrderRow | undefined> {
    const [row] = await ex
      .select()
      .from(orders)
      .where(and(eq(orders.userId, userId), eq(orders.idempotencyKey, key)))
      .limit(1);
    return row;
  },

  async findById(ex: Executor, id: string): Promise<OrderWithOwner | undefined> {
    const [row] = await ex
      .select({ order: orders, userEmail: users.email })
      .from(orders)
      .innerJoin(users, eq(users.id, orders.userId))
      .where(eq(orders.id, id))
      .limit(1);
    return row ? { ...row.order, userEmail: row.userEmail } : undefined;
  },

  async list(ex: Executor, f: OrderFilters): Promise<Page<OrderWithOwner>> {
    const conditions: SQL[] = [];
    if (f.userId) conditions.push(eq(orders.userId, f.userId));
    if (f.status) conditions.push(eq(orders.status, f.status));
    if (f.provider) conditions.push(eq(orders.provider, f.provider));
    const where = conditions.length ? and(...conditions) : undefined;

    const rows = await ex
      .select({ order: orders, userEmail: users.email })
      .from(orders)
      .innerJoin(users, eq(users.id, orders.userId))
      .where(where)
      .orderBy(desc(orders.createdAt), desc(orders.id))
      .limit(f.pageSize)
      .offset((f.page - 1) * f.pageSize);

    const [countRow] = await ex
      .select({ n: sql<number>`count(*)::int` })
      .from(orders)
      .where(where);
    const total = countRow?.n ?? 0;

    return {
      items: rows.map((r) => ({ ...r.order, userEmail: r.userEmail })),
      page: f.page,
      pageSize: f.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / f.pageSize)),
    };
  },

  /**
   * The ONLY place an order's status is changed (besides the worker's atomic claim,
   * which is a single SQL statement and writes its own audit row).
   * Validates the transition, guards against concurrent changes (status = from),
   * and writes the audit log: all in the caller's transaction.
   */
  async transition(ex: Executor, t: TransitionInput): Promise<void> {
    assertTransition(t.from, t.to);
    const updated = await ex
      .update(orders)
      .set({ status: t.to, updatedAt: new Date(), ...t.patch })
      .where(and(eq(orders.id, t.orderId), eq(orders.status, t.from)))
      .returning({ id: orders.id });

    if (updated.length === 0) {
      throw new ConflictError(`Order ${t.orderId} is no longer ${t.from}; it was changed by someone else`);
    }
    await auditLogRepository.append(ex, {
      orderId: t.orderId,
      from: t.from,
      to: t.to,
      actor: t.actor,
      note: t.note,
    });
  },

  async listStaleProvisioning(ex: Executor, olderThanMs: number): Promise<{ id: string }[]> {
    return ex
      .select({ id: orders.id })
      .from(orders)
      .where(
        and(
          eq(orders.status, "PROVISIONING"),
          sql`${orders.startedAt} < now() - (${olderThanMs}::bigint * interval '1 millisecond')`,
        ),
      );
  },
};
