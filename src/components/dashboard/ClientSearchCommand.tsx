import { useState, useEffect, useMemo } from "react";
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
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { getPlatformRates } from "@/lib/pricing";

interface ClientItem {
  user_id: string;
  full_name: string;
  email?: string;
  business_name?: string | null;
  balance: number;
  pricing_config?: any;
  platform_balances?: Record<string, number>;
}

interface ClientSearchCommandProps {
  clients: ClientItem[];
}

// 8 deterministic gradient pairs for avatars — semantic-feeling but unique per client
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

const KNOWN_PLATFORMS = ["meta", "tiktok", "google"] as const;

/**
 * Compute BDT debt total using per-platform billing rates,
 * matching ClientList.tsx logic exactly.
 */
function computeBdtDebt(client: ClientItem): number {
  const rates = getPlatformRates(client.pricing_config);
  const platBals = client.platform_balances ?? {};
  let bdt = 0;
  for (const p of KNOWN_PLATFORMS) {
    const bal = Number(platBals[p]) || 0;
    if (bal < 0) {
      const rate = Number((rates as any)[p]) || 120;
      bdt += Math.abs(bal) * rate;
    }
  }
  // Fallback when no per-platform breakdown is available:
  // use the average platform rate against the aggregate negative balance.
  if (bdt === 0 && client.balance < 0) {
    const fallbackRate =
      Number(rates.meta) || Number(rates.tiktok) || Number(rates.google) || 120;
    bdt = Math.abs(client.balance) * fallbackRate;
  }
  return bdt;
}

