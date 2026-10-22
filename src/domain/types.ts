export const ROLES = ["customer", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const PROVIDERS = ["google", "microsoft"] as const;
export type Provider = (typeof PROVIDERS)[number];

export const MAILBOX_STATUSES = ["PENDING", "ACTIVE", "FAILED"] as const;
export type MailboxStatus = (typeof MAILBOX_STATUSES)[number];

export const ACTOR_TYPES = ["CUSTOMER", "ADMIN", "WORKER", "SYSTEM"] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
}

export interface Actor {
  type: ActorType;
  id: string | null;
}
