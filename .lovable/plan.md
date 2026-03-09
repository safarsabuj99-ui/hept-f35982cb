

# Plan: Remove Activity & Redesign Premium Sidebar

## Changes

### 1. Remove Activity from Navigation
- Remove the Activity nav item from `allSections` in AdminLayout.tsx
- "Overview" section becomes just "Dashboard" (no section header needed for single item)

### 2. Premium Sidebar Redesign

**Header**: Elevated logo with gradient orb glow effect, premium typography with letter-spacing, subtle version tag

**Navigation Style**:
- Remove collapsible sections -- use flat layout with subtle section dividers (thin gradient lines) and floating section labels
- Active item: frosted glass pill with left accent gradient bar + subtle glow shadow
- Hover: smooth lift with background luminance shift
- Icons: active items get a soft colored background circle behind the icon
- Badge counts: pill with glassmorphic effect and pulse animation

**Footer**: User avatar placeholder with initials, sign-out as icon-only button, theme toggle integrated cleanly

**New CSS additions to index.css**:
- `sidebar-glow-item` -- active nav glow effect
- `sidebar-icon-bubble` -- colored circle behind active icons
- `sidebar-divider` -- gradient line divider between sections

### Files to Modify

1. **`src/components/AdminLayout.tsx`** -- Full sidebar redesign: remove Activity, flatten sections with dividers, premium active states, icon bubbles, refined header/footer
2. **`src/index.css`** -- Add 3-4 new utility classes for sidebar premium effects

### Design Details

```text
┌──────────────────────┐
│  ◉ AdSpend    v2.0   │  ← gradient orb + subtle tag
│─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─│
│                      │
│  ◉ Dashboard         │  ← active: glass pill + glow
│                      │
│  ── Clients ───────  │  ← gradient divider label
│  ○ Client List       │
│  ○ New Client        │
│  ○ Team              │
│                      │
│  ── Advertising ───  │
│  ○ Ad Accounts       │
│  ○ Integrations      │
│  ○ Campaigns         │
│                      │
│  ── Finance ───────  │
│  ○ Finance           │
│  ○ Payments    ●3    │  ← glassmorphic badge
│  ○ Orders      ●2    │
│                      │
│  ── System ────────  │
│  ○ Settings          │
│  ○ System Logs       │
│                      │
│──────────────────────│
│  [☽]  [↗ Sign Out]   │  ← minimal footer
└──────────────────────┘
```

- No collapsible groups -- all items visible, cleaner feel
- Section labels are inline with gradient fade lines
- Active item has frosted glass background + left gradient bar + subtle outer glow
- Hover items smoothly brighten with 200ms transition

