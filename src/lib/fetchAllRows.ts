/**
 * Paginated fetch helper to bypass Supabase's default 1000-row query cap.
 *
 * Supabase silently limits SELECT queries to 1000 rows by default, which
 * causes UI dashboards to display truncated/incorrect aggregates when the
 * result set is larger (e.g. multi-day metric pulls across many campaigns).
 *
 * This helper repeatedly invokes the provided builder() factory with
 * incrementing .range() windows until every row is loaded.
 *
 * Usage:
 *   const rows = await fetchAllRows<DailyMetric>(() =>
 *     supabase.from("daily_metrics").select("*").in("campaign_id", ids)
 *   );
 */
export async function fetchAllRows<T = any>(
  builder: () => any,
  pageSize = 1000
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  // Hard safety cap to prevent runaway loops (1M rows max)
  const maxIterations = 1000;
  let iteration = 0;

  while (iteration < maxIterations) {
    iteration += 1;
    const { data, error } = await builder().range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as T[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }

  // Sanity warning: if we hit a perfect multiple of pageSize without an
  // additional empty page, we may still have truncated. Helps catch future
  // regressions early.
  if (all.length > 0 && all.length % pageSize === 0) {
    // eslint-disable-next-line no-console
    console.debug(
      `[fetchAllRows] loaded ${all.length} rows (multiple of ${pageSize}) — verify completeness if data looks off.`
    );
  }

  return all;
}
