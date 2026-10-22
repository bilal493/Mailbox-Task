export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID_TRANSITION"
  | "CONFLICT"
  | "IDEMPOTENCY_KEY_REUSED"
  | "INTERNAL";

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super("VALIDATION_ERROR", message, 400, details);
  }
}
export class UnauthenticatedError extends AppError {
  constructor(message = "Authentication required") {
    super("UNAUTHENTICATED", message, 401);
  }
}
export class ForbiddenError extends AppError {
  constructor(message = "You do not have access to this action") {
    super("FORBIDDEN", message, 403);
  }
}
export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super("NOT_FOUND", message, 404);
  }
}
export class InvalidTransitionError extends AppError {
  constructor(from: string, to: string) {
    super("INVALID_TRANSITION", `Cannot move an order from ${from} to ${to}`, 409, { from, to });
  }
}
export class ConflictError extends AppError {
  constructor(message: string) {
    super("CONFLICT", message, 409);
  }
}
export class IdempotencyKeyReusedError extends AppError {
  constructor() {
    super(
      "IDEMPOTENCY_KEY_REUSED",
      "This Idempotency-Key was already used with a different request body",
      409,
    );
  }
}
export class ProviderError extends Error {
  constructor(
    readonly provider: string,
    message: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
