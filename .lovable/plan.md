

## Sales Landing Page for HEPT — Digital Marketing Agency SaaS

### Overview
Create a high-converting sales landing page at the root route (`/`) targeting digital marketers running Meta, TikTok, and Google Ads campaigns. The page will showcase all agency admin features, pain points, and benefits with a modern SaaS landing page design.

### Route Changes
- Change `"/"` from redirecting to `/login` to rendering the new `LandingPage` component
- Add a "Get Started" / "Login" button in the landing page navbar that links to `/login`

### New File: `src/pages/LandingPage.tsx`
A single-page sales landing page with these sections:

**1. Hero Section**
- Bold headline: "Stop Managing Ad Spend on Spreadsheets"
- Subheadline targeting pain: Manual tracking, Excel chaos, client reporting nightmares
- CTA buttons: "Start Free Trial" + "Watch Demo"
- Hero visual: Dashboard mockup/gradient illustration
- Platform badges: Meta, TikTok, Google Ads logos

**2. Pain Points Section**
- "Sound Familiar?" — 4 cards highlighting problems digital marketers face:
  - Manual spend tracking across platforms
  - Excel-based client billing & invoicing
  - No real-time profit visibility
  - Sending reports manually to each client

**3. Features Grid — Agency Admin Capabilities**
Organized by category with icons, matching the actual admin sidebar:

- **Dashboard & Analytics**: Real-time KPIs, spend trends, profit/loss widgets, revenue vs cost charts, attention alerts
- **Client Management**: Client list with balances, per-client pricing (platform rates), client portal with self-service dashboard, wallet health & runway prediction
- **Ad Account Management**: Multi-platform ad accounts (Meta/TikTok/Google), campaign mapping, auto-sync from ad platforms, deep-dive analytics
- **Finance & Billing**: P&L overview, USD wallet inventory (WAC method), expense tracking, cash flow management, payment requests with approval workflow, BDT-to-USD conversion
- **Client Portal**: Branded client dashboard, real-time spend reports, wallet balance & deposit requests, campaign request system
- **Team Management**: Role-based permissions, manager accounts with scoped access, audit logs for every action
- **Automation**: Auto-import ad accounts, auto-snapshot USD rates, sync orchestrator, billing radar alerts
- **White-Label & Branding**: Custom logo, brand name, themed interface

**4. How It Works — 3 Steps**
1. Connect your ad platforms (Meta, TikTok, Google)
2. Add your clients & set pricing
3. Everything auto-syncs — spend, billing, reports

**5. Client Portal Preview**
- Show what clients see: their own dashboard, spend breakdown, wallet, reports
- "Your clients get their own portal — no more manual reporting"

**6. Pricing CTA**
- "Plans for every agency size" — link to contact/plans
- Highlight: Multi-tier plans with resource limits

**7. Trust & Social Proof**
- "Built for Bangladeshi digital marketing agencies"
- Key stats: "Track 10M+ data rows", "100+ clients supported"
- Platform integrations badges

**8. FAQ Section**
- Common questions about the platform using Accordion component

**9. Final CTA**
- "Ready to automate your agency?" — Start Free Trial button
- Link to login/signup

### Sticky Navbar
- HEPT logo/brand name
- Nav links: Features, How It Works, Pricing, FAQ
- "Login" and "Get Started" buttons
- Smooth scroll to sections

### Design Approach
- Use existing design system (glass-card, glow-border, gradients from index.css)
- Dark hero section with gradient, light content sections
- Responsive: mobile-first with proper breakpoints
- Animated sections with fade-in on scroll (Intersection Observer)
- Platform-colored accents (Meta blue, TikTok cyan, Google colors)

### Files Changed
- `src/pages/LandingPage.tsx` — new (entire landing page)
- `src/App.tsx` — change `/` route from redirect to LandingPage, add lazy import

### Technical Notes
- No database changes needed
- No authentication required for this page
- Uses existing UI components (Button, Card, Accordion, Badge)
- Intersection Observer for scroll animations
- Smooth scroll anchors for navbar links

