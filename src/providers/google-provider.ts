import { SimulatedProvider } from "./simulated-provider";

export class GoogleProvider extends SimulatedProvider {
  readonly name = "google" as const;
  protected readonly idPrefix = "gws";
  protected failureMessage(address: string): string {
    return `Google Workspace API: quotaExceeded while creating ${address}`;
  }
}
