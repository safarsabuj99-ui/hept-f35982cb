import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type KeywordAvailability =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "available" }
  | { state: "taken"; ownerName: string; ownerId: string }
  | { state: "self" }; // already used by the same client — allowed

interface Options {
  /**
   * The keyword the admin is typing.
   */
  keyword: string;
  /**
   * The client this keyword is being saved for. Conflicts with this same
   * client are considered "self" and are allowed (e.g. the same client
   * reusing the keyword across multiple of their own ad accounts).
   * Pass null when creating a brand-new client.
   */
  selfClientId: string | null;
  /**
   * Skip the check entirely (e.g. field is empty or component unmounted).
   */
  enabled?: boolean;
  /**
   * Debounce in ms. Defaults to 400ms.
   */
  debounceMs?: number;
}

/**
 * Live "is this keyword available?" check, scoped to the current admin's
 * organization. Looks across BOTH `profiles.mapping_keyword` and
 * `ad_account_clients.mapping_keyword`. Case-insensitive, trim-insensitive.
 */
export function useKeywordAvailability({
  keyword,
  selfClientId,
  enabled = true,
  debounceMs = 400,
}: Options): KeywordAvailability {
  const [result, setResult] = useState<KeywordAvailability>({ state: "idle" });

  useEffect(() => {
    const trimmed = (keyword || "").trim();
    if (!enabled || !trimmed) {
      setResult({ state: "idle" });
      return;
    }

    let cancelled = false;
    setResult({ state: "checking" });

    const handle = setTimeout(async () => {
      try {
        const lower = trimmed.toLowerCase();

        // Find the current admin's org_id
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          if (!cancelled) setResult({ state: "idle" });
          return;
        }
        const { data: meProfile } = await supabase
          .from("profiles")
          .select("org_id")
          .eq("user_id", user.id)
          .maybeSingle();
        const orgId = meProfile?.org_id;
        if (!orgId) {
          if (!cancelled) setResult({ state: "idle" });
          return;
        }

        // 1. Check profiles
        const { data: profileMatches } = await supabase
          .from("profiles")
          .select("user_id, full_name, mapping_keyword")
          .eq("org_id", orgId)
          .not("mapping_keyword", "is", null);

        const profileHit = (profileMatches || []).find(
          (p: any) => (p.mapping_keyword || "").trim().toLowerCase() === lower,
        );

        // 2. Check ad_account_clients
        const { data: aacMatches } = await supabase
          .from("ad_account_clients")
          .select("client_id, mapping_keyword")
          .eq("org_id", orgId)
          .neq("mapping_keyword", "");

        const aacHit = (aacMatches || []).find(
          (a: any) => (a.mapping_keyword || "").trim().toLowerCase() === lower,
        );

        if (cancelled) return;

        const hitClientId = profileHit?.user_id || aacHit?.client_id || null;

        if (!hitClientId) {
          setResult({ state: "available" });
          return;
        }

        if (selfClientId && hitClientId === selfClientId) {
          setResult({ state: "self" });
          return;
        }

        let ownerName = profileHit?.full_name as string | undefined;
        if (!ownerName && aacHit) {
          const { data: owner } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("user_id", aacHit.client_id)
            .maybeSingle();
          ownerName = owner?.full_name || "Unknown";
        }

        setResult({
          state: "taken",
          ownerName: ownerName || "Unknown",
          ownerId: hitClientId,
        });
      } catch {
        if (!cancelled) setResult({ state: "idle" });
      }
    }, debounceMs);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [keyword, selfClientId, enabled, debounceMs]);

  return result;
}
