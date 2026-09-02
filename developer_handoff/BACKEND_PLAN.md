# A3TRANZ — Backend plan

Companion to `IMPLEMENTATION_PLAN.md`. That document ends at "two clients, both
mock-backed". This one replaces the mock.

Written against the code as it stands 2026-08-27: `mobile-app` and `admin-web`
both typecheck clean, both pass their §7 gates, and `grep -rn "fetch(\|axios"`
over both `src/` trees returns **nothing**. There is no network layer to
retrofit around — there is a seam, and it is already cut.

---

## 1 · The three decisions that make this small

### 1.1 The contracts are the API spec. Do not write a second one.

`src/data/contracts/*.ts` exists in both projects: 8 domains, ~50 methods, every
one already typed with its arguments, its return shape and its failure codes.
`jobs.ts` even says so in its header comment:

> *"the swap point. UI never imports from `data/mock/`. When a real API lands,
> one import per domain changes."*

So: **one HTTP route per repo method**, named after the method. No REST purity
argument, no resource-modelling exercise, no OpenAPI authored by hand. The route
table is mechanically derived from the interfaces, and the client-side types
already exist and already compile.

`POST /jobs/:id/seal-number` is `setSealNumber`. `GET /chat/unread` is
`hasUnreadThreads`. That is the entire design conversation.

### 1.2 The state machine moves server-side **verbatim**. This forces Node/TS.

`mobile-app/src/data/mock/jobStateMachine.ts` is the most valuable file in the
repo: the 12-item DOT checklist, the 2+3+4 slot specs, `gate()`, `advance()`,
`submit()`, `deletePhoto()`'s re-open rule, `isOverdue`/`isDueToday`. It is
subtle, it is correct, and it has a written invariant block at the top.

Right now it runs **on the client only**, which means it is UX, not enforcement.
A driver with the app's own token can `POST /jobs/A3-0421/submit` with zero
photos and the office gets a "complete" job and a customer email.

The lazy fix is not to reimplement those rules in Go/Python/Java and then keep
two copies in sync forever. It is to **run that exact file on the server**.

→ **Backend is TypeScript on Node.** The file moves to a shared package that
both the API and both clients import. One copy of the gates, permanently.

Same for `admin-web/src/lib/rbac.ts` — a plain object map of 10 capabilities
across 3 tiers. It becomes the authorization check on every admin route. Also
one copy.

### 1.3 Fastify + `pg` + Zod. Not NestJS.

Eight domains, ~50 endpoints, one state machine, one upload path, one email.
Fastify + `pg` + Zod covers that in roughly a third of the files NestJS needs,
and Zod schemas are derived from the contract types we already have.

*Alternative, one line:* the roster has a `nest-backend-developer` agent with
NestJS/TypeORM conventions and a matching reviewer. If you want the team's
existing conventions and review loop more than you want fewer files, say so and
the plan is otherwise unchanged — every decision below is stack-neutral except
the file count.

**Not using:** GraphQL, WebSockets, Redis, an ORM, a queue broker, microservices,
event sourcing, a policy engine. Each is a paragraph in §7 with the condition
that would change the answer.

---

## 2 · Stack

| Concern | Choice | Why not something else |
|---|---|---|
| Runtime | Node 22 (matches `mobile-app` `engines`) | — |
| HTTP | Fastify | Express is fine too; Fastify gives schema validation and typed routes for free |
| DB | PostgreSQL 16 | Constraints do the concurrency work (§5). Not optional |
| DB access | `pg` + hand-written SQL | ~30 queries. An ORM is a migration system plus a query language you have to learn anyway |
| Migrations | `node-pg-migrate` | Plain SQL up/down |
| Validation | Zod at every route boundary | Trust boundary — not a place to be lazy |
| Auth | JWT (access 15m + refresh 30d), `argon2` hashes | — |
| Photos | S3 presigned PUT, DB stores keys only | Never proxy image bytes through the API |
| Email | Resend/SES via an **outbox table** (§6) | A broker for one email type is a service to operate at 3am |
| Shared code | `packages/domain` — the state machine + RBAC + contracts | The whole point of §1.2 |

**Repo shape** — one package added, two `package.json` files gain a dependency:

```
A3TRANZ/
  packages/domain/        ← jobStateMachine.ts, rbac.ts, contracts/*  (moved, not copied)
  api/                    ← the new service
  mobile-app/             ← imports @a3/domain, swaps 8 imports
  admin-web/              ← imports @a3/domain, swaps 8 imports
```

