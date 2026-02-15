
-- Step 1: Add new role value to enum (must be committed before use)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'manager';
