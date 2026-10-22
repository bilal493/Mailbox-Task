# PLAN.md: Mailbox Order Manager

**Stack:** Next.js (App Router, strict TypeScript) + PostgreSQL + Prisma + zod + Vitest
**Tooling:** Claude Code CLI only.
**Time limit:** Hard cap of **4 hours**. Target: **3h 30m**, with a 30-minute buffer.

---

## 1. Time Budget

| # | Phase | Time | Output |
|---|-------|------|--------|
| 0 | Setup, CLAUDE.md, plan | 15 min | Repository, Docker, Prisma init |
| 1 | Schema, migration, seed | 20 min | Models, seed users |
| 2 | State machine and unit tests | 25 min | Pure domain module and tests |
| 3 | Order service, repository, idempotency | 30 min | Create / get / list / retry |
| 4 | API layer (zod, error handler, auth) | 25 min | Thin route handlers |
| 5 | Provider abstraction and worker | 40 min | Strategy pattern and `SKIP LOCKED` worker |
| 6 | UI: customer and admin screens | 40 min | List, form, detail, admin |
| 7 | Integration test | 15 min | Order creation test |
| 8 | Docs, README, worklog | 20 min | ARCHITECTURE, README |
| 9 | Demo video and final clean-clone test | 15 min | Video link |
| | **Total** | **~4h 05m** | |

If time runs short, follow this priority order: order creation and state machine → provider and worker → admin list/retry/audit → customer views → tests.

---

## 2. Architecture

### Layers (dependencies point downward only)

```
app/api/**/route.ts, app/**/page.tsx   → HTTP / UI only (parse, call service, respond)
        ↓
src/services/*          → business logic (OrderService, AuthService)
        ↓
src/domain/*            → pure logic (state machine, types, errors)
src/providers/*         → Strategy: GoogleProvider, MicrosoftProvider
        ↓
src/repositories/*      → Prisma queries only
        ↓
PostgreSQL
```

### Folder Structure

```
.
├── CLAUDE.md
├── README.md
├── docker-compose.yml
├── .env.example
├── plan.md
├── docs/
│   ├── ARCHITECTURE.md
│   └── AI_WORKLOG.md
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── src/
│   ├── domain/
│   │   ├── order-status.ts        # enum + transition map + canTransition/assertTransition
│   │   └── errors.ts              # AppError, NotFound, InvalidTransition, Forbidden...
│   ├── providers/
│   │   ├── mailbox-provider.ts    # interface
│   │   ├── google-provider.ts
│   │   ├── microsoft-provider.ts
│   │   └── provider-factory.ts
│   ├── repositories/
│   │   ├── order.repository.ts
│   │   ├── audit-log.repository.ts
│   │   └── user.repository.ts
│   ├── services/
│   │   ├── order.service.ts
│   │   ├── provisioning.service.ts
│   │   └── auth.service.ts
│   ├── validation/
│   │   └── order.schemas.ts       # zod
│   ├── lib/
│   │   ├── db.ts                  # prisma singleton
│   │   ├── session.ts             # signed cookie (jose)
│   │   ├── api-handler.ts         # wrapper: auth + errors → consistent JSON
│   │   └── logger.ts
│   └── worker/
│       └── index.ts               # loop: claim → provision → finish
├── app/
│   ├── login/page.tsx
│   ├── orders/                    # customer
│   │   ├── page.tsx
│   │   ├── new/page.tsx
│   │   └── [id]/page.tsx
│   ├── admin/orders/page.tsx
│   └── api/
│       ├── auth/login/route.ts
│       ├── auth/logout/route.ts
│       ├── orders/route.ts            # GET list, POST create
│       ├── orders/[id]/route.ts       # GET detail
│       └── orders/[id]/retry/route.ts # POST (admin)
└── tests/
    ├── unit/order-status.test.ts
    └── integration/create-order.test.ts
```

---

## 3. Database Schema (Prisma)

