

## Redesign Landing Page — High-Converting B2B SaaS Sales Page

### What Changes
Complete rewrite of `src/pages/LandingPage.tsx` with a modern, Stripe/Linear-inspired design that's laser-focused on conversion for digital marketers managing 20-50+ clients.

### Key Differences from Current Page
- **New headline & copy** aligned exactly to the 4 pain points and 4 solutions specified
- **Time-saving section** (new) — "Save 10+ hours/week" with concrete metrics
- **Dashboard mockup placeholders** — visual wireframes showing the actual software UI (client balance tracker, profit dashboard, reporting view)
- **Testimonial/social proof section** (new) — placeholder cards for future reviews
- **Cleaner Stripe/Linear aesthetic** — more whitespace, subtle gradients, sharper typography hierarchy, fewer colors
- **Streamlined features** — 4 focused feature cards (Reporting, Account Mgmt, Client Balances, Agency Profit) instead of 8 categories
- **Stronger CTAs** — "Automate My Agency" primary CTA, repeated strategically

### Page Structure

1. **Sticky Navbar** — HEPT logo, nav links (Problems, Features, How It Works, Testimonials, FAQ), Login + "Automate My Agency" CTA
2. **Hero** — "Automate Your Agency. Scale Your Clients. Stop Wasting Hours on Manual Reports." + subheadline + CTA + platform badges (Meta/TikTok/Google) + dashboard mockup wireframe
3. **Pain/Agitation** — 4 pain point cards matching the exact problems specified + "Before vs After" comparison table
4. **Features** — 4 solution cards with icons: Automated Reporting, Smart Ad Account Organization, Client Balance Tracker, Agency Profit & Dollar Management. Each with a mini dashboard mockup placeholder
5. **Time-Saving** — "Manage 50 clients as easily as 5" with stat counters (10+ hrs saved/week, 50+ clients, 3 platforms, 0 spreadsheets)
6. **How It Works** — 3 steps (Connect → Organize → Automate)
7. **Testimonials** — 3 placeholder review cards with avatar, name, role, quote
8. **FAQ** — Accordion with relevant questions
9. **Final CTA** — Strong closing with gradient background
10. **Footer** — Links, copyright, heptbd.com

### Design Details
- Clean white background with subtle gray sections alternating
- Dark mode compatible using existing CSS variables
- Primary blue gradient accents (existing design system)
- Large typography with tight tracking for headlines
- Generous whitespace between sections
- Subtle hover animations on cards
- Dashboard wireframe mockups built with divs/gradients (no images needed)
- Fully responsive, mobile-first

### Files Changed
- `src/pages/LandingPage.tsx` — full rewrite with new structure, copy, and design

### No Database Changes
No backend or routing changes needed — only the landing page content/design.

