-- Defense-in-depth: explicitly deny DELETE on agency_expenses so expense history is permanent.
-- Drop any pre-existing delete policies to ensure deny-all takes effect.
DROP POLICY IF EXISTS "Admins can delete expenses" ON public.agency_expenses;
DROP POLICY IF EXISTS "Users can delete their own expenses" ON public.agency_expenses;
DROP POLICY IF EXISTS "Allow delete for authenticated" ON public.agency_expenses;

-- Explicit deny: no role can delete agency_expenses through PostgREST.
CREATE POLICY "Deny all deletes on agency_expenses"
ON public.agency_expenses
FOR DELETE
TO authenticated, anon
USING (false);