```prisma
enum Role            { CUSTOMER ADMIN }
enum Provider        { GOOGLE MICROSOFT }
enum OrderStatus     { PENDING PROVISIONING ACTIVE FAILED }
enum MailboxStatus   { PENDING ACTIVE FAILED }

model User {
  id           String   @id @default(uuid())
  email        String   @unique
  passwordHash String
  role         Role
  orders       Order[]
  createdAt    DateTime @default(now())
}

model Order {
  id             String      @id @default(uuid())
  userId         String
  user           User        @relation(fields: [userId], references: [id])
  domain         String
  provider       Provider
  mailboxCount   Int
  status         OrderStatus @default(PENDING)
  idempotencyKey String
  attempts       Int         @default(0)
  lastError      String?
  startedAt      DateTime?   // set when PROVISIONING starts (stale detection)
  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt
  mailboxes      Mailbox[]
  auditLogs      AuditLog[]

  @@unique([userId, idempotencyKey])
  @@index([status, createdAt])
  @@index([userId, createdAt])
  @@index([provider, status])
}

model Mailbox {
  id        String        @id @default(uuid())
  orderId   String
  order     Order         @relation(fields: [orderId], references: [id], onDelete: Cascade)
  address   String
  status    MailboxStatus @default(PENDING)
  error     String?
  createdAt DateTime      @default(now())
  updatedAt DateTime      @updatedAt

  @@unique([orderId, address])
}

model AuditLog {
  id         String       @id @default(uuid())
  orderId    String
  order      Order        @relation(fields: [orderId], references: [id], onDelete: Cascade)
  fromStatus OrderStatus?
  toStatus   OrderStatus
  actorType  String       // "USER" | "ADMIN" | "WORKER" | "SYSTEM"
  actorId    String?
  note       String?
  createdAt  DateTime     @default(now())

  @@index([orderId, createdAt])
}
```

**Notes:**
- `@@unique([userId, idempotencyKey])` provides a database-level idempotency guarantee.
- When an order is created, immediately create `mailboxCount` Mailbox rows in `PENDING` status (`user1@domain`, `user2@domain`, ...) so the detail page can show per-mailbox status.
- Seed data: 1 admin, 2 customers (with known passwords), and a few sample orders in different statuses.

---

## 4. State Machine (`src/domain/order-status.ts`)

```ts
PENDING        → [PROVISIONING]
PROVISIONING   → [ACTIVE, FAILED]
FAILED         → [PENDING]        // admin retry only
ACTIVE         → []               // terminal
```

- Implemented as pure functions: `canTransition(from, to)` and `assertTransition(from, to)` (throws `InvalidTransitionError`).
- No DB or I/O dependencies, which keeps unit testing simple.
- Transitions happen in **exactly one place**: `OrderRepository.transition(tx, orderId, from, to, actor, note)`:
  - Runs `updateMany({ where: { id, status: from }, data: { status: to } })`. If the update count is 0, raise a conflict error (optimistic concurrency check).
  - Inserts an `AuditLog` row within the same transaction.
- No code may assign `order.status = ...` directly. (Document this rule in CLAUDE.md.)

**Minimum unit tests:**
- Every valid transition passes.
- Every invalid pair is rejected (full 4×4 matrix loop).
- No transitions are allowed out of ACTIVE.
- Same-state transitions are rejected.
- Retry is permitted only for FAILED → PENDING.

---

## 5. Idempotent Order Creation

- On form load, the client generates a key with `crypto.randomUUID()` and sends it in the `Idempotency-Key` header (safe against double-clicks and retries).
- `OrderService.create(user, input, key)`:
  1. Validate with zod: domain regex, provider enum, count between 1 and 50.
  2. In a single transaction: insert the order, `createMany` the mailboxes, and write the audit log (`null → PENDING`).
  3. On a unique violation (`P2002`), fetch and return the existing order (HTTP 200, `idempotent: true`); a newly created order returns 201.
  4. Same key with a different payload → 409 `IDEMPOTENCY_KEY_REUSED` (compare payload hashes; optional but a strong safeguard).
- Integration test: POST twice with the same key → only one order exists in the database, and the same ID is returned.

---

## 6. Provider Abstraction (Strategy + Factory)

```ts
interface MailboxProvider {
  readonly name: Provider;
  provisionMailbox(input: { domain: string; address: string }): Promise<{ externalId: string }>;
}
```

