import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import type { AuthUser, Role } from "@/domain/types";
import { SESSION_COOKIE, signSession } from "@/lib/session";

export async function resetDb(): Promise<void> {
  await db.execute(sql`TRUNCATE TABLE audit_logs, mailboxes, orders, users RESTART IDENTITY CASCADE`);
}

export async function createUser(email: string, role: Role): Promise<AuthUser> {
  const [row] = await db
    .insert(users)
    .values({ email, role, passwordHash: await bcrypt.hash("password", 4) })
    .returning();
  return { id: row!.id, email: row!.email, role: row!.role };
}

export async function apiRequest(
  path: string,
  opts: { method?: string; user?: AuthUser; body?: unknown; headers?: Record<string, string> } = {},
): Promise<NextRequest> {
  const headers: Record<string, string> = { "content-type": "application/json", ...opts.headers };
  if (opts.user) headers.cookie = `${SESSION_COOKIE}=${await signSession(opts.user)}`;
  return new NextRequest(`http://localhost${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
}
