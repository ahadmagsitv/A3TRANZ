-- Where to push. One row per device, keyed by the FCM registration token —
-- the token IS the device, so re-registering the same one just moves it to
-- whoever is signed in now (a shared phone must not keep notifying the
-- previous driver).
CREATE TABLE device_tokens (
  token        text PRIMARY KEY,
  user_id      text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform     text NOT NULL CHECK (platform IN ('ios','android')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX device_tokens_by_user ON device_tokens (user_id);
