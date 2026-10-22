# Architecture

```
 Browser ──▶ Next.js pages / route handlers ──▶ Services ──▶ Repositories ──▶ PostgreSQL
                  (thin, no logic)            │   ▲
                                              │   └── Domain (state machine, errors)
 Worker process (npm run worker) ─▶ ProvisioningService ─▶ Provider registry (Strategy)
```

The web app and the worker are separate processes that share the services, repositories and database. PostgreSQL is the only coordination point.

## Patterns used

| Pattern | Where | Why | Rejected alternative |
|---|---|---|---|
| **State machine** | `src/domain/order-status.ts` | One pure transition table (`canTransition` / `assertTransition`) is the single source of truth for what is legal. Pure code is trivially unit-tested (full 4×4 matrix). | Scattered `if (status === ...)` checks in services: they drift apart and are hard to test. XState: far more machinery than four states need. |
| **Service layer** | `src/services/*` | Business rules, authorization and transaction boundaries live in one place, independent of HTTP. Route handlers stay 3-5 lines. | Logic inside route handlers: not reusable by the worker or pages, hard to test without HTTP. |
| **Repository** | `src/repositories/*` | All SQL/Drizzle in one layer; methods take an `Executor` (db or transaction) so the service decides what is atomic. | Calling Drizzle from services: couples rules to the ORM and makes transactions implicit. A generic base repository: too abstract for four tables. |
| **Strategy + Factory** | `src/providers/*` (`MailboxProvider`, `createProviderRegistry`) | Google and Microsoft share one interface; the worker never branches on vendor. A new vendor is one class plus one registry entry. Latency, failure rate, sleep and random are injected, so tests are instant and deterministic. | `switch (provider)` in the worker: every new vendor edits core logic. |
| **DB-backed queue + worker** | `orders.status = 'PENDING'` as the queue; `src/worker/index.ts`; `ProvisioningService.claimNext()` | `UPDATE … WHERE id = (SELECT … FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING …` atomically claims one order, so running N workers never processes an order twice. The claim and its audit row commit together. No extra infrastructure and no dual-write problem (the order row *is* the job). | BullMQ/Redis: a second system plus the risk of the DB and queue disagreeing. In-process timers in Next.js: not safe with multiple instances and dies with the web server. |
| **Idempotency key** | `OrderService.create`, unique index `(user_id, idempotency_key)` | A retried or double-clicked request returns the original order (200) instead of creating a duplicate (201 first time). `INSERT … ON CONFLICT DO NOTHING` is race-safe; a stored request hash rejects key reuse with a different body (409). | Disabling the button in the UI: does not protect against network retries or API clients. "Check then insert" without a constraint: races. |
| **Audit log (append-only)** | `audit_logs`, written by `orderRepository.transition()` and creation/claim | Every status change records from → to, actor and note in the same transaction as the change, so history and state cannot diverge. | A JSON history column on `orders`: unqueryable and easy to corrupt. |
| **Optimistic concurrency** | `transition()` uses `UPDATE … WHERE id = ? AND status = from` | Two actors changing the same order cannot both win; the loser gets a 409. | `SELECT … FOR UPDATE` on every change: holds locks longer for no benefit here. |
| **Centralized error handling** | `src/domain/errors.ts`, `src/lib/api-handler.ts` | Typed `AppError`s map to one consistent JSON error shape and status code, in one place. | `try/catch` in each route: inconsistent shapes and leaked internals. |
| **Schema validation at the boundary** | `src/validation/*` (zod) | Input is parsed once at the edge; services receive typed, trusted data. | Manual checks inside services. |

## Worker details
1. `claimNext()`: one transaction: atomic claim + audit row (`PENDING → PROVISIONING`, actor `WORKER`).
2. `process()`: provisions every mailbox that is not yet `ACTIVE` (max `WORKER_CONCURRENCY` in parallel), saving each result immediately. The provider calls happen **outside** any DB transaction, so slow vendor calls never hold locks.
3. The order closes as `ACTIVE` (all mailboxes active) or `FAILED` (any failed), through `transition()`.
4. A retry (`FAILED → PENDING`) re-runs only mailboxes that are not `ACTIVE`, so a mailbox is never provisioned twice.
5. `recoverStale()`: an order stuck in `PROVISIONING` for `STALE_MINUTES` (worker crashed) becomes `FAILED` (actor `SYSTEM`) so an admin can retry it.

## Authorization
- Session: signed JWT in an httpOnly cookie. Customers only ever query their own orders (filter applied in the service); another customer's order returns 404. Retry is admin-only.
