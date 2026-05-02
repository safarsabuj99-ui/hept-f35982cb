import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Users,
  UserPlus,
  ArrowRight,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Minus,
  Star,
  AlertTriangle,
  CornerDownLeft,
  Pause,
  Clock,
  EyeOff,
  Wallet,
  CreditCard,
  History,
  X,
  ChevronRight,
  Banknote,
} from "lucide-react";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { computeBdtDebt as sharedComputeBdtDebt } from "@/lib/walletBalance";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { createPortal } from "react-dom";
import { registerMobilePill, useIsTopMobilePill } from "@/components/ui/mobile-search-pill";
import { useHideOnScroll } from "@/hooks/use-hide-on-scroll";

interface ClientItem {
  user_id: string;
  full_name: string;
  email?: string;
  business_name?: string | null;
  balance: number;
  pricing_config?: any;
  platform_balances?: Record<string, number>;
  phone?: string | null;
  mapping_keyword?: string | null;
  is_active?: boolean;
  is_paused?: boolean;
  pending_payments?: number;
}

interface ClientSearchCommandProps {
  clients: ClientItem[];
  /**
   * "full" (default): visible trigger button + dialog. No global ⌘K listener
   *   (the layout-mounted instance owns the hotkey to avoid double-opens).
   * "hotkey-only": no visible trigger, only the dialog + ⌘K / Ctrl+K listener.
   *   Use this in layouts so the popup is reachable from every page.
   */
  mode?: "full" | "hotkey-only";
  /** Optional controlled open state (used by mobile double-tap mount). */
  forceOpen?: boolean;
  /** Callback when open state changes (paired with forceOpen). */
  onOpenChange?: (open: boolean) => void;
}

const AVATAR_GRADIENTS = [
  "from-blue-500/80 to-indigo-600/80",
  "from-violet-500/80 to-purple-600/80",
  "from-pink-500/80 to-rose-600/80",
  "from-amber-500/80 to-orange-600/80",
  "from-emerald-500/80 to-teal-600/80",
  "from-cyan-500/80 to-sky-600/80",
  "from-fuchsia-500/80 to-pink-600/80",
  "from-lime-500/80 to-emerald-600/80",
];

function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function getAvatarGradient(userId: string): string {
  return AVATAR_GRADIENTS[hashString(userId) % AVATAR_GRADIENTS.length];
}

function getInitials(name: string) {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "?"
  );
}

