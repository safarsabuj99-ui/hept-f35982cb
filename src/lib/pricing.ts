/**
 * Centralized pricing utility — single source of truth for client platform rates.
 * Prevents bugs where components check only one of flat_rates / platform_rates.
 */

export interface PlatformRates {
  meta: number;
  tiktok: number;
  google: number;
  [key: string]: number;
}

const DEFAULT_RATES: PlatformRates = { meta: 120, tiktok: 120, google: 120 };

/**
 * Extract per-platform BDT billing rates from a client's pricing_config JSONB.
 * Priority: flat_rates → platform_rates → defaults (120).
 */
export function getPlatformRates(pricingConfig: any): PlatformRates {
  const rates = pricingConfig?.flat_rates || pricingConfig?.platform_rates || {};
  return {
    meta: Number(rates.meta) || DEFAULT_RATES.meta,
    tiktok: Number(rates.tiktok) || DEFAULT_RATES.tiktok,
    google: Number(rates.google) || DEFAULT_RATES.google,
  };
}

/**
 * Get the rate for a single platform from pricing_config.
 */
export function getPlatformRate(pricingConfig: any, platform: string): number {
  const rates = getPlatformRates(pricingConfig);
  return (rates as any)[platform] ?? 120;
}
