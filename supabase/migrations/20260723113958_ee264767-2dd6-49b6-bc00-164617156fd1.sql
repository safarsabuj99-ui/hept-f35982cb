-- 1. Add mfs_fee_percent to payment_requests
ALTER TABLE public.payment_requests
  ADD COLUMN IF NOT EXISTS mfs_fee_percent numeric;

-- 2. Add fee context to refunds
ALTER TABLE public.refunds
  ADD COLUMN IF NOT EXISTS mfs_fee_percent numeric,
  ADD COLUMN IF NOT EXISTS effective_rate numeric;

-- 3. Backfill mfs_fee_percent for existing approved MFS payments
--    Derive: fee% = 1 - (final_amount_usd * avg_rate) / amount_bdt
WITH derived AS (
  SELECT
    pr.id,
    CASE
      WHEN pr.final_amount_usd IS NULL OR pr.final_amount_usd <= 0 OR pr.amount_bdt <= 0 THEN NULL
      WHEN jsonb_typeof(pr.exchange_rate_snapshot) = 'number'
        THEN GREATEST(0, LEAST(10,
          ROUND((1 - ((pr.final_amount_usd * (pr.exchange_rate_snapshot)::text::numeric) / pr.amount_bdt)) * 100, 4)
        ))
      WHEN jsonb_typeof(pr.exchange_rate_snapshot) = 'object' THEN
        GREATEST(0, LEAST(10,
          ROUND((1 - (
            (pr.final_amount_usd * (
              SELECT AVG((value)::text::numeric)
              FROM jsonb_each(pr.exchange_rate_snapshot)
              WHERE (value)::text::numeric > 0
            )) / pr.amount_bdt
          )) * 100, 4)
        ))
      ELSE NULL
    END AS fee_pct
  FROM public.payment_requests pr
  WHERE pr.status = 'approved'
    AND LOWER(COALESCE(pr.payment_method::text, '')) IN ('bkash', 'nagad')
    AND pr.mfs_fee_percent IS NULL
)
UPDATE public.payment_requests pr
SET mfs_fee_percent = d.fee_pct
FROM derived d
WHERE pr.id = d.id AND d.fee_pct IS NOT NULL AND d.fee_pct > 0.01;