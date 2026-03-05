import { useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  SortingState,
} from "@tanstack/react-table";
import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

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

const columns = [
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
      const active = info.getValue() === "active";
      return (
        <div className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${active ? "bg-green-500" : "bg-muted-foreground/40"}`} />
          <span className="text-xs text-muted-foreground capitalize">{info.getValue()}</span>
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
];

interface DeepDiveTableProps {
  data: CampaignRow[];
}

export function DeepDiveTable({ data }: DeepDiveTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  // Compute totals
  const totals = useMemo(() => {
    const t = { spend: 0, impressions: 0, results: 0, convValue: 0 };
    for (const r of data) {
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
              {/* Totals Summary Row */}
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
  );
}
