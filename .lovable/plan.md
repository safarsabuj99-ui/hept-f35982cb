# Premium AI Chat Interface (Nova) — ChatGPT/Gemini-grade redesign

Upgrade the existing AI Copilot page (`src/pages/AICopilot.tsx`) so the conversation surface looks and feels like ChatGPT / Google Gemini: spacious, typographic, with a streaming "typing" cursor, polished markdown rendering, message-level actions, and a refined composer. No backend or tool-engine changes — purely the chat UI layer.

## What changes

### 1. Message stream (ChatGPT-style)
- Drop the bubble look for assistant turns. Use a clean, full-width row with:
  - Small Nova avatar (gradient circle, Bot icon) on the left
  - Message body in `prose` typography, generous line-height, no border, no card
- Keep user turns as compact right-aligned bubbles (rounded-2xl, muted-foreground tint, not heavy primary fill — Gemini style).
- Add subtle row separators / vertical rhythm between turns.

### 2. Streaming text experience
- Replace the "Thinking…" spinner-only state with a streaming **blinking caret** (`▍`) appended to the live assistant text as tokens arrive — same feel as ChatGPT.
- Keep step indicator ("Step 3 — Hunting money leaks") as a slim chip above the text while tools run, then fade out.
- Smooth auto-scroll only if the user is already near the bottom (don't yank them up if they scrolled to read).

### 3. Markdown polish
- Expand ReactMarkdown with `remark-gfm` for tables, task lists, strikethrough.
- Custom renderers:
  - `code` inline → subtle rounded mono chip
  - `pre` block → dark surface, language tag, copy button
  - `table` → bordered, zebra rows, horizontal scroll on overflow
  - `a` → primary color, underline on hover, opens in new tab
  - `blockquote` → left primary border, muted bg

### 4. Message actions (hover toolbar)
On each assistant message, show on hover (top-right of row):
- Copy
- Regenerate (re-sends the previous user turn)
- Good / Bad feedback (local state only — no backend)

### 5. Composer refinements
- Center-aligned, max-w-3xl, floating pill style with soft shadow.
- Auto-grow textarea up to ~8 rows.
- Left side: small "mode" pill (current Analyst / Strategist / Creative / Comms) as a dropdown so user can switch inline.
- Right side: send button morphs into stop button while streaming (visual only — abort wire-up is optional follow-up).
- Slash-command popover restyled to match Gemini's command palette.

### 6. Empty state
Keep current hero + one-click missions + slash commands, but:
- Tighten spacing, use larger hero greeting like "Good evening — what should we ship today?"
- Quick-action cards: replace flat borders with subtle gradient-border on hover.

### 7. Sidebar
- Light tweaks only: section headers in small caps, hover affordance, current thread gets a 2px primary left bar.

## Technical notes

- Single-file change scope: `src/pages/AICopilot.tsx` plus possibly a small `src/components/ai/ChatMarkdown.tsx` helper for the custom renderers.
- Add `remark-gfm` to deps (already common with react-markdown).
- Reuse design tokens from `index.css` / `tailwind.config.ts` — no hard-coded colors.
- Keep all existing handlers (`send`, `handleComposerSubmit`, streaming reader, tool cards, NovaPendingActions) intact. The redesign is presentational.
- Preserve `ToolCard` collapsible behavior; just restyle it as a slim inline "Used tool" chip that expands.

## Out of scope

- Backend / edge function changes.
- Real streaming-abort wiring (stop button is visual unless trivial).
- Conversation persistence / sharing features.