- `GoogleProvider` and `MicrosoftProvider`: `await sleep(2000–4000ms)` and throw `ProviderError(...)` roughly 20% of the time.
- Failure rate and delay are configurable via environment variables (`PROVIDER_FAILURE_RATE`, `PROVIDER_MIN_MS`, `PROVIDER_MAX_MS`) so that tests and demos run quickly and failures can be demonstrated deterministically.
- `ProviderFactory.get(provider)` is a simple map lookup (adding a provider = one new file and one new line).
- Inject the random source and sleep function via the constructor so tests can control them.

---

## 7. Worker (Safe, No Double Processing)

Runs as a separate process: `npm run worker` (`tsx src/worker/index.ts`).

### Claim Query (write by hand; have Claude review it)

```sql
UPDATE "Order" SET status = 'PROVISIONING', "startedAt" = now(), attempts = attempts + 1
WHERE id = (
  SELECT id FROM "Order"
  WHERE status = 'PENDING'
  ORDER BY "createdAt"
  FOR UPDATE SKIP LOCKED
  LIMIT 1
)
RETURNING *;
```

- The claim and its audit log entry (`PENDING → PROVISIONING`, actor WORKER) happen in **one transaction**.
- `FOR UPDATE SKIP LOCKED` guarantees two workers never pick up the same row.
- Provisioning runs **outside** the transaction, so long-running provider calls do not hold database locks or connections.

### Flow

1. Claim an order.
2. Load that order's `PENDING` / `FAILED` mailboxes (on retry, work only on mailboxes that are not already ACTIVE).
3. Call the provider once per mailbox with a concurrency limit of 5 (`p-limit`), persisting each mailbox result immediately.
4. If all mailboxes are ACTIVE, transition the order `PROVISIONING → ACTIVE`. If any mailbox FAILED, transition `PROVISIONING → FAILED` and record `lastError`.
5. The finishing update is guarded: `WHERE id AND status = 'PROVISIONING'`.

### Robustness

- **Stale recovery:** if an order has been in `PROVISIONING` for longer than `STALE_MINUTES` (e.g., after a worker crash), the loop moves it `PROVISIONING → FAILED` (actor SYSTEM, note "stale") so an admin can retry it. (If time does not permit, document this as a known limitation.)
- **Graceful shutdown:** on `SIGINT` / `SIGTERM`, finish the current order, then exit.
- **Polling:** poll every 2 seconds when the queue is empty; when work is found, proceed to the next order immediately.
- **Error isolation:** errors must never crash the worker loop (try/catch with logging).

**Test / demo:** run the worker in two terminals, create 10 orders, and show that no order was processed twice (the audit log contains exactly one `PENDING → PROVISIONING` entry per order).

---

## 8. Authentication

- Seeded users with email and password (bcrypt). Login issues a signed JWT (`jose`) stored in an httpOnly cookie.
- `requireUser()` and `requireAdmin()` helpers live in `lib/session.ts`. Middleware is used only for redirects; actual authorization is enforced in the service layer and handler wrapper.
- **Authorization rules:** a customer can access only their own orders; requesting another user's order returns 404 (to avoid information leakage). Retry is admin-only (403 otherwise).

---

## 9. API Contract

| Method | Path | Role | Notes |
|--------|------|------|-------|
| POST | /api/auth/login | public | Sets cookie |
| POST | /api/auth/logout | any | Clears cookie |
| GET | /api/orders | any | Customer: own orders; admin: all. Query: `status`, `provider`, `page`, `pageSize` |
| POST | /api/orders | customer | `Idempotency-Key` header required |
| GET | /api/orders/:id | owner/admin | Includes mailboxes and auditLogs |
| POST | /api/orders/:id/retry | admin | FAILED → PENDING |

Consistent error shape across all endpoints:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [ ... ] } }
```

**Error codes:** `VALIDATION_ERROR` 400, `UNAUTHENTICATED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404, `INVALID_TRANSITION` 409, `IDEMPOTENCY_KEY_REUSED` 409, `INTERNAL` 500.

The `lib/api-handler.ts` wrapper uses try/catch to map `AppError` to its code, `ZodError` to 400, and unknown errors to 500 (log the stack; return a generic message to the client).

Route handler shape (3–5 lines):

```ts
export const POST = apiHandler(async (req) => {
  const user = await requireUser(req);
  const input = createOrderSchema.parse(await req.json());
  const key = requireIdempotencyKey(req);
  return orderService.create(user, input, key);
});
```

---

## 10. UI Screens

