import "dotenv/config";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { closeDb, db } from "./client";
import { auditLogs, mailboxes, orders, users } from "./schema";
import { mailboxAddresses } from "@/services/order.service";

const SEED_USERS = [
  { email: "admin@example.com", password: "admin123", role: "admin" as const },
  { email: "alice@example.com", password: "customer123", role: "customer" as const },
  { email: "bob@example.com", password: "customer123", role: "customer" as const },
];

async function main() {
  for (const u of SEED_USERS) {
    await db
      .insert(users)
      .values({ email: u.email, passwordHash: await bcrypt.hash(u.password, 10), role: u.role })
      .onConflictDoNothing({ target: users.email });
  }

  const [{ n }] = (await db.select({ n: sql<number>`count(*)::int` }).from(orders)) as [{ n: number }];
  if (n > 0) {
    console.log("Users ensured. Orders already exist: skipping sample orders");
    return;
  }

  const all = await db.select().from(users);
  const byEmail = (e: string) => all.find((u) => u.email === e)!;
  const alice = byEmail("alice@example.com");
  const bob = byEmail("bob@example.com");

  const samples = [
    { user: alice, domain: "acme-outreach.com", provider: "google" as const, count: 3, failedMailboxes: 0 },
    { user: alice, domain: "northwind-mail.io", provider: "microsoft" as const, count: 4, failedMailboxes: 2 },
    { user: bob, domain: "bobs-bakery.co", provider: "google" as const, count: 2, failedMailboxes: 0 },
  ];

  for (const [i, s] of samples.entries()) {
    const failed = s.failedMailboxes > 0;
    const [order] = await db
      .insert(orders)
      .values({
        userId: s.user.id,
        domain: s.domain,
        provider: s.provider,
        mailboxCount: s.count,
        status: failed ? "FAILED" : "ACTIVE",
        idempotencyKey: `seed-order-${i + 1}`,
        requestHash: `seed-${i + 1}`,
        attempts: 1,
        lastError: failed ? `${s.failedMailboxes} of ${s.count} mailboxes failed` : null,
      })
      .returning();
    if (!order) continue;

    await db.insert(mailboxes).values(
      mailboxAddresses(s.domain, s.count).map((address, idx) => {
        const isFailed = idx >= s.count - s.failedMailboxes;
        return {
          orderId: order.id,
          address,
          status: isFailed ? ("FAILED" as const) : ("ACTIVE" as const),
          externalId: isFailed ? null : `seed_${order.id.slice(0, 8)}_${idx}`,
          error: isFailed ? "Microsoft Graph: Request_ThrottledTemporarily" : null,
        };
      }),
    );
    const base = Date.now() - (samples.length - i) * 3_600_000;
    const at = (mins: number) => new Date(base + mins * 60_000);
    await db.insert(auditLogs).values([
      { orderId: order.id, fromStatus: null, toStatus: "PENDING", actorType: "CUSTOMER", actorId: s.user.id, note: "Order created", createdAt: at(0) },
      { orderId: order.id, fromStatus: "PENDING", toStatus: "PROVISIONING", actorType: "WORKER", actorId: "worker-seed", note: "Picked up (attempt 1)", createdAt: at(1) },
      { orderId: order.id, fromStatus: "PROVISIONING", toStatus: failed ? "FAILED" : "ACTIVE", actorType: "WORKER", actorId: "worker-seed", note: failed ? `${s.failedMailboxes} of ${s.count} mailboxes failed` : `All ${s.count} mailboxes provisioned`, createdAt: at(2) },
    ]);
  }
  console.log("Seeded 3 users and 3 sample orders");
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
