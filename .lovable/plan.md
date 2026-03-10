

## Cloudflare Worker: TikTok API Proxy Relay

Since both direct and BC-scoped TikTok API calls are blocked by error 41000 (geo-restriction on server IP), we need an external proxy in an allowed region. A **Cloudflare Worker** is ideal — free tier supports 100K requests/day, deployed globally, and takes ~5 minutes to set up.

### The Cloudflare Worker Code

You'll deploy this as a Cloudflare Worker. It transparently forwards any request to `business-api.tiktok.com`, preserving headers, path, query params, and body:

```javascript
export default {
  async fetch(request) {
    const url = new URL(request.url);
    
    // Forward everything after the worker domain to TikTok
    const tiktokUrl = `https://business-api.tiktok.com${url.pathname}${url.search}`;
    
    // Clone headers, remove Host
    const headers = new Headers(request.headers);
    headers.delete("Host");
    
    const response = await fetch(tiktokUrl, {
      method: request.method,
      headers,
      body: request.method !== "GET" ? request.body : undefined,
    });
    
    // Return response with CORS
    const newHeaders = new Headers(response.headers);
    newHeaders.set("Access-Control-Allow-Origin", "*");
    
    return new Response(response.body, {
      status: response.status,
      headers: newHeaders,
    });
  }
};
```

### Deployment Steps

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **Create Worker**
2. Name it something like `tiktok-proxy`
3. Paste the code above and click **Deploy**
4. Your proxy URL will be: `https://tiktok-proxy.<your-subdomain>.workers.dev`
5. In your app's **Settings** page, paste that URL into the **TikTok API Proxy URL** field and save
6. Trigger a manual sync — the edge functions will route TikTok calls through your worker

### How It Works With Your Code

Your sync functions already have `getTikTokBaseUrl(proxyUrl)` which replaces `https://business-api.tiktok.com` with the proxy URL. So a call like:

```
https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/?...
```

Becomes:

```
https://tiktok-proxy.your-subdomain.workers.dev/open_api/v1.3/report/integrated/get/?...
```

The Worker forwards it to TikTok from Cloudflare's network (US/EU IPs), bypassing the geo-block.

### Important Notes

- **Free tier**: 100,000 requests/day — more than enough for ad sync
- **Region**: Cloudflare Workers run on edge nodes globally; TikTok typically allows US/EU IPs
- **Security**: The Access-Token header passes through to TikTok, so only your edge functions (with valid tokens) can use it meaningfully
- **No code changes needed** in Lovable — just paste the Worker URL in Settings

