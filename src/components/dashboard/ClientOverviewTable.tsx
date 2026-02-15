import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Eye, Plus, ArrowUpDown } from "lucide-react";
import { Link } from "react-router-dom";

interface Client {
  user_id: string;
  full_name: string;
  email: string;
  business_name: string | null;
  balance: number;
  todaySpend: number;
}

interface Props {
  clients: Client[];
  loading: boolean;
  exchangeRate: number;
}

type SortKey = "full_name" | "balance" | "todaySpend";

export function ClientOverviewTable({ clients, loading, exchangeRate }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("balance");
  const [sortAsc, setSortAsc] = useState(false);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(key === "full_name"); }
  };

  const sorted = [...clients].sort((a, b) => {
    const mul = sortAsc ? 1 : -1;
    if (sortKey === "full_name") return mul * a.full_name.localeCompare(b.full_name);
    return mul * ((a[sortKey] ?? 0) - (b[sortKey] ?? 0));
  });

  const fmt = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtBdt = (n: number) => `৳${(n * exchangeRate).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  const SortBtn = ({ k, label }: { k: SortKey; label: string }) => (
    <button onClick={() => handleSort(k)} className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
      {label} <ArrowUpDown className="h-3 w-3" />
    </button>
  );

  return (
    <Card className="dark:bg-card/80 dark:backdrop-blur-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-muted-foreground">Client Overview</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : sorted.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No clients yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead><SortBtn k="full_name" label="Name" /></TableHead>
                  <TableHead className="hidden sm:table-cell">Business</TableHead>
                  <TableHead className="text-right"><SortBtn k="balance" label="Balance (USD)" /></TableHead>
                  <TableHead className="text-right hidden md:table-cell">Balance (BDT)</TableHead>
                  <TableHead className="text-right hidden lg:table-cell"><SortBtn k="todaySpend" label="Today's Spend" /></TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((c) => (
                  <TableRow key={c.user_id} className="group">
                    <TableCell className="font-medium">{c.full_name}</TableCell>
                    <TableCell className="hidden sm:table-cell text-muted-foreground">{c.business_name || "—"}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={c.balance >= 0 ? "default" : "destructive"} className="font-mono text-xs">
                        {fmt(c.balance)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right hidden md:table-cell font-mono text-sm text-muted-foreground">
                      {fmtBdt(c.balance)}
                    </TableCell>
                    <TableCell className="text-right hidden lg:table-cell font-mono text-sm">
                      {c.todaySpend > 0 ? fmt(c.todaySpend) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                          <Link to={`/admin/clients`}><Eye className="h-3.5 w-3.5" /></Link>
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                          <Link to={`/admin/add-funds`}><Plus className="h-3.5 w-3.5" /></Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