npm workspaces. `jobStateMachine.ts` and `rbac.ts` are **moved** to
`packages/domain` and re-exported, so the "change one, change both" comment at
the top of the state machine stops being a request and starts being a fact.

---

## 3 · Schema

Tables map ~1:1 to the contract types. Notes are only where the mapping is
*not* obvious — everything unmentioned is the boring column you expect.

```
users            id, email UNIQUE, password_hash, name, initials,
                 role (enum: the 6 from contracts/auth.ts), base, active,
                 created_at
                 -- drivers and office staff are ONE table. `role='driver'`
                 -- is the mobile-only sixth role. Two tables would mean two
                 -- login paths for one login form.

customers        id, name, short_name, notify_on_completion, created_at

fleet_units      id (TRK-118 / CH-4402), kind, out_of_service, created_at
defects          id, unit_id, job_id, item, note NOT NULL, reported_by,
                 reported_at, photo_key
                 -- note is NOT NULL at the DB level, not just in gate code.
                 -- This row is the legal record of why a unit went OOS (W18)
                 -- and it is INSERT-only: no UPDATE, no DELETE grant.

jobs             id, title, customer_id, type, priority, status, step,
                 driver_id, location, address, map_query,
                 assigned_at, due_at, timezone,
                 container_no, seal_no, truck_id, chassis_id,
                 price_cents, description, instructions,
                 submitted_at, approved_at, version
job_legs         job_id, kind, driver_id, amount_cents, ordinal

inspection_items job_id, item_id, result, note, photo_key, PK(job_id,item_id)
                 CHECK (result <> 'defect' OR btrim(coalesce(note,'')) <> '')
                 -- §6.1's "a ✗ with no note is invalid" as a CHECK constraint.

job_evidence     job_id, step, slot_index, s3_key, captured_at
                 PK(job_id, step, slot_index)
                 -- Stores ONLY the key. Labels, hints and ordering are rebuilt
                 -- on read from SLOT_SPECS. Never denormalise design copy.

job_photos       id, job_id, s3_key, alt, uploaded_by, created_at
                 -- M10 loose uploads. NOT evidence. Driver-deletable (Q5).
job_attachments  id, job_id, name, size_bytes, s3_key, origin, kind, step
                 -- origin='admin' documents are download-only (Q5).

threads          id, job_id, admin_id, created_at
messages         id, thread_id, author_id, body, attachment_key, created_at
thread_reads     thread_id, user_id, last_read_at, PK(thread_id,user_id)
                 -- unread is derived from this, never a stored counter that
                 -- can drift out of sync with the messages it counts.
job_notes        id, job_id, author_id, body, created_at

pay_periods      id, driver_id, starts_on, ends_on, status,
                 pays_on, paid_on, reference, method
pay_lines        period_id, job_id, leg_kind, amount_cents
                 UNIQUE(period_id, job_id, leg_kind)
                 -- the unique key is what stops an approve retry double-paying.

notifications    id, user_id, kind, title, body, job_id, read_at, created_at
notification_prefs user_id, kind, enabled, PK(user_id,kind)

outbox           id, kind, job_id, payload jsonb, created_at, sent_at,
                 attempts, last_error
                 UNIQUE(kind, job_id) WHERE kind='job_complete'
                 -- §6. The customer is told once.
```

**Money is `_cents INTEGER`, everywhere, no exceptions.** Fixtures currently
carry whole-dollar JS numbers (`40`, `120`, `840`). Seeding multiplies by 100.
The `Money` component on both clients keeps rendering dollars; the API returns
cents and the repo adapter divides in one place per project.

**Seed data is `fixtures.json`.** 11 jobs, 6 pay periods, 5 customers, the
defect, the threads — already authored, already internally consistent, already
the thing both UIs were built against. The seed script is a loop over that file,
not a fixtures-authoring exercise. Every screenshot you have keeps reproducing.

---

## 4 · The presentation-string problem — read this before writing a route

The contracts leak formatting into the data layer, and it is load-bearing:

```
Job.dueLabel        'Due today · 4:00 PM'
Job.assignedLabel   'Assigned 2 hours ago'
Thread.whenLabel    '10:42 AM'
DriverOverview.greeting  'Morning, John'
DriverOverview.dateLabel 'Tuesday · 25 November'
PayPeriod.label     'Nov 10 – Nov 16'
EarningsSummary.holdRule  <a full sentence, rendered literally>
```

