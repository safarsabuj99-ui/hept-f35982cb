import { FinanceAggregate, ClientProfit } from "./aggregate";

export type InsightTone = "positive" | "warning" | "danger" | "info";
export interface Insight { tone: InsightTone; title: string; detail?: string; }

export function buildInsights(args: {
  current: FinanceAggregate;
  previous: FinanceAggregate | null;
  prevWac: number | null;
}): Insight[] {
  const { current, previous, prevWac } = args;
  const out: Insight[] = [];

  // Take-home negative
  if (current.takeHome < 0) {
    out.push({ tone: "danger", title: "Take-home is negative this period",
      detail: `OpEx + Owner's Draw exceeds gross profit by ৳${Math.abs(current.takeHome).toLocaleString()}.` });
  }

  // Margin delta
  if (previous && previous.revenue > 0 && current.revenue > 0) {
    const delta = Math.round((current.margin - previous.margin) * 10) / 10;
    if (Math.abs(delta) >= 5) {
      out.push({
        tone: delta > 0 ? "positive" : "warning",
        title: `Net margin ${delta > 0 ? "up" : "down"} ${Math.abs(delta)}pp vs previous period`,
        detail: `Now ${current.margin}% (was ${previous.margin}%).`,
      });
    }
  }

  // WAC spike
  if (prevWac && current.wac && Math.abs(current.wac - prevWac) >= 3) {
    const dir = current.wac > prevWac ? "spiked" : "dropped";
    out.push({
      tone: current.wac > prevWac ? "warning" : "positive",
      title: `Avg cost (WAC) ${dir} to ${current.wac} BDT/USD`,
      detail: `Was ${prevWac} BDT/USD in the previous period.`,
    });
  }

  // OpEx heavy
  if (current.grossProfit > 0 && current.opex / current.grossProfit > 0.25) {
    const ratio = Math.round((current.opex / current.grossProfit) * 100);
    out.push({ tone: "warning", title: `OpEx is ${ratio}% of gross profit`,
      detail: "Operational expenses are eating into profit. Review recurring costs." });
  }

  // Concentration risk
  if (current.clients.length > 0 && current.netProfit > 0) {
    const top = current.clients[0];
    const share = Math.round((top.netProfit / current.netProfit) * 100);
    if (share >= 35 && top.netProfit > 0) {
      out.push({ tone: "warning", title: `${top.name} drives ${share}% of net profit`,
        detail: "High client concentration. Diversify revenue to reduce risk." });
    }
  }

  // Loss-making clients
  const losers = current.clients.filter((c: ClientProfit) => c.netProfit < 0);
  if (losers.length > 0) {
    const names = losers.slice(0, 3).map((c) => c.name).join(", ");
    out.push({
      tone: "danger",
      title: `${losers.length} loss-making client${losers.length > 1 ? "s" : ""}: ${names}${losers.length > 3 ? "…" : ""}`,
      detail: "Spend exceeds billed revenue. Review pricing or pause spend.",
    });
  }

  // Thin-margin watch
  const thin = current.clients.filter((c) => c.margin >= 0 && c.margin < 5 && c.revenueBdt > 0);
  if (thin.length > 0 && losers.length === 0) {
    out.push({
      tone: "info",
      title: `${thin.length} client${thin.length > 1 ? "s" : ""} on thin margin (<5%)`,
      detail: thin.slice(0, 3).map((c) => `${c.name} (${c.margin}%)`).join(", "),
    });
  }

  // All clear
  if (out.length === 0) {
    out.push({ tone: "positive", title: "All clear — no anomalies detected",
      detail: "Margins, costs, and client mix are within healthy ranges." });
  }

  return out;
}
