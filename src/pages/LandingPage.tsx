import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  BarChart3,
  FileText,
  Wallet,
  TrendingUp,
  ArrowRight,
  CheckCircle2,
  XCircle,
  Clock,
  Users,
  Layers,
  Zap,
  Star,
  ChevronRight,
  Menu,
  X,
  Send,
  ArrowUpDown,
} from "lucide-react";

/* ─── scroll-reveal hook ─── */
function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.15 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return { ref, visible };
}

function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const { ref, visible } = useReveal();
  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"
      } ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

/* ─── data ─── */
const painPoints = [
  {
    icon: Layers,
    title: "Account Chaos",
    desc: "Juggling dozens of Meta, TikTok & Google ad accounts across clients. Copy-pasting IDs, losing track of which account belongs to whom.",
  },
  {
    icon: FileText,
    title: "Report Slavery",
    desc: "Spending 2-3 hours every morning pulling numbers from each platform, formatting Excel sheets, and emailing reports to every client.",
  },
  {
    icon: Wallet,
    title: "Balance Blindness",
    desc: "Manually tracking how much each client deposited vs. how much was actually spent. One miscalculation = angry client or lost profit.",
  },
  {
    icon: TrendingUp,
    title: "Profit Guesswork",
    desc: "No clear picture of your agency's real margins. How much USD was bought, at what rate, how much is left — it's all in scattered spreadsheets.",
  },
];

const features = [
  {
    icon: FileText,
    title: "Automated Daily Reporting",
    desc: "Generate polished performance reports for every client with one click. Spend, impressions, clicks, conversions — all pulled automatically from Meta, TikTok & Google.",
  },
  {
    icon: BarChart3,
    title: "Smart Ad Account Organization",
    desc: "Map each client to their specific ad accounts across platforms. See at a glance which accounts belong to whom and switch context in seconds.",
  },
  {
    icon: Wallet,
    title: "Client Balance Tracker",
    desc: "Real-time dashboard showing every client's deposits, daily ad spend, and remaining dollar balance. No more spreadsheets, no more errors.",
  },
  {
    icon: TrendingUp,
    title: "Agency Profit & Dollar Management",
    desc: "Track USD purchase costs, calculate your actual profit margins automatically, and forecast how many dollars you need to buy next. Your CFO in a dashboard.",
  },
];

const stats = [
  { value: "10+", label: "Hours Saved / Week", icon: Clock },
  { value: "50+", label: "Clients Managed Easily", icon: Users },
  { value: "3", label: "Platforms Connected", icon: Layers },
  { value: "0", label: "Spreadsheets Needed", icon: Zap },
];

const steps = [
  {
    num: "01",
    title: "Connect Your Ad Accounts",
    desc: "Link your Meta, TikTok & Google Ads accounts in minutes. We handle the API complexity.",
  },
  {
    num: "02",
    title: "Organize Clients & Accounts",
    desc: "Map each client to their ad accounts. Set budgets, deposit amounts, and pricing rules.",
  },
  {
    num: "03",
    title: "Automate Everything",
    desc: "Reports go out automatically. Balances update in real-time. Profits calculate themselves.",
  },
];

const testimonials = [
  {
    name: "Rakib Hasan",
    role: "Agency Owner, 35 Clients",
    quote:
      "I used to spend 3 hours every morning on reports. Now it takes 2 minutes. HEPT literally gave me my mornings back.",
    rating: 5,
  },
  {
    name: "Nusrat Jahan",
    role: "Freelance Media Buyer",
    quote:
      "The client balance tracker alone is worth it. No more awkward conversations about 'how much is left' — clients can see it themselves.",
    rating: 5,
  },
  {
    name: "Tanvir Ahmed",
    role: "Digital Marketing Agency, 50+ Clients",
    quote:
      "We scaled from 20 to 50 clients without hiring a single extra person for reporting or finance tracking. HEPT handles it all.",
    rating: 5,
  },
];

