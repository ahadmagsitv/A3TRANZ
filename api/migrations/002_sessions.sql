-- Opaque session tokens, not JWTs (BACKEND_PLAN §2 revised).
--
-- JWTs cannot be revoked, and this product needs revocation: W8-confirm
-- deactivates a driver and that has to log them out NOW, not in 15 minutes.
-- Bolting a denylist onto a JWT reintroduces exactly this table plus a
-- signature library and a refresh-token dance. So: a random token, hashed at
-- rest, one indexed lookup per request.
--
-- ponytail: one DB round-trip per authenticated request. At this scale that is
-- free; cache in Redis the day the lookup shows up in a profile.
CREATE TABLE sessions (
  token_hash   text PRIMARY KEY,
  user_id      text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at   timestamptz
);
CREATE INDEX ON sessions (user_id) WHERE revoked_at IS NULL;

-- Login throttling lives in the DB so it survives a restart and works with
-- more than one API process. Counts failures per email+ip over a window.
CREATE TABLE login_attempts (
  id         bigserial PRIMARY KEY,
  email      citext NOT NULL,
  ip         text NOT NULL,
  at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON login_attempts (email, at DESC);
CREATE INDEX ON login_attempts (ip, at DESC);
