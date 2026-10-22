import type { Provider } from "@/domain/types";

export interface ProvisionRequest {
  domain: string;
  address: string;
}
export interface ProvisionResult {
  externalId: string;
}

/** Strategy interface: one implementation per mailbox vendor. */
export interface MailboxProvider {
  readonly name: Provider;
  provisionMailbox(request: ProvisionRequest): Promise<ProvisionResult>;
}
