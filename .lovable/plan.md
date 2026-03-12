

# Redesign Campaign Analytics Panel + Table — Premium & Modern

## Changes

### 1. Remove Overview Section (`CampaignAnalyticsPanel.tsx`)
- Delete the entire `Collapsible` block (lines 111-128) containing `SalesFunnel` and `PlatformComparison`
- Remove unused imports: `SalesFunnel`, `PlatformComparison`, `Collapsible`, `CollapsibleContent`, `CollapsibleTrigger`, `ChevronDown`, `ChevronUp`
- Remove `overviewOpen` state and `platformStats` memo

### 2. Redesign Table UI (`DeepDiveTable.tsx`)

Inspired by the reference screenshot — clean, spacious, modern aesthetic:

**Toolbar redesign:**
- Wider search input with a clean rounded-xl pill shape, subtle border, larger padding
- Status filter and Preset selector styled as minimal pill buttons with soft backgrounds
- Group toolbar controls in a single glassmorphic bar with consistent height and spacing

**Table header redesign:**
- Lighter, more subtle headers: use `text-[11px] uppercase tracking-widest text-muted-foreground/70` with no heavy background
- Thin bottom border only (no full cell borders) — clean line-separated look
- Remove grip icons from headers (keep drag functional but hide the visual grip for cleaner look)

**Table rows redesign:**
- Increase row height for more breathing room (`py-4` instead of default)
- Remove alternating backgrounds — use pure white/dark card bg with hover highlight only
- Subtle bottom border between rows (`border-b border-border/40`)
- Campaign name: slightly larger font weight, with ad account name as a muted sub-label
- Platform badge: compact pill with rounded-lg and platform brand color
- Delivery status: clean green dot + "Active" text + toggle switch inline
- Numeric values: `font-mono text-sm` with right-alignment for a clean data grid feel

**Container redesign:**
- Add `rounded-xl` container with `border border-border/50` and subtle `shadow-sm`
- Remove the current `border-t border-r border-b rounded-r-lg` hack — use full rounded border since the left-border issue was about frozen columns (now addressed with matching bg)

### Files Changed

| File | Change |
|------|--------|
| `CampaignAnalyticsPanel.tsx` | Remove overview section and unused imports |
| `DeepDiveTable.tsx` | Premium table redesign: toolbar, headers, rows, container styling |