const faqs = [
  {
    q: "Which ad platforms does HEPT support?",
    a: "HEPT currently supports Meta (Facebook & Instagram Ads), TikTok Ads, and Google Ads. We're adding more platforms based on user demand.",
  },
  {
    q: "How does the automated reporting work?",
    a: "HEPT pulls performance data from your connected ad accounts daily, calculates key metrics (spend, impressions, clicks, conversions, ROAS), and generates beautiful client-ready reports you can share with one click.",
  },
  {
    q: "Can my clients see their own balance and reports?",
    a: "Yes! Each client gets their own branded portal where they can view their remaining balance, daily spend breakdown, and performance reports — all under your agency brand.",
  },
  {
    q: "How is client billing calculated?",
    a: "You set your own pricing rules per client (markup percentage, flat fee, or custom rates). HEPT tracks actual ad spend in USD, applies your pricing, and shows you the exact profit on every dollar spent.",
  },
  {
    q: "Is my data secure?",
    a: "Absolutely. We use bank-grade encryption, row-level security policies, and your data is isolated per organization. We never share or access your client data.",
  },
  {
    q: "Can I try before I pay?",
    a: "Yes — every plan starts with a 14-day free trial. No credit card required upfront. You'll have full access to all features during the trial.",
  },
];

const beforeAfter = [
  { before: "3 hours daily on manual reports", after: "Auto-generated in 2 minutes" },
  { before: "Scattered Excel spreadsheets", after: "One unified dashboard" },
  { before: "Client balance errors & disputes", after: "Real-time balance tracking" },
  { before: "Guessing agency profit margins", after: "Automated profit calculation" },
  { before: "Searching across 3 platform dashboards", after: "All platforms in one view" },
  { before: "Manual USD purchase tracking", after: "Dollar inventory forecasting" },
];

