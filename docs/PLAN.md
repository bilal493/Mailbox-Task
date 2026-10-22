# PLAN.md: Mailbox Order Manager

> Planning document written at the start of the build. **Deviation:** the plan used Prisma, but the dev environment could not download Prisma's engine binaries, so the implementation uses **Drizzle ORM** instead (see `docs/AI_WORKLOG.md`, mistake #1). Everything else follows the plan. Folder `app/` became `src/app/`.

Stack: Next.js (App Router, TS strict) + PostgreSQL + Drizzle (planned: Prisma) + zod + Vitest
Tool: Claude Code (CLI). Hard cap: **4 hours**. Target: **3h 30m** + 30m buffer.

---

## 0. Strategy (read first)

Is task mein marks sirf code ke nahi, **process** ke bhi hain. Isliye:

1. Claude ko kabhi "poori app bana do" mat bolo. Phase-by-phase, chhote prompts, har phase ke baad review + commit.
2. Har phase mein pehle plan maango, plan review karo, phir execute.
3. **Worklog turant likho**, baad mein yaad nahi rahega. Ek `docs/AI_WORKLOG.md` hamesha open rakho.
4. Jab Claude galat kare, note karo (min 2 cases): kya galat tha, kaise pakda, kaise fix kiya.
5. Kuch cheezein jaan-boojh kar haath se likho/change karo (e.g. worker claim SQL, state machine table) aur worklog mein likho.
6. Har cheez explain karni aani chahiye (follow-up call). Jo samajh na aaye wo accept mat karo.

---

## 1. Time Budget

| # | Phase | Time | Output |
|---|-------|------|--------|
| 0 | Setup + CLAUDE.md + plan | 15 min | repo, docker, prisma init |
| 1 | Schema + migration + seed | 20 min | models, seed users |
| 2 | State machine + unit tests | 25 min | pure domain module + tests |
| 3 | Order service + repository + idempotency | 30 min | create/get/list/retry |
| 4 | API layer (zod, error handler, auth) | 25 min | route handlers (thin) |
| 5 | Provider abstraction + worker | 40 min | Strategy + SKIP LOCKED worker |
| 6 | UI: customer + admin screens | 40 min | list, form, detail, admin |
| 7 | Integration test | 15 min | order creation test |
| 8 | Docs + README + worklog | 20 min | ARCHITECTURE, README |
| 9 | Demo video + final clean-clone test | 15 min | video link |
| | **Total** | **~3h 25m** | |

Agar time kam pade, priority order: order creation + state machine → provider + worker → admin list/retry/audit → customer views → tests.

---

## 2. Architecture

### Layers (dependency sirf neeche ki taraf)

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

### Folder structure

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

Notes:
- `@@unique([userId, idempotencyKey])` = DB-level idempotency guarantee.
- Order create hote hi `mailboxCount` ke Mailbox rows (`PENDING`) bana do (`user1@domain`, `user2@domain`...), taake detail page par per-mailbox status dikhe.
- Seed: 1 admin, 2 customers (known passwords), kuch sample orders alag statuses mein.

---

## 4. State Machine (`src/domain/order-status.ts`)

```ts
PENDING        → [PROVISIONING]
PROVISIONING   → [ACTIVE, FAILED]
FAILED         → [PENDING]        // admin retry only
ACTIVE         → []               // terminal
```

- Pure functions: `canTransition(from, to)`, `assertTransition(from, to)` (throws `InvalidTransitionError`).
- Koi DB/IO nahi, isliye unit test aasaan.
- **Ek hi jagah** transition hoti hai: `OrderRepository.transition(tx, orderId, from, to, actor, note)`:
  - `updateMany({ where: { id, status: from }, data: { status: to } })`. Agar count = 0 → conflict error (optimistic check).
  - Same transaction mein `AuditLog` insert.
- Koi code direct `order.status = ...` nahi karega. (CLAUDE.md mein rule likho.)

Unit tests (min):
- Har valid transition pass.
- Har invalid pair reject (full matrix loop: 4×4).
- ACTIVE se koi transition nahi.
- Same-state transition reject.
- Retry sirf FAILED → PENDING.

