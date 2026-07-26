import { ClientSearchCommand } from "@/components/dashboard/ClientSearchCommand";
import { MobileDoubleTapSearch } from "@/components/MobileDoubleTapSearch";
import { useGlobalClientSearch } from "@/hooks/useGlobalClientSearch";

/**
 * Layout-level mount for the global ⌘K / Ctrl+K client search popup.
 *
 * This is the ONLY place the search dialog actually renders. Every other
 * caller (dashboard search bar, mobile bottom pill, double-tap gesture)
 * just flips the shared `useSearchDialog` store open, avoiding stacked
 * dialogs and the "close animation then another dialog appears" bug.
 */
export function GlobalSearchMount() {
  const { data: clients } = useGlobalClientSearch();
  const list = clients ?? [];
  return (
    <>
      <ClientSearchCommand clients={list} mode="hotkey-only" />
      <MobileDoubleTapSearch />
    </>
  );
}