The mock computes all of these. Something still has to.

**Decision: the server computes them**, in the job's timezone (`jobs.timezone`,
default `America/Chicago`), and returns them alongside the raw ISO fields the
contracts already carry. The clients then do not change at all, which is the
whole point — and the state machine's own comment on `isDueToday` already
explains why the device's calendar is the wrong clock:

> *"a phone five hours east of Houston turns a job due at 17:00 local into
> tomorrow's job, and the urgency ink silently disappears."*

Cost: `Intl.DateTimeFormat` in the API and a `timezone` column. Cheaper than
moving the formatting into two client codebases and getting the second one
subtly wrong.

`Evidence`, by contrast, is **rebuilt on read** — `blankEvidence()` then
`capturePhoto()` per stored key. Labels and hints come from `SLOT_SPECS` at
serialize time. A copy change in the design ships without a data migration.

---

## 5 · Correctness — where laziness stops

Six things get real enforcement, not a comment.

**① Every gate runs server-side.** `advance`, `submit`, `reportDefect`,
`setSealNumber`, `capturePhoto`, `deletePhoto` all load the job, call the shared
state machine, and persist the returned job inside one transaction.
`JobStateError` maps to `422` with the message the client already renders. The
client keeps its optimistic copy for the lock copy and the disabled button; the
server is what decides.

**② Optimistic concurrency on jobs.** `jobs.version` bumps on every write;
writes carry the version they read and `409` on mismatch. Two dispatchers with
W4 open on the same job stop being a silent last-write-wins.

**③ Approve is idempotent and cannot double-pay.**
`UPDATE jobs SET status='done' WHERE id=$1 AND status='awaiting_approval'`
— zero rows affected means someone already approved it, return the job, do not
insert pay lines. The `UNIQUE(period_id, job_id, leg_kind)` on `pay_lines`
is the belt to that suspenders. Payroll accrual and the status change are one
transaction.

**④ Submit fires the email exactly once.** The outbox row's unique index does
it (§6). Not application logic, not a "have we sent it?" SELECT.

**⑤ Delete-photo and status are one transaction.** The state machine already
drops `awaiting_approval` → `in_progress` when evidence is removed. That
demotion and the key deletion commit together or not at all — evidence and
status can never disagree, which is exactly what W22's reviewer is trusting.

**⑥ RBAC on the route, from the shared map.** `can(role, capability)` runs in a
Fastify `preHandler`. The clients keep rendering blocked actions
visible-and-disabled-with-a-lock (§7 gate 9) — that stays a UI concern; the
route is what actually refuses. `DriverJobsRepo` has no `approve` and no
`setStatus` by design, and the driver token is rejected on those routes
regardless of what any client sends.

**Uploads.** `POST /uploads/presign` returns a presigned PUT for a key the
server chooses (`jobs/{jobId}/{step}/{slot}/{uuid}.jpg`) — the client never
picks the key and never gets blanket bucket write. Client PUTs to S3, then calls
`capturePhoto` with the key. Content-length and content-type are pinned in the
presign. That also retires `UploadWorkScreen`'s timer-instead-of-a-transfer
shortcut, which is currently the largest fake in the app.

---

## 6 · The customer email

W22 renders it as *already sent*, and the send-back path warns that the customer
was told the job was complete. So the send is a fact the office UI depends on —
it cannot be best-effort.

Also not a reason for a message broker. Transactional outbox:

1. `submit()` inserts `outbox(kind='job_complete', job_id, payload)` **in the
   same transaction** as the status change. The partial unique index makes a
   second submit a no-op insert.
2. A worker polls unsent rows every 10s, sends via Resend, stamps `sent_at`.
3. Failures increment `attempts` and back off. Nothing is lost on a crash
   between commit and send.

Body per §8 Q2 (resolved): no `J1-…` / `CR-…` literals. *"Container returned and
chassis returned; 9 photos are attached."* Attachments are presigned GET links
to the nine evidence keys, not inlined bytes.

