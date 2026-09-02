-- A3TRANZ initial schema (BACKEND_PLAN §3).
-- One file: there is no production data to migrate yet. Split at the first
-- deploy that has any.
CREATE EXTENSION IF NOT EXISTS citext;


-- ── people ───────────────────────────────────────────────────────────────────
-- One table, six roles. A driver is a user whose role is 'driver'; two tables
-- would have meant two login paths for one login form.
CREATE TYPE role AS ENUM ('admin','manager','assistant_manager',
                          'project_manager','dispatcher','driver');

CREATE TABLE users (
  id            text PRIMARY KEY,
  email         citext UNIQUE NOT NULL,
  password_hash text NOT NULL,
  name          text NOT NULL,
  initials      text NOT NULL,
  role          role NOT NULL,
  phone         text,
  base          text NOT NULL DEFAULT '',
  active        boolean NOT NULL DEFAULT true,
  joined_at     timestamptz NOT NULL DEFAULT now(),
  last_active_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE password_resets (
  token_hash text PRIMARY KEY,
  user_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz
);

-- ── customers ────────────────────────────────────────────────────────────────
CREATE TABLE customers (
  id                   text PRIMARY KEY,
  name                 text NOT NULL,
  short_name           text NOT NULL,
  email                citext,
  contact_name         text,
  phone                text,
  -- Gates the §6 completion email. W15/W16's per-customer toggle.
  notify_on_completion boolean NOT NULL DEFAULT true,
  customer_since       date,
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- ── fleet ────────────────────────────────────────────────────────────────────
CREATE TYPE unit_kind   AS ENUM ('truck','chassis');
CREATE TYPE unit_status AS ENUM ('in_service','in_use','out_of_service');

CREATE TABLE fleet_units (
  id                 text PRIMARY KEY,             -- TRK-118 / CH-4402
  kind               unit_kind NOT NULL,
  label              text NOT NULL,
  plate              text,
  status             unit_status NOT NULL DEFAULT 'in_service',
  on_job_id          text,
  last_inspection_at timestamptz,
  next_due_at        timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- ── jobs ─────────────────────────────────────────────────────────────────────
CREATE TYPE job_status AS ENUM ('pending','in_progress','blocked',
                                'awaiting_approval','done');
-- No 'overdue' member, deliberately. OVERDUE is derived — past due and not
-- done — and a stored copy goes stale the moment a due date passes with
-- nobody writing. See contracts/jobs.ts §R3.
CREATE TYPE job_step   AS ENUM ('pretrip','pickup','load','delivery');
CREATE TYPE job_type   AS ENUM ('import','export','empty');
CREATE TYPE priority   AS ENUM ('high','medium','low');
CREATE TYPE leg_kind   AS ENUM ('pickup','loading','delivery');

CREATE TABLE jobs (
  id                text PRIMARY KEY,              -- 'A3-0421', never '#A3-0421'
  title             text NOT NULL,
  customer_id       text NOT NULL REFERENCES customers(id),
  type              job_type NOT NULL,
  priority          priority NOT NULL DEFAULT 'medium',
  status            job_status NOT NULL DEFAULT 'pending',
  step              job_step NOT NULL DEFAULT 'pretrip',
  driver_id         text REFERENCES users(id),
  pickup_location   text NOT NULL,
  delivery_location text NOT NULL,
  address           text NOT NULL DEFAULT '',
  map_query         text,
  assigned_at       timestamptz NOT NULL DEFAULT now(),
  due_at            timestamptz NOT NULL,
  -- The calendar `isDueToday` is read in. The device's zone is the wrong
  -- clock: a phone five hours east of Houston turns a job due 17:00 local
  -- into tomorrow's job and the urgency ink silently disappears.
  timezone          text NOT NULL DEFAULT 'America/Chicago',
  container_no      text,
  seal_no           text,
  truck_id          text REFERENCES fleet_units(id),
  chassis_id        text REFERENCES fleet_units(id),
  price_cents       integer CHECK (price_cents IS NULL OR price_cents >= 0),
  description       text,
  instructions      text,
  submitted_at      timestamptz,
  approved_at       timestamptz,
  -- Optimistic concurrency. Two dispatchers with W4 open on the same job stop
  -- being a silent last-write-wins.
  version           integer NOT NULL DEFAULT 1,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON jobs (driver_id, status);
CREATE INDEX ON jobs (status, due_at);

CREATE TABLE job_legs (
  job_id       text NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  kind         leg_kind NOT NULL,
  driver_id    text REFERENCES users(id),
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  ordinal      smallint NOT NULL,
  PRIMARY KEY (job_id, kind)
);

-- ── ① pre-trip ───────────────────────────────────────────────────────────────
CREATE TYPE inspection_result AS ENUM ('pass','defect');

CREATE TABLE inspection_items (
  job_id    text NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  item_id   text NOT NULL,
  result    inspection_result,
  note      text,
  photo_key text,
  PRIMARY KEY (job_id, item_id),
  -- §6.1's "a ✗ with no note is invalid" as a constraint, not a code path.
  CONSTRAINT defect_needs_note
    CHECK (result IS DISTINCT FROM 'defect' OR btrim(coalesce(note,'')) <> '')
);

-- The legal record of why a unit went out of service. INSERT-only: no UPDATE
-- grant, no DELETE grant. W18 quotes and attributes it, never edits it.
CREATE TABLE defects (
  id          text PRIMARY KEY,
  unit_id     text NOT NULL REFERENCES fleet_units(id),
  job_id      text NOT NULL REFERENCES jobs(id),
  item        text NOT NULL,
  note        text NOT NULL CHECK (btrim(note) <> ''),
  reported_by text NOT NULL REFERENCES users(id),
  reported_at timestamptz NOT NULL DEFAULT now(),
  photo_key   text
);

-- ── ②③④ evidence ─────────────────────────────────────────────────────────────
-- Keys only. Labels, hints and ordering are rebuilt on read from SLOT_SPECS,
-- so a copy change ships without a data migration.
CREATE TABLE job_evidence (
  job_id      text NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  step        job_step NOT NULL CHECK (step <> 'pretrip'),
  slot_index  smallint NOT NULL,
  s3_key      text NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, step, slot_index)
);

-- M10 loose uploads. NOT evidence. Driver-deletable (plan §8 Q5).
CREATE TABLE job_photos (
  id          text PRIMARY KEY,
  job_id      text NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  s3_key      text NOT NULL,
  alt         text NOT NULL DEFAULT '',
  uploaded_by text NOT NULL REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE job_attachments (
  id         text PRIMARY KEY,
  job_id     text NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  name       text NOT NULL,
  size_bytes bigint NOT NULL DEFAULT 0,
  s3_key     text NOT NULL,
  -- origin='admin' documents are download-only for drivers (plan §8 Q5).
  origin     text NOT NULL CHECK (origin IN ('admin','driver')),
  kind       text NOT NULL CHECK (kind IN ('document','photo')),
  step       job_step,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── chat ─────────────────────────────────────────────────────────────────────
CREATE TABLE threads (
  id         text PRIMARY KEY,
  job_id     text NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  driver_id  text NOT NULL REFERENCES users(id),
  admin_id   text NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE messages (
  id             text PRIMARY KEY,
  thread_id      text NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  author_id      text NOT NULL REFERENCES users(id),
  body           text NOT NULL,
  attachment_key text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON messages (thread_id, created_at DESC);

-- Unread is derived from this, never a stored counter that can drift out of
-- sync with the messages it counts.
CREATE TABLE thread_reads (
  thread_id    text NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  user_id      text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (thread_id, user_id)
);

CREATE TABLE job_notes (
  id         text PRIMARY KEY,
  job_id     text NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  author_id  text NOT NULL REFERENCES users(id),
  body       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── payroll ──────────────────────────────────────────────────────────────────
-- A period is ONE company-wide row; the driver's M24/M25 view is a projection.
-- Modelling it per-driver would make W19's driverCount a sum over rows that
-- could disagree. See contracts/payroll.ts §R-P1.
CREATE TYPE pay_status AS ENUM ('accruing','held','payable','paid');

CREATE TABLE pay_periods (
  id         text PRIMARY KEY,
  label      text NOT NULL,
  starts_on  date NOT NULL,
  ends_on    date NOT NULL,
  status     pay_status NOT NULL DEFAULT 'accruing',
  closes_at  timestamptz NOT NULL,
  pays_at    timestamptz NOT NULL,
  reference  text,
  paid_at    timestamptz,
  method     text,
  UNIQUE (starts_on, ends_on)
);

CREATE TABLE pay_lines (
  period_id    text NOT NULL REFERENCES pay_periods(id) ON DELETE CASCADE,
  job_id       text NOT NULL REFERENCES jobs(id),
  leg_kind     leg_kind NOT NULL,
  driver_id    text NOT NULL REFERENCES users(id),
  amount_cents integer NOT NULL CHECK (amount_cents >= 0),
  -- This is what stops an approve retry double-paying a leg.
  PRIMARY KEY (period_id, job_id, leg_kind)
);
CREATE INDEX ON pay_lines (driver_id, period_id);

-- ── notifications ────────────────────────────────────────────────────────────
CREATE TYPE notification_kind AS ENUM ('job_assigned','job_updated','message',
                                       'overdue','approved','period_paid',
                                       'unit_out_of_service');

CREATE TABLE notifications (
  id         text PRIMARY KEY,
  user_id    text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       notification_kind NOT NULL,
  title      text NOT NULL,
  body       text NOT NULL,
  job_id     text REFERENCES jobs(id) ON DELETE CASCADE,
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON notifications (user_id, created_at DESC);

CREATE TABLE notification_prefs (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind    notification_kind NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  PRIMARY KEY (user_id, kind)
);

-- ── outbox ───────────────────────────────────────────────────────────────────
-- Transactional outbox (§6). The customer is told exactly once: the row is
-- inserted in the same transaction as the status change, and this partial
-- unique index makes a replayed submit a no-op insert rather than a resend.
CREATE TABLE outbox (
  id         bigserial PRIMARY KEY,
  kind       text NOT NULL,
  job_id     text REFERENCES jobs(id) ON DELETE CASCADE,
  payload    jsonb NOT NULL,
  sent_at    timestamptz,
  attempts   integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX outbox_job_complete_once
  ON outbox (kind, job_id) WHERE kind = 'job_complete';
CREATE INDEX outbox_unsent ON outbox (created_at) WHERE sent_at IS NULL;
