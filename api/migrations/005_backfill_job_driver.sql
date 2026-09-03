-- Jobs created through the console before the owner was derived from the legs
-- carry driver_id = NULL: the form assigns a driver per leg and never sent a
-- top-level one, so nobody owned the job and the capture flow refused every
-- driver on it.
--
-- The owner is the pickup leg's driver — whoever starts the job, does the
-- pre-trip and submits it. Falls back to any leg that has one, and leaves
-- genuinely unassigned jobs alone.
UPDATE jobs j
   SET driver_id = COALESCE(
         (SELECT l.driver_id FROM job_legs l
           WHERE l.job_id = j.id AND l.kind = 'pickup' AND l.driver_id IS NOT NULL),
         (SELECT l.driver_id FROM job_legs l
           WHERE l.job_id = j.id AND l.driver_id IS NOT NULL
           ORDER BY l.ordinal LIMIT 1)
       )
 WHERE j.driver_id IS NULL;
