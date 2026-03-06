import { useMemo, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  SortingState,
} from "@tanstack/react-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowUpDown, ArrowUp, ArrowDown, Loader2, Power, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface CampaignRow {
  campaign_name: string;
  platform: string;
  status: string;
  impressions: number;
  clicks: number;
  spend: number;
  results: number;
  conversion_value: number;
  ad_account_name?: string;
  campaign_id?: string; // DB UUID for actions
}

const PLATFORM_BADGE: Record<string, { label: string; className: string }> = {
  meta: { label: "Meta", className: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30" },
  tiktok: { label: "TikTok", className: "bg-foreground/10 text-foreground border-foreground/20" },
  google: { label: "Google", className: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30" },
};

const safeDivide = (a: number, b: number) => (b > 0 ? a / b : 0);

const fmt = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtNum = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
};

const columnHelper = createColumnHelper<CampaignRow>();

interface DeepDiveTableProps {
  data: CampaignRow[];
  onCampaignPaused?: () => void;
}

export function DeepDiveTable({ data, onCampaignPaused }: DeepDiveTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [pausingId, setPausingId] = useState<string | null>(null);
  const [confirmPause, setConfirmPause] = useState<CampaignRow | null>(null);

  const filteredData = useMemo(() => {
    if (!searchQuery.trim()) return data;
    const q = searchQuery.toLowerCase();
    return data.filter(
      (r) =>
        r.campaign_name.toLowerCase().includes(q) ||
        r.platform.toLowerCase().includes(q) ||
        (r.ad_account_name && r.ad_account_name.toLowerCase().includes(q))
    );
  }, [data, searchQuery]);

  const handlePause = async (row: CampaignRow) => {
    if (!row.campaign_id) return;
    setPausingId(row.campaign_id);
    try {
      const { data: result, error } = await supabase.functions.invoke("pause-campaign", {
        body: { campaign_id: row.campaign_id },
      });
      if (error) throw error;
      if (result?.error) throw new Error(result.error);
      toast({ title: "Campaign Paused", description: result?.message || "Campaign has been paused successfully." });
      onCampaignPaused?.();
    } catch (err: any) {
      toast({ title: "Failed to pause", description: err.message, variant: "destructive" });
    } finally {
      setPausingId(null);
      setConfirmPause(null);
    }
  };

  const columns = useMemo(() => [
    columnHelper.accessor("campaign_name", {
      header: "Campaign",
      cell: (info) => (
        <div className="min-w-[180px]">
          <span className="font-medium text-sm truncate max-w-[260px] block">{info.getValue()}</span>
          {info.row.original.ad_account_name && (
            <span className="text-[11px] text-muted-foreground truncate block">{info.row.original.ad_account_name}</span>
          )}
        </div>
      ),
    }),
    columnHelper.accessor("platform", {
      header: "Platform",
      cell: (info) => {
        const p = PLATFORM_BADGE[info.getValue()] || { label: info.getValue(), className: "bg-muted text-muted-foreground border-border" };
        return <Badge variant="outline" className={`text-[10px] font-semibold ${p.className}`}>{p.label}</Badge>;
      },
    }),
    columnHelper.accessor("status", {
      header: "Status",
      cell: (info) => {
        const row = info.row.original;
        const active = info.getValue() === "active";
        const isPausing = pausingId === row.campaign_id;
        return (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${active ? "bg-green-500" : "bg-muted-foreground/40"}`} />
              <span className="text-xs text-muted-foreground capitalize">{info.getValue()}</span>
            </div>
            {active && row.campaign_id && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive/10"
                disabled={isPausing}
                onClick={(e) => { e.stopPropagation(); setConfirmPause(row); }}
                title="Pause campaign"
              >
                {isPausing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}
              </Button>
            )}
          </div>
        );
      },
    }),
    columnHelper.accessor("impressions", {
      header: "Impressions",
      cell: (info) => <span className="font-mono text-sm">{fmtNum(info.getValue())}</span>,
    }),
    columnHelper.display({
      id: "cpm",
      header: "CPM",
      cell: (info) => {
        const row = info.row.original;
        const cpm = safeDivide(row.spend, row.impressions) * 1000;
        return <span className="font-mono text-sm">{fmt(cpm)}</span>;
      },
    }),
    columnHelper.accessor("results", {
      header: "Results",
      cell: (info) => <span className="font-mono text-sm font-medium">{info.getValue().toLocaleString()}</span>,
    }),
    columnHelper.display({
      id: "cpo",
      header: "Cost/Result",
      cell: (info) => {
        const row = info.row.original;
        const cpo = safeDivide(row.spend, row.results);
        return <span className="font-mono text-sm">{fmt(cpo)}</span>;
      },
    }),
    columnHelper.accessor("spend", {
      header: "Spent",
      cell: (info) => <span className="font-mono text-sm font-medium">{fmt(info.getValue())}</span>,
    }),
    columnHelper.display({
      id: "roas",
      header: "ROAS",
      cell: (info) => {
        const row = info.row.original;
        const roas = safeDivide(row.conversion_value, row.spend);
        let className = "font-mono text-xs ";
        if (roas > 3) {
          className += "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30";
        } else if (roas < 1.5) {
          className += "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30";
        } else {
          className += "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30";
        }
        return <Badge variant="outline" className={className}>{roas.toFixed(2)}x</Badge>;
      },
    }),
  ], [pausingId]);

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const totals = useMemo(() => {
    const t = { spend: 0, impressions: 0, results: 0, convValue: 0 };
    for (const r of filteredData) {
      t.spend += r.spend;
      t.impressions += r.impressions;
      t.results += r.results;
      t.convValue += r.conversion_value;
    }
    return t;
  }, [data]);

  const totalRoas = safeDivide(totals.convValue, totals.spend);
  const totalCpm = safeDivide(totals.spend, totals.impressions) * 1000;
  const totalCpo = safeDivide(totals.spend, totals.results);

  return (
    <>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    className="cursor-pointer select-none hover:bg-muted/50 transition-colors text-xs uppercase tracking-wider"
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <div className="flex items-center gap-1">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getIsSorted() === "asc" ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : header.column.getIsSorted() === "desc" ? (
                        <ArrowDown className="h-3 w-3" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 text-muted-foreground/50" />
                      )}
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center py-12 text-muted-foreground">
                  No campaign data available
                </TableCell>
              </TableRow>
            ) : (
              <>
                {table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id} className="hover:bg-muted/30 transition-colors">
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
                {data.length > 1 && (
                  <TableRow className="bg-muted/40 font-semibold border-t-2">
                    <TableCell className="text-sm">Totals</TableCell>
                    <TableCell />
                    <TableCell />
                    <TableCell className="font-mono text-sm">{fmtNum(totals.impressions)}</TableCell>
                    <TableCell className="font-mono text-sm">{fmt(totalCpm)}</TableCell>
                    <TableCell className="font-mono text-sm">{totals.results.toLocaleString()}</TableCell>
                    <TableCell className="font-mono text-sm">{fmt(totalCpo)}</TableCell>
                    <TableCell className="font-mono text-sm">{fmt(totals.spend)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs bg-primary/10 text-primary border-primary/30">
                        {totalRoas.toFixed(2)}x
                      </Badge>
                    </TableCell>
                  </TableRow>
                )}
              </>
            )}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!confirmPause} onOpenChange={() => setConfirmPause(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pause Campaign?</AlertDialogTitle>
            <AlertDialogDescription>
              This will pause <strong>"{confirmPause?.campaign_name}"</strong> directly on the ad platform.
              Once paused, you will not be able to turn it back on from here — contact your account manager to resume.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confirmPause && handlePause(confirmPause)}
            >
              {pausingId ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Pause Campaign
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