| Screen | Path | Details |
|--------|------|---------|
| Login | /login | Email/password form with error message |
| Customer list | /orders | Own orders, status badge, link to detail, "New order" button |
| Create form | /orders/new | Domain, provider select, count 1–50, inline zod errors, submit button disabled while submitting (double-click guard) |
| Order detail | /orders/[id] | Summary, per-mailbox status table, audit log timeline; auto-refresh every 3–5 seconds while PENDING/PROVISIONING |
| Admin list | /admin/orders | Filters (status, provider), pagination, Retry button on FAILED rows only |

- Components should only render and fetch; they must not contain business logic. Keep styling minimal (basic Tailwind badges are sufficient).
- Every screen needs loading, empty, and error states.

---

## 11. Testing

**Unit (Vitest):** `tests/unit/order-status.test.ts` (cases from Section 4). Optional: provider factory, idempotency payload hash.

**Integration:** `tests/integration/create-order.test.ts`
- Use a test database (separate `DATABASE_URL_TEST`, or truncate tables in the same database).
- Cases:
  - Valid create → 201, status PENDING, N mailboxes, and 1 audit row.
  - Same key twice → same order returned, only one order in the database.
  - Invalid payload (count 51, bad domain) → 400 with the standard error shape.
- Test through the service layer directly or by calling the route handler, whichever is simpler.

---

## 12. Documentation Deliverables

### CLAUDE.md (repository root, created in Phase 0; short and practical)
- Stack and commands (`npm run dev|worker|test|lint|typecheck`, `prisma migrate`).
- Layer rules: no business logic in route handlers or components; database access only through repositories; status changes only through `transition()`.
- Style: strict TypeScript, no `any`, zod at boundaries, use `AppError`.
- Workflow: plan first, make small commits (conventional commits), and run `typecheck` and tests after every change.

### docs/ARCHITECTURE.md (for each pattern: where, why, and the rejected alternative)

| Pattern | Where | Why | Rejected alternative |
|---------|-------|-----|----------------------|
| State machine | `domain/order-status.ts` | Invalid transitions blocked in one place | `if` checks everywhere / XState (overkill) |
| Strategy + Factory | `providers/` | Add a provider without changing the service | `switch(provider)` inside the service |
| Repository | `repositories/` | Prisma isolated in one place; testable | Prisma calls inside services |
| Service layer | `services/` | Business logic separated from HTTP | Fat route handlers |
| DB-backed queue + worker | `worker/` + `SKIP LOCKED` | Postgres is sufficient; no extra infrastructure | BullMQ/Redis (extra service, dual-write problem) |
| Idempotency key | unique(userId, key) | Prevents duplicate orders | Client-side button disabling only |
| Audit log (append-only) | `AuditLog` + `transition()` | Traceability | JSON history column on the order table |
| Centralized error handling | `api-handler.ts` | Consistent error responses | try/catch in every route |
| Optimistic concurrency | `updateMany where status = from` | Race-safe transitions | `SELECT FOR UPDATE` everywhere |

### docs/AI_WORKLOG.md (sections)
1. Planning approach (Plan Mode, phases, CLAUDE.md first).
2. 3–5 key prompts (paste the actual prompts).
3. **Where Claude was wrong (minimum 2).** For each: what it said, how it was caught, and the fix. Likely real cases:
   - Wrote `findFirst` + `update` in the worker (race condition) instead of using `SKIP LOCKED`.
   - Placed business logic in a route handler.
   - On retry, re-provisioned mailboxes that were already ACTIVE.
   - Implemented idempotency as "check, then insert", which fails under a race.
   - Used `any`, or omitted a transaction around the audit log.
4. What was changed or written by hand (claim SQL, transition table, seed, etc.).
5. Time-per-phase table and total.

### README.md
- Demo video link at the top.
- Prerequisites (Node 20+, Docker).
- Steps: `git clone` → `cp .env.example .env` → `docker compose up -d` → `npm install` → `npx prisma migrate deploy` → `npx prisma db seed` → `npm run dev` → `npm run worker` (in a separate terminal).
- Table of login credentials (admin and customers).
- `npm test`.
- Link to the architecture document and a known-limitations section.

### Known Limitations (be honest)
- Basic session authentication; no password reset or rate limiting.
- Worker uses polling (no LISTEN/NOTIFY).
- Mock providers only.
- Simple stale-order recovery (if implemented at all).
- UI uses polling, not websockets.