Suppressed when `customers.notify_on_completion` is false (W15/W16's toggle).

---

## 7 · Deliberately not building

| Skipped | Add when |
|---|---|
| WebSockets for chat | `hasUnreadThreads()` is a boolean the tab badge polls. 30s polling covers it. Add when someone asks for typing indicators or sub-second delivery |
| Push notifications | `notifications` rows + polling first. Add FCM/APNs when drivers say they miss assignments with the app closed — that's a real trigger, not a guess |
| Redis | Nothing to cache yet; 11 jobs. Add when a query is measurably slow |
| An ORM | ~30 queries. Add when there are 200 |
| GraphQL | Two known clients, both already typed against fixed shapes |
| Refresh-token rotation/families | Add with the first security review. Plain refresh tokens with revocation-on-logout for now |
| Audit log | The defect record and `outbox` are the two legally interesting trails and both are already INSERT-only |
| Rate limiting beyond login | Login gets it on day one (§8 Phase 1). The rest when there is traffic |
| Self-serve signup | **Never.** Spec: drivers are added by an admin. There is no such endpoint |

---

## 8 · Phases

Each phase leaves both apps runnable. No big-bang cutover — the swap is
per-domain, and a domain still on the mock keeps working next to one on the API.

**Phase 0 — foundation.** `packages/domain` (move state machine + RBAC +
contracts, re-export, both clients still green). `api` skeleton, Postgres via
Docker Compose, migrations, seed from `fixtures.json`. *Done when:* `psql` shows
11 jobs and `npm run typecheck` is clean in all three packages.

**Phase 1 — auth + RBAC.** `POST /auth/login`, `/logout`, `GET /auth/me`,
`/auth/users`, `POST /auth/reset-request`. Argon2, JWT, the RBAC preHandler,
login rate limit. `AuthError` codes map 1:1 to the four the contract declares,
so M2-error and W1-error stay reachable. *Done when:* both apps log in against
the API with their fixture credentials.

**Phase 2 — reads, all 8 domains.** `list`/`get` for jobs, drivers, customers,
fleet, payroll, chat, notifications. Label computation (§4). Both clients swap
their read imports. *Done when:* every screen renders from Postgres with the
mock deleted from the read path, and the §7 visual gates still pass.

**Phase 3 — driver writes.** The nine `DriverJobsRepo` methods, S3 presign, the
state machine wired into every one. *Done when:* a full job runs end-to-end on
the simulator — pre-trip → pickup+seal → load → delivery → submit — and a
`curl` that skips a photo gets `422`, not a completed job.

**Phase 4 — admin writes.** `create`/`update`/`approve`/`sendBack`, leg-split
validation, payroll accrual on approve, mark-as-paid, customer/driver/fleet
mutations, CSV export server-side. *Done when:* approve moves a job to done,
accrues its legs exactly once, and a replayed approve changes nothing.

**Phase 5 — email + notifications.** Outbox, worker, the seven notification
triggers from §6.8, prefs. *Done when:* submit sends one email, a replayed
submit sends zero, and the driver's Alerts tab fills from real triggers.

Phases 1–2 are the unblocking half; 3–5 can overlap once the seam is proven.

---

## 9 · Open questions

**B1 · Hosting and environments.** Nothing in the handoff says where this runs.
Fly/Render/ECS all work; the choice sets the CI shape and the S3 region.
*Blocking Phase 0's compose-vs-managed-Postgres decision — needs an answer.*

**B2 · Who owns the driver's password today?** Fixtures ship one shared
credential (`a3transport`). Real drivers need an invite flow — admin adds the
driver, driver gets an email with a set-password link. W9 "Add driver" has no
password field, so that flow does not exist in the design yet. *Assumed default:*
reuse the M3 reset-link mechanism as the invite link. One code path, no new
screen. Say otherwise before Phase 1.

**B3 · Photo retention.** Nine evidence photos × every job, forever, is the
legal-record reading. *Assumed default:* keep forever, S3 lifecycle to
infrequent-access at 90 days. Cheap, reversible.

**B4 · Timezone.** `America/Chicago` assumed throughout §4 (Houston, per the
state machine's own comment). If A3 runs terminals in another zone, the column
is already there — the default changes.

---

## 10 · Pushback

**The riskiest thing here is not the schema, it is §1.2.** If the backend is
written in a language that cannot run `jobStateMachine.ts`, that file gets
reimplemented, and then there are two definitions of "nine photos, seal
photographed twice, a defect needs a note" — one of which will quietly rot. The
gates are the product. Everything else is CRUD.

**Do not let "the mock is basically the backend" become "port the mock."**
`data/mock/*.ts` is in-memory and single-user; its concurrency story is that
there isn't one. §5 is the part that has no mock equivalent and it is where the
real work is.

**Phase 2 is bigger than it looks and it is where the schedule slips.** It is
not 16 SELECTs — it is §4, the label layer, on every domain at once. Budget for
it accordingly.
