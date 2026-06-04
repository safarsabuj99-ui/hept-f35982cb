import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { crypto as stdCrypto } from "https://deno.land/std@0.224.0/crypto/mod.ts";
import { requireCaller, requireOrgAccess, requireRole, AuthError } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResp(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  async function loadGateway(name: string) {
    const { data, error } = await supabase
      .from("platform_payment_gateways")
      .select("*")
      .eq("gateway", name)
      .eq("is_enabled", true)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  try {
    // Read raw body once so we can both verify signatures (SSLCommerz MD5,
    // Stripe HMAC) and re-parse it as JSON / form data downstream.
    const rawBody = await req.text();
    let payload: any = {};
    let action: string | undefined;
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      try { payload = rawBody ? JSON.parse(rawBody) : {}; } catch { payload = {}; }
      action = payload.action;
    } else {
      // SSLCommerz posts IPN as application/x-www-form-urlencoded
      const params = new URLSearchParams(rawBody);
      for (const [k, v] of params.entries()) payload[k] = v;
      action = payload.action || (req.headers.get("x-sslcommerz-ipn") ? "ipn" : undefined);
    }

    // Guard user-initiated payment sessions. Webhooks/IPN come from external gateways.
    const isInitiate = action === "initiate" || action === "sslcommerz-initiate" || action === "stripe-initiate";
    if (isInitiate) {
      const ctx = await requireCaller(req);
      requireRole(ctx, ["admin", "platform_owner"]);
      await requireOrgAccess(ctx, payload.org_id);
    }

    // ===== SSLCommerz: Initiate =====
    if (action === "initiate" || action === "sslcommerz-initiate") {
      const { org_id, invoice_id, amount_bdt, success_url, fail_url, cancel_url } = payload;
      const gw = await loadGateway("sslcommerz");
      if (!gw) {
        return jsonResp({ error: "SSLCommerz not configured. Ask the platform owner to add it under Payment Gateways." }, 400);
      }
      const { store_id, store_password } = gw.credentials || {};
      if (!store_id || !store_password) {
        return jsonResp({ error: "SSLCommerz credentials incomplete." }, 400);
      }
      const isSandbox = gw.mode === "sandbox";

      const tranId = `TXN-${org_id.slice(0, 6)}-${Date.now().toString(36).toUpperCase()}`;

      const { data: txn, error: txnErr } = await supabase.from("gateway_transactions").insert({
        org_id, invoice_id, gateway: "sslcommerz", gateway_txn_id: tranId, amount_bdt, status: "initiated",
      }).select("id").single();
      if (txnErr) throw txnErr;

      const { data: org } = await supabase.from("organizations").select("name, owner_user_id").eq("id", org_id).single();
      const { data: profile } = await supabase.from("profiles").select("email, phone, full_name").eq("user_id", org?.owner_user_id).single();

      const baseUrl = isSandbox ? "https://sandbox.sslcommerz.com" : "https://securepay.sslcommerz.com";
      const formData = new URLSearchParams({
        store_id, store_passwd: store_password,
        total_amount: String(amount_bdt), currency: "BDT", tran_id: tranId,
        success_url: success_url || `${Deno.env.get("SUPABASE_URL")}/functions/v1/payment-gateway`,
        fail_url: fail_url || `${Deno.env.get("SUPABASE_URL")}/functions/v1/payment-gateway`,
        cancel_url: cancel_url || `${Deno.env.get("SUPABASE_URL")}/functions/v1/payment-gateway`,
        ipn_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/payment-gateway`,
        cus_name: profile?.full_name || org?.name || "Agency",
        cus_email: profile?.email || "no-reply@example.com",
        cus_phone: profile?.phone || "01700000000",
        cus_add1: "Dhaka", cus_city: "Dhaka", cus_country: "Bangladesh",
        shipping_method: "NO", product_name: "Subscription Payment",
        product_category: "SaaS", product_profile: "non-physical-goods",
        value_a: txn.id, value_b: org_id, value_c: invoice_id || "",
      });

      const resp = await fetch(`${baseUrl}/gwprocess/v4`, { method: "POST", body: formData });
      const result = await resp.json();
      if (result.status === "SUCCESS") {
        await supabase.from("gateway_transactions").update({ gateway_response: result }).eq("id", txn.id);
        return jsonResp({ ok: true, gateway_url: result.GatewayPageURL, txn_id: txn.id });
      }
      return jsonResp({ error: "Gateway session failed", details: result }, 400);
    }

    // ===== Stripe: Initiate =====
    if (action === "stripe-initiate") {
      const { org_id, invoice_id, amount, currency = "USD", success_url, cancel_url } = payload;
      const gw = await loadGateway("stripe");
      if (!gw) return jsonResp({ error: "Stripe not configured. Ask the platform owner to add it." }, 400);
      const { secret_key } = gw.credentials || {};
      if (!secret_key) return jsonResp({ error: "Stripe secret key missing." }, 400);

      const tranId = `STR-${org_id.slice(0, 6)}-${Date.now().toString(36).toUpperCase()}`;
      const { data: txn, error: txnErr } = await supabase.from("gateway_transactions").insert({
        org_id, invoice_id, gateway: "stripe", gateway_txn_id: tranId,
        amount_bdt: amount, // store amount; currency tracked via gateway_response
        status: "initiated",
      }).select("id").single();
      if (txnErr) throw txnErr;

      const { data: org } = await supabase.from("organizations").select("name, owner_user_id").eq("id", org_id).single();
      const { data: profile } = await supabase.from("profiles").select("email").eq("user_id", org?.owner_user_id).single();

      const form = new URLSearchParams();
      form.set("mode", "payment");
      form.set("payment_method_types[0]", "card");
      form.set("line_items[0][price_data][currency]", currency.toLowerCase());
      form.set("line_items[0][price_data][product_data][name]", `Subscription — ${org?.name || "Agency"}`);
      form.set("line_items[0][price_data][unit_amount]", String(Math.round(Number(amount) * 100)));
      form.set("line_items[0][quantity]", "1");
      form.set("success_url", success_url || `${Deno.env.get("SUPABASE_URL")}/functions/v1/payment-gateway?action=stripe-success&txn=${txn.id}`);
      form.set("cancel_url", cancel_url || `${Deno.env.get("SUPABASE_URL")}/functions/v1/payment-gateway?action=stripe-cancel&txn=${txn.id}`);
      form.set("client_reference_id", txn.id);
      form.set("metadata[txn_id]", txn.id);
      form.set("metadata[org_id]", org_id);
      form.set("metadata[invoice_id]", invoice_id || "");
      if (profile?.email) form.set("customer_email", profile.email);

      const resp = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${secret_key}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form,
      });
      const result = await resp.json();
      if (!resp.ok) {
        return jsonResp({ error: result.error?.message || "Stripe session failed", details: result }, 400);
      }
      await supabase.from("gateway_transactions").update({
        gateway_response: result,
        gateway_txn_id: result.id,
      }).eq("id", txn.id);
      return jsonResp({ ok: true, gateway_url: result.url, txn_id: txn.id });
    }

    // ===== SSLCommerz IPN / Callbacks =====
    if (action === "ipn" || action === "success" || action === "fail" || action === "cancel") {
      // SECURITY: Verify SSLCommerz IPN signature (MD5 of sorted params + store_passwd hash).
      // Spec: https://developer.sslcommerz.com/doc/v4/#ipn
      const gw = await loadGateway("sslcommerz");
      if (!gw) return jsonResp({ error: "SSLCommerz gateway not configured" }, 400);
      const storePassword = gw.credentials?.store_password;
      if (!storePassword) return jsonResp({ error: "SSLCommerz store_password missing" }, 400);

      const verifySign = payload.verify_sign;
      const verifyKey = payload.verify_key;
      if (!verifySign || !verifyKey) {
        return jsonResp({ error: "Missing IPN signature" }, 400);
      }

      // Build hash per SSLCommerz spec: md5(store_passwd) first, then
      // alphabetically-sorted key=value of fields listed in verify_key,
      // joined with '&', md5'd again.
      const md5 = async (input: string) => {
        const buf = await stdCrypto.subtle.digest("MD5", new TextEncoder().encode(input));
        return Array.from(new Uint8Array(buf))
          .map((b) => b.toString(16).padStart(2, "0")).join("");
      };
      const storeHash = await md5(storePassword);
      const keys = String(verifyKey).split(",").sort();
      const parts: string[] = [];
      for (const k of keys) {
        const v = payload[k] ?? "";
        parts.push(`${k}=${v}`);
      }
      parts.push(`store_passwd=${storeHash}`);
      parts.sort();
      const expected = await md5(parts.join("&"));
      if (expected !== String(verifySign).toLowerCase()) {
        console.warn("[payment-gateway] SSLCommerz IPN signature mismatch", { tran_id: payload.tran_id });
        return jsonResp({ error: "Invalid IPN signature" }, 401);
      }

      const { value_a, value_b, value_c, status: payStatus } = payload;
      const txnId = value_a;
      const orgId = value_b;
      const invoiceId = value_c;

      const newStatus = payStatus === "VALID" || payStatus === "VALIDATED"
        ? "success"
        : action === "cancel" ? "cancelled" : "failed";

      await supabase.from("gateway_transactions").update({
        status: newStatus, gateway_response: payload,
      }).eq("id", txnId);

      if (newStatus === "success") {
        await finalizePayment(supabase, orgId, invoiceId, payload.amount || 0, "sslcommerz");
      }
      return jsonResp({ ok: true, status: newStatus });
    }

    // ===== Stripe webhook (HMAC-SHA256 signature verified) =====
    if (action === "stripe-webhook") {
      const sigHeader = req.headers.get("stripe-signature");
      const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
      if (!sigHeader || !webhookSecret) {
        return jsonResp({ error: "Stripe webhook signature/secret missing" }, 401);
      }
      // Parse "t=...,v1=..." header
      const parts = Object.fromEntries(
        sigHeader.split(",").map((kv) => {
          const i = kv.indexOf("=");
          return [kv.slice(0, i), kv.slice(i + 1)];
        })
      ) as Record<string, string>;
      const timestamp = parts.t;
      const v1 = parts.v1;
      if (!timestamp || !v1) return jsonResp({ error: "Malformed Stripe signature" }, 401);

      // Reject replays > 5 minutes old
      const tsNum = Number(timestamp);
      if (!Number.isFinite(tsNum) || Math.abs(Date.now() / 1000 - tsNum) > 300) {
        return jsonResp({ error: "Stripe signature timestamp out of tolerance" }, 401);
      }

      const signedPayload = `${timestamp}.${rawBody}`;
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(webhookSecret),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
      );
      const macBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
      const expected = Array.from(new Uint8Array(macBuf))
        .map((b) => b.toString(16).padStart(2, "0")).join("");
      if (expected !== v1) {
        console.warn("[payment-gateway] Stripe webhook signature mismatch");
        return jsonResp({ error: "Invalid Stripe signature" }, 401);
      }

      const event = payload;
      if (event.type === "checkout.session.completed") {
        const session = event.data.object;
        const txnId = session.client_reference_id || session.metadata?.txn_id;
        const orgId = session.metadata?.org_id;
        const invoiceId = session.metadata?.invoice_id || null;
        await supabase.from("gateway_transactions").update({
          status: "success", gateway_response: session,
        }).eq("id", txnId);
        await finalizePayment(supabase, orgId, invoiceId, session.amount_total ? session.amount_total / 100 : 0, "stripe");
      }
      return jsonResp({ ok: true });
    }

    return jsonResp({ error: "Unknown action" }, 400);
  } catch (err: any) {
    if (err instanceof AuthError) return jsonResp({ error: err.message }, err.status);
    return jsonResp({ error: err.message }, 500);
  }
});

async function finalizePayment(
  supabase: any,
  orgId: string,
  invoiceId: string | null,
  amount: number,
  gateway: string,
) {
  if (invoiceId) {
    await supabase.from("platform_invoices").update({
      status: "paid",
      payment_date: new Date().toISOString().slice(0, 10),
      payment_method: gateway,
    }).eq("id", invoiceId);
  }

  const { data: sub } = await supabase.from("organization_subscriptions")
    .select("*").eq("org_id", orgId).order("created_at", { ascending: false }).limit(1).single();

  if (sub) {
    const periodEnd = new Date(sub.current_period_end);
    const newEnd = new Date(periodEnd.getTime() + (sub.billing_cycle === "yearly" ? 365 : 30) * 86400000);
    await supabase.from("organization_subscriptions").update({
      payment_status: "paid",
      current_period_start: sub.current_period_end,
      current_period_end: newEnd.toISOString().slice(0, 10),
      updated_at: new Date().toISOString(),
    }).eq("id", sub.id);
  }

  await supabase.from("organizations").update({ status: "active", suspension_reason: null }).eq("id", orgId);

  const { data: orgData } = await supabase.from("organizations").select("owner_user_id, name").eq("id", orgId).single();
  if (orgData) {
    await supabase.from("notifications").insert({
      user_id: orgData.owner_user_id,
      title: "Payment Successful ✅",
      body: `Payment for ${orgData.name} was processed successfully via ${gateway}.`,
      type: "system", priority: "normal", link: "/admin/subscription",
    });
  }

  await supabase.from("dunning_runs")
    .update({ status: "recovered", recovery_amount_bdt: amount })
    .eq("org_id", orgId).eq("status", "active");
}
