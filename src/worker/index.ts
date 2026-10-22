import "dotenv/config";
import { randomUUID } from "node:crypto";
import { closeDb, db } from "@/db/client";
import { getEnv } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import { createProviderRegistry } from "@/providers/provider-factory";
import { ProvisioningService } from "@/services/provisioning.service";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function main() {
  const env = getEnv();
  const workerId = `worker-${randomUUID().slice(0, 8)}`;
  const logger = createLogger(workerId);
  const service = new ProvisioningService({
    db,
    providers: createProviderRegistry(),
    logger,
    workerId,
    concurrency: env.WORKER_CONCURRENCY,
  });

  let stopping = false;
  const stop = () => {
    if (!stopping) logger.info("Shutting down after the current order…");
    stopping = true;
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  logger.info(`Started. Polling every ${env.WORKER_POLL_MS}ms`);
  while (!stopping) {
    try {
      const recovered = await service.recoverStale(env.STALE_MINUTES * 60_000);
      if (recovered > 0) logger.warn(`Marked ${recovered} stale order(s) as FAILED`);
      const didWork = await service.runOnce();
      if (!didWork) await sleep(env.WORKER_POLL_MS);
    } catch (err) {
      logger.error("Loop error (will retry)", err);
      await sleep(env.WORKER_POLL_MS);
    }
  }
  await closeDb();
  logger.info("Stopped");
}

main().catch((err) => {
  console.error("Worker failed to start:", err);
  process.exit(1);
});
