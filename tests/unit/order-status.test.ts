import { describe, expect, it } from "vitest";
import { InvalidTransitionError } from "@/domain/errors";
import {
  ORDER_STATUSES,
  allowedTransitions,
  assertTransition,
  canTransition,
  isInFlight,
  isTerminal,
  type OrderStatus,
} from "@/domain/order-status";

const VALID: ReadonlyArray<[OrderStatus, OrderStatus]> = [
  ["PENDING", "PROVISIONING"],
  ["PROVISIONING", "ACTIVE"],
  ["PROVISIONING", "FAILED"],
  ["FAILED", "PENDING"],
];

describe("order state machine", () => {
  it.each(VALID)("allows %s → %s", (from, to) => {
    expect(canTransition(from, to)).toBe(true);
    expect(() => assertTransition(from, to)).not.toThrow();
  });

  it("rejects every transition that is not explicitly allowed (full 4×4 matrix)", () => {
    const isValid = (f: OrderStatus, t: OrderStatus) => VALID.some(([a, b]) => a === f && b === t);
    for (const from of ORDER_STATUSES) {
      for (const to of ORDER_STATUSES) {
        if (isValid(from, to)) continue;
        expect(canTransition(from, to), `${from} → ${to}`).toBe(false);
        expect(() => assertTransition(from, to), `${from} → ${to}`).toThrow(InvalidTransitionError);
      }
    }
  });

  it("never allows a status to transition to itself", () => {
    for (const s of ORDER_STATUSES) expect(canTransition(s, s)).toBe(false);
  });

  it("treats ACTIVE as terminal", () => {
    expect(isTerminal("ACTIVE")).toBe(true);
    expect(allowedTransitions("ACTIVE")).toEqual([]);
    for (const to of ORDER_STATUSES) expect(canTransition("ACTIVE", to)).toBe(false);
  });

  it("only allows retry (→ PENDING) from FAILED", () => {
    for (const from of ORDER_STATUSES) {
      expect(canTransition(from, "PENDING")).toBe(from === "FAILED");
    }
  });

  it("does not let PENDING jump straight to a finished state", () => {
    expect(canTransition("PENDING", "ACTIVE")).toBe(false);
    expect(canTransition("PENDING", "FAILED")).toBe(false);
  });

  it("InvalidTransitionError maps to HTTP 409 with from/to details", () => {
    try {
      assertTransition("ACTIVE", "PENDING");
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(InvalidTransitionError);
      const e = err as InvalidTransitionError;
      expect(e.status).toBe(409);
      expect(e.code).toBe("INVALID_TRANSITION");
      expect(e.details).toEqual({ from: "ACTIVE", to: "PENDING" });
    }
  });

  it("flags only PENDING and PROVISIONING as in flight", () => {
    expect(ORDER_STATUSES.filter(isInFlight)).toEqual(["PENDING", "PROVISIONING"]);
  });
});
