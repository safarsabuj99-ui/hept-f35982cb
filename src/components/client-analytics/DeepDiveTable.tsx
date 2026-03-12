import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
  SortingState,
  ColumnOrderState,
} from "@tanstack/react-table";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowUpDown, ArrowUp, ArrowDown, Loader2, Power, Search, Filter, X, LayoutGrid, Star, GripVertical } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { TablePagination } from "@/components/TablePagination";
import { cn } from "@/lib/utils";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
  campaign_id?: string;
  objective?: string;
  view_content?: number;
  add_to_cart?: number;
  initiate_checkout?: number;
  purchase?: number;
  messaging_conversations?: number;
  cost_per_purchase?: number;
  cost_per_message?: number;
  cpm?: number;
  reach?: number;
  new_messaging_contacts?: number;
  create_order?: number;
}

export type PresetType = "auto" | "messages" | "sales" | "performance";

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

const isActiveStatus = (status: string) => {
  const s = status.toLowerCase();
  return s === "active" || s.startsWith("active -") || s === "enable";
};

const normalizeStatus = (status: string) => {
  const s = status.toLowerCase();
  if (s === "enable") return "active";
  if (s === "disable") return "paused";
  return status;
};

const columnHelper = createColumnHelper<CampaignRow>();

// Frozen columns that stay pinned to the left and are NOT draggable
const FROZEN_COLS = ["select", "campaign_name", "platform", "status"];
const FROZEN_LEFT: Record<string, string> = {
  select: "left-0",
  campaign_name: "left-[40px]",
  platform: "left-[228px]",
  status: "left-[312px]",
};
const isFrozen = (id: string) => FROZEN_COLS.includes(id);

interface DeepDiveTableProps {
  data: CampaignRow[];
  onCampaignPaused?: () => void;
  defaultPreset?: PresetType;
  onPresetChange?: (preset: PresetType) => void;
  onSetDefaultPreset?: (preset: PresetType) => void;
  savedColumnOrder?: string[];
  onColumnOrderChange?: (order: string[]) => void;
}