---

## 5. Idempotent Order Creation

- Client form load par `crypto.randomUUID()` bana kar `Idempotency-Key` header mein bhejta hai (double-click / retry safe).
- `OrderService.create(user, input, key)`:
  1. zod validate: domain regex, provider enum, count 1..50.
  2. Transaction: order insert + mailboxes createMany + audit log (`null → PENDING`).
  3. Agar unique violation (`P2002`) → existing order fetch karke return karo (HTTP 200, `idempotent: true`); naya = 201.
  4. Same key, different payload → 409 `IDEMPOTENCY_KEY_REUSED` (payload hash compare; optional but strong signal).
- Integration test: same key do baar POST → 1 hi order DB mein, same id wapas.

---

## 6. Provider Abstraction (Strategy + Factory)

```ts
interface MailboxProvider {
  readonly name: Provider;
  provisionMailbox(input: { domain: string; address: string }): Promise<{ externalId: string }>;
}
```

- `GoogleProvider`, `MicrosoftProvider`: `await sleep(2000–4000ms)`, ~20% `throw new ProviderError(...)`.
- Failure rate aur delay env se configurable (`PROVIDER_FAILURE_RATE`, `PROVIDER_MIN_MS`, `PROVIDER_MAX_MS`), taake tests/demo fast ho sakein (demo mein deterministic failure dikhana hai).
- `ProviderFactory.get(provider)` → map lookup (naya provider = ek file + ek line).
- Random aur sleep inject karo (constructor mein) taake test mein control ho.

---

## 7. Worker (safe, no double processing)

Separate process: `npm run worker` (`tsx src/worker/index.ts`).

### Claim query (haath se likhna, Claude se review karwao)

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

- Claim + audit log (`PENDING → PROVISIONING`, actor WORKER) **ek transaction** mein.
- `FOR UPDATE SKIP LOCKED` ki wajah se 2 workers kabhi same row nahi uthate.
- Provisioning transaction ke **bahar** hoti hai (long calls par DB lock/connection nahi roke).

### Flow

1. Claim order.
2. Us order ke `PENDING`/`FAILED` mailboxes lo (retry par sirf unhi par kaam jo ACTIVE nahi).
3. Provider call per mailbox, concurrency limit 5 (`p-limit`), har mailbox ka result turant save.
4. Sab ACTIVE → order `PROVISIONING → ACTIVE`; koi bhi FAILED → `PROVISIONING → FAILED` + `lastError`.
5. Finish update guarded: `WHERE id AND status = 'PROVISIONING'`.

### Robustness

- **Stale recovery:** agar order `PROVISIONING` mein `STALE_MINUTES` se zyada hai (worker crash), to loop mein `PROVISIONING → FAILED` (actor SYSTEM, note "stale") taake admin retry kar sake. (Ya known limitation likho agar time na mile.)
- Graceful shutdown: `SIGINT/SIGTERM` par current order poora karo, phir exit.
- Poll interval 2s jab queue khali ho; kaam mile to turant agla.
- Errors worker loop ko crash na karein (try/catch + log).

Test/demo: 2 terminals mein worker chalao, 10 orders banao, dikhao ke koi order do baar process nahi hua (audit log mein ek hi `PENDING→PROVISIONING`).

---

## 8. Auth

- Seeded users, email+password (bcrypt). Login → signed JWT (`jose`) httpOnly cookie.
- `requireUser()` / `requireAdmin()` helpers `lib/session.ts` mein; middleware sirf redirect ke liye, asli authorization service/handler wrapper mein.
- **Authorization rules:** customer sirf apne orders; doosre ka order → 404 (leak na ho). Retry → admin only (403 warna).

---

## 9. API Contract

| Method | Path | Role | Notes |
|--------|------|------|-------|
| POST | /api/auth/login | public | sets cookie |
| POST | /api/auth/logout | any | clears cookie |
| GET | /api/orders | any | customer: own; admin: all. Query: `status`, `provider`, `page`, `pageSize` |
| POST | /api/orders | customer | header `Idempotency-Key` required |
| GET | /api/orders/:id | owner/admin | includes mailboxes + auditLogs |
| POST | /api/orders/:id/retry | admin | FAILED → PENDING |

