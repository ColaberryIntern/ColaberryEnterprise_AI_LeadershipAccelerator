-- Wire AI Mock Interview scores into the Architect Evaluation Agent's weekly
-- readiness aggregate (BC #10088637794). Additive/nullable — existing rows
-- (weeks with no interview taken) are unaffected.
BEGIN;

ALTER TABLE architect_evaluations ADD COLUMN IF NOT EXISTS interview_score INTEGER;

COMMIT;
