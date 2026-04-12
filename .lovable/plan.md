

## Plan: Rewrite Bangla Landing Content for Maximum Sales Conversion

### Strategy

The current Bangla copy is a decent translation but reads **descriptive, not persuasive**. A media buyer in Bangladesh scrolling this page needs to feel their daily pain viscerally, see the exact financial loss of not using HEPT, and feel urgency to start immediately. The rewrite follows these sales copywriting principles:

1. **Pain amplification** — Use specific relatable scenarios (morning Excel hell, client WhatsApp complaints, dollar rate losses)
2. **Financial stakes** — Quantify the cost of NOT using HEPT (lost hours = lost money, miscalculation = client churn)
3. **Social proof pressure** — Testimonials that mention specific before/after numbers
4. **Urgency & scarcity language** — "আপনার competitor already ব্যবহার করছে"
5. **Conversational Bangla tone** — Natural agency-owner language, not textbook translation

### Content Changes (all in `src/lib/landingContent.ts`, `bn` section only)

**Hero** — Rewrite subtitle to hit the emotional nerve: "আপনি কি এখনো প্রতিদিন সকালে Excel খুলে client-এর report বানাচ্ছেন?" style opener. Add urgency to CTA.

**Pain Points** — Each one gets a sharper hook with financial consequences:
- "Account-এর জগাখিচুড়ি" → "Account-এর নরক" — emphasize the chaos costs real money
- "Report-এর গোলামি" → "Report বানাতে বানাতে জীবন শেষ" — relatable frustration
- "Balance-এর অন্ধকার" → "হিসাবে গরমিল = Client হারানো" — stakes-driven
- "Profit আন্দাজে" → "আপনার আসল লাভ কত? জানেন না তো!" — provocative question

**Before/After** — Add more emotional contrast, make "after" results feel inevitable with HEPT.

**Features** — Rewrite descriptions to be benefit-first instead of feature-first. Lead with "কি পাবেন" not "কি করে".

**Stats** — More impactful labels with context.

**Testimonials** — Make quotes more specific with numbers and emotional relief language. Add relatable agency scenarios.

**FAQ** — Rewrite answers to handle objections aggressively (cost concern, trust, switching effort).

**Final CTA** — Create FOMO: "আপনার competitor agency already HEPT ব্যবহার করছে।"

### Files Changed
- `src/lib/landingContent.ts` — Complete rewrite of the `bn` object (lines 178-351) with high-conversion sales copy

