import { randomInt, randomUUID } from "node:crypto";
import { ProviderError } from "@/domain/errors";
import type { Provider } from "@/domain/types";
import type { MailboxProvider, ProvisionRequest, ProvisionResult } from "./mailbox-provider";

export interface SimulationOptions {
  minMs: number;
  maxMs: number;
  failureRate: number;
  /** Injected so tests never wait or rely on real randomness. */
  sleep: (ms: number) => Promise<void>;
  random: () => number;
}

export const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Shared fake-API behaviour: latency plus random failures. */
export abstract class SimulatedProvider implements MailboxProvider {
  abstract readonly name: Provider;
  protected abstract readonly idPrefix: string;
  protected abstract failureMessage(address: string): string;

  constructor(protected readonly opts: SimulationOptions) {}

  async provisionMailbox(request: ProvisionRequest): Promise<ProvisionResult> {
    const { minMs, maxMs } = this.opts;
    const latency = maxMs > minMs ? minMs + Math.floor(this.opts.random() * (maxMs - minMs)) : minMs;
    await this.opts.sleep(latency);
    if (this.opts.random() < this.opts.failureRate) {
      throw new ProviderError(this.name, this.failureMessage(request.address));
    }
    return { externalId: `${this.idPrefix}_${randomUUID()}` };
  }
}

export const defaultRandom = () => randomInt(0, 1_000_000) / 1_000_000;
