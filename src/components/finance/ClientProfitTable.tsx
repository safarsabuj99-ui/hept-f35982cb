import { useMemo, useState } from "react";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowUpDown, AlertTriangle, Trophy, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { ClientProfit } from "@/lib/finance/aggregate";

type SortKey = "name" | "totalSpendUsd" | "revenueBdt" | "cogsBdt" | "netProfit" | "margin";

interface Props {
  clients: ClientProfit[];
  canViewProfit: boolean;
}

export function ClientProfitTable({ clients, canViewProfit }: Props) {
  const [q, setQ] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("netProfit");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const winners = useMemo(() => clients.slice(0, 3).map((c) => c.clientId), [clients]);
  const watchlist = useMemo(
    () => clients.filter((c) => c.netProfit < 0 || (c.margin >= 0 && c.margin < 5 && c.revenueBdt > 0)).map((c) => c.clientId),
    [clients]
  );

  const filtered = useMemo(() => {
    const search = q.toLowerCase().trim();
    let list = search ? clients.filter((c) => c.name.toLowerCase().includes(search)) : clients.slice();
    list.sort((a, b) => {
      const av = a[sortKey] as any, bv = b[sortKey] as any;
      if (typeof av === "string") return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return list;
  }, [clients, q, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("desc"); }
  };

  const SortBtn = ({ k, label, align = "left" }: { k: SortKey; label: string; align?: "left" | "right" }) => (
    <button
      onClick={() => toggleSort(k)}
      className={cn("inline-flex items-center gap-1 text-[11px] uppercase tracking-widest text-muted-foreground/70 hover:text-foreground",
        align === "right" && "ml-auto")}
    >
      {label} <ArrowUpDown className={cn("h-3 w-3", sortKey === k && "text-primary")} />
    </button>
  );

  return (
    <div className="glass-card glow-border">
      <CardHeader className="flex-row items-center justify-between gap-3 flex-wrap">
        <CardTitle className="text-base">Client Profitability</CardTitle>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search client..." className="pl-8 h-9" />
        </div>
      </CardHeader>
      <CardContent>
        {clients.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No client spend in this period.</p>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="flex flex-col gap-3 md:hidden">
              {filtered.map((c) => (
                <div key={c.clientId} className="rounded-xl border p-4 space-y-2 bg-card">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {winners.includes(c.clientId) && <Trophy className="h-3.5 w-3.5 text-warning shrink-0" />}
                      <span className="font-medium truncate">{c.name}</span>
                    </div>
                    {canViewProfit && (
                      c.margin < 5
                        ? <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />{c.margin}%</Badge>
                        : <Badge variant="secondary">{c.margin}%</Badge>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><p className="text-xs text-muted-foreground">Spend</p><p className="font-mono">${c.totalSpendUsd.toLocaleString()}</p></div>
                    <div><p className="text-xs text-muted-foreground">Revenue</p><p className="font-mono">৳{c.revenueBdt.toLocaleString()}</p></div>
                    <div><p className="text-xs text-muted-foreground">COGS</p><p className="font-mono text-destructive">৳{c.cogsBdt.toLocaleString()}</p></div>
                    {canViewProfit && (
                      <div><p className="text-xs text-muted-foreground">Profit</p>
                        <p className={cn("font-mono", c.netProfit >= 0 ? "text-success" : "text-destructive")}>৳{c.netProfit.toLocaleString()}</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead><SortBtn k="name" label="Client" /></TableHead>
                    <TableHead className="text-right"><SortBtn k="totalSpendUsd" label="Spend (USD)" align="right" /></TableHead>
                    <TableHead className="text-right"><SortBtn k="revenueBdt" label="Revenue" align="right" /></TableHead>
                    <TableHead className="text-right"><SortBtn k="cogsBdt" label="COGS" align="right" /></TableHead>
                    {canViewProfit && <TableHead className="text-right"><SortBtn k="netProfit" label="Profit" align="right" /></TableHead>}
                    {canViewProfit && <TableHead className="text-right"><SortBtn k="margin" label="Margin" align="right" /></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((c) => (
                    <TableRow key={c.clientId} className={cn(
                      watchlist.includes(c.clientId) && "bg-destructive/5",
                      winners.includes(c.clientId) && !watchlist.includes(c.clientId) && "bg-success/5"
                    )}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {winners.includes(c.clientId) && <Trophy className="h-3.5 w-3.5 text-warning" />}
                          {c.name}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono">${c.totalSpendUsd.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono">৳{c.revenueBdt.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono text-destructive">৳{c.cogsBdt.toLocaleString()}</TableCell>
                      {canViewProfit && (
                        <TableCell className="text-right font-mono">
                          <span className={c.netProfit >= 0 ? "text-success" : "text-destructive"}>৳{c.netProfit.toLocaleString()}</span>
                        </TableCell>
                      )}
                      {canViewProfit && (
                        <TableCell className="text-right">
                          {c.margin < 5
                            ? <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />{c.margin}%</Badge>
                            : <Badge variant="secondary">{c.margin}%</Badge>}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </div>
  );
}
