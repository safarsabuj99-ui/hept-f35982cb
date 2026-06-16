-- Drop the overly-broad active-job unique index that blocked chunked sync jobs.
DROP INDEX IF EXISTS public.idx_sync_jobs_unique_active;

-- Keep the per-window uniqueness rule (already exists) — sync_jobs_unique_active_chunk
-- prevents duplicate (ad_account_id, function_name, date_from) pending/processing jobs,
-- which is exactly what we need for chunked schedules.