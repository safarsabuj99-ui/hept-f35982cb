import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const { org_id, request_id } = await req.json();
    if (!org_id) throw new Error("Missing org_id");

    // Update request status
    if (request_id) {
      await supabase.from("data_export_requests").update({ status: "processing" }).eq("id", request_id);
    }

    // Collect all org data
    const [profiles, adAccounts, campaigns, transactions, paymentRequests, invoices] = await Promise.all([
      supabase.from("profiles").select("*").eq("org_id", org_id),
      supabase.from("ad_accounts").select("*").eq("org_id", org_id),
      supabase.from("campaigns").select("*").eq("org_id", org_id),
      supabase.from("transactions").select("*").in("client_id",
        (await supabase.from("profiles").select("user_id").eq("org_id", org_id)).data?.map((p: any) => p.user_id) || []),
      supabase.from("payment_requests").select("*").eq("org_id", org_id),
      supabase.from("platform_invoices").select("*").eq("org_id", org_id),
    ]);

    const exportData = {
      exported_at: new Date().toISOString(),
      org_id,
      profiles: profiles.data || [],
      ad_accounts: adAccounts.data || [],
      campaigns: campaigns.data || [],
      transactions: transactions.data || [],
      payment_requests: paymentRequests.data || [],
      invoices: invoices.data || [],
    };

    const fileName = `export-${org_id.slice(0, 8)}-${Date.now()}.json`;
    const fileContent = JSON.stringify(exportData, null, 2);
    const blob = new Blob([fileContent], { type: "application/json" });

    // Upload to storage
    const { error: uploadError } = await supabase.storage.from("data-exports").upload(fileName, blob, {
      contentType: "application/json",
    });

    if (uploadError) throw uploadError;

    // Create signed URL (48 hours)
    const { data: signedUrl } = await supabase.storage.from("data-exports")
      .createSignedUrl(fileName, 48 * 3600);

    const expiresAt = new Date(Date.now() + 48 * 3600000).toISOString();

    // Update request
    if (request_id) {
      await supabase.from("data_export_requests").update({
        status: "ready", export_url: signedUrl?.signedUrl || null, expires_at: expiresAt,
      }).eq("id", request_id);
    }

    // Notify requester
    const { data: exportReq } = request_id
      ? await supabase.from("data_export_requests").select("requested_by").eq("id", request_id).single()
      : { data: null };

    if (exportReq) {
      await supabase.from("notifications").insert({
        user_id: exportReq.requested_by, title: "Data Export Ready 📦",
        body: "Your data export is ready for download. It expires in 48 hours.",
        type: "system", priority: "normal", link: "/admin/subscription",
      });
    }

    return new Response(JSON.stringify({
      ok: true, download_url: signedUrl?.signedUrl, expires_at: expiresAt,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
