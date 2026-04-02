
## PWA Setup for Mobile Notifications

### What You'll Get
Your app becomes **installable** on any phone — users tap "Add to Home Screen" and it looks/feels like a native app. The real-time notification system we already built will work inside this installed app, delivering instant alerts via toast/badge just like native push notifications.

### Important Notes
- **PWA push notifications work fully on Android** — users will see alerts even when the app is in the background
- **iOS has limitations** — real-time notifications work when the app is open, but background push is limited on Safari PWAs
- PWA features (install prompt, offline) only work in the **published version**, not in the Lovable editor preview

### Changes

**1. Add `manifest.json`** to `public/`
- App name: AdSpend
- Theme color matching your brand
- Icons for home screen (192px + 512px)
- `display: standalone` for full-screen app experience

**2. Generate PWA icons**
- 192x192 and 512x512 app icons for the home screen

**3. Update `index.html`**
- Add mobile-optimized meta tags (viewport, theme-color, apple-mobile-web-app)
- Link to manifest

**4. No service worker / vite-plugin-pwa needed**
- Since you mainly need installability + real-time in-app notifications (not offline support), a simple manifest approach is enough — no service worker complexity

### Result
Users visit your published URL on their phone → browser shows "Install" banner → they add it → full-screen app on home screen → real-time notification bell + toasts work just like a native app.
