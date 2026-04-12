import { supabase } from "@/integrations/supabase/client";

/**
 * Atomically adjust a platform_account balance by reading fresh from DB first.
 * @param accountId - the account to adjust
 * @param delta - positive to add, negative to subtract
 * @returns true if successful
 */
export async function adjustPlatformAccountBalance(accountId: string, delta: number): Promise<boolean> {
  const { data, error: readErr } = await supabase
    .from("platform_accounts")
    .select("current_balance_bdt")
    .eq("id", accountId)
    .single();

  if (readErr || !data) return false;

  const newBalance = Number(data.current_balance_bdt) + delta;
  const { error: updateErr } = await supabase
    .from("platform_accounts")
    .update({ current_balance_bdt: newBalance })
    .eq("id", accountId);

  return !updateErr;
}
