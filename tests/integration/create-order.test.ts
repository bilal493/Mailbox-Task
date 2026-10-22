import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, db } from "@/db/client";
import { auditLogs, mailboxes, orders } from "@/db/schema";
import { GET as getOrder } from "@/app/api/orders/[id]/route";
import { POST as createOrder } from "@/app/api/orders/route";
import { POST as retryOrder } from "@/app/api/orders/[id]/retry/route";
import type { AuthUser } from "@/domain/types";
import { apiRequest, createUser, resetDb } from "../helpers";

const valid = { domain: "acme.com", provider: "google", mailboxCount: 3 };
let customer: AuthUser;
let other: AuthUser;
let admin: AuthUser;

async function call(user: AuthUser | undefined, body: unknown, key?: string) {
  const req = await apiRequest("/api/orders", {
    method: "POST",
    user,
    body,
    headers: key ? { "idempotency-key": key } : {},
  });
  const res = await createOrder(req, { params: {} });
  return { res, json: await res.json() };
}

beforeEach(async () => {
  await resetDb();
  customer = await createUser("customer@test.com", "customer");
  other = await createUser("other@test.com", "customer");
  admin = await createUser("admin@test.com", "admin");
});
afterAll(() => closeDb());

describe("POST /api/orders", () => {
  it("creates a PENDING order with its mailboxes and an audit entry", async () => {
    const { res, json } = await call(customer, valid, "key-0001-abcd");
    expect(res.status).toBe(201);
    expect(json.order).toMatchObject({ domain: "acme.com", provider: "google", mailboxCount: 3, status: "PENDING" });
    expect(json.idempotentReplay).toBe(false);

    const boxes = await db.select().from(mailboxes).where(eq(mailboxes.orderId, json.order.id));
    expect(boxes.map((b) => b.address)).toEqual([
      "mailbox01@acme.com",
      "mailbox02@acme.com",
      "mailbox03@acme.com",
    ]);
    expect(boxes.every((b) => b.status === "PENDING")).toBe(true);

    const logs = await db.select().from(auditLogs).where(eq(auditLogs.orderId, json.order.id));
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ fromStatus: null, toStatus: "PENDING", actorType: "CUSTOMER", actorId: customer.id });
  });

  it("is idempotent: the same key returns the same order and creates nothing new", async () => {
    const first = await call(customer, valid, "key-idem-0001");
    const second = await call(customer, valid, "key-idem-0001");

    expect(first.res.status).toBe(201);
    expect(second.res.status).toBe(200);
    expect(second.json.order.id).toBe(first.json.order.id);
    expect(second.json.idempotentReplay).toBe(true);
    expect(await db.select().from(orders)).toHaveLength(1);
    expect(await db.select().from(mailboxes)).toHaveLength(3);
    expect(await db.select().from(auditLogs)).toHaveLength(1);
  });

  it("is idempotent under concurrency: 8 parallel identical requests create exactly one order", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => call(customer, valid, "key-parallel-1")));
    const ids = new Set(results.map((r) => r.json.order.id));
    expect(ids.size).toBe(1);
    expect(results.filter((r) => r.res.status === 201)).toHaveLength(1);
    expect(await db.select().from(orders)).toHaveLength(1);
    expect(await db.select().from(mailboxes)).toHaveLength(3);
  });

  it("rejects reusing a key with a different body (409)", async () => {
    await call(customer, valid, "key-reuse-0001");
    const { res, json } = await call(customer, { ...valid, mailboxCount: 10 }, "key-reuse-0001");
    expect(res.status).toBe(409);
    expect(json.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
  });

  it("scopes keys per user: two users may use the same key", async () => {
    const a = await call(customer, valid, "shared-key-0001");
    const b = await call(other, valid, "shared-key-0001");
    expect(a.json.order.id).not.toBe(b.json.order.id);
  });

  it.each([
    ["mailbox count above 50", { ...valid, mailboxCount: 51 }],
    ["mailbox count below 1", { ...valid, mailboxCount: 0 }],
    ["non-integer count", { ...valid, mailboxCount: 2.5 }],
    ["unknown provider", { ...valid, provider: "yahoo" }],
    ["invalid domain", { ...valid, domain: "not a domain" }],
    ["missing domain", { provider: "google", mailboxCount: 1 }],
  ])("returns a consistent 400 for %s", async (_name, body) => {
    const { res, json } = await call(customer, body, "key-invalid-01");
    expect(res.status).toBe(400);
    expect(json.error.code).toBe("VALIDATION_ERROR");
    expect(typeof json.error.message).toBe("string");
    expect(Array.isArray(json.error.details)).toBe(true);
    expect(await db.select().from(orders)).toHaveLength(0);
  });

  it("requires an Idempotency-Key header (400)", async () => {
    const { res, json } = await call(customer, valid);
    expect(res.status).toBe(400);
    expect(json.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 401 without a session and 403 for admins", async () => {
    expect((await call(undefined, valid, "key-auth-0001")).res.status).toBe(401);
    const forbidden = await call(admin, valid, "key-auth-0002");
    expect(forbidden.res.status).toBe(403);
    expect(forbidden.json.error.code).toBe("FORBIDDEN");
  });
});

describe("access control and retry", () => {
  it("hides other customers' orders (404) but lets admins read any order", async () => {
    const { json } = await call(customer, valid, "key-access-001");
    const id = json.order.id as string;
    const get = async (u: AuthUser) =>
      getOrder(await apiRequest(`/api/orders/${id}`, { user: u }), { params: { id } });

    expect((await get(other)).status).toBe(404);
    expect((await get(customer)).status).toBe(200);
    const adminRes = await get(admin);
    expect(adminRes.status).toBe(200);
    const detail = await adminRes.json();
    expect(detail.mailboxes).toHaveLength(3);
    expect(detail.auditLogs).toHaveLength(1);
  });

  it("only admins may retry, and only FAILED orders can be retried", async () => {
    const { json } = await call(customer, valid, "key-retry-0001");
    const id = json.order.id as string;
    const retry = async (u: AuthUser) =>
      retryOrder(await apiRequest(`/api/orders/${id}/retry`, { method: "POST", user: u }), { params: { id } });

    expect((await retry(customer)).status).toBe(403);

    const pendingRetry = await retry(admin); // PENDING → PENDING is invalid
    expect(pendingRetry.status).toBe(409);
    expect((await pendingRetry.json()).error.code).toBe("INVALID_TRANSITION");

    await db.update(orders).set({ status: "FAILED" }).where(eq(orders.id, id));
    const ok = await retry(admin);
    expect(ok.status).toBe(200);
    expect((await ok.json()).order.status).toBe("PENDING");

    const logs = await db.select().from(auditLogs).where(eq(auditLogs.orderId, id));
    expect(logs.at(-1)).toMatchObject({ fromStatus: "FAILED", toStatus: "PENDING", actorType: "ADMIN", actorId: admin.id });
  });
});
