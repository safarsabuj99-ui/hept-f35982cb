import { useCallback, useState } from "react";
import { ClientSearchCommand } from "@/components/dashboard/ClientSearchCommand";
import { useDoubleTapGesture } from "@/hooks/useDoubleTapGesture";
import type { GlobalSearchClient } from "@/hooks/useGlobalClientSearch";

interface Props {
  clients: GlobalSearchClient[];
}

/**
 * Mobile-only: double-tap anywhere on the page (away from controls) to open
 * the global client search popup. Reuses the same dialog as the ⌘K hotkey.
 */
export function MobileDoubleTapSearch({ clients }: Props) {
  const [open, setOpen] = useState(false);

  const handleDoubleTap = useCallback(() => {
    setOpen((prev) => (prev ? prev : true));
  }, []);

  useDoubleTapGesture(handleDoubleTap, { disabled: open });

  return (
    <ClientSearchCommand
      clients={clients}
      mode="hotkey-only"
      forceOpen={open}
      onOpenChange={setOpen}
    />
  );
}
