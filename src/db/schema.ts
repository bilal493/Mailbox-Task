import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { ACTOR_TYPES, MAILBOX_STATUSES, PROVIDERS, ROLES } from "@/domain/types";
import { ORDER_STATUSES } from "@/domain/order-status";

export const roleEnum = pgEnum("role", ROLES);
export const providerEnum = pgEnum("provider", PROVIDERS);
export const orderStatusEnum = pgEnum("order_status", ORDER_STATUSES);
export const mailboxStatusEnum = pgEnum("mailbox_status", MAILBOX_STATUSES);
export const actorTypeEnum = pgEnum("actor_type", ACTOR_TYPES);

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull(),
  createdAt: createdAt(),
});

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    domain: text("domain").notNull(),
    provider: providerEnum("provider").notNull(),
    mailboxCount: integer("mailbox_count").notNull(),
    status: orderStatusEnum("status").notNull().default("PENDING"),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // DB-level idempotency guarantee: one order per (user, key).
    uniqueIndex("orders_user_idempotency_key_uq").on(t.userId, t.idempotencyKey),
    index("orders_status_created_idx").on(t.status, t.createdAt),
    index("orders_provider_status_idx").on(t.provider, t.status),
    index("orders_user_created_idx").on(t.userId, t.createdAt),
    check("orders_mailbox_count_range", sql`${t.mailboxCount} BETWEEN 1 AND 50`),
  ],
);

export const mailboxes = pgTable(
  "mailboxes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    address: text("address").notNull(),
    status: mailboxStatusEnum("status").notNull().default("PENDING"),
    externalId: text("external_id"),
    error: text("error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("mailboxes_order_address_uq").on(t.orderId, t.address)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    fromStatus: orderStatusEnum("from_status"),
    toStatus: orderStatusEnum("to_status").notNull(),
    actorType: actorTypeEnum("actor_type").notNull(),
    actorId: text("actor_id"),
    note: text("note"),
    createdAt: createdAt(),
  },
  (t) => [index("audit_logs_order_created_idx").on(t.orderId, t.createdAt)],
);
