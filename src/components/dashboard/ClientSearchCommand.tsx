import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Users, UserPlus, ArrowRight } from "lucide-react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";

interface ClientItem {
  user_id: string;
  full_name: string;
  email?: string;
  business_name?: string | null;
  balance: number;
}

interface ClientSearchCommandProps {
  clients: ClientItem[];
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
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

  const sortedClients = useMemo(
    () => [...clients].sort((a, b) => a.full_name.localeCompare(b.full_name)),
    [clients]
  );

  const handleSelect = (path: string) => {
    setOpen(false);
    navigate(path);
  };

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

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Type a name, email, or business…" />
        <CommandList>
          <CommandEmpty>
            <div className="py-6 flex flex-col items-center gap-2 text-muted-foreground">
              <Search className="h-6 w-6 opacity-40" />
              <p className="text-sm">No clients found</p>
              <p className="text-xs opacity-70">Try a different name or email</p>
            </div>
          </CommandEmpty>

          {sortedClients.length > 0 && (
            <CommandGroup heading={`Clients (${sortedClients.length})`}>
              {sortedClients.map((client) => {
                const positive = client.balance > 0;
                const negative = client.balance < 0;
                const searchValue = `${client.full_name} ${client.email ?? ""} ${client.business_name ?? ""}`;
                return (
                  <CommandItem
                    key={client.user_id}
                    value={searchValue}
                    onSelect={() => handleSelect(`/admin/clients/${client.user_id}`)}
                    className="gap-3"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5 text-xs font-semibold text-primary border border-primary/20">
                      {getInitials(client.full_name) || "?"}
                    </div>
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-sm font-medium truncate">{client.full_name}</span>
                      <span className="text-xs text-muted-foreground truncate">
                        {client.business_name || client.email || "—"}
                      </span>
                    </div>
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                        positive
                          ? "bg-success/10 text-success border-success/30"
                          : negative
                          ? "bg-destructive/10 text-destructive border-destructive/30"
                          : "bg-muted text-muted-foreground border-border"
                      }`}
                    >
                      ${Math.abs(client.balance).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          )}

          <CommandSeparator />

          <CommandGroup heading="Quick Actions">
            <CommandItem onSelect={() => handleSelect("/admin/clients")} className="gap-3">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">View All Clients</span>
              <ArrowRight className="ml-auto h-3.5 w-3.5 opacity-50" />
            </CommandItem>
            <CommandItem onSelect={() => handleSelect("/admin/clients/new")} className="gap-3">
              <UserPlus className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Add New Client</span>
              <ArrowRight className="ml-auto h-3.5 w-3.5 opacity-50" />
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
