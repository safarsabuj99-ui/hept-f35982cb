import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  BarChart3,
  Users,
  Monitor,
  DollarSign,
  Shield,
  Zap,
  Paintbrush,
  Layout,
  ArrowRight,
  CheckCircle2,
  XCircle,
  TrendingUp,
  FileSpreadsheet,
  Clock,
  Send,
  ChevronRight,
  Globe,
  Wallet,
  Bot,
  Menu,
  X,
} from "lucide-react";

/* ─── scroll-reveal hook ─── */
function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); io.disconnect(); } },
      { threshold: 0.15 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return { ref, visible };
}

function Section({ children, className = "", id }: { children: React.ReactNode; className?: string; id?: string }) {
  const { ref, visible } = useReveal();
  return (
    <section
      ref={ref}
      id={id}
      className={`transition-all duration-700 ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"} ${className}`}
    >
      {children}
    </section>
  );
}

/* ─── data ─── */
const painPoints = [
  { icon: FileSpreadsheet, title: "Tracking Spend on Spreadsheets", desc: "Copy-pasting ad spend from Meta, TikTok & Google into Excel every single day." },
  { icon: DollarSign, title: "Manual Client Billing", desc: "Calculating each client's invoice by hand, converting currencies, chasing payments." },
  { icon: TrendingUp, title: "Zero Profit Visibility", desc: "No idea which client is profitable until end-of-month when it's too late." },
  { icon: Send, title: "Sending Reports Manually", desc: "Screenshotting dashboards and emailing PDF reports to every client, every week." },
];

const featureCategories = [
  {
    icon: BarChart3, title: "Dashboard & Analytics",
    features: ["Real-time KPI cards with live spend data", "Spend trend charts across all platforms", "Profit/loss widgets per client", "Revenue vs cost comparison charts", "Attention alerts for anomalies"],
    color: "from-blue-500/20 to-indigo-500/20",
  },
  {
    icon: Users, title: "Client Management",
    features: ["Complete client database with balances", "Per-client platform pricing rates", "Wallet health & runway prediction", "Client assignment to managers", "Deposit & payment request workflows"],
    color: "from-emerald-500/20 to-teal-500/20",
  },
  {
    icon: Monitor, title: "Ad Account Management",
    features: ["Multi-platform accounts (Meta, TikTok, Google)", "Auto-sync spend from ad platforms via API", "Campaign mapping to clients", "Deep-dive campaign analytics", "Account-level spending limits & alerts"],
    color: "from-purple-500/20 to-pink-500/20",
  },
  {
    icon: DollarSign, title: "Finance & Billing",
    features: ["USD wallet inventory (WAC method)", "BDT-to-USD conversion with live rates", "Expense tracking by category", "Cash flow management & withdrawals", "Payment approval workflow with proof upload"],
    color: "from-amber-500/20 to-orange-500/20",
  },
  {
    icon: Layout, title: "Client Portal",
    features: ["Branded self-service dashboard", "Real-time spend & performance reports", "Wallet balance & deposit requests", "Campaign request system", "Notice board & announcements"],
    color: "from-cyan-500/20 to-sky-500/20",
  },
  {
    icon: Shield, title: "Team & Permissions",
    features: ["Role-based access (Admin, Manager, Client)", "Granular manager permissions", "Full audit log for every action", "Team member detail views", "Secure authentication system"],
    color: "from-rose-500/20 to-red-500/20",
  },
  {
    icon: Zap, title: "Automation Engine",
    features: ["Auto-import ad accounts from APIs", "Auto-snapshot USD exchange rates", "Sync orchestrator for all platforms", "Billing radar alerts (threshold warnings)", "Auto-pause campaigns on low balance"],
    color: "from-yellow-500/20 to-lime-500/20",
  },
  {
    icon: Paintbrush, title: "White-Label Branding",
    features: ["Custom logo & brand name", "Primary & accent color theming", "Branded client-facing portal", "Custom domain support", "Full agency identity, zero HEPT branding"],
    color: "from-fuchsia-500/20 to-violet-500/20",
  },
];

