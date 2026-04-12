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
      cta: "ফ্রি শুরু করুন",
      getStarted: "এখনই শুরু করুন",
    },
    hero: {
      badge: "🇧🇩 বাংলাদেশের #1 Agency Automation Tool",
      h1: "Agency চালান,",
      h1Accent: "Excel চালাবেন না।",
      sub: "আপনি কি এখনো প্রতিদিন সকালে ঘুম থেকে উঠে Excel খুলে client-এর report বানাচ্ছেন? প্রতিটা platform থেকে manually data টানছেন? Client কত টাকা দিলো, কত spend হলো — হাতে হাতে হিসাব করছেন? এই সময়টা আপনার agency grow করার কথা ছিলো। HEPT দিয়ে 50+ client ম্যানেজ করুন — 5 জনের চেয়েও সহজে।",
      cta: "ফ্রি ট্রায়াল শুরু করুন",
      ctaSecondary: "2 মিনিটে দেখুন কিভাবে কাজ করে",
      platformLabel: "যেসব platform সাপোর্ট করে",
    },
    problems: {
      badge: "😤 চেনা সমস্যা?",
      title: "এই ঝামেলাগুলো কি আপনারও?",
      sub: "আপনি একা নন। বাংলাদেশের 90% agency owner এই সমস্যাগুলোতে প্রতিদিন সময় আর টাকা হারাচ্ছে।",
      beforeAfterTitle: "HEPT ছাড়া vs. HEPT দিয়ে",
      beforeLabel: "😩 এখন যা হচ্ছে",
      afterLabel: "🚀 HEPT দিয়ে যা হবে",
    },
    painPoints: [
      {
        title: "Account-এর নরক",
        desc: "20টা client, 40টা Ad Account, 3টা platform — কোনটা কার মনে নেই। ভুল account-এ টাকা খরচ হলে কে দায় নেবে? এক ভুলেই client-এর trust শেষ।",
      },
      {
        title: "Report বানাতে বানাতে জীবন শেষ",
        desc: "প্রতিদিন সকালে 2-3 ঘণ্টা ধরে Meta, TikTok, Google থেকে number টেনে Excel-এ বসানো — এটা কি আপনার কাজ, নাকি একটা robot-এর? এই সময়ে আপনি 3টা নতুন client close করতে পারতেন।",
      },
      {
        title: "হিসাবে গরমিল = Client হারানো",
        desc: "Client বললো 'ভাই আমার তো ৫০ হাজার টাকা বাকি থাকার কথা!' — আপনি Excel চেক করে দেখলেন ভুল হিসাব। একটা ভুল = একটা client gone forever। আর সেই client আপনার competitor-এর কাছে যাবে।",
      },
      {
        title: "আপনার আসল লাভ কত? জানেন তো?",
        desc: "Dollar কিনলেন 122 rate-এ, client-কে charge করলেন 125-এ — কিন্তু platform fee, tax, ভুল হিসাব বাদ দিলে আসলে কত রইলো? বেশিরভাগ agency owner নিজের real profit জানে না। জানলে হয়তো কাঁদতো।",
      },
    ],
    beforeAfter: [
      { before: "প্রতিদিন 3 ঘণ্টা report বানানো", after: "1 click-এ auto report — 2 মিনিটে" },
      { before: "10টা Excel file-এ ছড়ানো data", after: "একটাই dashboard, সব এক জায়গায়" },
      { before: "Client-এর সাথে balance নিয়ে ঝগড়া", after: "Client নিজেই balance দেখতে পারে" },
      { before: "Profit কত — আন্দাজে চলা", after: "প্রতিটা টাকার হিসাব automatic" },
      { before: "3টা platform আলাদা আলাদা চেক করা", after: "Meta + TikTok + Google — এক screen-এ" },
      { before: "Dollar কেনার হিসাব মাথায় রাখা", after: "Dollar inventory + forecast automatic" },
    ],
    features: {
      badge: "💡 সমাধান এসে গেছে",
      title: "আর কোনো Excel নেই। আর কোনো ঝামেলা নেই।",
      sub: "4টা powerful module যেগুলো আপনার পুরো agency operation সামলাবে — আপনি শুধু client বাড়ান।",
      tryFree: "ফ্রি তে চালান",
    },
    featureItems: [
      {
        title: "1-Click Automated Report",
        desc: "আর কোনোদিন manually report বানাতে হবে না। HEPT প্রতিদিন automatically Meta, TikTok, Google থেকে data টেনে professional report ready রাখে। আপনি শুধু client-কে পাঠান — 2 মিনিটে 50 client-এর report done।",
      },
      {
        title: "Smart Account Mapping",
        desc: "কোন client-এর কোন Ad Account — সব organized। আর কখনো ভুল account-এ কাজ করার ভয় নেই। এক নজরে সব দেখুন, এক click-এ switch করুন। ভুল হওয়ার chance — zero।",
      },
      {
        title: "Real-Time Client Balance",
        desc: "প্রতিটা client কত টাকা দিয়েছে, কত spend হয়েছে, কত বাকি — সব real-time। Client নিজেও দেখতে পারবে branded portal-এ। আর কোনো WhatsApp-এ 'ভাই কত বাকি?' — সেই দিন শেষ।",
      },
      {
        title: "Profit Calculator + Dollar Tracker",
        desc: "আপনার প্রতিটা dollar purchase-এর cost, প্রতিটা client-এর real profit margin — সব automatic। কবে কত dollar কিনতে হবে সেটাও forecast করে দেয়। এটা আপনার agency-র CFO — dashboard-এর মধ্যে।",
      },
    ],
    stats: {
      badge: "📊 Real Impact",
      title: "যারা HEPT ব্যবহার করছে, তারা আর পিছনে তাকায়নি",
      sub: "সময় বাঁচান, ভুল কমান, extra hire ছাড়াই scale করুন — HEPT ব্যবহারকারী agency-দের result।",
    },
    statItems: [
      { value: "10+", label: "ঘণ্টা বাঁচে প্রতি সপ্তাহে" },
      { value: "50+", label: "Client — একা ম্যানেজ করুন" },
      { value: "3", label: "Platform একসাথে connected" },
      { value: "0", label: "Excel দরকার — সত্যিই zero" },
    ],
    howItWorks: {
      badge: "⚡ সেটআপ",
      title: "মাত্র 10 মিনিটে পুরো agency automated",
    },
    stepItems: [
      {
        num: "01",
        title: "Ad Account Connect করুন",
        desc: "আপনার Meta, TikTok আর Google Ads account link করুন — মাত্র কয়েক click-এ। কোনো coding লাগবে না, কোনো ঝামেলা নেই। API complexity আমরা সামলাবো।",
      },
      {
        num: "02",
        title: "Client ও Account সাজিয়ে নিন",
        desc: "প্রতিটা client-কে তাদের Ad Account-এর সাথে map করুন। Budget সেট করুন, pricing rule ঠিক করুন — 5 মিনিটে সব ready।",
      },
      {
        num: "03",
        title: "বসে থাকুন — বাকিটা HEPT করবে",
        desc: "Report automatic যাবে, balance real-time update হবে, profit নিজে calculate হবে। আপনি শুধু নতুন client আনুন আর agency grow করুন।",
      },
    ],
    testimonialSection: {
      badge: "⭐ সত্যিকারের রিভিউ",
      title: "এই agency owner-রা আর কোনোদিন আগের system-এ ফিরবে না",
    },
    testimonialItems: [
      {
        name: "রাকিব হাসান",
        role: "Agency Owner — 35 Client Manage করেন",
        quote: "আগে প্রতিদিন সকাল 8টা থেকে 11টা পর্যন্ত শুধু report বানাতাম। এখন সকাল 8:05-এ সব report ready থাকে। HEPT আমার প্রতিদিন 3 ঘণ্টা ফিরিয়ে দিয়েছে — এই সময়ে আমি 8টা নতুন client close করেছি গত মাসে।",
      },
      {
        name: "নুসরাত জাহান",
        role: "Freelance Media Buyer — 12 Client",
        quote: "আমার এক client বলেছিলো 'balance নিয়ে আর ঝামেলা হলে agency change করবো।' HEPT দেওয়ার পর সেই client নিজেই portal-এ balance দেখে — গত 6 মাসে একটাও complain নেই। উল্টো 3 জন নতুন client refer করেছে।",
      },
      {
        name: "তানভীর আহমেদ",
        role: "Digital Marketing Agency — 50+ Client",
        quote: "আমরা 20 client থেকে 50+ client-এ scale করেছি — reporting বা finance-এর জন্য একজনও extra hire করিনি। HEPT না থাকলে কমপক্ষে 2 জন employee লাগতো — মাসে ৪০,০০০+ টাকা বাঁচাচ্ছি।",
      },
    ],
    faqSection: {
      badge: "❓ প্রশ্ন আছে?",
      title: "আপনার মনে যা আসতে পারে",
    },
    faqItems: [
      {
        q: "HEPT কোন কোন Ad Platform সাপোর্ট করে?",
        a: "Meta (Facebook + Instagram Ads), TikTok Ads, আর Google Ads — বাংলাদেশের agency-গুলোর সবচেয়ে বেশি ব্যবহৃত 3টা platform। আরো platform আসছে — user demand অনুযায়ী।",
      },
      {
        q: "আমার data কি safe? কেউ দেখতে পারবে?",
        a: "100% safe। Bank-grade encryption + Row-Level Security — আপনার data শুধু আপনি দেখতে পারবেন। আমরা নিজেরাও আপনার client data access করি না — ever। আপনার data আপনার।",
      },
      {
        q: "আমি তো মাত্র 5-10 client manage করি, আমার কি দরকার?",
        a: "5 client manage করতেও প্রতিদিন 1-2 ঘণ্টা reporting-এ যায়। HEPT দিয়ে সেটা 5 মিনিটে হবে — বাকি সময়ে আপনি 5 থেকে 20 client-এ grow করতে পারবেন। ছোট agency-দের জন্যই HEPT সবচেয়ে বেশি game-changer।",
      },
      {
        q: "খরচ কত? আমার budget কম।",
        a: "14 দিনের ফ্রি trial — কোনো credit card লাগবে না। এরপর মাসিক plan শুরু হয় মাত্র একজন employee-র এক দিনের বেতনের চেয়েও কম দামে। আর HEPT যে সময় বাঁচাবে, সেটার value এর 10 গুণ বেশি।",
      },
      {
        q: "Setup কি কঠিন? Technical knowledge লাগবে?",
        a: "না! কোনো coding নেই, কোনো technical setup নেই। আপনি যদি Facebook-এ login করতে পারেন, তাহলে HEPT setup করতে পারবেন। 10 মিনিটে পুরো agency automated।",
      },
      {
        q: "আমার client-রাও কি access পাবে?",
        a: "হ্যাঁ! প্রতিটা client তাদের নিজস্ব branded portal পায় — আপনার agency-র নাম আর logo দিয়ে। Client নিজেই balance, spend, report দেখতে পারে। আপনাকে আর WhatsApp-এ screenshot পাঠাতে হবে না।",
      },
    ],
    finalCta: {
      title: "আপনার competitor agency already HEPT ব্যবহার করছে।",
      sub: "যতদিন আপনি Excel-এ সময় নষ্ট করছেন, ততদিন আপনার competitor নতুন client নিচ্ছে। আজই শুরু করুন — 14 দিন ফ্রি, কোনো risk নেই।",
      button: "এখনই ফ্রি ট্রায়াল শুরু করুন",
      note: "Credit card লাগবে না • 10 মিনিটে setup • Full access",
    },
    footer: {
      tagline: "বাংলাদেশের agency owner-দের জন্য #1 automation platform।",
      login: "লগ ইন",
      signup: "ফ্রি তে শুরু করুন",
      copyright: "HEPT। সর্বস্বত্ব সংরক্ষিত।",
    },
  },
} as const;
