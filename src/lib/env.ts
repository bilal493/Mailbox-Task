import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  SESSION_SECRET: z.string().min(16, "SESSION_SECRET must be at least 16 characters"),
  PROVIDER_FAILURE_RATE: z.coerce.number().min(0).max(1).default(0.2),
  PROVIDER_MIN_MS: z.coerce.number().int().min(0).default(2000),
  PROVIDER_MAX_MS: z.coerce.number().int().min(0).default(4000),
  WORKER_POLL_MS: z.coerce.number().int().min(100).default(2000),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(5),
  STALE_MINUTES: z.coerce.number().min(0.1).default(10),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Parsed lazily so that importing a module never fails at build time. */
export function getEnv(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new Error(`Invalid environment: ${issues}. Did you copy .env.example to .env?`);
    }
    cached = parsed.data;
  }
  return cached;
}
