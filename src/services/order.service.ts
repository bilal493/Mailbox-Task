import { createHash } from "node:crypto";
import { db } from "@/db/client";
import type { AuditLogRow, MailboxRow, OrderRow } from "@/db/types";
import {
  ForbiddenError,
  IdempotencyKeyReusedError,
  NotFoundError,
  ConflictError,
} from "@/domain/errors";
import type { Actor, AuthUser } from "@/domain/types";
import { auditLogRepository } from "@/repositories/audit-log.repository";
import { mailboxRepository } from "@/repositories/mailbox.repository";
import {
  orderRepository,
  type OrderWithOwner,
  type Page,
} from "@/repositories/order.repository";
import type { CreateOrderInput, ListOrdersQuery } from "@/validation/order.schemas";

export interface CreateOrderResult {
  order: OrderRow;
  /** false when an earlier request with the same Idempotency-Key is being replayed. */
  created: boolean;
}

export interface OrderDetail {
  order: OrderWithOwner;
  mailboxes: MailboxRow[];
  auditLogs: AuditLogRow[];
}

const hashRequest = (i: CreateOrderInput) =>
  createHash("sha256").update(`${i.domain}|${i.provider}|${i.mailboxCount}`).digest("hex");

export function mailboxAddresses(domain: string, count: number): string[] {
  const width = Math.max(2, String(count).length);
  return Array.from({ length: count }, (_, i) => `mailbox${String(i + 1).padStart(width, "0")}@${domain}`);
}

const actorFor = (user: AuthUser): Actor => ({
  type: user.role === "admin" ? "ADMIN" : "CUSTOMER",
  id: user.id,
});

export const orderService = {
  async create(user: AuthUser, input: CreateOrderInput, idempotencyKey: string): Promise<CreateOrderResult> {
    if (user.role !== "customer") throw new ForbiddenError("Only customers can create orders");
    const requestHash = hashRequest(input);

    return db.transaction(async (tx) => {
      const replay = (existing: OrderRow): CreateOrderResult => {
        if (existing.requestHash !== requestHash) throw new IdempotencyKeyReusedError();
        return { order: existing, created: false };
      };

      const existing = await orderRepository.findByIdempotencyKey(tx, user.id, idempotencyKey);
      if (existing) return replay(existing);

      // ON CONFLICT DO NOTHING closes the race where two identical requests pass the check above.
      const order = await orderRepository.insertIfAbsent(tx, {
        userId: user.id,
        domain: input.domain,
        provider: input.provider,
        mailboxCount: input.mailboxCount,
        idempotencyKey,
        requestHash,
      });
      if (!order) {
        const winner = await orderRepository.findByIdempotencyKey(tx, user.id, idempotencyKey);
        if (!winner) throw new ConflictError("Could not create the order, please retry");
        return replay(winner);
      }

      await mailboxRepository.insertMany(tx, order.id, mailboxAddresses(input.domain, input.mailboxCount));
      await auditLogRepository.append(tx, {
        orderId: order.id,
        from: null,
        to: "PENDING",
        actor: actorFor(user),
        note: "Order created",
      });
      return { order, created: true };
    });
  },

  async list(user: AuthUser, query: ListOrdersQuery): Promise<Page<OrderWithOwner>> {
    return orderRepository.list(db, {
      userId: user.role === "customer" ? user.id : undefined, // customers only ever see their own
      status: query.status,
      provider: query.provider,
      page: query.page,
      pageSize: query.pageSize,
    });
  },

  async getDetail(user: AuthUser, orderId: string): Promise<OrderDetail> {
    const order = await orderRepository.findById(db, orderId);
    // 404 (not 403) for someone else's order so ids cannot be probed.
    if (!order || (user.role === "customer" && order.userId !== user.id)) throw new NotFoundError("Order not found");
    const [mailboxes, auditLogs] = await Promise.all([
      mailboxRepository.listForOrder(db, orderId),
      auditLogRepository.listForOrder(db, orderId),
    ]);
    return { order, mailboxes, auditLogs };
  },

  /** Admin-only: FAILED → PENDING. Any other starting status is rejected by the state machine. */
  async retry(user: AuthUser, orderId: string): Promise<OrderRow> {
    if (user.role !== "admin") throw new ForbiddenError("Only admins can retry orders");
    return db.transaction(async (tx) => {
      const order = await orderRepository.findById(tx, orderId);
      if (!order) throw new NotFoundError("Order not found");
      await orderRepository.transition(tx, {
        orderId,
        from: order.status,
        to: "PENDING",
        actor: actorFor(user),
        note: "Retry requested by admin",
        patch: { lastError: null, startedAt: null },
      });
      const updated = await orderRepository.findById(tx, orderId);
      return updated as OrderRow;
    });
  },
};
