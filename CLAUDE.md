# CLAUDE.md

Project conventions for the AI assistant. This repo was built with **Claude Code (CLI)**, and these are the rules it followed and that any future AI session should keep following.

Mailbox Order Manager: Next.js 14 (App Router) + TypeScript (strict) + PostgreSQL + Drizzle ORM.

## Commands
- `docker compose up -d`: start Postgres (dev DB `mailbox_orders`, test DB `mailbox_orders_test`)
- `npm run db:setup`: apply migrations + seed users and sample orders
- `npm run dev`: web app on :3000. `npm run worker`: provisioning worker (run 1..N copies)
- `npm test`: Vitest (unit + integration, needs Postgres). `npm run typecheck`
- `npm run db:generate`: create a new migration after editing `src/db/schema.ts` (never edit applied migrations)

## Layers (dependencies point down only)
1. `src/app/**` route handlers and pages: parse input, call a service, return. **No business logic, no SQL.**
2. `src/services/*`: business rules, authorization, transactions (`OrderService`, `ProvisioningService`, `AuthService`).
3. `src/domain/*`: pure logic and types: state machine (`order-status.ts`), errors. No I/O, no imports from other layers.
4. `src/repositories/*`: the only code that talks to Drizzle/SQL. They take an `Executor` (db or tx), so services own transaction boundaries.
5. `src/providers/*`: Strategy implementations behind `MailboxProvider`.

## Hard rules
- Order status changes **only** through `orderRepository.transition()` (validates via the state machine, guards `status = from`, writes the audit log in the same transaction). The single exception is the worker's atomic claim (`FOR UPDATE SKIP LOCKED`), which writes its own audit row.
- Never provision outside the claim: the worker must hold the order in `PROVISIONING`.
- Validate every external input with zod (`src/validation`). Throw `AppError` subclasses; `apiHandler` turns them into `{ error: { code, message, details? } }`.
- Strict TypeScript, no `any`. Do not add dependencies without a reason.
- Order creation needs an `Idempotency-Key`; idempotency is enforced by the DB unique index `(user_id, idempotency_key)`.

## Workflow
- Plan first, then small steps. After each step run `npm run typecheck && npm test`.
- Small conventional commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`).
- When changing the worker or state machine, add or update a test that would fail without the change.