Consistent error shape (sab jagah):

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [ ... ] } }
```

Codes: `VALIDATION_ERROR` 400, `UNAUTHENTICATED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404, `INVALID_TRANSITION` 409, `IDEMPOTENCY_KEY_REUSED` 409, `INTERNAL` 500.

`lib/api-handler.ts` wrapper: try/catch → `AppError` ko map kare, `ZodError` → 400, unknown → 500 (stack log, client ko generic).

Route handler ka shape (3-5 lines):

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
| Login | /login | email/password, error message |
| Customer list | /orders | own orders, status badge, link to detail, "New order" |
| Create form | /orders/new | domain, provider select, count 1-50, inline zod errors, submit disable (double-click guard) |
| Order detail | /orders/[id] | summary, per-mailbox status table, audit log timeline; auto-refresh har 3-5s jab PENDING/PROVISIONING |
| Admin list | /admin/orders | filters (status, provider), pagination, Retry button sirf FAILED rows par |

- Components sirf render + fetch; logic nahi. Zyada styling mat karo (Tailwind basic badges kaafi).
- Loading, empty, error states har screen par.

---

## 11. Testing

**Unit (Vitest):** `tests/unit/order-status.test.ts` (section 4 ke cases). Optional: provider factory, idempotency payload hash.

**Integration:** `tests/integration/create-order.test.ts`
- Test DB (alag `DATABASE_URL_TEST` ya same DB mein truncate).
- Cases: valid create → 201 + PENDING + N mailboxes + 1 audit row; same key → same order, count 1; invalid payload (count 51, bad domain) → 400 shape.
- Service layer directly ya route handler call, jo bhi simple ho.

---

## 12. Docs Deliverables

### CLAUDE.md (repo root, Phase 0 mein, chhota aur kaam ka)
- Stack, commands (`npm run dev|worker|test|lint|typecheck`, `prisma migrate`).
- Layer rules: route handlers/components mein business logic nahi; DB access sirf repositories; status change sirf `transition()` se.
- Style: strict TS, no `any`, zod at boundaries, `AppError` use karo.
- Workflow: pehle plan, chhote commits (conventional commits), har change ke baad `typecheck + test`.

### docs/ARCHITECTURE.md (har pattern: kahan, kyun, rejected alternative)

| Pattern | Kahan | Kyun | Rejected |
|---------|-------|------|----------|
| State machine | `domain/order-status.ts` | invalid transitions ek jagah block | `if` checks har jagah / XState (overkill) |
| Strategy + Factory | `providers/` | naya provider bina service badle | `switch(provider)` service mein |
| Repository | `repositories/` | Prisma ek jagah, testable | Prisma calls services mein |
| Service layer | `services/` | business logic HTTP se alag | fat route handlers |
| DB-backed queue + worker | `worker/` + `SKIP LOCKED` | Postgres hi kaafi, no extra infra | BullMQ/Redis (extra service, dual-write problem) |
| Idempotency key | unique(userId, key) | duplicate orders rokna | client-side-only disable button |
| Audit log (append-only) | `AuditLog` + `transition()` | traceability | order table mein JSON history |
| Centralized error handling | `api-handler.ts` | consistent errors | har route mein try/catch |
| Optimistic concurrency | `updateMany where status = from` | race safe transitions | `SELECT FOR UPDATE` everywhere |

### docs/AI_WORKLOG.md (sections)
1. Planning approach (phases, CLAUDE.md pehle).
2. 3-5 key prompts (actual prompts paste karo).
3. **Claude galat tha, min 2** (har ek: kya kaha, kaise pakda, fix). Possible real cases:
   - Worker mein `findFirst` + `update` (race condition) likha, `SKIP LOCKED` nahi.
   - Business logic route handler mein rakh di.
   - Retry mein pehle se ACTIVE mailboxes dobara provision kiye.
   - Idempotency sirf "check then insert" se, race par fail.
   - `any` / missing transaction audit log ke saath.
4. Jo haath se change/likha (claim SQL, transition table, seed, etc.).
5. Time per phase table + total.

