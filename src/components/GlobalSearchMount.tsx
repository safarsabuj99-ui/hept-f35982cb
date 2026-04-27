import { ClientSearchCommand } from "@/components/dashboard/ClientSearchCommand";
import { useGlobalClientSearch } from "@/hooks/useGlobalClientSearch";

/**
 * Layout-level mount for the global ⌘K / Ctrl+K client search popup.
 * Renders no visible UI — just attaches the keyboard listener and dialog
 * so the popup is reachable from every agency page.
 */
export function GlobalSearchMount() {
  const { data: clients } = useGlobalClientSearch();
  return <ClientSearchCommand clients={clients ?? []} mode="hotkey-only" />;
}
