import { useSyncExternalStore } from "react";

/**
 * Module-level store for the global client-search dialog open state.
 *
 * Only ONE `ClientSearchCommand` (mounted by `GlobalSearchMount`) renders
 * the actual Radix dialog; every other place — the dashboard search bar,
 * the mobile bottom pill, the ⌘K hotkey, the double-tap gesture — simply
 * calls `openSearch()` / `closeSearch()` here. This guarantees a single
 * dialog is ever in the DOM at once, so closing never reveals a ghost.
 */

let state = false;
const listeners = new Set<() => void>();
let closedAt = 0;

function emit() {
  for (const l of listeners) l();
}

export function openSearch() {
  if (state) return;
  state = true;
  emit();
}

export function closeSearch() {
  if (!state) return;
  state = false;
  closedAt = performance.now();
  emit();
}

export function setSearchOpen(next: boolean) {
  next ? openSearch() : closeSearch();
}

/** ms since the dialog last closed — used to gate the double-tap re-open. */
export function timeSinceSearchClosed(): number {
  return closedAt === 0 ? Infinity : performance.now() - closedAt;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot() {
  return state;
}

export function useSearchDialogOpen(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
