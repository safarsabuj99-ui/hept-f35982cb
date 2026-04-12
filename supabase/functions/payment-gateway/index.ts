import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const { action, ...payload } = await req.json();

    if (action === "initiate") {
      const { org_id, invoice_id, amount_bdt, success_url, fail_url, cancel_url } = payload;
      const storeId = Deno.env.get("SSLCOMMERZ_STORE_ID");
      const storePass = Deno.env.get("SSLCOMMERZ_STORE_PASSWORD");
      const isSandbox = Deno.env.get("SSLCOMMERZ_SANDBOX") === "true";

      if (!storeId || !storePass) {
        return new Response(JSON.stringify({ error: "Payment gateway not configured. Please add SSLCommerz credentials." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const tranId = `TXN-${org_id.slice(0, 6)}-${Date.now().toString(36).toUpperCase()}`;

      // Create gateway transaction record
      const { data: txn, error: txnErr } = await supabase.from("gateway_transactions").insert({
        org_id, invoice_id, gateway: "sslcommerz", gateway_txn_id: tranId, amount_bdt, status: "initiated",
      }).select("id").single();

      if (txnErr) throw txnErr;

      // Get org info for customer details
      const { data: org } = await supabase.from("organizations").select("name, owner_user_id").eq("id", org_id).single();
      const { data: profile } = await supabase.from("profiles").select("email, phone, full_name").eq("user_id", org?.owner_user_id).single();

      const baseUrl = isSandbox ? "https://sandbox.sslcommerz.com" : "https://securepay.sslcommerz.com";
      const formData = new URLSearchParams({
        store_id: storeId,
        store_passwd: storePass,
        total_amount: String(amount_bdt),
        currency: "BDT",
        tran_id: tranId,
        success_url: success_url || `${Deno.env.get("SUPABASE_URL")}/functions/v1/payment-gateway`,
        fail_url: fail_url || `${Deno.env.get("SUPABASE_URL")}/functions/v1/payment-gateway`,
        cancel_url: cancel_url || `${Deno.env.get("SUPABASE_URL")}/functions/v1/payment-gateway`,
        ipn_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/payment-gateway`,
        cus_name: profile?.full_name || org?.name || "Agency",
        cus_email: profile?.email || "no-reply@example.com",
        cus_phone: profile?.phone || "01700000000",
        cus_add1: "Dhaka",
        cus_city: "Dhaka",
        cus_country: "Bangladesh",
        shipping_method: "NO",
        product_name: "Subscription Payment",
        product_category: "SaaS",
        product_profile: "non-physical-goods",
        value_a: txn.id, // store our txn id
        value_b: org_id,
        value_c: invoice_id || "",
      });

      const resp = await fetch(`${baseUrl}/gwprocess/v4`, { method: "POST", body: formData });
      const result = await resp.json();

      if (result.status === "SUCCESS") {
        await supabase.from("gateway_transactions").update({ gateway_response: result }).eq("id", txn.id);
        return new Response(JSON.stringify({ ok: true, gateway_url: result.GatewayPageURL, txn_id: txn.id }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ error: "Gateway session failed", details: result }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "ipn" || action === "success" || action === "fail" || action === "cancel") {
      const { tran_id, val_id, status: payStatus, value_a, value_b, value_c } = payload;
      const txnId = value_a;
      const orgId = value_b;
      const invoiceId = value_c;

      const newStatus = payStatus === "VALID" || payStatus === "VALIDATED" ? "success" : action === "cancel" ? "cancelled" : "failed";

      await supabase.from("gateway_transactions").update({
        status: newStatus, gateway_response: payload,
      }).eq("id", txnId);

      if (newStatus === "success") {
        // Mark invoice as paid
        if (invoiceId) {
          await supabase.from("platform_invoices").update({
            status: "paid", payment_date: new Date().toISOString().slice(0, 10), payment_method: "sslcommerz",
          }).eq("id", invoiceId);
        }
        // Update subscription
        const { data: sub } = await supabase.from("organization_subscriptions")
          .select("*").eq("org_id", orgId).order("created_at", { ascending: false }).limit(1).single();

        if (sub) {
          const periodEnd = new Date(sub.current_period_end);
          const newEnd = new Date(periodEnd.getTime() + (sub.billing_cycle === "yearly" ? 365 : 30) * 86400000);
          await supabase.from("organization_subscriptions").update({
            payment_status: "paid", current_period_start: sub.current_period_end,
            current_period_end: newEnd.toISOString().slice(0, 10), updated_at: new Date().toISOString(),
          }).eq("id", sub.id);
        }
        // Ensure org is active
        await supabase.from("organizations").update({ status: "active", suspension_reason: null }).eq("id", orgId);

        // Notify
        const { data: orgData } = await supabase.from("organizations").select("owner_user_id, name").eq("id", orgId).single();
        if (orgData) {
          await supabase.from("notifications").insert({
            user_id: orgData.owner_user_id, title: "Payment Successful ✅",
            body: `Payment for ${orgData.name} was processed successfully via SSLCommerz.`,
            type: "system", priority: "normal", link: "/admin/subscription",
          });
        }

        // Cancel any active dunning
        await supabase.from("dunning_runs").update({ status: "recovered", recovery_amount_bdt: payload.amount || 0 })
          .eq("org_id", orgId).eq("status", "active");
      }

      return new Response(JSON.stringify({ ok: true, status: newStatus }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
