export type Lang = "en" | "bn";

export const content = {
  en: {
    nav: {
      problems: "Problems",
      features: "Features",
      howItWorks: "How It Works",
      testimonials: "Testimonials",
      faq: "FAQ",
      login: "Log In",
      cta: "Automate My Agency",
      getStarted: "Get Started",
    },
    hero: {
      badge: "Built for Media Buying Agencies",
      h1: "Automate Your Agency.",
      h1Accent: "Scale Your Clients.",
      sub: "Stop wasting hours on manual reports, spreadsheet tracking, and balance calculations. HEPT automates ad spend reporting, client billing, and profit analytics — so you can manage 50+ clients as easily as 5.",
      cta: "Automate My Agency",
      ctaSecondary: "See How It Works",
      platformLabel: "Works with",
    },
    problems: {
      badge: "The Problem",
      title: "Running an agency shouldn't feel like this",
      sub: "If you manage paid campaigns for multiple clients, you know these daily struggles too well.",
      beforeAfterTitle: "Before HEPT vs. After HEPT",
      beforeLabel: "❌ Before",
      afterLabel: "✅ After",
    },
    painPoints: [
      {
        title: "Account Chaos",
        desc: "Juggling dozens of Meta, TikTok & Google ad accounts across clients. Copy-pasting IDs, losing track of which account belongs to whom.",
      },
      {
        title: "Report Slavery",
        desc: "Spending 2-3 hours every morning pulling numbers from each platform, formatting Excel sheets, and emailing reports to every client.",
      },
      {
        title: "Balance Blindness",
        desc: "Manually tracking how much each client deposited vs. how much was actually spent. One miscalculation = angry client or lost profit.",
      },
      {
        title: "Profit Guesswork",
        desc: "No clear picture of your agency's real margins. How much USD was bought, at what rate, how much is left — it's all in scattered spreadsheets.",
      },
    ],
    beforeAfter: [
      { before: "3 hours daily on manual reports", after: "Auto-generated in 2 minutes" },
      { before: "Scattered Excel spreadsheets", after: "One unified dashboard" },
      { before: "Client balance errors & disputes", after: "Real-time balance tracking" },
      { before: "Guessing agency profit margins", after: "Automated profit calculation" },
      { before: "Searching across 3 platform dashboards", after: "All platforms in one view" },
      { before: "Manual USD purchase tracking", after: "Dollar inventory forecasting" },
    ],
    features: {
      badge: "The Solution",
      title: "Everything you need to run a profitable agency",
      sub: "Four powerful modules that replace your spreadsheets, manual reports, and guesswork.",
      tryFree: "Try it free",
    },
    featureItems: [
      {
        title: "Automated Daily Reporting",
        desc: "Generate polished performance reports for every client with one click. Spend, impressions, clicks, conversions — all pulled automatically from Meta, TikTok & Google.",
      },
      {
        title: "Smart Ad Account Organization",
        desc: "Map each client to their specific ad accounts across platforms. See at a glance which accounts belong to whom and switch context in seconds.",
      },
      {
        title: "Client Balance Tracker",
        desc: "Real-time dashboard showing every client's deposits, daily ad spend, and remaining dollar balance. No more spreadsheets, no more errors.",
      },
      {
        title: "Agency Profit & Dollar Management",
        desc: "Track USD purchase costs, calculate your actual profit margins automatically, and forecast how many dollars you need to buy next. Your CFO in a dashboard.",
      },
    ],
    stats: {
      badge: "The Impact",
      title: "Manage 50 clients as easily as 5",
      sub: "Agencies using HEPT reclaim hours every week and scale without hiring extra staff.",
    },
    statItems: [
      { value: "10+", label: "Hours Saved / Week" },
      { value: "50+", label: "Clients Managed Easily" },
      { value: "3", label: "Platforms Connected" },
      { value: "0", label: "Spreadsheets Needed" },
    ],
    howItWorks: {
      badge: "How It Works",
      title: "Up and running in under 10 minutes",
    },
    stepItems: [
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
    ],
    testimonialSection: {
      badge: "Testimonials",
      title: "Trusted by agencies across Bangladesh",
    },
    testimonialItems: [
      {
        name: "Rakib Hasan",
        role: "Agency Owner, 35 Clients",
        quote: "I used to spend 3 hours every morning on reports. Now it takes 2 minutes. HEPT literally gave me my mornings back.",
      },
      {
        name: "Nusrat Jahan",
        role: "Freelance Media Buyer",
        quote: "The client balance tracker alone is worth it. No more awkward conversations about 'how much is left' — clients can see it themselves.",
      },
      {
        name: "Tanvir Ahmed",
        role: "Digital Marketing Agency, 50+ Clients",
        quote: "We scaled from 20 to 50 clients without hiring a single extra person for reporting or finance tracking. HEPT handles it all.",
      },
    ],
    faqSection: {
      badge: "FAQ",
      title: "Frequently asked questions",
    },
    faqItems: [
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
    ],
    finalCta: {
      title: "Ready to automate your agency?",
      sub: "Join hundreds of media buying agencies who've stopped drowning in spreadsheets and started scaling with HEPT.",
      button: "Start Free 14-Day Trial",
      note: "No credit card required • Full access during trial",
    },
    footer: {
      tagline: "Agency automation platform for digital marketers.",
      login: "Log In",
      signup: "Sign Up",
      copyright: "HEPT. All rights reserved.",
    },
  },
  bn: {
    nav: {
      problems: "সমস্যা",
      features: "ফিচার",
      howItWorks: "কিভাবে কাজ করে",
      testimonials: "রিভিউ",
      faq: "প্রশ্নোত্তর",
      login: "লগ ইন",
      cta: "Agency অটোমেট করুন",
      getStarted: "শুরু করুন",
    },
    hero: {
      badge: "Media Buying Agency-দের জন্য তৈরি",
      h1: "Agency অটোমেট করুন।",
      h1Accent: "Client স্কেল করুন।",
      sub: "প্রতিদিন ঘণ্টার পর ঘণ্টা manual report, Excel tracking আর balance হিসাব করা বন্ধ করুন। HEPT আপনার ad spend reporting, client billing আর profit analytics সব অটোমেট করে — যাতে আপনি 50+ client ম্যানেজ করতে পারেন 5 জনের মতোই সহজে।",
      cta: "Agency অটোমেট করুন",
      ctaSecondary: "কিভাবে কাজ করে দেখুন",
      platformLabel: "সাপোর্ট করে",
    },
    problems: {
      badge: "সমস্যা",
      title: "Agency চালানো এতো কঠিন হওয়ার কথা না",
      sub: "আপনি যদি multiple client-এর paid campaign ম্যানেজ করেন, এই প্রতিদিনের ঝামেলাগুলো আপনার খুবই চেনা।",
      beforeAfterTitle: "HEPT-এর আগে vs. HEPT-এর পরে",
      beforeLabel: "❌ আগে",
      afterLabel: "✅ পরে",
    },
    painPoints: [
      {
        title: "Account-এর জগাখিচুড়ি",
        desc: "ডজনখানেক Meta, TikTok আর Google Ad Account জাগলিং করা। ID copy-paste করা, কোন account কার সেটা ভুলে যাওয়া — এটা প্রতিদিনের ব্যাপার।",
      },
      {
        title: "Report-এর গোলামি",
        desc: "প্রতিদিন সকালে 2-3 ঘণ্টা ধরে প্রতিটা platform থেকে নম্বর টানা, Excel ফরম্যাট করা, আর প্রতিটা client-কে email করা — এটা কি সত্যিই আপনার কাজ?",
      },
      {
        title: "Balance-এর অন্ধকার",
        desc: "কোন client কত টাকা দিলো, কত spend হলো — manually ট্র্যাক করা। একটা ভুল হিসাব মানেই রাগী client অথবা লস।",
      },
      {
        title: "Profit আন্দাজে",
        desc: "Agency-র আসল margin কত সেটার clear picture নেই। কত USD কেনা হলো, কত rate-এ, কত বাকি আছে — সব ছড়ানো spreadsheet-এ।",
      },
    ],
    beforeAfter: [
      { before: "প্রতিদিন 3 ঘণ্টা manual report", after: "2 মিনিটে auto-generate" },
      { before: "ছড়ানো Excel spreadsheet", after: "একটাই unified dashboard" },
      { before: "Client balance ভুল ও ঝগড়া", after: "Real-time balance tracking" },
      { before: "Agency profit আন্দাজে", after: "Automated profit calculation" },
      { before: "3টা platform dashboard ঘাঁটা", after: "সব platform এক জায়গায়" },
      { before: "USD কেনা manually track করা", after: "Dollar inventory forecasting" },
    ],
    features: {
      badge: "সমাধান",
      title: "Profitable agency চালাতে যা যা দরকার — সব এখানে",
      sub: "চারটা powerful module যেগুলো আপনার spreadsheet, manual report আর guesswork রিপ্লেস করবে।",
      tryFree: "ফ্রি ট্রায়াল",
    },
    featureItems: [
      {
        title: "Automated Daily Reporting",
        desc: "এক click-এ প্রতিটা client-এর জন্য professional performance report তৈরি করুন। Spend, impressions, clicks, conversions — সব Meta, TikTok আর Google থেকে automatically টানা হয়।",
      },
      {
        title: "Smart Ad Account Organization",
        desc: "প্রতিটা client-কে তাদের specific Ad Account-এর সাথে map করুন। এক নজরে দেখুন কোন account কার, আর সেকেন্ডে context switch করুন।",
      },
      {
        title: "Client Balance Tracker",
        desc: "Real-time dashboard-এ দেখুন প্রতিটা client-এর deposit, daily ad spend আর বাকি dollar balance। আর কোনো spreadsheet নেই, কোনো ভুল নেই।",
      },
      {
        title: "Agency Profit & Dollar Management",
        desc: "USD কেনার cost track করুন, আসল profit margin automatically calculate করুন, আর forecast করুন পরেরবার কত dollar কিনতে হবে। আপনার dashboard-এই CFO।",
      },
    ],
    stats: {
      badge: "প্রভাব",
      title: "50 client ম্যানেজ করুন 5 জনের মতো সহজে",
      sub: "HEPT ব্যবহারকারী agency-গুলো প্রতি সপ্তাহে ঘণ্টার পর ঘণ্টা বাঁচাচ্ছে আর extra লোক hire ছাড়াই scale করছে।",
    },
    statItems: [
      { value: "10+", label: "ঘণ্টা সাশ্রয় / সপ্তাহে" },
      { value: "50+", label: "Client সহজে ম্যানেজ" },
      { value: "3", label: "Platform কানেক্টেড" },
      { value: "0", label: "Spreadsheet দরকার" },
    ],
    howItWorks: {
      badge: "কিভাবে কাজ করে",
      title: "10 মিনিটের মধ্যে শুরু করুন",
    },
    stepItems: [
      {
        num: "01",
        title: "Ad Account কানেক্ট করুন",
        desc: "মিনিটের মধ্যে আপনার Meta, TikTok আর Google Ads account লিংক করুন। API-এর complexity আমরা সামলাবো।",
      },
      {
        num: "02",
        title: "Client ও Account গুছিয়ে নিন",
        desc: "প্রতিটা client-কে তাদের Ad Account-এর সাথে map করুন। Budget, deposit আর pricing rule সেট করুন।",
      },
      {
        num: "03",
        title: "সব অটোমেট হয়ে যাক",
        desc: "Report automatically যাবে। Balance real-time আপডেট হবে। Profit নিজে থেকেই calculate হবে।",
      },
    ],
    testimonialSection: {
      badge: "রিভিউ",
      title: "বাংলাদেশ জুড়ে agency-দের বিশ্বাসের জায়গা",
    },
    testimonialItems: [
      {
        name: "রাকিব হাসান",
        role: "Agency Owner, 35 Client",
        quote: "আগে প্রতিদিন সকালে 3 ঘণ্টা report-এ যেতো। এখন 2 মিনিটে হয়ে যায়। HEPT আমার সকালটা ফিরিয়ে দিয়েছে।",
      },
      {
        name: "নুসরাত জাহান",
        role: "Freelance Media Buyer",
        quote: "শুধু client balance tracker-টাই worth it। 'কত বাকি আছে' নিয়ে আর কোনো awkward কথা নেই — client নিজেই দেখতে পারে।",
      },
      {
        name: "তানভীর আহমেদ",
        role: "Digital Marketing Agency, 50+ Client",
        quote: "আমরা 20 থেকে 50 client-এ scale করেছি reporting বা finance tracking-এর জন্য একজনও extra hire না করে। HEPT সব সামলায়।",
      },
    ],
    faqSection: {
      badge: "প্রশ্নোত্তর",
      title: "সচরাচর জিজ্ঞাসিত প্রশ্ন",
    },
    faqItems: [
      {
        q: "HEPT কোন কোন ad platform সাপোর্ট করে?",
        a: "HEPT বর্তমানে Meta (Facebook ও Instagram Ads), TikTok Ads আর Google Ads সাপোর্ট করে। User demand অনুযায়ী আরো platform যোগ করা হচ্ছে।",
      },
      {
        q: "Automated reporting কিভাবে কাজ করে?",
        a: "HEPT প্রতিদিন আপনার connected Ad Account থেকে performance data টানে, key metrics (spend, impressions, clicks, conversions, ROAS) calculate করে, আর সুন্দর client-ready report তৈরি করে যেটা এক click-এ share করতে পারবেন।",
      },
      {
        q: "আমার client-রা কি নিজেদের balance ও report দেখতে পারবে?",
        a: "হ্যাঁ! প্রতিটা client তাদের নিজস্ব branded portal পায় যেখানে তারা remaining balance, daily spend breakdown আর performance report দেখতে পারে — সব আপনার agency brand-এর under-এ।",
      },
      {
        q: "Client billing কিভাবে calculate হয়?",
        a: "আপনি প্রতিটা client-এর জন্য নিজের pricing rule সেট করবেন (markup percentage, flat fee, বা custom rate)। HEPT actual ad spend USD-এ track করে, আপনার pricing apply করে, আর প্রতিটা dollar-এ exact profit দেখায়।",
      },
      {
        q: "আমার data কি নিরাপদ?",
        a: "অবশ্যই। আমরা bank-grade encryption, row-level security policy ব্যবহার করি আর আপনার data organization-wise আলাদা থাকে। আমরা কখনো আপনার client data access বা share করি না।",
      },
      {
        q: "টাকা দেওয়ার আগে try করা যাবে?",
        a: "হ্যাঁ — প্রতিটা plan-এ 14 দিনের free trial আছে। আগে থেকে কোনো credit card লাগবে না। Trial-এর সময় সব feature-এ full access পাবেন।",
      },
    ],
    finalCta: {
      title: "আপনার agency অটোমেট করতে রেডি?",
      sub: "শত শত media buying agency spreadsheet-এর জগাখিচুড়ি ছেড়ে HEPT দিয়ে scale করছে। আপনিও শুরু করুন।",
      button: "14 দিনের ফ্রি ট্রায়াল শুরু করুন",
      note: "Credit card লাগবে না • Trial-এ full access",
    },
    footer: {
      tagline: "Digital marketer-দের জন্য agency automation platform।",
      login: "লগ ইন",
      signup: "সাইন আপ",
      copyright: "HEPT। সর্বস্বত্ব সংরক্ষিত।",
    },
  },
} as const;
