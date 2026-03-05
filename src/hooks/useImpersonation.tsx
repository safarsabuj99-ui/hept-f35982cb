import { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

const STORAGE_KEY = "impersonate_client_id";

export function useImpersonation() {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [impersonatingClientId, setImpersonatingClientId] = useState<string | null>(
    () => sessionStorage.getItem(STORAGE_KEY)
  );

  // On mount, pick up ?impersonate= param if admin
  useEffect(() => {
    const paramId = searchParams.get("impersonate");
    if (paramId && role === "admin") {
      sessionStorage.setItem(STORAGE_KEY, paramId);
      setImpersonatingClientId(paramId);
      // Remove query param from URL
      searchParams.delete("impersonate");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, role, setSearchParams]);

  const isImpersonating = role === "admin" && !!impersonatingClientId;

  const effectiveClientId = isImpersonating ? impersonatingClientId! : user?.id ?? null;

  const stopImpersonating = useCallback(() => {
    const clientId = sessionStorage.getItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_KEY);
    setImpersonatingClientId(null);
    navigate(clientId ? `/admin/clients/${clientId}` : "/admin");
  }, [navigate]);

  return { impersonatingClientId, isImpersonating, effectiveClientId, stopImpersonating };
}