---

## 13. Commit Plan (small and meaningful)

1. `chore: scaffold Next.js, strict TS, eslint, vitest`
2. `chore: docker-compose, .env.example, CLAUDE.md`
3. `feat(db): prisma schema, initial migration`
4. `feat(db): seed users and sample orders`
5. `feat(domain): order status state machine`
6. `test(domain): state machine unit tests`
7. `feat(repo): order and audit log repositories with transition()`
8. `feat(service): order service with idempotent create and retry`
9. `feat(api): zod schemas, error handler, auth, order routes`
10. `feat(providers): provider interface, google/microsoft mocks, factory`
11. `feat(worker): SKIP LOCKED claim and provisioning loop`
12. `feat(ui): login and customer order list/create/detail`
13. `feat(ui): admin list with filters, pagination, retry`
14. `test: order creation integration test`
15. `docs: architecture, worklog, README`

Before every commit, run: `npm run typecheck && npm test`.

---

## 14. Claude Code Prompts (copy-paste starters)

**Phase 0:**
> Plan mode. Next.js App Router + TS strict + Prisma + Postgres. Read plan.md. Propose scaffold steps only (no code yet): folder structure, deps, scripts, docker-compose. Wait for my approval.

**Phase 2:**
> Implement `src/domain/order-status.ts` as pure functions (transition map, canTransition, assertTransition throwing InvalidTransitionError). No DB imports. Then write Vitest tests covering the full 4x4 matrix.

**Phase 3:**
> Implement OrderRepository.transition(tx, ...) using updateMany with a `status: from` guard and an AuditLog insert in the same transaction. Then OrderService.create with idempotency via the unique(userId, idempotencyKey) constraint, handling P2002 by returning the existing order. No business logic outside services.

**Phase 5:**
> Write the worker claim using a raw SQL `UPDATE ... WHERE id = (SELECT ... FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`. Explain why this prevents double processing. Provisioning must happen outside the DB transaction.

**Review prompt (after every phase):**
> Review the diff you just made as a skeptical senior engineer. List race conditions, layer violations, and missing error handling. Don't change anything yet.

---

## 15. Review Checklist (before submission)

- [ ] README steps work on a clean clone within 10 minutes (test in a fresh folder)
- [ ] No business logic in route handlers or components
- [ ] Two workers running concurrently: no double processing
- [ ] Same Idempotency-Key sent twice → one order
- [ ] Invalid transition → consistent 409 error
- [ ] Every transition is audit-logged (create, claim, finish, retry)
- [ ] Customers cannot view other users' orders; retry is admin-only
- [ ] Strict TypeScript; `npm run typecheck` and lint are clean
- [ ] Unit and integration tests pass
- [ ] CLAUDE.md, ARCHITECTURE.md, and AI_WORKLOG.md are complete (2+ Claude mistakes, time table)
- [ ] 15+ small commits, no giant commits
- [ ] Demo video (2–3 min) linked at the top of the README: customer creates order → success and failure → admin audit log and retry → tests run
- [ ] Repository shared with reviewers
- [ ] If the 4-hour limit is reached: stop and list unfinished items in the README

---

## 16. Demo Video Script (2–3 min)

1. (0:00) Customer logs in and creates an order (Google, 3 mailboxes).
2. (0:20) Show the worker terminal; status moves PENDING → PROVISIONING → ACTIVE (successful order).
3. (0:50) Show a second order that ends FAILED (use `PROVIDER_FAILURE_RATE=1` for the demo, or a seeded failed order).
4. (1:20) Admin logs in, demonstrates filters and pagination, and opens the failed order's audit log.
5. (1:50) Click Retry → PENDING → worker picks it up → new result.
6. (2:20) Run `npm test` in the terminal and show it passing.
7. (2:40) One closing line: "Two workers running simultaneously, no double processing" (optional quick proof).

---

## 17. Common Traps

- Do not build the entire UI first; follow the priority order (backend core first).
- Do not run the worker inside the Next.js process; a separate process is the correct approach.
- Do not forget to track time; note the start and end of each phase.
- Do not commit Claude-generated code without reading it; the worklog must show evidence of review.
- Avoid over-engineering (XState, Redis, microservices); simple and explainable wins.
