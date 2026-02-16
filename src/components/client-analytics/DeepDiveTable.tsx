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
}

const platformIcons: Record<string, string> = {
  meta: "🟦",
  tiktok: "⬛",
  google: "🟨",
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
    cell: (info) => {
      const platform = info.row.original.platform;
      return (
        <div className="flex items-center gap-2 min-w-[180px]">
          <span className="text-base">{platformIcons[platform] || "⬜"}</span>
          <span className="font-medium text-sm truncate max-w-[220px]">{info.getValue()}</span>
        </div>
      );
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
      let variant: "default" | "secondary" | "destructive" | "outline" = "secondary";
      let label = `${roas.toFixed(2)}x`;
      let className = "font-mono text-xs ";
      if (roas > 3) {
        className += "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30";
      } else if (roas < 1.5) {
        className += "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30";
      } else {
        className += "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30";
      }
      return <Badge variant="outline" className={className}>{label}</Badge>;
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
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id} className="hover:bg-muted/30 transition-colors">
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
