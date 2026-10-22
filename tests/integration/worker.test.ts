import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, db } from "@/db/client";
import { auditLogs, mailboxes, orders } from "@/db/schema";
import { ProviderError } from "@/domain/errors";
import type { AuthUser } from "@/domain/types";
import { createLogger } from "@/lib/logger";
import type { MailboxProvider } from "@/providers/mailbox-provider";
import { createProviderRegistry } from "@/providers/provider-factory";
import { orderService } from "@/services/order.service";
import { ProvisioningService } from "@/services/provisioning.service";
import { createUser, resetDb } from "../helpers";

const silent = { info: () => {}, warn: () => {}, error: () => {} } as ReturnType<typeof createLogger>;

/** Provider whose calls we control: counts invocations, fails for chosen addresses. */
class FakeProvider implements MailboxProvider {
  readonly name = "google" as const;
  calls: string[] = [];
  constructor(private failing: Set<string> = new Set()) {}
  failFor(...addresses: string[]) {
    this.failing = new Set(addresses);
  }
  async provisionMailbox({ address }: { address: string }) {
    this.calls.push(address);
    await new Promise((r) => setTimeout(r, 5));
    if (this.failing.has(address)) throw new ProviderError("google", `boom ${address}`);
    return { externalId: `fake_${address}` };
  }
}

function makeWorker(workerId: string, google: MailboxProvider) {
  const base = createProviderRegistry();
  return new ProvisioningService({
    db,
    providers: { ...base, google },
    logger: silent,
    workerId,
    concurrency: 5,
  });
}

let customer: AuthUser;
let admin: AuthUser;

const newOrder = async (key: string, count = 3, domain = "acme.com") =>
  (await orderService.create(customer, { domain, provider: "google", mailboxCount: count }, key)).order;

beforeEach(async () => {
  await resetDb();
  customer = await createUser("customer@test.com", "customer");
  admin = await createUser("admin@test.com", "admin");
});
afterAll(() => closeDb());

describe("provisioning worker", () => {
  it("moves an order PENDING → PROVISIONING → ACTIVE and records every step in the audit log", async () => {
    const order = await newOrder("worker-key-001");
    const provider = new FakeProvider();
    expect(await makeWorker("w1", provider).runOnce()).toBe(true);

    const [row] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(row?.status).toBe("ACTIVE");
    expect((await db.select().from(mailboxes).where(eq(mailboxes.orderId, order.id))).every((m) => m.status === "ACTIVE")).toBe(true);

    const logs = await db.select().from(auditLogs).where(eq(auditLogs.orderId, order.id));
    expect(logs.map((l) => `${l.fromStatus ?? "∅"}→${l.toStatus}`)).toEqual(["∅→PENDING", "PENDING→PROVISIONING", "PROVISIONING→ACTIVE"]);
  });

  it("returns false when there is nothing to do", async () => {
    expect(await makeWorker("w1", new FakeProvider()).runOnce()).toBe(false);
  });

  it("never lets two workers process the same order (SKIP LOCKED)", async () => {
    const order = await newOrder("worker-key-002");
    const claims = await Promise.all(
      Array.from({ length: 6 }, (_, i) => makeWorker(`w${i}`, new FakeProvider()).claimNext()),
    );
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect(claims.find(Boolean)?.id).toBe(order.id);

    const logs = await db.select().from(auditLogs).where(eq(auditLogs.orderId, order.id));
    expect(logs.filter((l) => l.toStatus === "PROVISIONING")).toHaveLength(1);
  });

  it("splits many orders across concurrent workers with no duplicates", async () => {
    const created = await Promise.all(Array.from({ length: 6 }, (_, i) => newOrder(`worker-multi-${i}-xx`, 2, `client${i}.com`)));
    const providers = [new FakeProvider(), new FakeProvider(), new FakeProvider()];
    const workers = providers.map((p, i) => makeWorker(`w${i}`, p));

    await Promise.all(
      workers.map(async (w) => {
        while (await w.runOnce()) {
          /* drain */
        }
      }),
    );

    const allCalls = providers.flatMap((p) => p.calls);
    expect(allCalls).toHaveLength(12); // 6 orders × 2 mailboxes, each exactly once
    expect(new Set(allCalls).size).toBe(12);
    const rows = await db.select().from(orders);
    expect(rows).toHaveLength(created.length);
    expect(rows.every((r) => r.status === "ACTIVE" && r.attempts === 1)).toBe(true);
  });

  it("marks the order FAILED when a mailbox fails, then retry only re-provisions the failed mailbox", async () => {
    const order = await newOrder("worker-key-003");
    const provider = new FakeProvider(new Set(["mailbox02@acme.com"]));
    await makeWorker("w1", provider).runOnce();

    const [failed] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(failed?.status).toBe("FAILED");
    expect(failed?.lastError).toBe("1 of 3 mailboxes failed");
    const boxes = await db.select().from(mailboxes).where(eq(mailboxes.orderId, order.id));
    expect(boxes.filter((b) => b.status === "FAILED").map((b) => b.address)).toEqual(["mailbox02@acme.com"]);
    expect(boxes.find((b) => b.status === "FAILED")?.error).toContain("boom");

    await orderService.retry(admin, order.id);
    provider.calls = [];
    provider.failFor(); // provider recovers
    await makeWorker("w2", provider).runOnce();

    expect(provider.calls).toEqual(["mailbox02@acme.com"]); // ACTIVE mailboxes are never provisioned twice
    const [done] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(done).toMatchObject({ status: "ACTIVE", attempts: 2, lastError: null });

    const logs = await db.select().from(auditLogs).where(eq(auditLogs.orderId, order.id));
    expect(logs.map((l) => `${l.fromStatus ?? "∅"}→${l.toStatus}`)).toEqual([
      "∅→PENDING",
      "PENDING→PROVISIONING",
      "PROVISIONING→FAILED",
      "FAILED→PENDING",
      "PENDING→PROVISIONING",
      "PROVISIONING→ACTIVE",
    ]);
  });

  it("recovers orders stuck in PROVISIONING after a worker crash", async () => {
    const order = await newOrder("worker-key-004");
    const worker = makeWorker("w1", new FakeProvider());
    await worker.claimNext(); // claimed, then the worker "dies"
    await db.update(orders).set({ startedAt: new Date(Date.now() - 20 * 60_000) }).where(eq(orders.id, order.id));

    expect(await worker.recoverStale(10 * 60_000)).toBe(1);
    const [row] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(row?.status).toBe("FAILED");
    const logs = await db.select().from(auditLogs).where(eq(auditLogs.orderId, order.id));
    expect(logs.at(-1)).toMatchObject({ toStatus: "FAILED", actorType: "SYSTEM" });
  });
});