/* ─── mock dashboard component ─── */
function DashboardMockup() {
  const kpis = [
    { label: "Total Clients", value: "24", sub: "+3 this week", color: "text-primary" },
    { label: "Active Spend", value: "$12,840", sub: "across 3 platforms", color: "text-primary" },
    { label: "Revenue", value: "$18,200", sub: "+12% MoM", color: "text-primary" },
    { label: "Profit", value: "$5,360", sub: "18.2% margin", color: "text-success" },
  ];
  const barData = [
    { month: "Jul", spend: 38, revenue: 52 },
    { month: "Aug", spend: 55, revenue: 70 },
    { month: "Sep", spend: 45, revenue: 62 },
    { month: "Oct", spend: 68, revenue: 82 },
    { month: "Nov", spend: 58, revenue: 78 },
    { month: "Dec", spend: 75, revenue: 92 },
  ];
  const clients = [
    { initials: "FA", name: "Fashion Avenue", platforms: ["#1877F2", "#E4405F"], spend: "$3,240", status: "Active", statusColor: "bg-success/20 text-success" },
    { initials: "TC", name: "TechCorp BD", platforms: ["#1877F2", "#000000"], spend: "$4,180", status: "Scaling", statusColor: "bg-warning/20 text-warning" },
    { initials: "GS", name: "GreenShop", platforms: ["#E4405F"], spend: "$1,920", status: "New", statusColor: "bg-primary/20 text-primary" },
  ];
  const avatarColors = ["bg-primary/70", "bg-accent/70", "bg-success/70"];

  return (
    <div className="relative w-full max-w-4xl mx-auto">
      <div className="ios-glass-card rounded-xl overflow-hidden">
        {/* Browser chrome */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/50">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-destructive/60" />
            <div className="w-3 h-3 rounded-full bg-warning/60" />
            <div className="w-3 h-3 rounded-full bg-success/60" />
          </div>
          <div className="flex-1 text-center">
            <div className="inline-block bg-background rounded px-3 py-0.5 text-xs text-muted-foreground">
              app.heptbd.com/dashboard
            </div>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {/* KPI Row */}
          <div className="grid grid-cols-4 gap-3">
            {kpis.map((kpi) => (
              <div key={kpi.label} className="bg-muted/40 rounded-lg p-3 space-y-0.5">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{kpi.label}</div>
                <div className={`text-lg font-bold ${kpi.color}`}>{kpi.value}</div>
                <div className="text-[9px] text-muted-foreground">{kpi.sub}</div>
              </div>
            ))}
          </div>

          {/* Bar Chart */}
          <div className="bg-muted/30 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Spend vs Revenue</span>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-primary/40" /><span className="text-[9px] text-muted-foreground">Spend</span></div>
                <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-sm bg-primary" /><span className="text-[9px] text-muted-foreground">Revenue</span></div>
              </div>
            </div>
            <div className="relative h-28">
              {/* Grid lines */}
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="absolute w-full border-t border-border/30" style={{ bottom: `${i * 33}%` }} />
              ))}
              <div className="flex items-end gap-2 h-full relative z-10">
                {barData.map((d) => (
                  <div key={d.month} className="flex-1 flex flex-col items-center gap-0.5">
                    <div className="w-full flex items-end justify-center gap-0.5" style={{ height: "88px" }}>
                      <div className="w-[40%] bg-primary/30 rounded-t transition-all" style={{ height: `${d.spend}%` }} />
                      <div className="w-[40%] bg-primary rounded-t transition-all" style={{ height: `${d.revenue}%` }} />
                    </div>
                    <span className="text-[8px] text-muted-foreground mt-1">{d.month}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Client List */}
          <div className="space-y-2">
            {clients.map((c, i) => (
              <div key={c.name} className="flex items-center gap-3 bg-muted/20 rounded-lg p-3">
                <div className={`w-8 h-8 rounded-lg ${avatarColors[i]} flex items-center justify-center text-[10px] font-bold text-primary-foreground`}>
                  {c.initials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{c.name}</div>
                  <div className="flex items-center gap-1 mt-0.5">
                    {c.platforms.map((color, pi) => (
                      <div key={pi} className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                    ))}
                  </div>
                </div>
                <div className="text-xs font-semibold text-foreground">{c.spend}</div>
                <div className={`text-[9px] font-medium px-2 py-0.5 rounded-full ${c.statusColor}`}>{c.status}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="absolute -inset-4 bg-primary/5 rounded-2xl blur-3xl -z-10" />
    </div>
  );
}

/* ─── platform badges ─── */
function PlatformBadges() {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Works with</span>
      {[
        { name: "Meta Ads", color: "bg-[hsl(var(--chart-meta))]" },
        { name: "TikTok Ads", color: "bg-[hsl(var(--chart-tiktok))]" },
        { name: "Google Ads", color: "bg-[hsl(var(--chart-google))]" },
      ].map((p) => (
        <span key={p.name} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted text-xs font-medium text-foreground">
          <span className={`w-2 h-2 rounded-full ${p.color}`} />
          {p.name}
        </span>
      ))}
    </div>
  );
}

/* ═══════════ MAIN COMPONENT ═══════════ */
export default function LandingPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navLinks = [
    { href: "#problems", label: "Problems" },
    { href: "#features", label: "Features" },
    { href: "#how-it-works", label: "How It Works" },
    { href: "#testimonials", label: "Testimonials" },
    { href: "#faq", label: "FAQ" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground antialiased">
      {/* ── NAVBAR ── */}
      <nav className="sticky top-0 z-50 ios-glass-nav">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <Link to="/" className="text-xl font-bold tracking-tight text-foreground">HEPT</Link>

          <div className="hidden md:flex items-center gap-8">
            {navLinks.map((l) => (
              <a key={l.href} href={l.href} className="text-sm text-muted-foreground hover:text-foreground transition-colors">{l.label}</a>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild><Link to="/login">Log In</Link></Button>
            <Button size="sm" asChild><Link to="/signup">Automate My Agency</Link></Button>
          </div>

          <button className="md:hidden p-2 text-muted-foreground" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden border-t border-border bg-background px-4 pb-4 space-y-2">
            {navLinks.map((l) => (
              <a key={l.href} href={l.href} className="block py-2 text-sm text-muted-foreground" onClick={() => setMobileMenuOpen(false)}>{l.label}</a>
            ))}
            <div className="flex gap-2 pt-2">
              <Button variant="outline" size="sm" className="flex-1" asChild><Link to="/login">Log In</Link></Button>
              <Button size="sm" className="flex-1" asChild><Link to="/signup">Get Started</Link></Button>
            </div>
          </div>
        )}
      </nav>

      {/* ── HERO ── */}
      <section className="relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16 lg:pt-28 lg:pb-24">
          <div className="max-w-3xl mx-auto text-center space-y-6">
            <Reveal>
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full ios-glass-pill text-primary text-xs font-semibold tracking-wide">
                <Zap className="w-3.5 h-3.5" /> Built for Media Buying Agencies
              </span>
            </Reveal>
            <Reveal delay={100}>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.1]">
                Automate Your Agency.{" "}
                <span className="text-primary">Scale Your Clients.</span>
              </h1>
            </Reveal>
            <Reveal delay={200}>
              <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                Stop wasting hours on manual reports, spreadsheet tracking, and balance calculations.
                HEPT automates ad spend reporting, client billing, and profit analytics — so you can
                manage 50+ clients as easily as 5.
              </p>
            </Reveal>
            <Reveal delay={300}>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                <Button size="lg" className="text-base px-8" asChild>
                  <Link to="/signup">Automate My Agency <ArrowRight className="w-4 h-4 ml-1" /></Link>
                </Button>
                <Button variant="outline" size="lg" className="text-base px-8" asChild>
                  <a href="#features">See How It Works</a>
                </Button>
              </div>
            </Reveal>
            <Reveal delay={400}>
              <div className="flex justify-center"><PlatformBadges /></div>
            </Reveal>
          </div>

          <Reveal delay={500} className="mt-16">
            <DashboardMockup />
          </Reveal>
        </div>
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[120%] h-[600px] bg-gradient-to-b from-primary/5 via-transparent to-transparent -z-10 rounded-full blur-3xl" />
      </section>

      {/* ── PAIN / AGITATION ── */}
      <section id="problems" className="py-20 lg:py-28 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal>
            <div className="text-center max-w-2xl mx-auto mb-16">
              <span className="text-sm font-semibold text-primary uppercase tracking-wider">The Problem</span>
              <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight">Running an agency shouldn't feel like this</h2>
              <p className="mt-4 text-muted-foreground text-lg">If you manage paid campaigns for multiple clients, you know these daily struggles too well.</p>
            </div>
          </Reveal>

          <div className="grid sm:grid-cols-2 gap-6 mb-16">
            {painPoints.map((p, i) => (
              <Reveal key={p.title} delay={i * 100}>
                <Card className="p-6 ios-glass rounded-xl transition-shadow border-none h-full">
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center">
                      <p.icon className="w-5 h-5 text-destructive" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg mb-1">{p.title}</h3>
                      <p className="text-muted-foreground text-sm leading-relaxed">{p.desc}</p>
                    </div>
                  </div>
                </Card>
              </Reveal>
            ))}
          </div>

          <Reveal>
            <div className="max-w-3xl mx-auto">
              <h3 className="text-center text-xl font-bold mb-6">Before HEPT vs. After HEPT</h3>
              <div className="ios-glass-card rounded-xl overflow-hidden">
                <div className="grid grid-cols-2 text-sm font-semibold border-b border-border">
                  <div className="px-6 py-3 bg-destructive/5 text-destructive">❌ Before</div>
                  <div className="px-6 py-3 bg-success/5 text-[hsl(var(--success))]">✅ After</div>
                </div>
                {beforeAfter.map((row, i) => (
                  <div key={i} className={`grid grid-cols-2 text-sm ${i < beforeAfter.length - 1 ? "border-b border-border/50" : ""}`}>
                    <div className="px-6 py-3 flex items-center gap-2 text-muted-foreground">
                      <XCircle className="w-4 h-4 text-destructive/60 flex-shrink-0" />{row.before}
                    </div>
                    <div className="px-6 py-3 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-[hsl(var(--success))] flex-shrink-0" />{row.after}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" className="py-20 lg:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal>
            <div className="text-center max-w-2xl mx-auto mb-16">
              <span className="text-sm font-semibold text-primary uppercase tracking-wider">The Solution</span>
              <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight">Everything you need to run a profitable agency</h2>
              <p className="mt-4 text-muted-foreground text-lg">Four powerful modules that replace your spreadsheets, manual reports, and guesswork.</p>
            </div>
          </Reveal>

          <div className="space-y-20">
            {features.map((f, i) => (
              <Reveal key={f.title} delay={100}>
                <div className={`flex flex-col lg:flex-row gap-10 items-center ${i % 2 === 1 ? "lg:flex-row-reverse" : ""}`}>
                  <div className="flex-1 space-y-4">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                      <f.icon className="w-6 h-6 text-primary" />
                    </div>
                    <h3 className="text-2xl font-bold">{f.title}</h3>
                    <p className="text-muted-foreground leading-relaxed text-base">{f.desc}</p>
                    <Link to="/signup" className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
                      Try it free <ChevronRight className="w-4 h-4" />
                    </Link>
                  </div>
                  <div className="flex-1 w-full">
                    <div className="ios-glass-card rounded-xl p-5">
                      <div className="flex items-center gap-1.5 mb-4">
                        <div className="w-2.5 h-2.5 rounded-full bg-destructive/50" />
                        <div className="w-2.5 h-2.5 rounded-full bg-warning/50" />
                        <div className="w-2.5 h-2.5 rounded-full bg-success/50" />
                      </div>
                      {i === 0 && (
                        /* Reporting Mockup */
                        <div className="space-y-3">
                          <div className="flex gap-1 text-[10px] font-semibold">
                            <span className="px-2.5 py-1 rounded bg-primary text-primary-foreground">Meta</span>
                            <span className="px-2.5 py-1 rounded bg-muted text-muted-foreground">TikTok</span>
                            <span className="px-2.5 py-1 rounded bg-muted text-muted-foreground">Google</span>
                          </div>
                          <div className="grid grid-cols-4 gap-2">
                            {[
                              { label: "Spend", val: "$1,240", color: "text-primary" },
                              { label: "Impressions", val: "124K", color: "text-foreground" },
                              { label: "Clicks", val: "3,821", color: "text-foreground" },
                              { label: "ROAS", val: "3.8x", color: "text-[hsl(var(--success))]" },
                            ].map((kpi) => (
                              <div key={kpi.label} className="bg-muted/50 rounded-lg p-2 text-center">
                                <div className="text-[9px] text-muted-foreground uppercase">{kpi.label}</div>
                                <div className={`text-sm font-bold ${kpi.color}`}>{kpi.val}</div>
                              </div>
                            ))}
                          </div>
                          <div className="border border-border/50 rounded-lg overflow-hidden text-[10px]">
                            <div className="grid grid-cols-[1fr_80px_60px] gap-2 px-3 py-1.5 bg-muted/40 font-semibold text-muted-foreground">
                              <span>Campaign</span><span>Spend</span><span>Status</span>
                            </div>
                            {[
                              { name: "Summer Sale - Conv", spend: "$420", pct: 75, status: "Active", sColor: "bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]" },
                              { name: "Brand Awareness Q2", spend: "$380", pct: 60, status: "Active", sColor: "bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]" },
                              { name: "Retargeting - DPA", spend: "$280", pct: 45, status: "Learning", sColor: "bg-warning/15 text-warning" },
                              { name: "Lead Gen - Form", spend: "$160", pct: 30, status: "Active", sColor: "bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]" },
                            ].map((r) => (
                              <div key={r.name} className="grid grid-cols-[1fr_80px_60px] gap-2 px-3 py-1.5 border-t border-border/30 items-center">
                                <span className="truncate text-foreground">{r.name}</span>
                                <div className="flex items-center gap-1">
                                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden"><div className="h-full bg-primary rounded-full" style={{ width: `${r.pct}%` }} /></div>
                                  <span className="text-muted-foreground">{r.spend}</span>
                                </div>
                                <span className={`px-1.5 py-0.5 rounded text-[8px] font-medium ${r.sColor}`}>{r.status}</span>
                              </div>
                            ))}
                          </div>
                          <div className="flex justify-end">
                            <div className="px-3 py-1.5 bg-primary/10 text-primary text-[10px] font-semibold rounded-md flex items-center gap-1">
                              <Send className="w-3 h-3" /> Send Report
                            </div>
                          </div>
                        </div>
                      )}
                      {i === 1 && (
                        /* Account Organization Mockup */
                        <div className="space-y-3">
                          {[
                            { client: "FashionHub", accounts: [{ platform: "Meta", id: "act_8821", color: "bg-blue-500" }, { platform: "TikTok", id: "adv_7741", color: "bg-cyan-500" }] },
                            { client: "TechNova", accounts: [{ platform: "Meta", id: "act_3302", color: "bg-blue-500" }, { platform: "Google", id: "ads_9910", color: "bg-amber-500" }, { platform: "TikTok", id: "adv_5523", color: "bg-cyan-500" }] },
                            { client: "GreenLife", accounts: [{ platform: "Google", id: "ads_4415", color: "bg-amber-500" }] },
                          ].map((c) => (
                            <div key={c.client} className="flex items-start gap-3">
                              <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center text-[10px] font-bold text-primary flex-shrink-0 mt-0.5">
                                {c.client[0]}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-semibold text-foreground mb-1">{c.client}</div>
                                <div className="flex flex-wrap gap-1.5">
                                  {c.accounts.map((a) => (
                                    <div key={a.id} className="flex items-center gap-1 bg-muted/60 rounded px-2 py-0.5">
                                      <div className={`w-1.5 h-1.5 rounded-full ${a.color}`} />
                                      <span className="text-[9px] font-medium text-muted-foreground">{a.platform}</span>
                                      <span className="text-[9px] text-foreground/70 font-mono">{a.id}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <div className="text-[8px] text-muted-foreground/50 flex-shrink-0 mt-1">⋮⋮</div>
                            </div>
                          ))}
                          <div className="border-t border-dashed border-border/50 pt-2 flex items-center justify-center gap-1 text-[9px] text-muted-foreground">
                            <ArrowUpDown className="w-3 h-3" /> Drag to reassign accounts
                          </div>
                        </div>
                      )}
                      {i === 2 && (
                        /* Balance Tracker Mockup */
                        <div className="space-y-2">
                          <div className="grid grid-cols-[1fr_70px_70px_70px] gap-1 text-[9px] font-semibold text-muted-foreground px-2 pb-1 border-b border-border/40">
                            <span>Client</span><span className="text-right">Deposited</span><span className="text-right">Spent</span><span className="text-right">Balance</span>
                          </div>
                          {[
                            { name: "FashionHub", dep: "$2,000", spent: "$980", bal: "$1,020", pct: 49, color: "bg-[hsl(var(--success))]" },
                            { name: "TechNova", dep: "$1,500", spent: "$1,200", bal: "$300", pct: 80, color: "bg-warning" },
                            { name: "GreenLife", dep: "$800", spent: "$750", bal: "$50", pct: 94, color: "bg-destructive" },
                          ].map((c) => (
                            <div key={c.name} className="grid grid-cols-[1fr_70px_70px_70px] gap-1 items-center px-2 py-1.5 rounded-md hover:bg-muted/30 transition-colors">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center text-[9px] font-bold text-primary">{c.name[0]}</div>
                                <span className="text-xs font-medium text-foreground truncate">{c.name}</span>
                              </div>
                              <span className="text-[10px] text-foreground text-right font-mono">{c.dep}</span>
                              <span className="text-[10px] text-muted-foreground text-right font-mono">{c.spent}</span>
                              <span className="text-[10px] text-foreground text-right font-bold font-mono">{c.bal}</span>
                            </div>
                          ))}
                          <div className="pt-1">
                            {[
                              { pct: 49, color: "bg-[hsl(var(--success))]", label: "FashionHub" },
                              { pct: 80, color: "bg-warning", label: "TechNova" },
                              { pct: 94, color: "bg-destructive", label: "GreenLife" },
                            ].map((b) => (
                              <div key={b.label} className="flex items-center gap-2 px-2 py-0.5">
                                <span className="text-[8px] text-muted-foreground w-16 truncate">{b.label}</span>
                                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full ${b.color} transition-all`} style={{ width: `${b.pct}%` }} />
                                </div>
                                <span className="text-[8px] text-muted-foreground">{b.pct}%</span>
                              </div>
                            ))}
                          </div>
                          <div className="border-t border-border/50 mt-1 pt-2 flex justify-between px-2 text-[10px] font-semibold">
                            <span className="text-muted-foreground">Total Balance</span>
                            <span className="text-foreground font-mono">$1,370</span>
                          </div>
                        </div>
                      )}
                      {i === 3 && (
                        /* Profit & Dollar Management Mockup */
                        <div className="space-y-3">
                          <div className="grid grid-cols-3 gap-2">
                            {[
                              { label: "USD Purchased", val: "$5,200", sub: "This month", color: "text-primary" },
                              { label: "WAC Rate", val: "৳121.5", sub: "Avg cost", color: "text-foreground" },
                              { label: "Margin", val: "18.2%", sub: "+2.1% MoM", color: "text-[hsl(var(--success))]" },
                            ].map((kpi) => (
                              <div key={kpi.label} className="bg-muted/40 rounded-lg p-2.5 text-center">
                                <div className="text-[8px] text-muted-foreground uppercase">{kpi.label}</div>
                                <div className={`text-sm font-bold ${kpi.color}`}>{kpi.val}</div>
                                <div className="text-[7px] text-muted-foreground mt-0.5">{kpi.sub}</div>
                              </div>
                            ))}
                          </div>
                          <div className="h-20 bg-muted/30 rounded-lg p-2 flex items-end gap-0.5 relative">
                            <div className="absolute top-1.5 left-2.5 text-[8px] text-muted-foreground font-medium">Profit Trend</div>
                            {[35, 42, 38, 55, 48, 62, 58, 70, 65, 75, 68, 80].map((h, j) => (
                              <div key={j} className="flex-1 rounded-t transition-all" style={{ height: `${h}%`, background: h > 50 ? 'hsl(var(--success) / 0.4)' : 'hsl(var(--primary) / 0.25)' }} />
                            ))}
                          </div>
                          <div className="bg-primary/5 border border-primary/20 rounded-lg px-3 py-2 flex items-center justify-between">
                            <div>
                              <div className="text-[9px] text-muted-foreground">Next Week Forecast</div>
                              <div className="text-xs font-bold text-foreground">Need <span className="text-primary">$3,400</span> USD</div>
                            </div>
                            <TrendingUp className="w-4 h-4 text-primary" />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── TIME SAVING ── */}
      <section className="py-20 lg:py-28 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal>
            <div className="text-center max-w-2xl mx-auto mb-16">
              <span className="text-sm font-semibold text-primary uppercase tracking-wider">The Impact</span>
              <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight">Manage 50 clients as easily as 5</h2>
              <p className="mt-4 text-muted-foreground text-lg">Agencies using HEPT reclaim hours every week and scale without hiring extra staff.</p>
            </div>
          </Reveal>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
            {stats.map((s, i) => (
              <Reveal key={s.label} delay={i * 100}>
                <Card className="p-6 text-center ios-glass rounded-xl transition-all border-none">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <s.icon className="w-6 h-6 text-primary" />
                  </div>
                  <div className="text-3xl sm:text-4xl font-extrabold text-foreground">{s.value}</div>
                  <div className="text-sm text-muted-foreground mt-1">{s.label}</div>
                </Card>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how-it-works" className="py-20 lg:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal>
            <div className="text-center max-w-2xl mx-auto mb-16">
              <span className="text-sm font-semibold text-primary uppercase tracking-wider">How It Works</span>
              <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight">Up and running in under 10 minutes</h2>
            </div>
          </Reveal>
          <div className="grid md:grid-cols-3 gap-8">
            {steps.map((s, i) => (
              <Reveal key={s.num} delay={i * 150}>
                <div className="relative text-center space-y-4 ios-glass rounded-xl p-6">
                  <div className="text-5xl font-extrabold text-primary/15">{s.num}</div>
                  <h3 className="text-xl font-bold">{s.title}</h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">{s.desc}</p>
                  {i < steps.length - 1 && (
                    <div className="hidden md:block absolute top-8 -right-4 text-primary/20">
                      <ArrowRight className="w-8 h-8" />
                    </div>
                  )}
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section id="testimonials" className="py-20 lg:py-28 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal>
            <div className="text-center max-w-2xl mx-auto mb-16">
              <span className="text-sm font-semibold text-primary uppercase tracking-wider">Testimonials</span>
              <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight">Trusted by agencies across Bangladesh</h2>
            </div>
          </Reveal>
          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map((t, i) => (
              <Reveal key={t.name} delay={i * 100}>
                <Card className="p-6 h-full flex flex-col ios-glass rounded-xl border-none transition-all">
                  <div className="flex gap-1 mb-4">
                    {Array.from({ length: t.rating }).map((_, j) => (
                      <Star key={j} className="w-4 h-4 fill-warning text-warning" />
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed flex-1 italic">"{t.quote}"</p>
                  <div className="mt-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center text-sm font-bold text-primary">
                      {t.name.charAt(0)}
                    </div>
                    <div>
                      <div className="text-sm font-semibold">{t.name}</div>
                      <div className="text-xs text-muted-foreground">{t.role}</div>
                    </div>
                  </div>
                </Card>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" className="py-20 lg:py-28">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal>
            <div className="text-center mb-12">
              <span className="text-sm font-semibold text-primary uppercase tracking-wider">FAQ</span>
              <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight">Frequently asked questions</h2>
            </div>
          </Reveal>
          <Reveal delay={100}>
            <Accordion type="single" collapsible className="w-full">
              {faqs.map((f, i) => (
                <AccordionItem key={i} value={`faq-${i}`}>
                  <AccordionTrigger className="text-left text-base">{f.q}</AccordionTrigger>
                  <AccordionContent className="text-muted-foreground leading-relaxed">{f.a}</AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </Reveal>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="py-20 lg:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Reveal>
            <div className="relative rounded-2xl bg-primary p-12 lg:p-16 text-center overflow-hidden" style={{ boxShadow: 'inset 0 1px 0 0 hsl(0 0% 100% / 0.1), 0 12px 40px -8px hsl(0 0% 0% / 0.2)' }}>
              <h2 className="text-3xl sm:text-4xl font-bold text-primary-foreground mb-4">Ready to automate your agency?</h2>
              <p className="text-primary-foreground/80 text-lg max-w-xl mx-auto mb-8">
                Join hundreds of media buying agencies who've stopped drowning in spreadsheets and started scaling with HEPT.
              </p>
              <Button size="lg" variant="secondary" className="text-base px-8" asChild>
                <Link to="/signup">Start Free 14-Day Trial <ArrowRight className="w-4 h-4 ml-1" /></Link>
              </Button>
              <p className="text-primary-foreground/60 text-xs mt-4">No credit card required • Full access during trial</p>
              <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full bg-primary-foreground/5" />
              <div className="absolute -bottom-16 -left-16 w-48 h-48 rounded-full bg-primary-foreground/5" />
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-border py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div>
              <div className="text-lg font-bold">HEPT</div>
              <div className="text-sm text-muted-foreground mt-1">Agency automation platform for digital marketers.</div>
            </div>
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <a href="https://heptbd.com" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">heptbd.com</a>
              <Link to="/login" className="hover:text-foreground transition-colors">Log In</Link>
              <Link to="/signup" className="hover:text-foreground transition-colors">Sign Up</Link>
            </div>
          </div>
          <div className="mt-8 text-center text-xs text-muted-foreground">© {new Date().getFullYear()} HEPT. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
}