### README.md
- Top par demo video link.
- Prerequisites (Node 20+, Docker).
- Steps: `git clone` → `cp .env.example .env` → `docker compose up -d` → `npm install` → `npx prisma migrate deploy` → `npx prisma db seed` → `npm run dev` → `npm run worker` (alag terminal).
- Logins table (admin + customers).
- `npm test`.
- Architecture link, known limitations.

### Known limitations (honest likho)
- Basic session auth, no password reset/rate limit.
- Worker polling (no LISTEN/NOTIFY).
- Mock providers only.
- Stale recovery simple (agar implement na hua).
- UI polling, no websockets.

---

## 13. Commit Plan (small, meaningful)

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

Har commit se pehle: `npm run typecheck && npm test`.

---

## 14. Claude Prompts (copy-paste starters)

**Phase 0:**
> Plan mode. Next.js App Router + TS strict + Prisma + Postgres. Read plan.md. Propose scaffold steps only (no code yet): folder structure, deps, scripts, docker-compose. Wait for my approval.

**Phase 2:**
> Implement `src/domain/order-status.ts` as pure functions (transition map, canTransition, assertTransition throwing InvalidTransitionError). No DB imports. Then write Vitest tests covering the full 4x4 matrix.

**Phase 3:**
> Implement OrderRepository.transition(tx, ...) using updateMany with a `status: from` guard and an AuditLog insert in the same transaction. Then OrderService.create with idempotency via the unique(userId, idempotencyKey) constraint, handling P2002 by returning the existing order. No business logic outside services.

**Phase 5:**
> Write the worker claim using a raw SQL `UPDATE ... WHERE id = (SELECT ... FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`. Explain why this prevents double processing. Provisioning must happen outside the DB transaction.

**Review prompt (har phase ke baad):**
> Review the diff you just made as a skeptical senior engineer. List race conditions, layer violations, and missing error handling. Don't change anything yet.

---

## 15. Review Checklist (submit se pehle)

- [ ] Clean clone par README steps 10 minute mein chalte hain (fresh folder mein test karo)
- [ ] Route handlers/components mein business logic nahi
- [ ] Do workers ek saath: koi double processing nahi
- [ ] Same Idempotency-Key do baar → ek order
- [ ] Invalid transition → 409 consistent error
- [ ] Har transition ka audit log (create, claim, finish, retry)
- [ ] Customer doosre ka order nahi dekh sakta; retry sirf admin
- [ ] Strict TS, `npm run typecheck` clean, lint clean
- [ ] Unit + integration tests pass
- [ ] CLAUDE.md, ARCHITECTURE.md, AI_WORKLOG.md (2+ Claude mistakes, time table)
- [ ] 15+ chhote commits, giant commit nahi
- [ ] Demo video (2-3 min) README ke top par: customer create → success + failure → admin audit log + retry → tests run
- [ ] Repo shared with reviewers
- [ ] Agar 4h ho jaye: stop karo, unfinished list README mein likho

---

## 16. Demo Video Script (2-3 min)

1. (0:00) Customer login → create order (google, 3 mailboxes).
2. (0:20) Worker terminal dikhao, status PENDING → PROVISIONING → ACTIVE (success order).
3. (0:50) Dusra order jo FAILED ho (demo ke liye `PROVIDER_FAILURE_RATE=1` ya seeded failed order).
4. (1:20) Admin login → list filters/pagination → failed order ka audit log.
5. (1:50) Retry click → PENDING → worker pick → naya result.
6. (2:20) Terminal mein `npm test` chalao, pass dikhao.
7. (2:40) Ek line: "Do workers ek saath, no double processing" (optional quick proof).

---

## 17. Common Traps

- Pehle poora UI mat banao; priority order follow karo (backend core pehle).
- Worker ko Next.js process ke andar mat chalao (alag process hi sahi hai).
- Time track karna na bhoolo, phase ke start/end par note karo.
- Claude ke diye code ko bina padhe commit mat karo, review ka saboot worklog mein chahiye.
- Over-engineering (XState, Redis, microservices) se bacho; simple + explainable jeetta hai.