export function ClientSearchCommand({ clients }: ClientSearchCommandProps) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const { topClients, attentionClients, restClients } = useMemo(() => {
    const sorted = [...clients].sort((a, b) =>
      a.full_name.localeCompare(b.full_name)
    );
    const negatives = sorted.filter((c) => c.balance < 0);
    const positives = sorted
      .filter((c) => c.balance > 0)
      .sort((a, b) => b.balance - a.balance);
    const top = positives.slice(0, 3);
    const topIds = new Set(top.map((c) => c.user_id));
    const negIds = new Set(negatives.map((c) => c.user_id));
    const rest = sorted.filter(
      (c) => !topIds.has(c.user_id) && !negIds.has(c.user_id)
    );
    return {
      topClients: top,
      attentionClients: negatives,
      restClients: rest,
    };
  }, [clients]);

  const handleSelect = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  const renderClientRow = (client: ClientItem) => {
    const positive = client.balance > 0;
    const negative = client.balance < 0;
    const gradient = getAvatarGradient(client.user_id);
    const searchValue = `${client.full_name} ${client.email ?? ""} ${client.business_name ?? ""}`;
    const TrendIcon = negative ? TrendingDown : positive ? TrendingUp : Minus;

    return (
      <CommandItem
        key={client.user_id}
        value={searchValue}
        onSelect={() => handleSelect(`/admin/clients/${client.user_id}`)}
        className="group/row relative gap-3 rounded-lg px-3 py-2.5 my-0.5 data-[selected=true]:bg-gradient-to-r data-[selected=true]:from-primary/10 data-[selected=true]:via-primary/5 data-[selected=true]:to-transparent transition-all duration-200"
      >
        {/* Left accent bar on hover/select */}
        <span
          aria-hidden
          className="absolute left-0 top-1/2 -translate-y-1/2 h-7 w-[2px] rounded-r-full bg-primary opacity-0 group-data-[selected=true]/row:opacity-100 transition-opacity"
        />

        {/* Avatar */}
        <div
          className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${gradient} ring-1 ring-white/10 shadow-inner`}
        >
          <span className="text-[11px] font-semibold tracking-wide text-white drop-shadow-sm">
            {getInitials(client.full_name)}
          </span>
        </div>

        {/* Name + subtitle */}
        <div className="flex flex-col min-w-0 flex-1">
          <span className="text-sm font-medium text-foreground truncate">
            {client.full_name}
          </span>
          <span className="text-[11px] text-muted-foreground/70 truncate">
            {client.business_name || client.email || "—"}
          </span>
        </div>

        {/* Balance — color only, no border */}
        <div className="flex items-center gap-1.5 shrink-0">
          <TrendIcon
            className={`h-3 w-3 ${
              positive
                ? "text-success"
                : negative
                ? "text-destructive"
                : "text-muted-foreground/50"
            }`}
          />
          <div className="flex flex-col items-end leading-tight">
            <span
              className={`text-sm font-semibold tabular-nums ${
                positive
                  ? "text-success"
                  : negative
                  ? "text-destructive"
                  : "text-muted-foreground"
              }`}
            >
              {negative ? "−" : ""}
              {formatBalance(client.balance)}
            </span>
            <span className="text-[8px] uppercase tracking-[0.15em] text-muted-foreground/50 font-medium">
              BDT
            </span>
          </div>
        </div>
      </CommandItem>
    );
  };

  const totalCount = clients.length;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative flex items-center w-full md:max-w-md h-11 px-4 rounded-xl border border-border/50 bg-gradient-to-br from-card/60 to-card/30 backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_8px_24px_-6px_hsl(var(--primary)/0.35)]"
      >
        <Search className="h-4 w-4 text-muted-foreground mr-2.5 transition-colors group-hover:text-primary" />
        <span className="text-sm text-muted-foreground/80 truncate">
          <span className="hidden sm:inline">Search clients by name, email, phone…</span>
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="overflow-hidden p-0 max-w-xl gap-0 rounded-2xl border-border/40 bg-gradient-to-b from-card/95 via-card/90 to-card/85 backdrop-blur-2xl shadow-[0_24px_80px_-20px_hsl(var(--primary)/0.4)]"
        >
          <VisuallyHidden>
            <DialogTitle>Search clients</DialogTitle>
          </VisuallyHidden>

          {/* Top accent gradient line */}
          <div
            aria-hidden
            className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent"
          />

          {/* Subtle noise overlay */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.03] mix-blend-overlay"
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
            }}
          />

          <Command
            className="bg-transparent [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.15em] [&_[cmdk-group-heading]]:text-muted-foreground/60 [&_[cmdk-group]]:px-2"
          >
            {/* Elevated input zone */}
            <div className="relative bg-gradient-to-r from-primary/5 via-transparent to-primary/5">
              <div className="flex items-center px-4" cmdk-input-wrapper="">
                <Search className="mr-3 h-4 w-4 shrink-0 text-primary/70" />
                <CommandInput
                  placeholder="Search by name, email, or business…"
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
                </div>
              </div>
              {/* Gradient divider */}
              <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />
            </div>

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
                      Try a different name or email
                    </p>
                  </div>
                  <button
                    onClick={() => handleSelect("/admin/clients/new")}
                    className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                  >
                    <UserPlus className="h-3 w-3" />
                    Add a new client
                    <ArrowRight className="h-3 w-3" />
                  </button>
                </div>
              </CommandEmpty>

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
                      <span className="ml-auto text-muted-foreground/40 normal-case tracking-normal font-normal">
                        {attentionClients.length}
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
                heading={
                  <span className="text-muted-foreground/60">Quick Actions</span>
                }
              >
                <CommandItem
                  onSelect={() => handleSelect("/admin/clients")}
                  className="gap-3 rounded-lg px-3 py-2.5 data-[selected=true]:bg-primary/5"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 border border-primary/20">
                    <Users className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <span className="text-sm font-medium">View All Clients</span>
                  <ArrowRight className="ml-auto h-3.5 w-3.5 opacity-40" />
                </CommandItem>
                <CommandItem
                  onSelect={() => handleSelect("/admin/clients/new")}
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

            {/* Power-user footer */}
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
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/50">
                <span className="h-1 w-1 rounded-full bg-primary/60" />
                <span className="font-semibold tracking-wider">HEPT</span>
              </div>
            </div>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
