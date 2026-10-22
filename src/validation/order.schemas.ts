import { z } from "zod";
import { ORDER_STATUSES } from "@/domain/order-status";
import { PROVIDERS } from "@/domain/types";

const DOMAIN_RE = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export const createOrderSchema = z.object({
  domain: z
    .string({ required_error: "Domain is required" })
    .trim()
    .toLowerCase()
    .regex(DOMAIN_RE, "Enter a valid domain such as example.com"),
  provider: z.enum(PROVIDERS, { errorMap: () => ({ message: "Provider must be google or microsoft" }) }),
  mailboxCount: z
    .number({ invalid_type_error: "Mailbox count must be a number", required_error: "Mailbox count is required" })
    .int("Mailbox count must be a whole number")
    .min(1, "Order at least 1 mailbox")
    .max(50, "You can order at most 50 mailboxes at a time"),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const idempotencyKeySchema = z
  .string({ required_error: "Idempotency-Key header is required" })
  .trim()
  .min(8, "Idempotency-Key must be at least 8 characters")
  .max(128, "Idempotency-Key must be at most 128 characters");

const emptyToUndefined = (v: unknown) => (v === "" || v === null ? undefined : v);

export const listOrdersQuerySchema = z.object({
  status: z.preprocess(emptyToUndefined, z.enum(ORDER_STATUSES).optional()),
  provider: z.preprocess(emptyToUndefined, z.enum(PROVIDERS).optional()),
  page: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).default(1)),
  pageSize: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(100).default(10)),
});
export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;

export const uuidSchema = z.string().uuid("Invalid id");

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});
