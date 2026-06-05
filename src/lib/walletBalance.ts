/**
 * Single source of truth for client wallet balances.
 *
 * Rules (must be applied EVERYWHERE balances are shown):
 *  1. Only `transactions.status = 'completed'` rows count toward balance.
 *  2. Per-platform totals are tracked for the known platforms (meta/tiktok/google).
 *     Untagged rows still affect the overall USD total but are not attributed
 *     to a platform bucket.
 *  3. For NEGATIVE totals, BDT debt is computed from each platform's negative
 *     bucket using that platform's billing rate from `pricing_config`.
 *     If no platform bucket is negative (i.e. only an untagged debit exists),
 *     fall back to the highest configured platform rate so the displayed BDT
 *     debt is never under-stated.
 *
 * If you need a balance number anywhere in the app, use this module.
 */
import { getPlatformRates } from "@/lib/pricing";

export const KNOWN_PLATFORMS = ["meta", "tiktok", "google"] as const;
export type KnownPlatform = (typeof KNOWN_PLATFORMS)[number];

export interface BalanceTxnInput {
  type: "credit" | "debit";
  amount: number | string;
  status?: string | null;
  platform?: string | null;
}

export interface PlatformBalances {
  meta: number;
  tiktok: number;
  google: number;
  /** Sum of credits/debits whose platform is NULL or not a known platform. */
  untagged: number;
}

export interface WalletBalance {
  /** Total USD balance (credits − debits) across ALL completed transactions. */
  total: number;
  /** Per-platform USD breakdown (completed only). */
  platforms: PlatformBalances;
}

const ZERO_PLATFORMS: PlatformBalances = { meta: 0, tiktok: 0, google: 0, untagged: 0 };

function isKnown(p: string | null | undefined): p is KnownPlatform {
  return !!p && (KNOWN_PLATFORMS as readonly string[]).includes(p);
}

/**
 * Compute a single client's wallet balance from raw transactions.
 * Filters to status='completed' internally — pass any subset safely.
 */
export function computeWalletBalance(txns: BalanceTxnInput[] | null | undefined): WalletBalance {
  const platforms: PlatformBalances = { ...ZERO_PLATFORMS };
  let total = 0;
  if (!txns) return { total, platforms };

  for (const t of txns) {
    if ((t.status ?? "completed") !== "completed") continue;
    const amt = Number(t.amount) || 0;
    const delta = t.type === "credit" ? amt : -amt;
    total += delta;
    if (isKnown(t.platform)) {
      platforms[t.platform] += delta;
    } else {
      platforms.untagged += delta;
    }
  }

  // Round to 2dp to avoid float dust mismatches between screens.
  total = Math.round(total * 100) / 100;
  (Object.keys(platforms) as (keyof PlatformBalances)[]).forEach((k) => {
    platforms[k] = Math.round(platforms[k] * 100) / 100;
  });

  return { total, platforms };
}

/**
 * BDT debt to display when a balance is negative.
 * Uses each platform's configured billing rate from pricing_config.
 *
 * Accepts either a full WalletBalance (preferred) or a partial platform map
 * shaped like { meta, tiktok, google } as returned by the dashboard RPC.
 */
export function computeBdtDebt(
  pricingConfig: any,
  source: WalletBalance | { total?: number; platforms?: Partial<PlatformBalances> } | { balance: number; platform_balances?: Record<string, number> },
): number {
  const rates = getPlatformRates(pricingConfig) as Record<string, number>;

  // Normalize the input into total + per-platform map
  let total = 0;
  const platBals: Partial<PlatformBalances> = {};

  if ("platforms" in source && source.platforms) {
    total = "total" in source ? Number(source.total ?? 0) : 0;
    Object.assign(platBals, source.platforms);
  } else if ("platform_balances" in source) {
    total = Number((source as any).balance ?? 0);
    const pb = (source as any).platform_balances || {};
    for (const p of KNOWN_PLATFORMS) platBals[p] = Number(pb[p]) || 0;
  } else {
    total = Number((source as any).total ?? 0);
  }

  if (total >= 0) return 0;

  let bdt = 0;
  for (const p of KNOWN_PLATFORMS) {
    const bal = Number(platBals[p]) || 0;
    if (bal < 0) {
      const rate = Number(rates[p]) || 120;
      bdt += Math.abs(bal) * rate;
    }
  }

  // No negative platform bucket but overall total is negative (untagged debit).
  // Use the highest configured rate so debt isn't under-displayed.
  if (bdt === 0) {
    const fallbackRate = Math.max(
      Number(rates.meta) || 0,
      Number(rates.tiktok) || 0,
      Number(rates.google) || 0,
      120,
    );
    bdt = Math.abs(total) * fallbackRate;
}

/**
 * Signed net BDT across all known platforms, each converted at its own rate.
 * Positive platform balances add, negative subtract.
 * Untagged USD is converted at the highest configured rate.
 */
export function computeNetBdt(
  pricingConfig: any,
  source: WalletBalance | { total?: number; platforms?: Partial<PlatformBalances> },
): number {
  const rates = getPlatformRates(pricingConfig) as Record<string, number>;
  const platBals: Partial<PlatformBalances> = {};
  let total = 0;

  if ("platforms" in source && source.platforms) {
    total = Number((source as any).total ?? 0);
    Object.assign(platBals, source.platforms);
  } else {
    total = Number((source as any).total ?? 0);
  }

  let bdt = 0;
  let knownSum = 0;
  for (const p of KNOWN_PLATFORMS) {
    const bal = Number(platBals[p]) || 0;
    const rate = Number(rates[p]) || 120;
    bdt += bal * rate;
    knownSum += bal;
  }

  // Untagged residual = total - sum(known buckets). Convert at highest rate.
  const untagged = Math.round((total - knownSum) * 100) / 100;
  if (untagged !== 0) {
    const fallbackRate = Math.max(
      Number(rates.meta) || 0,
      Number(rates.tiktok) || 0,
      Number(rates.google) || 0,
      120,
    );
    bdt += untagged * fallbackRate;
  }

  return Math.round(bdt * 100) / 100;
}

  return Math.round(bdt * 100) / 100;
}
