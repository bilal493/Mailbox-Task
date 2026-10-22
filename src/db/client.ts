import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getEnv } from "@/lib/env";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { __pgPool?: Pool };

// Reuse the pool across Next.js dev hot reloads.
const pool = globalForDb.__pgPool ?? new Pool({ connectionString: getEnv().DATABASE_URL, max: 10 });
if (process.env.NODE_ENV !== "production") globalForDb.__pgPool = pool;

export const db = drizzle(pool, { schema });
export const closeDb = () => pool.end();
