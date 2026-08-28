import { Link } from "react-router-dom";
import { ClientNameLink } from "@/components/ClientNameLink";
import { Table, TableBody, TableHead, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { ActiveAccountRow } from "@/hooks/useActiveEntitiesOverview";

const usd = (n: number) => `$${(Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const bdt = (n: number) => `৳${(Number(n) || 0).toLocaleString("en-US")}`;

const PLATFORM_COLORS: Record<string, string> = {
  meta: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  tiktok: "bg-pink-500/10 text-pink-600 dark:text-pink-400",
  google: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
};

function PlatformBadges({ platforms }: { platforms: string }) {
  const list = (platforms || "").split(",").map((p) => p.trim()).filter(Boolean);
  return (
    <div className="flex flex-wrap gap-1">
      {list.map((p) => (
        <Badge key={p} variant="outline" className={`text-[10px] ${PLATFORM_COLORS[p] || ""}`}>
          {p}
        </Badge>
      ))}
    </div>
  );
}

interface Props {
  rows: ActiveAccountRow[];
}

export function ActiveAdAccountsTable({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        No ad accounts are currently running campaigns with spend in the last 7 days.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <Table className="min-w-[960px]">
        <TableHeader>
          <TableRow>
            <TableHead>Ad Account</TableHead>
            <TableHead>Platform</TableHead>
            <TableHead>Client</TableHead>
            <TableHead className="text-right">Camp.</TableHead>
            <TableHead className="text-right">Today</TableHead>
            <TableHead className="text-right">7d Spend</TableHead>
            <TableHead className="text-right">30d Spend</TableHead>
            <TableHead className="text-right">Profit (BDT)</TableHead>
            <TableHead className="text-right">Margin</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.ad_account_id}>
              <TableCell className="font-medium">
                <Link to={`/admin/ad-accounts/${r.ad_account_id}`} className="hover:underline">
                  {r.account_name}
                </Link>
              </TableCell>
              <TableCell><PlatformBadges platforms={r.platforms} /></TableCell>
               <TableCell className="text-muted-foreground">
                 <ClientNameLink clientId={r.client_id} name={r.client_name} />
               </TableCell>
              <TableCell className="text-right font-mono text-xs">{r.active_campaigns}</TableCell>
              <TableCell className="text-right font-mono text-xs">{usd(r.spend_today)}</TableCell>
              <TableCell className="text-right font-mono text-xs">{usd(r.spend_7d)}</TableCell>
              <TableCell className="text-right font-mono text-xs">{usd(r.spend_30d)}</TableCell>
              <TableCell className="text-right font-mono text-xs">{bdt(r.profit_bdt)}</TableCell>
              <TableCell className="text-right">
                <Badge variant={r.margin_pct >= 0 ? "default" : "destructive"} className="text-xs">
                  {r.margin_pct >= 0 ? "+" : ""}
                  {r.margin_pct}%
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
