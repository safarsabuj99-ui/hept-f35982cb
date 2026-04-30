import { ClientSearchCommand } from "@/components/dashboard/ClientSearchCommand";
import { MobileDoubleTapSearch } from "@/components/MobileDoubleTapSearch";
import { useGlobalClientSearch } from "@/hooks/useGlobalClientSearch";

/**
 * Layout-level mount for the global ⌘K / Ctrl+K client search popup.
 * Renders no visible UI — just attaches the keyboard listener and dialog
 * so the popup is reachable from every agency page.
 *
 * Also mounts the mobile double-tap-anywhere gesture that opens the same popup.
 */
export function GlobalSearchMount() {
  const { data: clients } = useGlobalClientSearch();
  const list = clients ?? [];
  return (
    <>
      <ClientSearchCommand clients={list} mode="hotkey-only" />
      <MobileDoubleTapSearch clients={list} />
    </>
  );
}
