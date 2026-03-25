import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Eye, Plus, ArrowUpDown } from "lucide-react";
import { Link } from "react-router-dom";
import { TablePagination } from "@/components/TablePagination";

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
}

type SortKey = "full_name" | "balance" | "todaySpend";

export function ClientOverviewTable({ clients, loading }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("balance");
  const [sortAsc, setSortAsc] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

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
          <div className="py-8 text-center space-y-3">
            <p className="text-sm text-muted-foreground">No clients yet.</p>
            <Button variant="outline" size="sm" asChild>
              <Link to="/admin/clients/new"><Plus className="h-3.5 w-3.5 mr-1.5" /> New Client</Link>
            </Button>
          </div>
        ) : (
          <>
            {/* Mobile card view */}
            <div className="flex flex-col gap-3 md:hidden">
              {sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((c) => (
                <div key={c.user_id} className="rounded-xl border bg-card p-4 space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-sm">{c.full_name}</p>
                      {c.business_name && <p className="text-xs text-muted-foreground">{c.business_name}</p>}
                    </div>
                    <Badge variant={c.balance >= 0 ? "default" : "destructive"} className="font-mono text-xs shrink-0">
                      {fmt(c.balance)}
                    </Badge>
                  </div>
                  {c.todaySpend > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Today's Spend</span>
                      <span className="font-mono text-sm">{fmt(c.todaySpend)}</span>
                    </div>
                  )}
                  <div className="flex gap-2 pt-1">
                    <Button variant="outline" size="sm" className="flex-1 text-xs" asChild>
                      <Link to={`/admin/clients/${c.user_id}`}><Eye className="h-3 w-3 mr-1" /> View</Link>
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1 text-xs" asChild>
                      <Link to={`/admin/add-funds`}><Plus className="h-3 w-3 mr-1" /> Funds</Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead><SortBtn k="full_name" label="Name" /></TableHead>
                    <TableHead>Business</TableHead>
                    <TableHead className="text-right"><SortBtn k="balance" label="Balance" /></TableHead>
                    <TableHead className="text-right"><SortBtn k="todaySpend" label="Today's Spend" /></TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((c) => (
                    <TableRow key={c.user_id} className="group">
                      <TableCell className="font-medium">{c.full_name}</TableCell>
                      <TableCell className="text-muted-foreground">{c.business_name || "—"}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={c.balance >= 0 ? "default" : "destructive"} className="font-mono text-xs">
                          {fmt(c.balance)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {c.todaySpend > 0 ? fmt(c.todaySpend) : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                            <Link to={`/admin/clients/${c.user_id}`}><Eye className="h-3.5 w-3.5" /></Link>
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
            <TablePagination totalItems={sorted.length} pageSize={pageSize} currentPage={currentPage} onPageChange={setCurrentPage} onPageSizeChange={(s) => { setPageSize(s); setCurrentPage(1); }} />
          </>
        )}
      </CardContent>
    </Card>
  );
}