const steps = [
  { num: "01", title: "Connect Your Ad Platforms", desc: "Link your Meta, TikTok & Google Ads accounts. Our API sync pulls spend data automatically — no manual entry ever again.", icon: Globe },
  { num: "02", title: "Add Clients & Set Pricing", desc: "Create client profiles, assign ad accounts, set per-platform pricing rates. The system calculates billable amounts automatically.", icon: Users },
  { num: "03", title: "Everything Auto-Syncs", desc: "Spend tracking, billing, profit calculation, client reports — all updated in real-time. Your clients see their own branded portal.", icon: Bot },
];

const faqs = [
  { q: "Which ad platforms do you support?", a: "HEPT currently supports Meta (Facebook & Instagram), TikTok, and Google Ads. We auto-sync spend data via official APIs so you never have to manually enter numbers again." },
  { q: "How does client billing work?", a: "You set per-platform pricing rates for each client (e.g., $1.05 per $1 spent). HEPT automatically calculates billable amounts based on actual ad spend, converts currencies, and generates invoices. Clients can submit payment proofs through their portal." },
  { q: "Can my clients see their own dashboard?", a: "Yes! Each client gets a branded self-service portal where they can view real-time spend reports, check wallet balance, request deposits, submit campaign requests, and download reports — eliminating manual reporting entirely." },
  { q: "Is my data secure?", a: "Absolutely. HEPT uses enterprise-grade security with row-level access controls, encrypted API tokens, full audit logging of every action, and role-based permissions. Your clients can only see their own data." },
  { q: "How does the USD wallet system work?", a: "HEPT uses a Weighted Average Cost (WAC) method for USD inventory management. When you buy USD at different rates, the system calculates a blended rate. This ensures accurate profit/loss tracking even with fluctuating exchange rates." },
  { q: "Can I white-label the platform?", a: "Yes. You can set your own brand name, logo, and color scheme. Your clients will see your agency branding — not HEPT. It's your platform, your brand." },
  { q: "What happens if a client's balance runs low?", a: "HEPT's Ad Guard system monitors client balances in real-time. When a balance drops below the threshold you set, it can automatically pause their campaigns to prevent overspend, and sends alerts to both you and the client." },
  { q: "Do you offer a free trial?", a: "Yes! You can start with a free trial to explore all features. No credit card required. Once you're ready, choose a plan that fits your agency size." },
];

const comparisonRows = [
  { feature: "Ad spend tracking", without: "Manual copy-paste from each platform daily", with: "Auto-synced every hour from Meta, TikTok & Google" },
  { feature: "Client billing", without: "Excel formulas, manual currency conversion", with: "Automatic calculation with per-client pricing rates" },
  { feature: "Profit visibility", without: "End-of-month surprise (maybe a loss)", with: "Real-time P&L per client, per platform" },
  { feature: "Client reporting", without: "Screenshot dashboards, email PDFs weekly", with: "Clients see their own live portal 24/7" },
  { feature: "Payment tracking", without: "WhatsApp messages & mental notes", with: "Payment requests with proof upload & approval workflow" },
  { feature: "Exchange rates", without: "Google search & calculator", with: "Auto-snapshot USD rates with WAC inventory" },
];

