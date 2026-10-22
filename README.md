# Mailbox Order Manager

Internal tool for a company that sells pre-warmed Google and Microsoft mailboxes. Customers place orders; a background worker provisions the mailboxes through a provider abstraction; admins monitor, filter and retry.

**Demo video:** _TODO: paste link here (2-3 min: customer creates an order, one success and one failure, admin sees the audit log and retries, tests run)_

Stack: Next.js 14 (App Router) · TypeScript (strict) · PostgreSQL 16 · Drizzle ORM · zod · Vitest

## Run it (about 5 minutes)

Prerequisites: **Node 20+** and **Docker**.

```bash
git clone <repo-url> && cd mailbox-order-manager
cp .env.example .env

docker compose up -d          # Postgres on :5432 (waits until healthy)
npm install
npm run db:setup              # applies migrations + seeds users and sample orders

npm run dev                   # terminal 1 → http://localhost:3000
npm run worker                # terminal 2 → the provisioning worker
```

Start a second `npm run worker` in a third terminal to see that two workers never process the same order.

### Logins (seeded)

| Role | Email | Password |
|---|---|---|
| Admin (sees all orders) | `admin@example.com` | `admin123` |
| Customer | `alice@example.com` | `customer123` |
| Customer | `bob@example.com` | `customer123` |

### Tests

```bash
npm test            # 32 tests: state machine unit tests, order-creation integration tests, worker tests
npm run typecheck
```

Tests need the Postgres from `docker compose up -d`. They use a separate `mailbox_orders_test` database (created automatically) and never touch dev data.

## How it works

- **Status flow:** `PENDING → PROVISIONING → ACTIVE | FAILED`; an admin can retry `FAILED → PENDING`. Invalid transitions are rejected (HTTP 409) and every transition is written to the audit log.
- **Idempotent creation:** `POST /api/orders` requires an `Idempotency-Key` header. The same key returns the same order (200 instead of 201). The web form sends one automatically.
- **Worker:** `npm run worker` claims one `PENDING` order at a time with `FOR UPDATE SKIP LOCKED`, calls the mocked provider once per mailbox (2-4 s each, ~20% random failure), then marks the order `ACTIVE` (all mailboxes ok) or `FAILED`. Retrying only re-provisions mailboxes that are not yet active.
- **Screens:** customer order list, create form, order detail (per-mailbox status + audit log, auto-refreshes); admin list with status/provider filters, pagination and a Retry button.

Design patterns, where they live and the alternatives rejected: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Claude Code notes: [CLAUDE.md](CLAUDE.md), [docs/AI_WORKLOG.md](docs/AI_WORKLOG.md).

### API

| Method | Path | Who | Notes |
|---|---|---|---|
| POST | `/api/auth/login`, `/api/auth/logout` | anyone | session cookie |
| GET | `/api/orders` | any user | `?status=&provider=&page=&pageSize=`; customers only get their own |
| POST | `/api/orders` | customer | body `{domain, provider: "google"\|"microsoft", mailboxCount: 1-50}` + `Idempotency-Key` header |
| GET | `/api/orders/:id` | owner or admin | includes mailboxes and audit log |
| POST | `/api/orders/:id/retry` | admin | `FAILED → PENDING` |

Errors always look like `{ "error": { "code", "message", "details?" } }`.

### Useful settings (`.env`)

| Variable | Default | Purpose |
|---|---|---|
| `PROVIDER_FAILURE_RATE` | `0.2` | Chance that one provider call fails. Set `1` to force a failure for a demo, `0` for guaranteed success |
| `PROVIDER_MIN_MS` / `PROVIDER_MAX_MS` | `2000` / `4000` | Simulated latency per mailbox call |
| `WORKER_CONCURRENCY` | `5` | Mailboxes provisioned in parallel per order |
| `STALE_MINUTES` | `10` | An order stuck in `PROVISIONING` this long is failed so it can be retried |

## Known limitations

- **Failure rate is per mailbox call.** With 20% per call an order of N mailboxes fails with probability 1 − 0.8^N (about 59% for 4 mailboxes, almost always for 50). That is faithful to "20% random failure" but harsh; for a smooth demo place small orders (1 mailbox succeeds 80% of the time) or lower `PROVIDER_FAILURE_RATE`. A per-mailbox automatic retry would be the next improvement.
- A retried order re-runs only its unfinished mailboxes; there is no per-mailbox retry button.
- Auth is deliberately minimal: seeded users, no sign-up, password reset or rate limiting.
- The worker polls (`WORKER_POLL_MS`) rather than using `LISTEN/NOTIFY`; the order page polls every 3 s instead of using websockets.
- Provider calls are mocks; there is no real Google/Microsoft integration.
- Timestamps are shown in UTC.
