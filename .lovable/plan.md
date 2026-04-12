

## Add Bangla (বাংলা) Language Toggle to Landing Page

**Goal:** Add an English/বাংলা language switcher on the landing page navbar and translate all content into natural Bangladeshi Bangla — written for Bangladeshi digital marketers, not formal/textbook Bengali.

### Approach

Create a translation system using a `useLang` hook with `useState` and React Context, keeping all translations in a single content map file. The language toggle sits in the navbar as a compact pill button (🇬🇧 EN / 🇧🇩 বাংলা).

### Changes

#### 1. New file: `src/lib/landingContent.ts` — All translatable strings

A single object with `en` and `bn` keys containing every text string on the landing page:
- **Navbar** links, CTA buttons
- **Hero** headline, subtext, badge, buttons
- **Pain points** — titles and descriptions rewritten in natural Bangla (not Google Translate — colloquial Bangladeshi tone targeting agency owners)
- **Before/After** table rows
- **Features** — titles, descriptions, CTAs
- **Stats** labels
- **How It Works** steps
- **Testimonials** — quotes rewritten naturally in Bangla
- **FAQ** — questions and answers in Bangla
- **Final CTA** and **Footer** text
- **Platform badges** ("Works with" → "সাপোর্ট করে")

The Bangla copy will use informal/professional tone that Bangladeshi digital marketers actually speak — mixing some English terms naturally (e.g., "Ad Account", "ROAS", "Meta Ads" stay in English as they're industry terms).

#### 2. New file: `src/hooks/useLandingLang.tsx` — Language state hook

Simple `useState<'en' | 'bn'>('en')` passed via props (no need for full Context since it's one page). Exports `lang` and `setLang`.

#### 3. Update: `src/pages/LandingPage.tsx`

- Add `lang` state at the top of `LandingPage` component
- Import content from `landingContent.ts`, access via `content[lang]`
- **Navbar:** Add a language toggle pill button (compact, glassmorphic) showing 🇬🇧/🇧🇩 flags with EN/বাংলা labels. Positioned between nav links and login buttons.
- Replace all hardcoded English strings with `content[lang].xxx` references
- Data arrays (`painPoints`, `features`, `stats`, `steps`, `testimonials`, `faqs`, `beforeAfter`) move inside the component or become functions of `lang`
- Dashboard mockup labels stay in English (they represent the actual app UI)
- Add `lang="bn"` attribute to wrapper div when Bangla is selected (for proper font rendering)
- Mobile menu also gets the language toggle

#### 4. Font consideration

Add Bangla-compatible font. The system fonts on most devices handle Bangla well, but we'll add `"Noto Sans Bengali"` from Google Fonts as a fallback in `index.html` for consistent rendering, and apply it via a `font-bangla` class when `lang === 'bn'`.

### Bangla content strategy

- Industry terms stay English: Meta Ads, TikTok, Google Ads, ROAS, CPC, impressions, clicks, USD, API
- Tone: Professional but friendly Bangladeshi Bangla — like how agency owners talk in Dhaka's digital marketing community
- Numbers: Use English numerals (not Bengali numerals) since that's standard in BD business context
- Currency: ৳ (Taka symbol) used where relevant

### Files changed
- `src/lib/landingContent.ts` (new) — all EN/BN translations
- `src/pages/LandingPage.tsx` — language toggle + dynamic content
- `index.html` — add Noto Sans Bengali font link

