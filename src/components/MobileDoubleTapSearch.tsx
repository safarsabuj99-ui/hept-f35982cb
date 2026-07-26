import { useCallback } from "react";
import { useDoubleTapGesture } from "@/hooks/useDoubleTapGesture";
import { openSearch, useSearchDialogOpen } from "@/hooks/useSearchDialog";

/**
 * Mobile-only: double-tap anywhere on the page (away from controls) to open
 * the global client search popup. Renders no UI — the dialog itself lives in
 * `GlobalSearchMount` and is toggled via the shared `useSearchDialog` store.
 */
export function MobileDoubleTapSearch() {
  const open = useSearchDialogOpen();

  const handleDoubleTap = useCallback(() => {
    openSearch();
  }, []);

  useDoubleTapGesture(handleDoubleTap, { disabled: open });

  return null;
}
