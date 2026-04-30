-- Remove redundant cron jobs that duplicate work already covered by orchestrator + queue worker
-- Rollback: re-create with cron.schedule() if needed

-- Redundant fast-lane direct call (orchestrator-fast-lane every 15min already covers this)
SELECT cron.unschedule(9);

-- Redundant deep-dive direct calls (orchestrator-deep-dive hourly already enqueues these via queue)
SELECT cron.unschedule(3);
SELECT cron.unschedule(10);