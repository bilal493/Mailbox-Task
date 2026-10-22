import { SimulatedProvider } from "./simulated-provider";

export class MicrosoftProvider extends SimulatedProvider {
  readonly name = "microsoft" as const;
  protected readonly idPrefix = "m365";
  protected failureMessage(address: string): string {
    return `Microsoft Graph: Request_ThrottledTemporarily while creating ${address}`;
  }
}