function formatMoney(n: number): string {
  return Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatCompactBdt(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 100000) return `৳${(abs / 1000).toFixed(0)}k`;
  if (abs >= 10000) return `৳${(abs / 1000).toFixed(1)}k`;
  return `৳${abs.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}



function computeBdtDebt(client: ClientItem): number {
  return sharedComputeBdtDebt(client.pricing_config, {
    balance: Number(client.balance) || 0,
    platform_balances: client.platform_balances ?? {},
  });
}

const RECENTS_LIMIT = 5;
function recentsKey(userId?: string | null) {
  return `hept_recent_clients_${userId ?? "anon"}`;
}
function readRecents(userId?: string | null): string[] {
  try {
    const raw = localStorage.getItem(recentsKey(userId));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string").slice(0, RECENTS_LIMIT) : [];
  } catch {
    return [];
  }
}
function pushRecent(userId: string | null | undefined, clientId: string) {
  try {
    const cur = readRecents(userId);
    const next = [clientId, ...cur.filter((id) => id !== clientId)].slice(0, RECENTS_LIMIT);
    localStorage.setItem(recentsKey(userId), JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function ClientSearchCommand({ clients, mode = "full", forceOpen, onOpenChange }: ClientSearchCommandProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = forceOpen !== undefined;
  const open = isControlled ? !!forceOpen : internalOpen;
  const setOpen = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      const resolved = typeof next === "function" ? (next as (p: boolean) => boolean)(open) : next;
      if (!isControlled) setInternalOpen(resolved);
      onOpenChange?.(resolved);
    },
    [isControlled, onOpenChange, open],
  );
  const isHotkeyOnly = mode === "hotkey-only";
  const isMobile = useIsMobile();
  const [query, setQuery] = useState("");
  const [activeMenuFor, setActiveMenuFor] = useState<string | null>(null);
  const [recents, setRecents] = useState<string[]>([]);
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.id;

  // Load recents whenever popup opens or user changes
  useEffect(() => {
    if (open) {
      setRecents(readRecents(userId));
      setQuery("");
      setActiveMenuFor(null);
    }
  }, [open, userId]);

  // Only the layout-mounted ("hotkey-only") instance listens for ⌘K to avoid
  // double-toggling when both the dashboard's visible bar and the layout mount
  // are present at the same time.
  useEffect(() => {
    if (!isHotkeyOnly) return;
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [isHotkeyOnly]);

  // Pre-compute heavy fields once per client.
  // - `_value` is a STABLE UNIQUE id (user_id) so cmdk never silently dedupes
  //   two clients that happen to share a name.
  // - `_keywords` carries every searchable token; cmdk passes this array as the
  //   3rd arg of `filter(value, search, keywords)`, which we use for matching.
  type EnrichedClient = ClientItem & { _bdtDebt: number; _value: string; _keywords: string[] };
  const enriched: EnrichedClient[] = useMemo(() => {
    return clients.map((c) => {
      const bdt = c.balance < 0 ? computeBdtDebt(c) : 0;
      const raw = [
        c.full_name,
        c.email ?? "",
        c.business_name ?? "",
        c.phone ?? "",
        c.mapping_keyword ?? "",
        c.balance > 0 ? Math.round(c.balance).toString() : "",
        c.balance < 0 ? Math.round(bdt).toString() : "",
        c.is_paused ? "paused" : "",
        (c.pending_payments ?? 0) > 0 ? "pending" : "",
        c.is_active === false ? "inactive" : "",
      ];
      const keywords = Array.from(
        new Set(
          raw
            .filter(Boolean)
            .map((s) => String(s).toLowerCase().trim())
            .filter(Boolean),
        ),
      );
      return { ...c, _bdtDebt: bdt, _value: c.user_id, _keywords: keywords };
    });
  }, [clients]);

  const { topClients, attentionClients, restClients, recentClients } = useMemo(() => {
    const sorted = [...enriched].sort((a, b) => a.full_name.localeCompare(b.full_name));
    const negatives = sorted
      .filter((c) => c.balance < 0)
      .sort((a, b) => b._bdtDebt - a._bdtDebt); // largest debt first
    const positives = sorted
      .filter((c) => c.balance > 0)
      .sort((a, b) => b.balance - a.balance);
    const top = positives.slice(0, 3);
    const topIds = new Set(top.map((c) => c.user_id));
    const negIds = new Set(negatives.map((c) => c.user_id));

    // Recents: only those still present, in stored order, excluded from other groups
    const byId = new Map(enriched.map((c) => [c.user_id, c]));
    const recentList: EnrichedClient[] = recents
      .map((id) => byId.get(id))
      .filter((x): x is EnrichedClient => !!x);
    const recentIds = new Set(recentList.map((c) => c.user_id));

    const rest = sorted.filter(
      (c) => !topIds.has(c.user_id) && !negIds.has(c.user_id) && !recentIds.has(c.user_id),
    );
    const topFiltered = top.filter((c) => !recentIds.has(c.user_id));
    const negFiltered = negatives.filter((c) => !recentIds.has(c.user_id));

    return {
      topClients: topFiltered,
      attentionClients: negFiltered,
      restClients: rest,
      recentClients: recentList,
    };
  }, [enriched, recents]);

  // Portfolio totals for KPI strip
  const portfolio = useMemo(() => {
    let usdCredit = 0;
    let bdtDebt = 0;
    let pausedCount = 0;
    let pendingCount = 0;
    for (const c of enriched) {
      if (c.balance > 0) usdCredit += c.balance;
      if (c.balance < 0) bdtDebt += c._bdtDebt;
      if (c.is_paused) pausedCount++;
      if ((c.pending_payments ?? 0) > 0) pendingCount++;
    }
    return { usdCredit, bdtDebt, pausedCount, pendingCount };
  }, [enriched]);

  const goTo = useCallback(
    (path: string, clientId?: string) => {
      if (clientId) pushRecent(userId, clientId);
      setOpen(false);
      navigate(path);
    },
    [navigate, userId],
  );

  const clearRecents = () => {
    try {
      localStorage.removeItem(recentsKey(userId));
    } catch {
      /* ignore */
    }
    setRecents([]);
  };

  const renderBadges = (c: EnrichedClient) => {
    const badges: JSX.Element[] = [];
    if (c.is_paused) {
      badges.push(
        <span
          key="paused"
          className="inline-flex items-center gap-0.5 rounded-full border border-destructive/30 bg-destructive/10 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-destructive"
        >
          <Pause className="h-2 w-2" /> Paused
        </span>,
      );
    }
    if ((c.pending_payments ?? 0) > 0) {
      badges.push(
        <span
          key="pending"
          className="inline-flex items-center gap-0.5 rounded-full border border-warning/30 bg-warning/10 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-warning"
        >
          <Clock className="h-2 w-2" /> {c.pending_payments} pay
        </span>,
      );
    }
    if (c.is_active === false && badges.length < 2) {
      badges.push(
        <span
          key="inactive"
          className="inline-flex items-center gap-0.5 rounded-full border border-muted-foreground/20 bg-muted/30 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-muted-foreground"
        >
          <EyeOff className="h-2 w-2" /> Off
        </span>,
      );
    }
    return badges.slice(0, 2);
  };

  const renderClientRow = (client: EnrichedClient) => {
    const positive = client.balance > 0;
    const negative = client.balance < 0;
    const gradient = getAvatarGradient(client.user_id);
    const TrendIcon = negative ? TrendingDown : positive ? TrendingUp : Minus;
    const badges = renderBadges(client);
    const isMenuOpen = activeMenuFor === client.user_id;

    return (
      <div key={client.user_id} className="relative">
        <CommandItem
          value={client._value}
          keywords={client._keywords}
          onSelect={() => goTo(`/admin/clients/${client.user_id}`, client.user_id)}
          className="group/row relative gap-3 rounded-lg px-3 py-2.5 my-0.5 data-[selected=true]:bg-gradient-to-r data-[selected=true]:from-primary/10 data-[selected=true]:via-primary/5 data-[selected=true]:to-transparent transition-all duration-200"
        >
          <span
            aria-hidden
            className="absolute left-0 top-1/2 -translate-y-1/2 h-7 w-[2px] rounded-r-full bg-primary opacity-0 group-data-[selected=true]/row:opacity-100 transition-opacity"
          />

          <div
            className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${gradient} ring-1 ring-white/10 shadow-inner`}
          >
            <span className="text-[11px] font-semibold tracking-wide text-white drop-shadow-sm">
              {getInitials(client.full_name)}
            </span>
          </div>

          <div className="flex flex-col min-w-0 flex-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-sm font-medium text-foreground truncate">
                {client.full_name}
              </span>
              {badges.length > 0 && (
                <div className="flex items-center gap-1 shrink-0">{badges}</div>
              )}
            </div>
            <span className="text-[11px] text-muted-foreground/70 truncate">
              {client.business_name || client.email || client.phone || "—"}
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <TrendIcon
              className={`h-3 w-3 ${
                positive ? "text-success" : negative ? "text-destructive" : "text-muted-foreground/50"
              }`}
            />
            <div className="flex flex-col items-end leading-tight">
              <span
                className={`text-sm font-semibold tabular-nums ${
                  positive ? "text-success" : negative ? "text-destructive" : "text-muted-foreground"
                }`}
              >
                {negative
                  ? `−৳${formatMoney(client._bdtDebt)}`
                  : positive
                  ? `$${formatMoney(client.balance)}`
                  : `$${formatMoney(0)}`}
              </span>
              <span className="text-[8px] uppercase tracking-[0.15em] text-muted-foreground/50 font-medium">
                {negative ? "BDT" : "USD"}
              </span>
            </div>
          </div>

          {/* Action toggle */}
          <button
            type="button"
            aria-label="Quick actions"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setActiveMenuFor(isMenuOpen ? null : client.user_id);
            }}
            className={`ml-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/50 hover:text-foreground hover:bg-muted/40 transition ${
              isMenuOpen ? "rotate-90 text-foreground bg-muted/40" : ""
            }`}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </CommandItem>

        {isMenuOpen && (
          <div className="ml-12 mr-2 mb-1.5 grid grid-cols-2 gap-1 rounded-lg border border-border/40 bg-background/40 p-1.5 backdrop-blur-sm">
            <ActionButton
              icon={<ArrowRight className="h-3 w-3" />}
              label="Open"
              onClick={() => goTo(`/admin/clients/${client.user_id}`, client.user_id)}
            />
            <ActionButton
              icon={<Banknote className="h-3 w-3" />}
              label="Add Funds"
              onClick={() => goTo(`/admin/add-funds`, client.user_id)}
            />
            <ActionButton
              icon={<Wallet className="h-3 w-3" />}
              label="Wallet"
              onClick={() => goTo(`/admin/finance?tab=wallet`, client.user_id)}
            />
            <ActionButton
              icon={<CreditCard className="h-3 w-3" />}
              label="Payments"
              onClick={() => goTo(`/admin/payment-requests`, client.user_id)}
            />
          </div>
        )}
      </div>
    );
  };

  const totalCount = clients.length;
  const isSearching = query.trim().length > 0;

  return (
    <>
      {!isHotkeyOnly && !isMobile && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group relative flex items-center w-full md:max-w-md h-11 px-4 rounded-xl border border-border/50 bg-gradient-to-br from-card/60 to-card/30 backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_8px_24px_-6px_hsl(var(--primary)/0.35)]"
        >
          <Search className="h-4 w-4 text-muted-foreground mr-2.5 transition-colors group-hover:text-primary" />
          <span className="text-sm text-muted-foreground/80 truncate">
            <span className="hidden sm:inline">Search clients by name, phone, business…</span>
            <span className="sm:hidden">Search clients…</span>
          </span>
          <div className="ml-auto flex items-center gap-2">
            <span className="relative hidden sm:flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-60 animate-ping" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
            </span>
            <kbd className="pointer-events-none hidden sm:inline-flex h-5 select-none items-center gap-1 rounded border border-border/60 bg-muted/60 px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
              <span className="text-xs">⌘</span>K
            </kbd>
          </div>
        </button>
      )}

      {/* Mobile: persistent One UI 8.5-style bottom pill trigger (only for "full" mode). */}
      {!isHotkeyOnly && isMobile && (
        <MobileGlobalSearchPill onOpen={() => setOpen(true)} />
      )}

      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay
            className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
          />
          <DialogPrimitive.Content
            onOpenAutoFocus={(e) => {
              // On mobile we focus the bottom-pinned input ourselves; on
              // desktop cmdk's CommandInput handles focus.
              if (isMobile) e.preventDefault();
            }}
            className={cn(
              "fixed z-50 outline-none overflow-hidden border bg-gradient-to-b from-card/95 via-card/90 to-card/85 backdrop-blur-2xl shadow-[0_24px_80px_-20px_hsl(var(--primary)/0.4)] border-border/40 max-h-[92vh]",
              "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
              isMobile
                ? // One UI 8.5 bottom sheet — anchored to bottom; the Command's flex-col-reverse pushes the search input to the bottom and stacks the list upward.
                  "inset-x-2 bottom-2 rounded-3xl data-[state=open]:slide-in-from-bottom-4 data-[state=closed]:slide-out-to-bottom-2"
                : // Desktop centered command palette (unchanged).
                  "left-[50%] top-[50%] w-full max-w-xl -translate-x-1/2 -translate-y-1/2 rounded-2xl data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            )}
            style={isMobile ? { paddingBottom: "env(safe-area-inset-bottom, 0px)" } : undefined}
          >
            <VisuallyHidden>
              <DialogPrimitive.Title>Search clients</DialogPrimitive.Title>
            </VisuallyHidden>

          <div
            aria-hidden
            className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent"
          />

          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.03] mix-blend-overlay"
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
            }}
          />

          <Command
            filter={(value, search) => {
              if (!search) return 1;
              const haystack = value.toLowerCase();
              const needles = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
              return needles.every((t) => haystack.includes(t)) ? 1 : 0;
            }}
            className={cn(
              "bg-transparent [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.15em] [&_[cmdk-group-heading]]:text-muted-foreground/60 [&_[cmdk-group]]:px-2",
              isMobile && "flex flex-col-reverse max-h-[88vh]",
            )}
          >
            <div
              className={cn(
                "relative bg-gradient-to-r from-primary/5 via-transparent to-primary/5",
                // On mobile this row sits at the BOTTOM (because of flex-col-reverse on
                // the parent Command). Style it as a One UI 8.5 pill, lifted off the list.
                isMobile &&
                  "mx-2 mb-1 mt-2 rounded-full border border-border/60 bg-card/95 backdrop-blur-2xl shadow-[0_-8px_32px_-8px_hsl(var(--primary)/0.4)] from-transparent via-transparent to-transparent",
              )}
            >
              <div
                className={cn("flex items-center", isMobile ? "px-4" : "px-4")}
                cmdk-input-wrapper=""
              >
                <Search className="mr-3 h-4 w-4 shrink-0 text-primary/70" />
                <CommandInput
                  value={query}
                  onValueChange={setQuery}
                  placeholder={
                    isMobile ? "Search clients…" : "Name, phone, business, mapping, amount…"
                  }
                  className="flex h-14 w-full bg-transparent py-3 text-base font-medium outline-none placeholder:text-muted-foreground/60 placeholder:font-normal placeholder:italic disabled:cursor-not-allowed disabled:opacity-50 border-0"
                />
                <div className="ml-auto flex items-center gap-2 shrink-0">
                  {totalCount > 0 && (
                    <span className="hidden sm:inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary/80 border border-primary/20">
                      {totalCount}
                    </span>
                  )}
                  <kbd className="hidden sm:inline-flex h-5 select-none items-center rounded border border-border/60 bg-muted/40 px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                    ESC
                  </kbd>
                  {isMobile && query && (
                    <button
                      type="button"
                      aria-label="Clear"
                      onClick={() => setQuery("")}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted/60 hover:text-foreground transition"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {isMobile && !query && (
                    <button
                      type="button"
                      aria-label="Close"
                      onClick={() => setOpen(false)}
                      className="rounded-full px-2.5 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
                    >
                      Done
                    </button>
                  )}
                </div>
              </div>
              {!isMobile && (
                <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />
              )}
            </div>

            {/* Portfolio KPI strip — only when not searching */}
            {!isSearching && (
              <div className="px-3 pt-2.5 pb-1.5 flex flex-wrap gap-1.5 border-b border-border/20">
                <KpiChip
                  tone="success"
                  icon={<TrendingUp className="h-2.5 w-2.5" />}
                  label={`+$${formatMoney(portfolio.usdCredit)}`}
                  sub="credit"
                  onClick={() => goTo("/admin/finance?tab=wallet")}
                />
                <KpiChip
                  tone="destructive"
                  icon={<TrendingDown className="h-2.5 w-2.5" />}
                  label={`−${formatCompactBdt(portfolio.bdtDebt)}`}
                  sub="due"
                  onClick={() => goTo("/admin/clients")}
                />
                {portfolio.pausedCount > 0 && (
                  <KpiChip
                    tone="destructive"
                    icon={<Pause className="h-2.5 w-2.5" />}
                    label={String(portfolio.pausedCount)}
                    sub="paused"
                    onClick={() => setQuery("paused")}
                  />
                )}
                {portfolio.pendingCount > 0 && (
                  <KpiChip
                    tone="warning"
                    icon={<Clock className="h-2.5 w-2.5" />}
                    label={String(portfolio.pendingCount)}
                    sub="pending"
                    onClick={() => goTo("/admin/payment-requests")}
                  />
                )}
              </div>
            )}

            <CommandList className="max-h-[420px] overflow-y-auto overflow-x-hidden px-1 py-2">
              <CommandEmpty>
                <div className="py-10 flex flex-col items-center gap-3 px-6">
                  <div className="relative">
                    <div className="absolute inset-0 rounded-full bg-primary/20 blur-xl animate-pulse" />
                    <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20">
                      <Search className="h-5 w-5 text-primary/70" />
                    </div>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-foreground">No clients match</p>
                    <p className="text-xs text-muted-foreground/70 mt-0.5">
                      Try a name, phone, mapping keyword, or amount
                    </p>
                  </div>
                  <button
                    onClick={() => goTo("/admin/clients/new")}
                    className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                  >
                    <UserPlus className="h-3 w-3" />
                    Add a new client
                    <ArrowRight className="h-3 w-3" />
                  </button>
                </div>
              </CommandEmpty>

              {!isSearching && recentClients.length > 0 && (
                <CommandGroup
                  heading={
                    <span className="flex items-center gap-1.5">
                      <History className="h-2.5 w-2.5 text-primary/70" />
                      <span className="text-primary/80">Recent</span>
                      <span className="ml-auto flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            clearRecents();
                          }}
                          className="text-[9px] normal-case tracking-normal font-normal text-muted-foreground/50 hover:text-foreground transition flex items-center gap-0.5"
                        >
                          <X className="h-2 w-2" /> clear
                        </button>
                        <span className="text-muted-foreground/40 normal-case tracking-normal font-normal">
                          {recentClients.length}
                        </span>
                      </span>
                    </span>
                  }
                >
                  {recentClients.map(renderClientRow)}
                </CommandGroup>
              )}

              {topClients.length > 0 && (
                <CommandGroup
                  heading={
                    <span className="flex items-center gap-1.5">
                      <Star className="h-2.5 w-2.5 text-warning fill-warning" />
                      <span className="text-warning/80">Top Balances</span>
                      <span className="ml-auto text-muted-foreground/40 normal-case tracking-normal font-normal">
                        {topClients.length}
                      </span>
                    </span>
                  }
                >
                  {topClients.map(renderClientRow)}
                </CommandGroup>
              )}

              {attentionClients.length > 0 && (
                <CommandGroup
                  heading={
                    <span className="flex items-center gap-1.5">
                      <AlertTriangle className="h-2.5 w-2.5 text-destructive" />
                      <span className="text-destructive/80">Needs Attention</span>
                      <span className="ml-auto flex items-center gap-2 normal-case tracking-normal font-normal">
                        <span className="text-destructive/70 tabular-nums">
                          {formatCompactBdt(portfolio.bdtDebt)} due
                        </span>
                        <span className="text-muted-foreground/40">{attentionClients.length}</span>
                      </span>
                    </span>
                  }
                >
                  {attentionClients.map(renderClientRow)}
                </CommandGroup>
              )}

              {restClients.length > 0 && (
                <CommandGroup
                  heading={
                    <span className="flex items-center gap-1.5">
                      <Sparkles className="h-2.5 w-2.5 text-muted-foreground/60" />
                      <span>All Clients</span>
                      <span className="ml-auto text-muted-foreground/40 normal-case tracking-normal font-normal">
                        {restClients.length}
                      </span>
                    </span>
                  }
                >
                  {restClients.map(renderClientRow)}
                </CommandGroup>
              )}

              <CommandSeparator className="my-2 bg-border/30" />

              <CommandGroup
                heading={<span className="text-muted-foreground/60">Quick Actions</span>}
              >
                <CommandItem
                  onSelect={() => goTo("/admin/clients")}
                  className="gap-3 rounded-lg px-3 py-2.5 data-[selected=true]:bg-primary/5"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 border border-primary/20">
                    <Users className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <span className="text-sm font-medium">View All Clients</span>
                  <ArrowRight className="ml-auto h-3.5 w-3.5 opacity-40" />
                </CommandItem>
                <CommandItem
                  onSelect={() => goTo("/admin/clients/new")}
                  className="gap-3 rounded-lg px-3 py-2.5 data-[selected=true]:bg-primary/5"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 border border-primary/20">
                    <UserPlus className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <span className="text-sm font-medium">Add New Client</span>
                  <ArrowRight className="ml-auto h-3.5 w-3.5 opacity-40" />
                </CommandItem>
              </CommandGroup>
            </CommandList>

            <div className="flex items-center justify-between gap-3 px-4 h-9 border-t border-border/30 bg-card/40 backdrop-blur-xl">
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground/60">
                <span className="flex items-center gap-1">
                  <kbd className="inline-flex h-4 min-w-4 items-center justify-center rounded border border-border/50 bg-muted/40 px-1 font-mono text-[9px]">
                    ↑↓
                  </kbd>
                  <span className="hidden sm:inline">navigate</span>
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="inline-flex h-4 min-w-4 items-center justify-center rounded border border-border/50 bg-muted/40 px-1 font-mono text-[9px]">
                    <CornerDownLeft className="h-2.5 w-2.5" />
                  </kbd>
                  <span className="hidden sm:inline">open</span>
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="inline-flex h-4 min-w-4 items-center justify-center rounded border border-border/50 bg-muted/40 px-1 font-mono text-[9px]">
                    <ChevronRight className="h-2.5 w-2.5" />
                  </kbd>
                  <span className="hidden sm:inline">actions</span>
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/50">
                <span className="h-1 w-1 rounded-full bg-primary/60" />
                <span className="font-semibold tracking-wider">HEPT</span>
              </div>
            </div>
          </Command>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}

