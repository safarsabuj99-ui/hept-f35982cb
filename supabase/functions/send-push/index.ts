import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { user_id, title, body, link, type } = await req.json();

    if (!user_id || !title) {
      return new Response(JSON.stringify({ error: "user_id and title required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");

    if (!vapidPrivateKey) {
      console.error("VAPID_PRIVATE_KEY not set");
      return new Response(JSON.stringify({ error: "VAPID_PRIVATE_KEY not set" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: subs, error } = await supabase
      .from("push_subscriptions")
      .select("*")
      .eq("user_id", user_id);

    if (error || !subs || subs.length === 0) {
      console.log("No subscriptions found for user:", user_id);
      return new Response(JSON.stringify({ sent: 0, message: "No subscriptions found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Found ${subs.length} subscription(s) for user ${user_id}`);

    const payload = JSON.stringify({ title, body: body || "", link: link || "/", tag: type || "system" });

    let sent = 0;
    const staleEndpoints: string[] = [];

    for (const sub of subs) {
      try {
        const response = await sendWebPush(
          sub.endpoint,
          sub.keys_p256dh,
          sub.keys_auth,
          payload,
          vapidPrivateKey
        );

        const responseText = await response.text();
        console.log(`Push to ${sub.endpoint.slice(0, 60)}...: status=${response.status} body=${responseText.slice(0, 200)}`);

        if (response.ok || response.status === 201) {
          sent++;
        } else if (response.status === 404 || response.status === 410) {
          staleEndpoints.push(sub.endpoint);
        }
      } catch (err) {
        console.error(`Push error for ${sub.endpoint}:`, err);
      }
    }

    if (staleEndpoints.length > 0) {
      await supabase
        .from("push_subscriptions")
        .delete()
        .eq("user_id", user_id)
        .in("endpoint", staleEndpoints);
    }

    console.log(`Result: sent=${sent}, total=${subs.length}, cleaned=${staleEndpoints.length}`);

    return new Response(
      JSON.stringify({ sent, total: subs.length, cleaned: staleEndpoints.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("send-push error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ----- Web Push Implementation (RFC 8291 / RFC 8188) -----

const VAPID_PUBLIC_KEY = "BApytxnwgrWgRXe4jlovIcb0-mDVXL8jxm1acUxrunW4ZgeK1z5TGUkuP682ald5mhsYKLePfQh0fwtydvQT9EM";

async function sendWebPush(
  endpoint: string,
  p256dhBase64: string,
  authBase64: string,
  payload: string,
  vapidPrivateKeyBase64: string
): Promise<Response> {
  // Generate ECDH key pair for this message
  const localKeys = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );

  // Import subscriber's public key
  const clientPubBytes = base64urlToBytes(p256dhBase64);
  const clientPubKey = await crypto.subtle.importKey(
    "raw", clientPubBytes, { name: "ECDH", namedCurve: "P-256" }, false, []
  );

  // ECDH shared secret
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: clientPubKey },
      localKeys.privateKey,
      256
    )
  );

  const authSecret = base64urlToBytes(authBase64);
  const localPubBytes = new Uint8Array(
    await crypto.subtle.exportKey("raw", localKeys.publicKey)
  );

  // --- RFC 8291 key derivation ---
  // IKM = HKDF(sharedSecret, authSecret, "WebPush: info\0" || client_pub || server_pub, 32)
  const infoForIKM = concatBytes(
    new TextEncoder().encode("WebPush: info\0"),
    clientPubBytes,
    localPubBytes
  );
  const ikm = await hkdfSha256(authSecret, sharedSecret, infoForIKM, 32);

  // Salt for content encryption
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // CEK = HKDF(salt, ikm, "Content-Encoding: aes128gcm\0", 16)
  const cekInfo = new TextEncoder().encode("Content-Encoding: aes128gcm\0");
  const contentKey = await hkdfSha256(salt, ikm, cekInfo, 16);

  // Nonce = HKDF(salt, ikm, "Content-Encoding: nonce\0", 12)
  const nonceInfo = new TextEncoder().encode("Content-Encoding: nonce\0");
  const nonce = await hkdfSha256(salt, ikm, nonceInfo, 12);

  // Pad and encrypt payload
  const payloadBytes = new TextEncoder().encode(payload);
  // aes128gcm padding: delimiter byte \x02 marks last record
  const padded = new Uint8Array(payloadBytes.length + 1);
  padded.set(payloadBytes);
  padded[payloadBytes.length] = 2; // delimiter

  const aesKey = await crypto.subtle.importKey("raw", contentKey, "AES-GCM", false, ["encrypt"]);
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, padded)
  );

  // Build aes128gcm header: salt(16) || rs(4) || idlen(1) || keyid(65)
  const rs = padded.length + 16; // record size = plaintext + tag
  const header = new Uint8Array(16 + 4 + 1 + localPubBytes.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, rs);
  header[20] = localPubBytes.length;
  header.set(localPubBytes, 21);

  const body = concatBytes(header, encrypted);

  // VAPID JWT
  const jwt = await createVapidJwt(endpoint, vapidPrivateKeyBase64);

  return fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      TTL: "86400",
      Authorization: `vapid t=${jwt}, k=${VAPID_PUBLIC_KEY}`,
    },
    body,
  });
}

// --- Crypto helpers ---

function base64urlToBytes(b64url: string): Uint8Array {
  // Use Deno's built-in base64 decoding which handles URL-safe variants
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  // Use TextEncoder approach to avoid atob issues in Deno
  const binaryString = globalThis.atob(padded);
  const bytes = Uint8Array.from(binaryString, (c) => c.charCodeAt(0));
  return bytes;
}

function bytesToBase64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const len = arrays.reduce((s, a) => s + a.length, 0);
  const result = new Uint8Array(len);
  let offset = 0;
  for (const a of arrays) {
    result.set(a, offset);
    offset += a.length;
  }
  return result;
}

/**
 * Standard HKDF-SHA-256: extract then expand.
 * salt = HKDF salt, ikm = input keying material
 */
async function hkdfSha256(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number
): Promise<Uint8Array> {
  // Extract: PRK = HMAC-SHA-256(salt, IKM)
  const saltKey = await crypto.subtle.importKey(
    "raw", salt.length ? salt : new Uint8Array(32),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const prk = new Uint8Array(await crypto.subtle.sign("HMAC", saltKey, ikm));

  // Expand: OKM = HMAC-SHA-256(PRK, info || 0x01)
  const prkKey = await crypto.subtle.importKey(
    "raw", prk, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const infoCounter = new Uint8Array(info.length + 1);
  infoCounter.set(info);
  infoCounter[info.length] = 1;
  const okm = new Uint8Array(await crypto.subtle.sign("HMAC", prkKey, infoCounter));
  return okm.slice(0, length);
}

async function createVapidJwt(
  endpoint: string,
  privateKeyBase64: string
): Promise<string> {
  const url = new URL(endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const expiry = Math.floor(Date.now() / 1000) + 12 * 60 * 60;

  const header = bytesToBase64url(
    new TextEncoder().encode(JSON.stringify({ typ: "JWT", alg: "ES256" }))
  );
  const payload = bytesToBase64url(
    new TextEncoder().encode(
      JSON.stringify({ aud: audience, exp: expiry, sub: "mailto:admin@adspend.app" })
    )
  );

  const unsignedToken = `${header}.${payload}`;

  const trimmedPrivateKey = privateKeyBase64.trim();
  console.log(`VAPID private key length: ${trimmedPrivateKey.length}, public key length: ${VAPID_PUBLIC_KEY.length}`);
  
  const publicKeyBytes = base64urlToBytes(VAPID_PUBLIC_KEY);
  const privateKeyBytes = base64urlToBytes(trimmedPrivateKey);

  const jwk = {
    kty: "EC",
    crv: "P-256",
    x: bytesToBase64url(publicKeyBytes.slice(1, 33)),
    y: bytesToBase64url(publicKeyBytes.slice(33, 65)),
    d: bytesToBase64url(privateKeyBytes),
  };

  const signingKey = await crypto.subtle.importKey(
    "jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]
  );

  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      signingKey,
      new TextEncoder().encode(unsignedToken)
    )
  );

  return `${unsignedToken}.${bytesToBase64url(signature)}`;
}
