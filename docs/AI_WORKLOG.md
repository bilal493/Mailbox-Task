# AI Worklog

**Tool used:** Claude Code (CLI), running in a terminal session inside the repo, with Node 22 and a real PostgreSQL 16.
**Method:** an interactive terminal session: Claude Code wrote files and ran commands (`npm`, `psql`, `vitest`, `curl`) directly in the project, and I steered, asked for changes and reviewed each result before committing.

## 1. Planning approach

1. **Understand the brief first.** I gave Claude Code the PDF and asked it to explain what was being asked before writing any code. It extracted the scoring weights (approach 25%, patterns 20%, correctness 20%, code quality 15%, time 10%, README/video/history 10%) and the red flags (one giant commit, logic in route handlers, no sign of review, README failing on a clean machine).
2. **Written plan before code.** Claude produced `docs/PLAN.md`: a time budget per phase, layered architecture, schema, state machine, idempotency design, worker design, API contract, commit plan and a review checklist. The task's own priority order drove the sequence: order creation and state machine → provider abstraction and worker → admin list/retry/audit → customer views → tests.
3. **Bottom-up build, vertical slices.** Config and schema → pure domain (state machine) → repositories → services → API → providers and worker → seed → UI → docs. Each layer was typechecked before the next one started.
4. **Real environment, not guesses.** Claude Code installed PostgreSQL in the dev environment so migrations, the worker's `SKIP LOCKED` claim and the integration tests ran against a real database, and it started the built app plus two worker processes and drove them with `curl`.
5. **Conventions in `CLAUDE.md`.** The layer rules and the "status only changes through `transition()`" rule were written down and followed throughout the build.

## 2. Key prompts

(Quoted from the session, lightly trimmed. Several were written in Roman Urdu.)

1. *"this is my evaluation task, look at it carefully and tell me what it is, and give me a complete plan.md"* → analysis of the brief and `PLAN.md` (time budget, architecture, schema, worker, checklist).
2. *"Plan is approved. Now build it in this repo, phase by phase, typecheck after each phase and commit small"* → moved from a plan-only answer to building the whole repo: scaffold, schema, services, worker, UI, tests, docs and commits.
3. *"What is left from the document? Fill the docs folder too, not just templates."* → a gap analysis against the brief (demo video, repo sharing, worklog) and complete docs.
4. *Follow-up to tighten the docs after the gap check* → this worklog, README and `CLAUDE.md` describe the process, the rules and the review evidence.

## 3. Where Claude was wrong, and how it was fixed

| # | What went wrong | How it was noticed | Fix |
|---|---|---|---|
| 1 | **Plan said Prisma; it was not usable.** The dev environment could not download Prisma's engine binaries (the host is blocked by the network restrictions). | Checked network limits before installing instead of discovering it mid-build. | Switched to **Drizzle ORM** (pure JS, allowed by the brief). The state machine, repositories and raw `SKIP LOCKED` SQL were unaffected because the layering isolates the ORM. |
| 2 | **Shell brace expansion created literal directories.** `mkdir -p src/{domain,db,...}` under `/bin/sh` produced one folder literally named `{domain,db,...}`, and the following file writes failed. | The command output showed `Directory nonexistent` errors and `ls` showed the odd folder. | Removed the folder, created directories in a loop, and re-wrote the files. |
| 3 | **A tautological test assertion hid a real test bug.** In the multi-worker test, Claude wrote `expect(new Set(calls).size).toBe(calls.length === 12 ? new Set(calls).size : -1)`, which can never fail. | Rewriting it to `toBe(12)` made the test fail (2 unique addresses instead of 12): all six orders used the same domain, so mailbox addresses collided. | Gave each order its own domain, kept the strict assertion, then re-ran the suite 3 more times to rule out flakiness. |
| 4 | **Leftover junk helper in a test.** The first draft of `create-order.test.ts` contained an unused `post`/`await_` pair that did nothing. | Re-read the file after writing it. | Deleted it, kept the single `call()` helper. |
| 5 | **`import.meta.url` main-module check in a script that tsx runs as CommonJS**, plus a Vitest config that triggered Vite's CJS-API deprecation warning. | Reasoned about the runtime before running; the warning appeared in the first test run. | Split the migration function (`run-migrations.ts`) from its CLI (`migrate.ts`), and renamed the config to `vitest.config.mts`. |
| 6 | **Overlooked what "20% failure" means at scale.** A per-call 20% failure makes large orders almost always FAIL (1 − 0.8^N: ~59% for 4 mailboxes, ~100% for 50). | Seen in the first end-to-end run: 5 of 6 four-mailbox orders failed. | Kept the faithful per-call semantics, made the rate configurable (`PROVIDER_FAILURE_RATE`), and documented the maths and demo advice in the README's known limitations. |
| 7 | **Background processes did not survive between Bash tool calls**, so the first end-to-end run had a dead server on the second half of its checks (every request returned HTTP 000). | All curls returned `000` and `pgrep` showed no processes. | Not an app bug. Re-ran server, worker and every check inside a single Bash command. |

Review steps that were not mistakes but are worth listing as evidence the output was checked:
- **Mutation test:** removed `FOR UPDATE SKIP LOCKED` from the claim query; two worker tests failed as they should. Restored it and re-ran everything.
- **Double-processing proof:** with two live workers, every order had exactly one `PENDING → PROVISIONING` audit row, split 3/3 between the workers.
- **Clean-clone check:** cloned the repo to a new folder with a fresh database and ran `npm ci`, `db:setup`, `typecheck`, `test`, `build`.

## 4. What I changed by hand

All code in the first version was generated by Claude Code in an interactive CLI session. Below are edits I made myself before submitting:

- Reviewed every file Claude produced, checking layer boundaries and SQL safety; no structural changes were needed.
- Ran Test cases
- Checked all requiremnets are met according to document.
- Changed UI theme color
- Added favicon icon


## 5. Time per phase

Wall-clock time estimates for the Claude Code CLI session (model generation + my reading and reviewing). File and log timestamps show about 12 minutes of command execution (plan at 08:14, last code commit at 08:26); the rest is roughly 2,500 lines of code and docs being generated and reviewed.

| Phase | Approx. time |
|---|---|
| Brief analysis and `PLAN.md` | 10 min |
| Environment (Postgres install), scaffold, config | 8 min |
| Schema, migration, domain (state machine), errors | 10 min |
| Repositories, validation, order service (idempotency) | 12 min |
| API layer (auth, error handler, routes) | 8 min |
| Providers, provisioning service, worker | 12 min |
| Tests (unit, API integration, worker) + fixes | 15 min |
| UI (customer + admin) | 18 min |
| End-to-end run with 2 workers, mutation test | 8 min |
| Docs, commits, clean-clone check, packaging | 12 min |
| **Total (estimated)** | **≈ 1 h 53 min** |

_TODO – Replace the estimates above with your real stopwatch numbers if they differ. Add time for reading/understanding the code, recording the demo video, and pushing to GitHub. The brief's hard cap is 4 hours._
