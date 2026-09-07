-- Direct threads: a conversation with a driver that is not about one job.
--
-- Job threads and the direct thread are separate streams on purpose — asking
-- "where's the BOL for A3-0042" and "your licence expires next month" are not
-- the same conversation, and collapsing them made the job thread unreadable.
--
-- `job_id` becomes nullable: NULL IS the direct thread. Two partial unique
-- indexes keep both kinds idempotent — one thread per job, one direct thread
-- per driver — so pressing Message twice can never fork a conversation.
ALTER TABLE threads ALTER COLUMN job_id DROP NOT NULL;

DROP INDEX threads_one_per_job;
CREATE UNIQUE INDEX threads_one_per_job
    ON threads (job_id) WHERE job_id IS NOT NULL;
CREATE UNIQUE INDEX threads_one_direct_per_driver
    ON threads (driver_id) WHERE job_id IS NULL;

-- A message notification has to be able to open its thread. `job_id` was doing
-- that job, and a direct thread has none — tapping one would go nowhere.
-- SET NULL, not CASCADE: the alert is a record of something that happened, and
-- deleting the thread must not rewrite the driver's history.
ALTER TABLE notifications
  ADD COLUMN thread_id text REFERENCES threads(id) ON DELETE SET NULL;
