import { useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { useLocation, matchPath } from "react-router-dom";

const SITE = "https://heptbd.com";
const OG_IMAGE = `${SITE}/og-image.jpg`;

type Meta = { title: string; description: string; index?: boolean };

/**
 * Route metadata map. Public marketing/auth routes are indexable with unique
 * titles + descriptions; authenticated app routes get unique titles but are
 * marked noindex (they are private dashboards, not search results).
 */
const ROUTE_META: Record<string, Meta> = {
  "/": {
    title: "HEPT — Automate Your Ad Agency. Scale Your Clients.",
    description:
      "HEPT automates ad spend reporting, client billing, and profit analytics for media-buying agencies across Meta, TikTok, and Google.",
    index: true,
  },
  "/login": {
    title: "Log In to Your HEPT Agency Dashboard",
    description:
      "Sign in to HEPT to track ad spend, approve client payments, and monitor campaign profitability in real time.",
    index: true,
  },
  "/signup": {
    title: "Create Your HEPT Agency Account",
    description:
      "Start your HEPT agency account and automate ad spend reporting, client wallets, and billing for Meta, TikTok, and Google campaigns.",
    index: true,
  },
  "/affiliate/login": {
    title: "Affiliate Login — HEPT Partner Portal",
    description:
      "Log in to the HEPT affiliate portal to track referrals, commissions, and payout history.",
    index: true,
  },
  "/affiliate/register": {
    title: "Become a HEPT Affiliate Partner",
    description:
      "Join the HEPT affiliate program and earn recurring commission for every agency you refer to the platform.",
    index: true,
  },
  "/payment-success": { title: "Payment Successful — HEPT", description: "Your payment to HEPT was completed successfully." },
  "/payment-failed": { title: "Payment Failed — HEPT", description: "Your payment to HEPT could not be completed." },

  // Agency admin
  "/admin": { title: "Agency Dashboard — HEPT", description: "Live overview of agency ad spend, client balances, and profit." },
  "/admin/profitability": { title: "Active Profitability — HEPT", description: "Profit per active ad account and client." },
  "/admin/attention": { title: "Attention Required — HEPT", description: "Accounts and clients that need immediate action." },
  "/admin/clients": { title: "Clients — HEPT", description: "Manage all agency clients, balances, and assignments." },
  "/admin/clients/new": { title: "Add New Client — HEPT", description: "Create a new agency client account." },
  "/admin/clients/:userId": { title: "Client Details — HEPT", description: "Client spend, wallet, payments, and campaign performance." },
  "/admin/add-funds": { title: "Add Funds — HEPT", description: "Record a client deposit and top up wallet balance." },
  "/admin/profile": { title: "My Profile — HEPT", description: "Manage your agency admin profile." },
  "/admin/settings": { title: "Agency Settings — HEPT", description: "Configure branding, pricing, automation, and integrations." },
  "/admin/sync-health": { title: "Sync Health — HEPT", description: "Monitor platform API sync jobs and data freshness." },
  "/admin/logs": { title: "Audit Logs — HEPT", description: "Review every administrative action across the agency." },
  "/admin/team": { title: "Team Management — HEPT", description: "Manage team members, roles, and permissions." },
  "/admin/team/:userId": { title: "Team Member Details — HEPT", description: "Member permissions and client assignments." },
  "/admin/ad-accounts": { title: "Ad Accounts — HEPT", description: "All connected Meta, TikTok, and Google ad accounts." },
  "/admin/ad-accounts/:accountId": { title: "Ad Account Details — HEPT", description: "Spend, billing, and campaigns for this ad account." },
  "/admin/integrations": { title: "Integrations — HEPT", description: "Connect Meta, TikTok, and Google ad platforms." },
  "/admin/campaigns": { title: "Campaign Analytics — HEPT", description: "Campaign, ad set, and ad level performance analytics." },
  "/admin/finance": { title: "Finance Hub — HEPT", description: "Cash flow, expenses, wallet inventory, and P&L." },
  "/admin/payment-requests": { title: "Payment Requests — HEPT", description: "Review and approve client deposit requests." },
  "/admin/orders": { title: "Order Management — HEPT", description: "Track and fulfil client orders." },
  "/admin/client-notices": { title: "Client Notices — HEPT", description: "Broadcast urgent notices to client dashboards." },
  "/admin/notifications": { title: "Notifications — HEPT", description: "All agency alerts and activity notifications." },
  "/admin/subscription": { title: "Subscription & Billing — HEPT", description: "Manage your HEPT plan and payments." },
  "/admin/support": { title: "Support — HEPT", description: "Get help from the HEPT platform team." },
  "/admin/ai-copilot": { title: "AI Copilot — HEPT", description: "Ask AI about your agency performance data." },
  "/admin/ai-campaign-builder": { title: "AI Campaign Builder — HEPT", description: "Draft campaigns with AI assistance." },

  // Manager
  "/manager": { title: "Manager Dashboard — HEPT", description: "Performance overview for your assigned clients." },
  "/manager/add-funds": { title: "Add Funds — HEPT", description: "Record a deposit for an assigned client." },
  "/manager/notifications": { title: "Notifications — HEPT", description: "Alerts for your assigned clients." },

  // Client portal
  "/dashboard": { title: "Client Dashboard — HEPT", description: "Your live ad spend, balance, and campaign results." },
  "/dashboard/wallet": { title: "My Wallet — HEPT", description: "Balance, deposits, and transaction history." },
  "/dashboard/campaigns": { title: "My Campaign Requests — HEPT", description: "Track your submitted campaign requests." },
  "/dashboard/campaigns/new": { title: "New Campaign Request — HEPT", description: "Submit a new campaign brief to your agency." },
  "/dashboard/reports": { title: "My Reports — HEPT", description: "Detailed performance reports for your campaigns." },
  "/dashboard/notifications": { title: "Notifications — HEPT", description: "Your account and campaign notifications." },

  // Affiliate portal
  "/affiliate": { title: "Affiliate Dashboard — HEPT", description: "Referral performance and commission overview." },
  "/affiliate/links": { title: "Referral Links — HEPT", description: "Create and manage your referral links." },
  "/affiliate/earnings": { title: "Affiliate Earnings — HEPT", description: "Track commissions earned from referrals." },
  "/affiliate/payouts": { title: "Affiliate Payouts — HEPT", description: "Request and track affiliate payouts." },
  "/affiliate/profile": { title: "Affiliate Profile — HEPT", description: "Manage your affiliate account details." },

  // Platform owner
  "/platform": { title: "Platform Dashboard — HEPT", description: "Platform-wide tenant and revenue overview." },
  "/platform/lifecycle": { title: "Tenant Lifecycle — HEPT", description: "Trials, upgrades, and churn across tenants." },
  "/platform/finance": { title: "Platform Finance — HEPT", description: "MRR, NRR, and platform cash flow." },
  "/platform/agencies": { title: "Agencies — HEPT", description: "All agencies on the platform." },
  "/platform/agencies/new": { title: "Create Agency — HEPT", description: "Provision a new agency tenant." },
  "/platform/agencies/:agencyId": { title: "Agency Details — HEPT", description: "Tenant usage, plan, and billing details." },
  "/platform/billing": { title: "Platform Billing — HEPT", description: "Tenant invoices and payment status." },
  "/platform/plans": { title: "Subscription Plans — HEPT", description: "Configure plans, limits, and features." },
  "/platform/announcements": { title: "Announcements — HEPT", description: "Broadcast platform announcements to agencies." },
  "/platform/affiliates": { title: "Affiliate Program — HEPT", description: "Manage affiliates and commission payouts." },
  "/platform/audit": { title: "Platform Audit Log — HEPT", description: "Platform-level administrative activity." },
  "/platform/payment-gateways": { title: "Payment Gateways — HEPT", description: "Configure platform payment providers." },
};

const FALLBACK: Meta = {
  title: "Page Not Found — HEPT",
  description: "The page you are looking for does not exist on HEPT.",
};

function resolveMeta(pathname: string): { meta: Meta; pattern: string } {
  const exact = ROUTE_META[pathname];
  if (exact) return { meta: exact, pattern: pathname };
  for (const pattern of Object.keys(ROUTE_META)) {
    if (pattern.includes(":") && matchPath(pattern, pathname)) {
      return { meta: ROUTE_META[pattern], pattern };
    }
  }
  return { meta: FALLBACK, pattern: pathname };
}

/**
 * Applies unique per-route <title>, description, canonical and og:* tags.
 * Mounted once inside the router.
 */
export function RouteMeta() {
  const { pathname } = useLocation();

  // The static index.html head keeps sitewide description/og tags as a
  // fallback for crawlers that do not execute JS. Once React runs, Helmet
  // owns these tags, so drop the static duplicates to avoid two
  // descriptions / og:titles in the live document.
  useEffect(() => {
    const selectors = [
      'meta[name="description"]',
      'meta[property="og:title"]',
      'meta[property="og:description"]',
      'meta[property="og:url"]',
      'meta[property="og:type"]',
      'meta[name="twitter:card"]',
      'meta[name="twitter:title"]',
      'meta[name="twitter:description"]',
    ].join(",");
    document.head.querySelectorAll(selectors).forEach((el) => {
      if (!el.hasAttribute("data-rh")) el.remove();
    });
  }, []);

  const { meta } = resolveMeta(pathname);
  const canonical = `${SITE}${pathname === "/" ? "/" : pathname.replace(/\/$/, "")}`;
  const indexable = meta.index === true;

  return (
    <Helmet>
      <title>{meta.title}</title>
      <meta name="description" content={meta.description} />
      <link rel="canonical" href={canonical} />
      <meta name="robots" content={indexable ? "index, follow" : "noindex, nofollow"} />
      <meta property="og:title" content={meta.title} />
      <meta property="og:description" content={meta.description} />
      <meta property="og:url" content={canonical} />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content="HEPT" />
      <meta property="og:image" content={OG_IMAGE} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content="HEPT agency analytics dashboard showing ad spend, ROAS and client performance." />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={meta.title} />
      <meta name="twitter:description" content={meta.description} />
      <meta name="twitter:image" content={OG_IMAGE} />
    </Helmet>

  );
}

export default RouteMeta;
