import { Link } from "react-router-dom";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { RunwayBadge } from "./RunwayBadge";
import type { ActiveClientRow } from "@/hooks/useActiveEntitiesOverview";

const usd = (n: number) => `$${(Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const bdt = (n: number) => `৳${(Number(n) || 0).toLocaleString("en-US")}`;

interface Props {
  rows: ActiveClientRow[];
}

export function ActiveClientsTable({ rows }: Props) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        No clients are currently running campaigns with spend in the last 7 days.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <Table className="min-w-[960px]">
        <TableHeader>
          <TableRow>
            <TableHead>Client</TableHead>
            <TableHead className="text-right">Accts</TableHead>
            <TableHead className="text-right">Camp.</TableHead>
            <TableHead className="text-right">Today</TableHead>
            <TableHead className="text-right">7d Spend</TableHead>
            <TableHead className="text-right">30d Spend</TableHead>
            <TableHead className="text-right">Wallet</TableHead>
            <TableHead className="text-right">Runway</TableHead>
            <TableHead className="text-right">Profit (BDT)</TableHead>
            <TableHead className="text-right">Margin</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.client_id}>
              <TableCell className="font-medium">
                <Link to={`/admin/clients/${r.client_id}`} className="hover:underline">
                  {r.client_name}
                </Link>
              </TableCell>
              <TableCell className="text-right font-mono text-xs">{r.active_accounts}</TableCell>
              <TableCell className="text-right font-mono text-xs">{r.active_campaigns}</TableCell>
              <TableCell className="text-right font-mono text-xs">{usd(r.spend_today)}</TableCell>
              <TableCell className="text-right font-mono text-xs">{usd(r.spend_7d)}</TableCell>
              <TableCell className="text-right font-mono text-xs">{usd(r.spend_30d)}</TableCell>
              <TableCell className="text-right font-mono text-xs">
                <span className={r.wallet_usd < 0 ? "text-destructive" : ""}>{usd(r.wallet_usd)}</span>
              </TableCell>
              <TableCell className="text-right">
                <RunwayBadge days={r.runway_days} />
              </TableCell>
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
