import { InvalidTransitionError } from "./errors";

/**
 * Order lifecycle (pure, no I/O):
 *
 *   PENDING ──▶ PROVISIONING ──▶ ACTIVE
 *                    │
 *                    └────────▶ FAILED ──(admin retry)──▶ PENDING
 */
export const ORDER_STATUSES = ["PENDING", "PROVISIONING", "ACTIVE", "FAILED"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

const TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  PENDING: ["PROVISIONING"],
  PROVISIONING: ["ACTIVE", "FAILED"],
  ACTIVE: [],
  FAILED: ["PENDING"],
};

export function allowedTransitions(from: OrderStatus): readonly OrderStatus[] {
  return TRANSITIONS[from];
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(from, to);
  }
}

export function isTerminal(status: OrderStatus): boolean {
  return TRANSITIONS[status].length === 0;
}

/** Statuses where the UI should keep polling because the worker will change them. */
export function isInFlight(status: OrderStatus): boolean {
  return status === "PENDING" || status === "PROVISIONING";
}