export function DeepDiveTable({
  data,
  onCampaignPaused,
  defaultPreset = "auto",
  onPresetChange,
  onSetDefaultPreset,
  savedColumnOrder,
  onColumnOrderChange,
}: DeepDiveTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [confirmToggle, setConfirmToggle] = useState<{ row: CampaignRow; action: "pause" | "enable" } | null>(null);

  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedPreset, setSelectedPreset] = useState<PresetType>(defaultPreset);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [bulkPausing, setBulkPausing] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });

  // Drag-and-drop state
  const [draggedCol, setDraggedCol] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  // Sync preset from prop when it changes
  useEffect(() => { setSelectedPreset(defaultPreset); }, [defaultPreset]);

  const handlePresetChange = (v: PresetType) => {
    setSelectedPreset(v);
    onPresetChange?.(v);
  };

  useEffect(() => { setCurrentPage(1); setSelectedIds(new Set()); }, [searchQuery, statusFilter]);

  const uniqueStatuses = useMemo(() => {
    const set = new Set(data.map((r) => r.status));
    return Array.from(set).sort();
  }, [data]);

  const filteredData = useMemo(() => {
    let filtered = data;
    if (statusFilter !== "all") {
      filtered = filtered.filter((r) => r.status === statusFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.campaign_name.toLowerCase().includes(q) ||
          r.platform.toLowerCase().includes(q) ||
          (r.ad_account_name && r.ad_account_name.toLowerCase().includes(q))
      );
    }
    return filtered;
  }, [data, searchQuery, statusFilter]);

  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredData.slice(start, start + pageSize);
  }, [filteredData, currentPage, pageSize]);

  const selectableRows = useMemo(
    () => paginatedData.filter(r => r.campaign_id && isActiveStatus(r.status)),
    [paginatedData]
  );

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    const allIds = selectableRows.map(r => r.campaign_id!);
    const allSelected = allIds.length > 0 && allIds.every(id => selectedIds.has(id));
    if (allSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        allIds.forEach(id => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        allIds.forEach(id => next.add(id));
        return next;
      });
    }
  }, [selectableRows, selectedIds]);

  const handleToggle = async (row: CampaignRow, action: "pause" | "enable") => {
    if (!row.campaign_id) return;
    setTogglingId(row.campaign_id);
    try {
      const { data: result, error } = await supabase.functions.invoke("pause-campaign", {
        body: { campaign_id: row.campaign_id, action },
      });
      if (error) throw error;
      if (result?.error) throw new Error(result.error);
      const verb = action === "enable" ? "Enabled" : "Paused";
      toast({ title: `Campaign ${verb}`, description: result?.message || `Campaign has been ${verb.toLowerCase()} successfully.` });
      onCampaignPaused?.();
    } catch (err: any) {
      toast({ title: `Failed to ${action}`, description: err.message, variant: "destructive" });
    } finally {
      setTogglingId(null);
      setConfirmToggle(null);
    }
  };

  const handleBulkPause = async () => {
    const ids = Array.from(selectedIds);
    setBulkPausing(true);
    setBulkProgress({ current: 0, total: ids.length });
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < ids.length; i++) {
      setBulkProgress({ current: i + 1, total: ids.length });
      try {
        const { data: result, error } = await supabase.functions.invoke("pause-campaign", {
          body: { campaign_id: ids[i], action: "pause" },
        });
        if (error) throw error;
        if (result?.error) throw new Error(result.error);
        successCount++;
      } catch {
        failCount++;
      }
    }

    setBulkPausing(false);
    setShowBulkConfirm(false);
    setSelectedIds(new Set());

    if (failCount === 0) {
      toast({ title: "Bulk Pause Complete", description: `${successCount} campaign${successCount > 1 ? "s" : ""} paused successfully.` });
    } else {
      toast({ title: "Bulk Pause Partial", description: `${successCount} paused, ${failCount} failed.`, variant: "destructive" });
    }
    onCampaignPaused?.();
  };

  const hasObjectiveData = useMemo(() => {
    const has = { sales: false, messages: false };
    for (const r of data) {
      if ((r.view_content ?? 0) > 0 || (r.add_to_cart ?? 0) > 0 || (r.initiate_checkout ?? 0) > 0 || (r.purchase ?? 0) > 0) has.sales = true;
      if ((r.messaging_conversations ?? 0) > 0) has.messages = true;
    }
    return has;
  }, [data]);

  const showColumns = useMemo(() => {
    if (selectedPreset === "sales") return { sales: true, messages: false, performance: false };
    if (selectedPreset === "messages") return { sales: false, messages: true, performance: false };
    if (selectedPreset === "performance") return { sales: false, messages: false, performance: true };
    return { sales: hasObjectiveData.sales, messages: hasObjectiveData.messages, performance: false };
  }, [selectedPreset, hasObjectiveData]);

  const columns = useMemo(() => {
    const cols: any[] = [
      columnHelper.display({
        id: "select",
        header: () => {
          const allIds = selectableRows.map(r => r.campaign_id!);
          const allSelected = allIds.length > 0 && allIds.every(id => selectedIds.has(id));
          const someSelected = allIds.some(id => selectedIds.has(id)) && !allSelected;
          return (
            <Checkbox
              checked={allSelected ? true : someSelected ? "indeterminate" : false}
              onCheckedChange={toggleSelectAll}
              aria-label="Select all"
              className="translate-y-[2px]"
            />
          );
        },
        cell: (info) => {
          const row = info.row.original;
          const isSelectable = row.campaign_id && isActiveStatus(row.status);
          if (!isSelectable) return <div className="w-4" />;
          return (
            <Checkbox
              checked={selectedIds.has(row.campaign_id!)}
              onCheckedChange={() => toggleSelect(row.campaign_id!)}
              aria-label={`Select ${row.campaign_name}`}
              className="translate-y-[2px]"
              onClick={(e) => e.stopPropagation()}
            />
          );
        },
      }),
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
        header: "Delivery",
        cell: (info) => {
          const row = info.row.original;
          const status = info.getValue();
          const isToggling = togglingId === row.campaign_id;
          const active = isActiveStatus(status);

          const redStatuses = ["not delivering", "disapproved", "with issues"];
          const yellowStatuses = ["in process", "pending review", "active - ad groups paused", "active - budget exceeded", "active - not started"];
          const dimStatuses = ["archived", "deleted"];

          let dotClass = "bg-muted-foreground/40";
          if (active) dotClass = "bg-green-500";
          if (redStatuses.includes(status)) dotClass = "bg-red-500";
          if (yellowStatuses.includes(status)) dotClass = "bg-yellow-500";
          if (dimStatuses.includes(status)) dotClass = "bg-muted-foreground/20";
          if (status.startsWith("active -")) dotClass = "bg-yellow-500";

          const isPaused = status.toLowerCase() === "paused" || status.toLowerCase() === "disable";
          const canToggle = row.campaign_id && (active || isPaused);

          return (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className={`h-2 w-2 rounded-full shrink-0 ${dotClass}`} />
                <span className="text-xs text-muted-foreground capitalize truncate">{normalizeStatus(status)}</span>
              </div>
              {canToggle && (
                <div className="shrink-0 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  {isToggling ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  ) : (
                    <Switch
                      checked={active}
                      onCheckedChange={() => {
                        const action = active ? "pause" : "enable";
                        setConfirmToggle({ row, action });
                      }}
                      className="scale-75"
                    />
                  )}
                </div>
              )}
            </div>
          );
        },
      }),
      columnHelper.display({
        id: "reach",
        header: "Reach",
        cell: (info) => <span className="font-mono text-sm">{fmtNum(info.row.original.reach ?? 0)}</span>,
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
          const cpm = row.cpm ?? safeDivide(row.spend, row.impressions) * 1000;
          return <span className="font-mono text-sm">{fmt(cpm)}</span>;
        },
      }),
    ];

    // Sales funnel columns
    if (showColumns.sales) {
      cols.push(
        columnHelper.display({
          id: "view_content",
          header: "View Content",
          cell: (info) => {
            const row = info.row.original;
            const obj = row.objective || "";
            if (selectedPreset === "auto" && obj && obj !== "sales") return <span className="text-muted-foreground/40 text-xs">—</span>;
            return <span className="font-mono text-sm">{fmtNum(row.view_content ?? 0)}</span>;
          },
        }),
        columnHelper.display({
          id: "add_to_cart",
          header: "Add to Cart",
          cell: (info) => {
            const row = info.row.original;
            const obj = row.objective || "";
            if (selectedPreset === "auto" && obj && obj !== "sales") return <span className="text-muted-foreground/40 text-xs">—</span>;
            return <span className="font-mono text-sm">{fmtNum(row.add_to_cart ?? 0)}</span>;
          },
        }),
        columnHelper.display({
          id: "initiate_checkout",
          header: "Checkout",
          cell: (info) => {
            const row = info.row.original;
            const obj = row.objective || "";
            if (selectedPreset === "auto" && obj && obj !== "sales") return <span className="text-muted-foreground/40 text-xs">—</span>;
            return <span className="font-mono text-sm">{fmtNum(row.initiate_checkout ?? 0)}</span>;
          },
        }),
        columnHelper.display({
          id: "purchase",
          header: "Purchase",
          cell: (info) => {
            const row = info.row.original;
            const obj = row.objective || "";
            if (selectedPreset === "auto" && obj && obj !== "sales") return <span className="text-muted-foreground/40 text-xs">—</span>;
            return <span className="font-mono text-sm font-medium">{fmtNum(row.purchase ?? 0)}</span>;
          },
        }),
        columnHelper.display({
          id: "cost_per_purchase",
          header: "Cost/Purchase",
          cell: (info) => {
            const row = info.row.original;
            const obj = row.objective || "";
            if (selectedPreset === "auto" && obj && obj !== "sales") return <span className="text-muted-foreground/40 text-xs">—</span>;
            const cpp = (row.purchase ?? 0) > 0 ? row.spend / row.purchase! : 0;
            return <span className="font-mono text-sm">{fmt(cpp)}</span>;
          },
        }),
      );
    }

    // Messages columns
    if (showColumns.messages) {
      cols.push(
        columnHelper.display({
          id: "messaging_conversations",
          header: "Messages",
          cell: (info) => {
            const row = info.row.original;
            const obj = row.objective || "";
            if (selectedPreset === "auto" && obj && obj !== "messages") return <span className="text-muted-foreground/40 text-xs">—</span>;
            return <span className="font-mono text-sm font-medium">{fmtNum(row.messaging_conversations ?? 0)}</span>;
          },
        }),
        columnHelper.display({
          id: "new_messaging_contacts",
          header: "New Contacts",
          cell: (info) => {
            const row = info.row.original;
            const obj = row.objective || "";
            if (selectedPreset === "auto" && obj && obj !== "messages") return <span className="text-muted-foreground/40 text-xs">—</span>;
            return <span className="font-mono text-sm">{fmtNum(row.new_messaging_contacts ?? 0)}</span>;
          },
        }),
        columnHelper.display({
          id: "returning_messaging",
          header: "Returning",
          cell: (info) => {
            const row = info.row.original;
            const obj = row.objective || "";
            if (selectedPreset === "auto" && obj && obj !== "messages") return <span className="text-muted-foreground/40 text-xs">—</span>;
            const returning = Math.max(0, (row.messaging_conversations ?? 0) - (row.new_messaging_contacts ?? 0));
            return <span className="font-mono text-sm">{fmtNum(returning)}</span>;
          },
        }),
        columnHelper.display({
          id: "create_order",
          header: "Create Order",
          cell: (info) => {
            const row = info.row.original;
            const obj = row.objective || "";
            if (selectedPreset === "auto" && obj && obj !== "messages") return <span className="text-muted-foreground/40 text-xs">—</span>;
            return <span className="font-mono text-sm">{fmtNum(row.create_order ?? 0)}</span>;
          },
        }),
        columnHelper.display({
          id: "cost_per_message",
          header: "Cost/Message",
          cell: (info) => {
            const row = info.row.original;
            const obj = row.objective || "";
            if (selectedPreset === "auto" && obj && obj !== "messages") return <span className="text-muted-foreground/40 text-xs">—</span>;
            const cpm = (row.messaging_conversations ?? 0) > 0 ? row.spend / row.messaging_conversations! : 0;
            return <span className="font-mono text-sm">{fmt(cpm)}</span>;
          },
        }),
      );
    }

    // Performance columns (clicks, CTR, CPC)
    if (showColumns.performance) {
      cols.push(
        columnHelper.accessor("clicks", {
          header: "Clicks",
          cell: (info) => <span className="font-mono text-sm">{fmtNum(info.getValue())}</span>,
        }),
        columnHelper.display({
          id: "ctr",
          header: "CTR",
          cell: (info) => {
            const row = info.row.original;
            const ctr = row.impressions > 0 ? (row.clicks / row.impressions) * 100 : 0;
            return <span className="font-mono text-sm">{ctr.toFixed(2)}%</span>;
          },
        }),
        columnHelper.display({
          id: "cpc",
          header: "CPC",
          cell: (info) => {
            const row = info.row.original;
            const cpc = row.clicks > 0 ? row.spend / row.clicks : 0;
            return <span className="font-mono text-sm">{fmt(cpc)}</span>;
          },
        }),
      );
    }

    // Generic results column (always show)
    cols.push(
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
    );

    return cols;
  }, [togglingId, selectedIds, selectableRows, toggleSelect, toggleSelectAll, showColumns, selectedPreset]);

  // Column order state for drag-and-drop
  const defaultColumnOrder = useMemo(() => columns.map((c: any) => c.id ?? c.accessorKey ?? ""), [columns]);
  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>(savedColumnOrder ?? defaultColumnOrder);

  // Update column order when columns change (preset switch)
  useEffect(() => {
    if (savedColumnOrder && savedColumnOrder.length > 0) {
      // Merge: keep saved order for columns that still exist, add new ones at end
      const currentIds = new Set(defaultColumnOrder);
      const validSaved = savedColumnOrder.filter(id => currentIds.has(id));
      const newCols = defaultColumnOrder.filter(id => !validSaved.includes(id));
      setColumnOrder([...validSaved, ...newCols]);
    } else {
      setColumnOrder(defaultColumnOrder);
    }
  }, [defaultColumnOrder, savedColumnOrder]);

  const table = useReactTable({
    data: paginatedData,
    columns,
    state: { sorting, columnOrder },
    onSortingChange: setSorting,
    onColumnOrderChange: setColumnOrder,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  // Drag handlers
  const dragGhostRef = useRef<HTMLDivElement | null>(null);

  const handleDragStart = (e: React.DragEvent, columnId: string) => {
    if (isFrozen(columnId)) return;
    setDraggedCol(columnId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", columnId);

    // Create premium ghost element
    const ghost = document.createElement("div");
    ghost.className = "fixed pointer-events-none px-3 py-1.5 rounded-md text-xs font-semibold uppercase tracking-wider shadow-lg border";
    ghost.style.cssText = `background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); z-index: 9999; top: -100px; left: -100px;`;
    ghost.textContent = (e.currentTarget as HTMLElement).textContent?.trim() || columnId;
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, ghost.offsetHeight / 2);
    dragGhostRef.current = ghost;
    setTimeout(() => ghost.remove(), 0);
  };

  const handleDragOver = (e: React.DragEvent, columnId: string) => {
    if (!draggedCol || isFrozen(columnId) || draggedCol === columnId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTarget(columnId);
  };

  const handleDragLeave = () => {
    setDropTarget(null);
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedCol || draggedCol === targetId || isFrozen(targetId)) return;

    setColumnOrder((prev) => {
      const newOrder = [...prev];
      const fromIdx = newOrder.indexOf(draggedCol);
      const toIdx = newOrder.indexOf(targetId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      // Don't allow dropping into frozen positions
      if (toIdx < FROZEN_COLS.length) return prev;
      newOrder.splice(fromIdx, 1);
      newOrder.splice(toIdx, 0, draggedCol);
      onColumnOrderChange?.(newOrder);
      return newOrder;
    });

    setDraggedCol(null);
    setDropTarget(null);
  };

  const handleDragEnd = () => {
    setDraggedCol(null);
    setDropTarget(null);
    if (dragGhostRef.current) {
      dragGhostRef.current.remove();
      dragGhostRef.current = null;
    }
  };

  const totals = useMemo(() => {
    const t = { spend: 0, impressions: 0, clicks: 0, results: 0, convValue: 0, viewContent: 0, addToCart: 0, initiateCheckout: 0, purchase: 0, messagingConversations: 0, reach: 0, newMessagingContacts: 0, createOrder: 0 };
    for (const r of filteredData) {
      t.spend += r.spend;
      t.impressions += r.impressions;
      t.clicks += r.clicks;
      t.results += r.results;
      t.convValue += r.conversion_value;
      t.viewContent += r.view_content ?? 0;
      t.addToCart += r.add_to_cart ?? 0;
      t.initiateCheckout += r.initiate_checkout ?? 0;
      t.purchase += r.purchase ?? 0;
      t.messagingConversations += r.messaging_conversations ?? 0;
      t.reach += r.reach ?? 0;
      t.newMessagingContacts += r.new_messaging_contacts ?? 0;
      t.createOrder += r.create_order ?? 0;
    }
    return t;
  }, [filteredData]);

  const totalRoas = safeDivide(totals.convValue, totals.spend);
  const totalCpm = safeDivide(totals.spend, totals.impressions) * 1000;
  const totalCpo = safeDivide(totals.spend, totals.results);
  const totalCostPerPurchase = safeDivide(totals.spend, totals.purchase);
  const totalCostPerMessage = safeDivide(totals.spend, totals.messagingConversations);

  // Mobile campaign card component
  const MobileCampaignCard = ({ row }: { row: CampaignRow }) => {
    const roas = safeDivide(row.conversion_value, row.spend);
    const cpo = safeDivide(row.spend, row.results);
    const pb = PLATFORM_BADGE[row.platform] || { label: row.platform, className: "bg-muted text-muted-foreground border-border" };
    const isSelectable = row.campaign_id && isActiveStatus(row.status);
    const isSelected = row.campaign_id ? selectedIds.has(row.campaign_id) : false;
    const isToggling = togglingId === row.campaign_id;
    const active = isActiveStatus(row.status);
    const isPaused = row.status.toLowerCase() === "paused" || row.status.toLowerCase() === "disable";
    const canToggle = row.campaign_id && (active || isPaused);

    const normalized = normalizeStatus(row.status);
    const redStatuses = ["not delivering", "disapproved", "with issues"];
    const yellowStatuses = ["in process", "pending review", "active - ad groups paused", "active - budget exceeded", "active - not started"];
    let dotClass = "bg-muted-foreground/40";
    if (active) dotClass = "bg-green-500";
    if (redStatuses.includes(normalized)) dotClass = "bg-red-500";
    if (yellowStatuses.includes(normalized)) dotClass = "bg-yellow-500";
    if (normalized.startsWith("active -")) dotClass = "bg-yellow-500";

    let roasClass = "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30";
    if (roas > 3) roasClass = "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30";
    else if (roas < 1.5) roasClass = "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30";

    const showMobileSales = selectedPreset === "sales" || (selectedPreset === "auto" && row.objective === "sales");
    const showMobileMessages = selectedPreset === "messages" || (selectedPreset === "auto" && row.objective === "messages");
    const showMobilePerformance = selectedPreset === "performance" || (selectedPreset === "auto" && row.objective !== "sales" && row.objective !== "messages");

    return (
      <div className={cn("mobile-card relative", isSelected && "ring-1 ring-primary/50 bg-primary/5")}>
        <div className="flex items-start gap-2.5">
          {isSelectable ? (
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => toggleSelect(row.campaign_id!)}
              className="mt-0.5 shrink-0"
            />
          ) : (
            <div className="w-4 shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium truncate">{row.campaign_name}</span>
              <Badge variant="outline" className={`text-[10px] font-semibold shrink-0 ${pb.className}`}>{pb.label}</Badge>
            </div>
            {row.ad_account_name && (
              <p className="text-[10px] text-muted-foreground truncate mt-0.5">{row.ad_account_name}</p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between mt-2.5 mb-2">
          <div className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${dotClass}`} />
            <span className="text-xs text-muted-foreground capitalize">{normalizeStatus(row.status)}</span>
          </div>
          {canToggle && (
            <div className="flex items-center gap-1">
              {isToggling ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              ) : (
                <Switch
                  checked={active}
                  onCheckedChange={() => {
                    const action = active ? "pause" : "enable";
                    setConfirmToggle({ row, action });
                  }}
                  className="scale-75"
                />
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 pt-2 border-t border-border/50">
          <div className="flex justify-between">
            <span className="text-[10px] text-muted-foreground uppercase">Spend</span>
            <span className="font-mono text-xs font-medium">{fmt(row.spend)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[10px] text-muted-foreground uppercase">Reach</span>
            <span className="font-mono text-xs">{fmtNum(row.reach ?? 0)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[10px] text-muted-foreground uppercase">Impr.</span>
            <span className="font-mono text-xs">{fmtNum(row.impressions)}</span>
          </div>

          {showMobileSales && (
            <>
              <div className="flex justify-between">
                <span className="text-[10px] text-muted-foreground uppercase">View Content</span>
                <span className="font-mono text-xs">{fmtNum(row.view_content ?? 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[10px] text-muted-foreground uppercase">Add to Cart</span>
                <span className="font-mono text-xs">{fmtNum(row.add_to_cart ?? 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[10px] text-muted-foreground uppercase">Checkout</span>
                <span className="font-mono text-xs">{fmtNum(row.initiate_checkout ?? 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[10px] text-muted-foreground uppercase">Purchase</span>
                <span className="font-mono text-xs font-medium">{fmtNum(row.purchase ?? 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[10px] text-muted-foreground uppercase">Cost/Purchase</span>
                <span className="font-mono text-xs">{fmt((row.purchase ?? 0) > 0 ? row.spend / row.purchase! : 0)}</span>
              </div>
            </>
          )}

          {showMobileMessages && (
            <>
              <div className="flex justify-between">
                <span className="text-[10px] text-muted-foreground uppercase">Messages</span>
                <span className="font-mono text-xs font-medium">{fmtNum(row.messaging_conversations ?? 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[10px] text-muted-foreground uppercase">New Contacts</span>
                <span className="font-mono text-xs">{fmtNum(row.new_messaging_contacts ?? 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[10px] text-muted-foreground uppercase">Returning</span>
                <span className="font-mono text-xs">{fmtNum(Math.max(0, (row.messaging_conversations ?? 0) - (row.new_messaging_contacts ?? 0)))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[10px] text-muted-foreground uppercase">Create Order</span>
                <span className="font-mono text-xs">{fmtNum(row.create_order ?? 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[10px] text-muted-foreground uppercase">Cost/Message</span>
                <span className="font-mono text-xs">{fmt((row.messaging_conversations ?? 0) > 0 ? row.spend / row.messaging_conversations! : 0)}</span>
              </div>
            </>
          )}

          {showMobilePerformance && (
            <>
              <div className="flex justify-between">
                <span className="text-[10px] text-muted-foreground uppercase">Clicks</span>
                <span className="font-mono text-xs">{fmtNum(row.clicks)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[10px] text-muted-foreground uppercase">CTR</span>
                <span className="font-mono text-xs">{(row.impressions > 0 ? (row.clicks / row.impressions) * 100 : 0).toFixed(2)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[10px] text-muted-foreground uppercase">CPC</span>
                <span className="font-mono text-xs">{fmt(row.clicks > 0 ? row.spend / row.clicks : 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[10px] text-muted-foreground uppercase">Results</span>
                <span className="font-mono text-xs font-medium">{row.results.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[10px] text-muted-foreground uppercase">CPR</span>
                <span className="font-mono text-xs">{fmt(cpo)}</span>
              </div>
            </>
          )}

          <div className="flex justify-between">
            <span className="text-[10px] text-muted-foreground uppercase">ROAS</span>
            <Badge variant="outline" className={`text-[10px] font-mono h-5 ${roasClass}`}>{roas.toFixed(2)}x</Badge>
          </div>
          {!showMobilePerformance && (
            <div className="flex justify-between">
              <span className="text-[10px] text-muted-foreground uppercase">Clicks</span>
              <span className="font-mono text-xs">{fmtNum(row.clicks)}</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search campaigns..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-10 sm:h-9 text-sm"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[160px] h-10 sm:h-9 text-sm">
            <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {uniqueStatuses.map((s) => (
              <SelectItem key={s} value={s}>
                <span className="capitalize">{normalizeStatus(s)}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1">
          <Select value={selectedPreset} onValueChange={(v) => handlePresetChange(v as PresetType)}>
            <SelectTrigger className="w-full sm:w-[160px] h-10 sm:h-9 text-sm">
              <LayoutGrid className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
              <SelectValue placeholder="Preset" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto Detect</SelectItem>
              <SelectItem value="messages">Messages</SelectItem>
              <SelectItem value="sales">Sales</SelectItem>
              <SelectItem value="performance">Performance</SelectItem>
            </SelectContent>
          </Select>
          {onSetDefaultPreset && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={selectedPreset === defaultPreset ? "secondary" : "outline"}
                    size="icon"
                    className="h-10 sm:h-9 w-10 sm:w-9 shrink-0"
                    onClick={() => onSetDefaultPreset(selectedPreset)}
                  >
                    <Star className={cn("h-4 w-4", selectedPreset === defaultPreset ? "fill-primary text-primary" : "text-muted-foreground")} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{selectedPreset === defaultPreset ? "Current default preset" : "Set as default preset"}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>

      <div className="relative">
        {/* Mobile card view */}
        <div className="flex flex-col gap-2 md:hidden">
          {paginatedData.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">No campaign data available</div>
          ) : (
            paginatedData.map((row, i) => <MobileCampaignCard key={`${row.campaign_name}-${i}`} row={row} />)
          )}
        </div>

        {/* Desktop table view */}
        <div className="hidden md:block overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id}>
                  {hg.headers.map((header) => {
                    const isDraggable = header.id !== "select";
                    const isBeingDragged = draggedCol === header.id;
                    const isDropTarget = dropTarget === header.id;
                    return (
                      <TableHead
                        key={header.id}
                        className={cn(
                          header.id === "select" ? "w-10" : "cursor-pointer",
                          "select-none hover:bg-muted/50 transition-colors text-xs uppercase tracking-wider",
                          isDraggable && "cursor-grab active:cursor-grabbing",
                          isBeingDragged && "opacity-50",
                          isDropTarget && "border-l-2 border-primary"
                        )}
                        onClick={header.id !== "select" ? header.column.getToggleSortingHandler() : undefined}
                        draggable={isDraggable}
                        onDragStart={(e) => handleDragStart(e, header.id)}
                        onDragOver={(e) => handleDragOver(e, header.id)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, header.id)}
                        onDragEnd={handleDragEnd}
                      >
                        <div className="flex items-center gap-1">
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          {header.id !== "select" && (
                            header.column.getIsSorted() === "asc" ? (
                              <ArrowUp className="h-3 w-3" />
                            ) : header.column.getIsSorted() === "desc" ? (
                              <ArrowDown className="h-3 w-3" />
                            ) : (
                              <ArrowUpDown className="h-3 w-3 text-muted-foreground/50" />
                            )
                          )}
                        </div>
                      </TableHead>
                    );
                  })}
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
                  {table.getRowModel().rows.map((row) => {
                    const isSelected = row.original.campaign_id ? selectedIds.has(row.original.campaign_id) : false;
                    return (
                      <TableRow
                        key={row.id}
                        className={`hover:bg-muted/30 transition-colors ${isSelected ? "bg-primary/5" : ""}`}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id}>
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        ))}
                      </TableRow>
                    );
                  })}
                  {filteredData.length > 1 && (
                    <TableRow className="bg-muted/40 font-semibold border-t-2">
                      <TableCell />
                      <TableCell className="text-sm">Totals</TableCell>
                      <TableCell />
                      <TableCell />
                      <TableCell className="font-mono text-sm">{fmtNum(totals.reach)}</TableCell>
                      <TableCell className="font-mono text-sm">{fmtNum(totals.impressions)}</TableCell>
                      <TableCell className="font-mono text-sm">{fmt(totalCpm)}</TableCell>
                      {showColumns.sales && (
                        <>
                          <TableCell className="font-mono text-sm">{fmtNum(totals.viewContent)}</TableCell>
                          <TableCell className="font-mono text-sm">{fmtNum(totals.addToCart)}</TableCell>
                          <TableCell className="font-mono text-sm">{fmtNum(totals.initiateCheckout)}</TableCell>
                          <TableCell className="font-mono text-sm">{fmtNum(totals.purchase)}</TableCell>
                          <TableCell className="font-mono text-sm">{fmt(totalCostPerPurchase)}</TableCell>
                        </>
                      )}
                      {showColumns.messages && (
                        <>
                          <TableCell className="font-mono text-sm">{fmtNum(totals.messagingConversations)}</TableCell>
                          <TableCell className="font-mono text-sm">{fmtNum(totals.newMessagingContacts)}</TableCell>
                          <TableCell className="font-mono text-sm">{fmtNum(Math.max(0, totals.messagingConversations - totals.newMessagingContacts))}</TableCell>
                          <TableCell className="font-mono text-sm">{fmtNum(totals.createOrder)}</TableCell>
                          <TableCell className="font-mono text-sm">{fmt(totalCostPerMessage)}</TableCell>
                        </>
                      )}
                      {showColumns.performance && (
                        <>
                          <TableCell className="font-mono text-sm">{fmtNum(totals.clicks)}</TableCell>
                          <TableCell className="font-mono text-sm">{(totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0).toFixed(2)}%</TableCell>
                          <TableCell className="font-mono text-sm">{fmt(totals.clicks > 0 ? totals.spend / totals.clicks : 0)}</TableCell>
                        </>
                      )}
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

        {/* Floating bulk action bar */}
        {selectedIds.size > 0 && (
          <div className="sticky bottom-16 md:bottom-0 mt-2 flex items-center justify-between gap-3 rounded-lg border bg-card p-3 shadow-lg">
            <span className="text-sm font-medium text-foreground">
              {selectedIds.size} campaign{selectedIds.size > 1 ? "s" : ""} selected
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedIds(new Set())}
                className="h-8 text-xs"
              >
                <X className="h-3.5 w-3.5 mr-1" /> Clear
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowBulkConfirm(true)}
                className="h-8 text-xs"
              >
                <Power className="h-3.5 w-3.5 mr-1" /> Pause All
              </Button>
            </div>
          </div>
        )}
      </div>

      <TablePagination
        totalItems={filteredData.length}
        pageSize={pageSize}
        currentPage={currentPage}
        onPageChange={(p) => { setCurrentPage(p); setSelectedIds(new Set()); }}
        onPageSizeChange={setPageSize}
      />

      {/* Toggle confirm dialog */}
      <AlertDialog open={!!confirmToggle} onOpenChange={() => setConfirmToggle(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmToggle?.action === "enable" ? "Enable" : "Pause"} Campaign?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmToggle?.action === "enable" ? (
                <>This will enable <strong>"{confirmToggle?.row.campaign_name}"</strong> on the ad platform. It will start delivering ads again.</>
              ) : (
                <>This will pause <strong>"{confirmToggle?.row.campaign_name}"</strong> directly on the ad platform. It will stop delivering ads.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={confirmToggle?.action === "enable"
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-destructive text-destructive-foreground hover:bg-destructive/90"
              }
              onClick={() => confirmToggle && handleToggle(confirmToggle.row, confirmToggle.action)}
            >
              {togglingId ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {confirmToggle?.action === "enable" ? "Enable Campaign" : "Pause Campaign"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk pause confirm */}
      <AlertDialog open={showBulkConfirm} onOpenChange={(open) => { if (!bulkPausing) setShowBulkConfirm(open); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pause {selectedIds.size} Campaign{selectedIds.size > 1 ? "s" : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will pause <strong>{selectedIds.size} active campaign{selectedIds.size > 1 ? "s" : ""}</strong> directly on their ad platforms.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkPausing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); handleBulkPause(); }}
              disabled={bulkPausing}
            >
              {bulkPausing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Pausing {bulkProgress.current} of {bulkProgress.total}…
                </>
              ) : (
                `Pause ${selectedIds.size} Campaign${selectedIds.size > 1 ? "s" : ""}`
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