/* ---------------- internal subcomponents ---------------- */

function KpiChip({
  tone,
  icon,
  label,
  sub,
  onClick,
}: {
  tone: "success" | "destructive" | "warning" | "muted";
  icon: React.ReactNode;
  label: string;
  sub: string;
  onClick?: () => void;
}) {
  const toneClasses: Record<string, string> = {
    success: "border-success/30 bg-success/10 text-success hover:bg-success/15",
    destructive: "border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/15",
    warning: "border-warning/30 bg-warning/10 text-warning hover:bg-warning/15",
    muted: "border-border/40 bg-muted/30 text-muted-foreground hover:bg-muted/50",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold transition ${toneClasses[tone]}`}
    >
      {icon}
      <span className="tabular-nums">{label}</span>
      <span className="opacity-60 font-normal uppercase tracking-wide text-[9px]">{sub}</span>
    </button>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition"
    >
      <span className="flex h-5 w-5 items-center justify-center rounded bg-primary/10 text-primary">
        {icon}
      </span>
      {label}
    </button>
  );
}

/**
 * Mobile-only persistent bottom pill that acts as the trigger for the global
 * search dialog. Matches One UI 8.5 styling — same shape/size as
 * `MobileSearchPill`, but tapping it opens the full command palette.
 */
function MobileGlobalSearchPill({ onOpen }: { onOpen: () => void }) {
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const idRef = useRef<{ id: number; release: () => void } | null>(null);
  if (!idRef.current) idRef.current = registerMobilePill();
  useEffect(() => {
    return () => {
      idRef.current?.release();
      idRef.current = null;
    };
  }, []);
  const isTop = useIsTopMobilePill(idRef.current.id);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const offset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKeyboardOffset(offset);
    };
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    update();
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  // Auto-hide on scroll-down, reveal on scroll-up. Stays put while keyboard up.
  const hiddenByScroll = useHideOnScroll({ enabled: keyboardOffset === 0 });

  if (!isTop) return null;
  if (typeof document === "undefined") return null;

  const node = (
    <div
      className={cn(
        "fixed left-0 right-0 z-40 px-4 pointer-events-none",
        hiddenByScroll ? "translate-y-[140%] opacity-0" : "translate-y-0 opacity-100",
      )}
      style={{
        bottom: keyboardOffset > 0
          ? `calc(${keyboardOffset}px + 0.5rem)`
          : `calc(env(safe-area-inset-bottom, 0px) + var(--mobile-bottom-offset, 1.25rem))`,
        transition:
          "bottom 180ms cubic-bezier(0.32, 0.72, 0, 1), transform 300ms cubic-bezier(0.32, 0.72, 0, 1), opacity 250ms ease-out",
      }}
    >
      <div className="mx-auto w-full max-w-[340px] pointer-events-auto">
        <button
          type="button"
          onClick={onOpen}
          aria-label="Search clients"
          className={cn(
            "ios-glass-pill-floating relative flex w-full items-center gap-2 rounded-full px-4 h-11",
            "transition active:scale-[0.98]",
          )}
        >
          <Search className="h-4 w-4 shrink-0 text-primary/70" />
          <span className="flex-1 min-w-0 text-left text-sm font-normal text-muted-foreground/70 truncate">
            Search clients…
          </span>
          <span className="relative flex h-1.5 w-1.5 shrink-0">
            <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-50 animate-ping" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary/80" />
          </span>
        </button>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}