/* ─── component ─── */
export default function LandingPage() {
  const [mobileNav, setMobileNav] = useState(false);

  const scrollTo = (id: string) => {
    setMobileNav(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* ── NAVBAR ── */}
      <nav className="fixed top-0 inset-x-0 z-50 backdrop-blur-xl bg-background/80 border-b border-border/50">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-4 sm:px-6 h-16">
          <span className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-primary to-blue-400 bg-clip-text text-transparent">
            HEPT
          </span>
          <div className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
            <button onClick={() => scrollTo("pain")} className="hover:text-foreground transition-colors">Problems</button>
            <button onClick={() => scrollTo("features")} className="hover:text-foreground transition-colors">Features</button>
            <button onClick={() => scrollTo("how")} className="hover:text-foreground transition-colors">How It Works</button>
            <button onClick={() => scrollTo("compare")} className="hover:text-foreground transition-colors">Compare</button>
            <button onClick={() => scrollTo("faq")} className="hover:text-foreground transition-colors">FAQ</button>
          </div>
          <div className="hidden md:flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild><Link to="/login">Login</Link></Button>
            <Button size="sm" asChild><Link to="/login">Get Started Free <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link></Button>
          </div>
          <button className="md:hidden" onClick={() => setMobileNav(!mobileNav)}>
            {mobileNav ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {mobileNav && (
          <div className="md:hidden border-t border-border/50 bg-background/95 backdrop-blur-xl px-4 py-4 space-y-3 text-sm">
            <button onClick={() => scrollTo("pain")} className="block w-full text-left py-1">Problems</button>
            <button onClick={() => scrollTo("features")} className="block w-full text-left py-1">Features</button>
            <button onClick={() => scrollTo("how")} className="block w-full text-left py-1">How It Works</button>
            <button onClick={() => scrollTo("compare")} className="block w-full text-left py-1">Compare</button>
            <button onClick={() => scrollTo("faq")} className="block w-full text-left py-1">FAQ</button>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" size="sm" className="flex-1" asChild><Link to="/login">Login</Link></Button>
              <Button size="sm" className="flex-1" asChild><Link to="/login">Get Started</Link></Button>
            </div>
          </div>
        )}
      </nav>

      {/* ── HERO ── */}
      <header className="relative pt-32 pb-20 md:pt-44 md:pb-32 overflow-hidden">
        {/* bg glow */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-[-30%] left-1/2 -translate-x-1/2 w-[800px] h-[800px] rounded-full bg-primary/15 blur-[120px]" />
          <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-blue-400/10 blur-[100px]" />
        </div>

        <div className="max-w-5xl mx-auto px-4 sm:px-6 text-center">
          <Badge variant="secondary" className="mb-6 text-xs font-medium px-3 py-1">
            Built for Digital Marketing Agencies 🚀
          </Badge>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-[1.1] tracking-tight mb-6">
            Stop Managing Ad Spend{" "}
            <span className="bg-gradient-to-r from-primary via-blue-400 to-cyan-400 bg-clip-text text-transparent">
              on Spreadsheets
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
            HEPT auto-syncs your Meta, TikTok & Google ad spend, calculates client billing, tracks profit in real-time,
            and gives every client their own branded portal — so you can stop copy-pasting and start scaling.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
            <Button size="lg" className="text-base px-8 h-12 shadow-lg shadow-primary/25" asChild>
              <Link to="/login">Start Free Trial <ArrowRight className="ml-2 h-4 w-4" /></Link>
            </Button>
            <Button size="lg" variant="outline" className="text-base px-8 h-12" onClick={() => scrollTo("features")}>
              See All Features
            </Button>
          </div>
          <div className="flex items-center justify-center gap-6 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> No credit card</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> 14-day free trial</span>
            <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> Cancel anytime</span>
          </div>

          {/* platform badges */}
          <div className="mt-14 flex items-center justify-center gap-8 opacity-60">
            <div className="flex items-center gap-2 text-sm font-medium"><div className="w-8 h-8 rounded-lg bg-[hsl(214,80%,52%)] flex items-center justify-center text-white text-xs font-bold">f</div> Meta Ads</div>
            <div className="flex items-center gap-2 text-sm font-medium"><div className="w-8 h-8 rounded-lg bg-[hsl(340,75%,55%)] flex items-center justify-center text-white text-xs font-bold">T</div> TikTok Ads</div>
            <div className="flex items-center gap-2 text-sm font-medium"><div className="w-8 h-8 rounded-lg bg-[hsl(142,60%,45%)] flex items-center justify-center text-white text-xs font-bold">G</div> Google Ads</div>
          </div>
        </div>
      </header>

      {/* ── PAIN POINTS ── */}
      <Section id="pain" className="py-20 md:py-28">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <Badge variant="outline" className="mb-4">Sound Familiar?</Badge>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">The Daily Chaos of Running an Ad Agency</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">If you're still doing any of this manually, you're losing hours every day — and money every month.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {painPoints.map((p, i) => (
              <Card key={i} className="border-destructive/20 bg-destructive/[0.03] hover:border-destructive/40 transition-colors group">
                <CardContent className="pt-6">
                  <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center mb-4 group-hover:bg-destructive/20 transition-colors">
                    <p.icon className="h-5 w-5 text-destructive" />
                  </div>
                  <h3 className="font-semibold mb-2">{p.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{p.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </Section>

      {/* ── FEATURES ── */}
      <Section id="features" className="py-20 md:py-28 bg-muted/30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <Badge variant="outline" className="mb-4">All-In-One Platform</Badge>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Everything Your Agency Needs, Under One Roof</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">From ad spend tracking to client billing to white-label portals — HEPT replaces your entire spreadsheet stack.</p>
          </div>
          <div className="grid md:grid-cols-2 gap-5">
            {featureCategories.map((cat, i) => (
              <Card key={i} className="overflow-hidden hover:shadow-lg transition-shadow group">
                <CardContent className="pt-6">
                  <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${cat.color} flex items-center justify-center mb-4`}>
                    <cat.icon className="h-5 w-5 text-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold mb-3">{cat.title}</h3>
                  <ul className="space-y-2">
                    {cat.features.map((f, j) => (
                      <li key={j} className="flex items-start gap-2 text-sm text-muted-foreground">
                        <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </Section>

      {/* ── HOW IT WORKS ── */}
      <Section id="how" className="py-20 md:py-28">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <Badge variant="outline" className="mb-4">Simple Setup</Badge>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Up and Running in 3 Steps</h2>
            <p className="text-muted-foreground max-w-lg mx-auto">No complex onboarding. Connect your platforms, add clients, and let HEPT handle the rest.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {steps.map((s, i) => (
              <div key={i} className="relative text-center md:text-left">
                <div className="text-5xl font-black text-primary/10 mb-2">{s.num}</div>
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 mx-auto md:mx-0">
                  <s.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{s.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
                {i < 2 && <ChevronRight className="hidden md:block absolute top-14 -right-4 h-5 w-5 text-muted-foreground/40" />}
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── COMPARISON TABLE ── */}
      <Section id="compare" className="py-20 md:py-28 bg-muted/30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <Badge variant="outline" className="mb-4">Before & After</Badge>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Your Agency Without HEPT vs. With HEPT</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-4 font-semibold w-1/4">Task</th>
                  <th className="text-left py-3 px-4 font-semibold text-destructive">Without HEPT 😩</th>
                  <th className="text-left py-3 px-4 font-semibold text-primary">With HEPT ✨</th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((r, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="py-3 px-4 font-medium">{r.feature}</td>
                    <td className="py-3 px-4 text-muted-foreground"><span className="flex items-start gap-1.5"><XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />{r.without}</span></td>
                    <td className="py-3 px-4 text-muted-foreground"><span className="flex items-start gap-1.5"><CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />{r.with}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      {/* ── CLIENT PORTAL PREVIEW ── */}
      <Section className="py-20 md:py-28">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <Badge variant="outline" className="mb-4">Client Portal</Badge>
              <h2 className="text-3xl font-bold mb-4">Your Clients Get Their Own Branded Portal</h2>
              <p className="text-muted-foreground mb-6 leading-relaxed">
                No more screenshotting dashboards or emailing PDF reports. Each client gets a white-labeled portal with their own login — branded with your agency's name, logo, and colors.
              </p>
              <ul className="space-y-3">
                {["Real-time ad spend & performance dashboard", "Wallet balance & deposit request system", "Campaign request submission", "Downloadable reports & analytics", "Notice board for agency announcements"].map((item, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm"><CheckCircle2 className="h-4 w-4 text-primary shrink-0" />{item}</li>
                ))}
              </ul>
            </div>
            <div className="relative">
              <div className="rounded-2xl border border-border bg-card p-6 shadow-xl">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-3 h-3 rounded-full bg-destructive/60" />
                  <div className="w-3 h-3 rounded-full bg-warning/60" />
                  <div className="w-3 h-3 rounded-full bg-success/60" />
                  <span className="text-xs text-muted-foreground ml-2">client-portal.youragency.com</span>
                </div>
                <div className="space-y-3">
                  <div className="h-8 rounded bg-primary/10 w-2/3" />
                  <div className="grid grid-cols-3 gap-2">
                    <div className="h-16 rounded bg-muted" />
                    <div className="h-16 rounded bg-muted" />
                    <div className="h-16 rounded bg-muted" />
                  </div>
                  <div className="h-24 rounded bg-muted/60" />
                  <div className="h-12 rounded bg-muted/40" />
                </div>
              </div>
              <div className="absolute -bottom-4 -right-4 w-32 h-32 rounded-full bg-primary/5 blur-[60px] -z-10" />
            </div>
          </div>
        </div>
      </Section>

      {/* ── STATS ── */}
      <Section className="py-16 bg-primary/[0.03]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { val: "3", label: "Ad Platforms Supported" },
              { val: "∞", label: "Clients & Ad Accounts" },
              { val: "24/7", label: "Auto-Sync Engine" },
              { val: "100%", label: "White-Label Ready" },
            ].map((s, i) => (
              <div key={i}>
                <div className="text-3xl sm:text-4xl font-extrabold text-primary mb-1">{s.val}</div>
                <div className="text-sm text-muted-foreground">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── PRICING CTA ── */}
      <Section className="py-20 md:py-28">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <Badge variant="outline" className="mb-4">Flexible Plans</Badge>
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">Plans for Every Agency Size</h2>
          <p className="text-muted-foreground mb-8 max-w-lg mx-auto">
            From solo freelancers to large agencies — pick a plan that matches your client count, ad accounts, and team size. Upgrade anytime as you grow.
          </p>
          <div className="grid sm:grid-cols-3 gap-4 mb-8">
            {[
              { name: "Starter", desc: "For freelancers just getting started", highlight: false },
              { name: "Growth", desc: "For growing agencies with multiple clients", highlight: true },
              { name: "Agency Pro", desc: "For large teams managing 50+ clients", highlight: false },
            ].map((plan, i) => (
              <Card key={i} className={`${plan.highlight ? "border-primary shadow-lg shadow-primary/10 ring-1 ring-primary/20" : ""}`}>
                <CardContent className="pt-6 text-center">
                  <h3 className="font-bold text-lg mb-1">{plan.name}</h3>
                  <p className="text-xs text-muted-foreground mb-4">{plan.desc}</p>
                  <Button variant={plan.highlight ? "default" : "outline"} size="sm" className="w-full" asChild>
                    <Link to="/login">Get Started</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">All plans include a 14-day free trial. No credit card required.</p>
        </div>
      </Section>

      {/* ── FAQ ── */}
      <Section id="faq" className="py-20 md:py-28 bg-muted/30">
        <div className="max-w-3xl mx-auto px-4 sm:px-6">
          <div className="text-center mb-14">
            <Badge variant="outline" className="mb-4">FAQ</Badge>
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">Frequently Asked Questions</h2>
          </div>
          <Accordion type="single" collapsible className="space-y-2">
            {faqs.map((f, i) => (
              <AccordionItem key={i} value={`faq-${i}`} className="border rounded-lg px-4 bg-card">
                <AccordionTrigger className="text-left text-sm font-medium hover:no-underline">{f.q}</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground leading-relaxed">{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </Section>

      {/* ── FINAL CTA ── */}
      <section className="py-24 md:py-32 relative overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary/10 blur-[100px]" />
        </div>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">Ready to Automate Your Agency?</h2>
          <p className="text-muted-foreground mb-8 max-w-lg mx-auto">
            Join digital marketing agencies who have ditched spreadsheets and automated their entire ad spend management workflow.
          </p>
          <Button size="lg" className="text-base px-10 h-12 shadow-lg shadow-primary/25" asChild>
            <Link to="/login">Start Your Free Trial <ArrowRight className="ml-2 h-4 w-4" /></Link>
          </Button>
          <p className="text-xs text-muted-foreground mt-4">Free 14-day trial · No credit card required · Cancel anytime</p>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-border py-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="text-sm font-bold bg-gradient-to-r from-primary to-blue-400 bg-clip-text text-transparent">HEPT</span>
          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} HEPT — Built for digital marketing agencies</p>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <a href="https://heptbd.com" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">heptbd.com</a>
            <Link to="/login" className="hover:text-foreground transition-colors">Login</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
