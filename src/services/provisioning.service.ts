import { sql } from "drizzle-orm";
import type { Database } from "@/db/types";
import { ConflictError } from "@/domain/errors";
import type { Provider } from "@/domain/types";
import type { Logger } from "@/lib/logger";
import { runWithConcurrency } from "@/lib/pool";
import type { ProviderRegistry } from "@/providers/provider-factory";
import { auditLogRepository } from "@/repositories/audit-log.repository";
import { mailboxRepository } from "@/repositories/mailbox.repository";
import { orderRepository } from "@/repositories/order.repository";

export interface ClaimedOrder {
  id: string;
  domain: string;
  provider: Provider;
  mailboxCount: number;
  attempts: number;
}

export interface ProvisioningDeps {
  db: Database;
  providers: ProviderRegistry;
  logger: Logger;
  workerId: string;
  concurrency: number;
}

export class ProvisioningService {
  constructor(private readonly deps: ProvisioningDeps) {}

  /**
   * Atomically takes ONE pending order for this worker.
   *
   * `FOR UPDATE SKIP LOCKED` makes concurrent workers skip rows another worker has
   * locked, so two workers can never claim the same order. The status flip and its
   * audit row are committed together.
   */
  async claimNext(): Promise<ClaimedOrder | null> {
    return this.deps.db.transaction(async (tx) => {
      const result = await tx.execute<{
        id: string;
        domain: string;
        provider: Provider;
        mailboxCount: number;
        attempts: number;
      }>(sql`
        UPDATE orders
           SET status = 'PROVISIONING',
               started_at = now(),
               updated_at = now(),
               attempts = attempts + 1
         WHERE id = (
           SELECT id FROM orders
            WHERE status = 'PENDING'
            ORDER BY created_at, id
            FOR UPDATE SKIP LOCKED
            LIMIT 1
         )
        RETURNING id, domain, provider, mailbox_count AS "mailboxCount", attempts
      `);
      const claimed = result.rows[0];
      if (!claimed) return null;

      await auditLogRepository.append(tx, {
        orderId: claimed.id,
        from: "PENDING",
        to: "PROVISIONING",
        actor: { type: "WORKER", id: this.deps.workerId },
        note: `Picked up (attempt ${claimed.attempts})`,
      });
      return claimed;
    });
  }

  /** Provisions every mailbox that is not ACTIVE yet, then closes the order as ACTIVE or FAILED. */
  async process(order: ClaimedOrder): Promise<"ACTIVE" | "FAILED"> {
    const { db, providers, logger } = this.deps;
    const actor = { type: "WORKER", id: this.deps.workerId } as const;
    try {
      const provider = providers[order.provider];
      const todo = await mailboxRepository.listUnprovisioned(db, order.id);

      await runWithConcurrency(todo, this.deps.concurrency, async (mailbox) => {
        try {
          const { externalId } = await provider.provisionMailbox({ domain: order.domain, address: mailbox.address });
          await mailboxRepository.markActive(db, mailbox.id, externalId);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          await mailboxRepository.markFailed(db, mailbox.id, message);
        }
      });

      const remaining = await mailboxRepository.countNotActive(db, order.id);
      const outcome = remaining === 0 ? "ACTIVE" : "FAILED";
      const lastError = outcome === "FAILED" ? `${remaining} of ${order.mailboxCount} mailboxes failed` : null;
      await db.transaction((tx) =>
        orderRepository.transition(tx, {
          orderId: order.id,
          from: "PROVISIONING",
          to: outcome,
          actor,
          note: lastError ?? `All ${order.mailboxCount} mailboxes provisioned`,
          patch: { lastError },
        }),
      );
      return outcome;
    } catch (err) {
      if (err instanceof ConflictError) {
        // e.g. stale-recovery already closed this order; nothing more for us to do.
        logger.warn(`Order ${order.id} changed while processing: ${err.message}`);
        return "FAILED";
      }
      // Unexpected crash while processing: fail the order so an admin can retry it.
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Order ${order.id} crashed`, err);
      await db
        .transaction((tx) =>
          orderRepository.transition(tx, {
            orderId: order.id,
            from: "PROVISIONING",
            to: "FAILED",
            actor,
            note: `Worker error: ${message}`,
            patch: { lastError: message },
          }),
        )
        .catch((e) => logger.error(`Could not mark order ${order.id} as FAILED`, e));
      return "FAILED";
    }
  }

  /** Claim + process one order. Returns false when the queue is empty. */
  async runOnce(): Promise<boolean> {
    const order = await this.claimNext();
    if (!order) return false;
    this.deps.logger.info(`Processing order ${order.id} (${order.provider}, ${order.mailboxCount} mailboxes)`);
    const outcome = await this.process(order);
    this.deps.logger.info(`Order ${order.id} → ${outcome}`);
    return true;
  }

  /** Crash recovery: orders stuck in PROVISIONING (worker died) become FAILED so an admin can retry. */
  async recoverStale(olderThanMs: number): Promise<number> {
    const { db, logger } = this.deps;
    const stale = await orderRepository.listStaleProvisioning(db, olderThanMs);
    let recovered = 0;
    for (const { id } of stale) {
      try {
        await db.transaction((tx) =>
          orderRepository.transition(tx, {
            orderId: id,
            from: "PROVISIONING",
            to: "FAILED",
            actor: { type: "SYSTEM", id: null },
            note: "Worker did not finish in time (stale PROVISIONING)",
            patch: { lastError: "Provisioning timed out" },
          }),
        );
        recovered++;
      } catch (err) {
        if (!(err instanceof ConflictError)) logger.error(`Stale recovery failed for ${id}`, err);
      }
    }
    return recovered;
  }
}
