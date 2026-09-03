-- Threads are job-scoped: the driver app opens each one from its job, and the
-- office inbox lists them per job. One per job was always the intent but was
-- never enforced, so "start a chat with this driver" had no safe way to be
-- idempotent — two clicks could make two threads for the same job.
--
-- Collapse any duplicates first (keeping the oldest, and its messages), then
-- let the index do the deciding.
WITH keep AS (
  SELECT job_id, MIN(created_at) AS first_at FROM threads GROUP BY job_id
), dupes AS (
  SELECT t.id, (SELECT t2.id FROM threads t2
                 JOIN keep k ON k.job_id = t2.job_id AND k.first_at = t2.created_at
                WHERE t2.job_id = t.job_id LIMIT 1) AS keeper
    FROM threads t
    JOIN keep k ON k.job_id = t.job_id
   WHERE t.created_at > k.first_at
)
UPDATE messages m SET thread_id = d.keeper FROM dupes d WHERE m.thread_id = d.id;

DELETE FROM threads t
 USING (SELECT job_id, MIN(created_at) AS first_at FROM threads GROUP BY job_id) k
 WHERE t.job_id = k.job_id AND t.created_at > k.first_at;

CREATE UNIQUE INDEX threads_one_per_job ON threads (job_id);
