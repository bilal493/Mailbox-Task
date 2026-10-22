import { Client } from "pg";
import { runMigrations } from "../src/db/run-migrations";
import { TEST_DATABASE_URL } from "./test-env";

/** Creates the test database if it does not exist yet, so `npm test` works on any Postgres. */
async function ensureDatabase(url: string): Promise<void> {
  const target = new URL(url);
  const dbName = target.pathname.slice(1);
  const admin = new URL(url);
  admin.pathname = "/postgres";
  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const { rowCount } = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
    if (!rowCount) await client.query(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`);
  } finally {
    await client.end();
  }
}

export default async function setup() {
  await ensureDatabase(TEST_DATABASE_URL);
  await runMigrations(TEST_DATABASE_URL);
}
