import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Web Push encryption uses ECDH + HKDF + AES-GCM per RFC 8291
// We implement the protocol directly using Web Crypto API (no npm deps needed in Deno)

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
      return new Response(JSON.stringify({ error: "VAPID_PRIVATE_KEY not set" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get user's push subscriptions
    const { data: subs, error } = await supabase
      .from("push_subscriptions")
      .select("*")
      .eq("user_id", user_id);

    if (error || !subs || subs.length === 0) {
      return new Response(JSON.stringify({ sent: 0, message: "No subscriptions found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

        if (response.ok || response.status === 201) {
          sent++;
        } else if (response.status === 404 || response.status === 410) {
          // Subscription expired/invalid — mark for removal
          staleEndpoints.push(sub.endpoint);
        } else {
          console.error(`Push failed for ${sub.endpoint}: ${response.status} ${await response.text()}`);
        }
      } catch (err) {
        console.error(`Push error for ${sub.endpoint}:`, err);
      }
    }

    // Clean up stale subscriptions
    if (staleEndpoints.length > 0) {
      await supabase
        .from("push_subscriptions")
        .delete()
        .eq("user_id", user_id)
        .in("endpoint", staleEndpoints);
    }

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

async function sendWebPush(
  endpoint: string,
  p256dhBase64: string,
  authBase64: string,
  payload: string,
  vapidPrivateKeyBase64: string
): Promise<Response> {
  const vapidPublicKey = "BApytxnwgrWgRXe4jlovIcb0-mDVXL8jxm1acUxrunW4ZgeK1z5TGUkuP682ald5mhsYKLePfQh0fwtydvQT9EM";

  // Generate ECDH key pair for this message
  const localKeys = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);

  // Import subscriber's public key
  const clientPublicKeyBytes = base64urlToBytes(p256dhBase64);
  const clientPublicKey = await crypto.subtle.importKey(
    "raw",
    clientPublicKeyBytes,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );

  // ECDH shared secret
  const sharedSecret = await crypto.subtle.deriveBits(
    { name: "ECDH", public: clientPublicKey },
    localKeys.privateKey,
    256
  );

  const authSecret = base64urlToBytes(authBase64);
  const localPublicKeyBytes = new Uint8Array(
    await crypto.subtle.exportKey("raw", localKeys.publicKey)
  );

  // HKDF to derive encryption key and nonce (RFC 8291)
  const ikm = await hkdf(
    new Uint8Array(sharedSecret),
    authSecret,
    createInfo("WebPush: info\0", clientPublicKeyBytes, localPublicKeyBytes),
    32
  );

  const salt = crypto.getRandomValues(new Uint8Array(16));

  const contentEncryptionKey = await hkdf(ikm, salt, createCEKInfo("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(ikm, salt, createCEKInfo("Content-Encoding: nonce\0"), 12);

  // Encrypt payload (AES-128-GCM with padding)
  const paddedPayload = new Uint8Array(2 + new TextEncoder().encode(payload).length);
  paddedPayload.set([0, 0]); // 2-byte padding length (no padding)
  paddedPayload.set(new TextEncoder().encode(payload), 2);

  const aesKey = await crypto.subtle.importKey("raw", contentEncryptionKey, "AES-GCM", false, ["encrypt"]);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, paddedPayload);

  // Build aes128gcm content coding header
  const recordSize = new ArrayBuffer(4);
  new DataView(recordSize).setUint32(0, paddedPayload.length + 16); // +16 for GCM tag
  const header = new Uint8Array(
    salt.length + 4 + 1 + localPublicKeyBytes.length
  );
  header.set(salt, 0);
  header.set(new Uint8Array(recordSize), 16);
  header[20] = localPublicKeyBytes.length;
  header.set(localPublicKeyBytes, 21);

  const body = new Uint8Array(header.length + encrypted.byteLength);
  body.set(header, 0);
  body.set(new Uint8Array(encrypted), header.length);

  // VAPID JWT
  const jwt = await createVapidJwt(endpoint, vapidPrivateKeyBase64, vapidPublicKey);

  return fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      TTL: "86400",
      Authorization: `vapid t=${jwt}, k=${vapidPublicKey}`,
    },
    body,
  });
}

function base64urlToBytes(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(base64 + padding);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function createInfo(type: string, clientPublicKey: Uint8Array, serverPublicKey: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const info = new Uint8Array(typeBytes.length + clientPublicKey.length + serverPublicKey.length);
  info.set(typeBytes, 0);
  info.set(clientPublicKey, typeBytes.length);
  info.set(serverPublicKey, typeBytes.length + clientPublicKey.length);
  return info;
}

function createCEKInfo(type: string): Uint8Array {
  return new TextEncoder().encode(type);
}

async function hkdf(
  ikm: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array,
  length: number
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const prk = new Uint8Array(await crypto.subtle.sign("HMAC", await crypto.subtle.importKey("raw", salt, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]), ikm));
  const prkKey = await crypto.subtle.importKey("raw", prk, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const infoWithCounter = new Uint8Array(info.length + 1);
  infoWithCounter.set(info, 0);
  infoWithCounter[info.length] = 1;
  const result = new Uint8Array(await crypto.subtle.sign("HMAC", prkKey, infoWithCounter));
  return result.slice(0, length);
}

async function createVapidJwt(endpoint: string, privateKeyBase64: string, publicKeyBase64: string): Promise<string> {
  const url = new URL(endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const expiry = Math.floor(Date.now() / 1000) + 12 * 60 * 60; // 12 hours

  const header = bytesToBase64url(new TextEncoder().encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = bytesToBase64url(
    new TextEncoder().encode(
      JSON.stringify({ aud: audience, exp: expiry, sub: "mailto:admin@adspend.app" })
    )
  );

  const unsignedToken = `${header}.${payload}`;

  // Import VAPID private key
  const privateKeyBytes = base64urlToBytes(privateKeyBase64);
  const publicKeyBytes = base64urlToBytes(publicKeyBase64);

  // Build JWK for P-256
  const jwk = {
    kty: "EC",
    crv: "P-256",
    x: bytesToBase64url(publicKeyBytes.slice(1, 33)),
    y: bytesToBase64url(publicKeyBytes.slice(33, 65)),
    d: bytesToBase64url(privateKeyBytes),
  };

  const signingKey = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);

  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      signingKey,
      new TextEncoder().encode(unsignedToken)
    )
  );

  // Convert DER signature to raw r||s format (64 bytes)
  const rawSignature = derToRaw(signature);

  return `${unsignedToken}.${bytesToBase64url(rawSignature)}`;
}

function derToRaw(derSig: Uint8Array): Uint8Array {
  // ECDSA signatures from Web Crypto are already in IEEE P1363 format (r||s, 64 bytes)
  if (derSig.length === 64) return derSig;

  // If DER encoded, parse it
  if (derSig[0] !== 0x30) return derSig;

  let offset = 2;
  if (derSig[1] & 0x80) offset++;

  // Parse r
  const rLen = derSig[offset + 1];
  const rStart = offset + 2;
  let r = derSig.slice(rStart, rStart + rLen);
  if (r.length === 33 && r[0] === 0) r = r.slice(1);
  offset = rStart + rLen;

  // Parse s
  const sLen = derSig[offset + 1];
  const sStart = offset + 2;
  let s = derSig.slice(sStart, sStart + sLen);
  if (s.length === 33 && s[0] === 0) s = s.slice(1);

  const raw = new Uint8Array(64);
  raw.set(r.length <= 32 ? r : r.slice(r.length - 32), 32 - Math.min(r.length, 32));
  raw.set(s.length <= 32 ? s : s.slice(s.length - 32), 64 - Math.min(s.length, 32));
  return raw;
}
