import { getEnv } from "@/lib/env";
import type { Provider } from "@/domain/types";
import { GoogleProvider } from "./google-provider";
import type { MailboxProvider } from "./mailbox-provider";
import { MicrosoftProvider } from "./microsoft-provider";
import { defaultRandom, defaultSleep, type SimulationOptions } from "./simulated-provider";

export type ProviderRegistry = Readonly<Record<Provider, MailboxProvider>>;

/** Factory: adding a vendor means one new class and one new entry here. */
export function createProviderRegistry(overrides: Partial<SimulationOptions> = {}): ProviderRegistry {
  const env = getEnv();
  const opts: SimulationOptions = {
    minMs: env.PROVIDER_MIN_MS,
    maxMs: env.PROVIDER_MAX_MS,
    failureRate: env.PROVIDER_FAILURE_RATE,
    sleep: defaultSleep,
    random: defaultRandom,
    ...overrides,
  };
  return { google: new GoogleProvider(opts), microsoft: new MicrosoftProvider(opts) };
}
