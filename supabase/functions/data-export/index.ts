import {
  corsHeaders,
  errorResponse,
  jsonResponse,
  requireCaller,
  requireOrgAccess,
  requireRole,
} from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ctx = await requireCaller(req);
    requireRole(ctx, ["admin", "platform_owner"]);

    const { org_id, request_id } = await req.json();
    if (!org_id) return jsonResponse({ error: "Missing org_id" }, 400);
    await requireOrgAccess(ctx, org_id);

    const supabase = ctx.supabaseAdmin;

    if (request_id) {
      await supabase.from("data_export_requests").update({ status: "processing" }).eq("id", request_id);
    }

    const [profiles, adAccounts, campaigns, transactions, paymentRequests, invoices] = await Promise.all([
      supabase.from("profiles").select("*").eq("org_id", org_id),
      supabase.from("ad_accounts").select("*").eq("org_id", org_id),
      supabase.from("campaigns").select("*").eq("org_id", org_id),
      supabase.from("transactions").select("*").in(
        "client_id",
        (await supabase.from("profiles").select("user_id").eq("org_id", org_id)).data?.map((p: any) => p.user_id) || [],
      ),
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

    const { error: uploadError } = await supabase.storage.from("data-exports").upload(fileName, blob, {
      contentType: "application/json",
    });
    if (uploadError) throw uploadError;

    const { data: signedUrl } = await supabase.storage.from("data-exports")
      .createSignedUrl(fileName, 48 * 3600);

    const expiresAt = new Date(Date.now() + 48 * 3600000).toISOString();

    if (request_id) {
      await supabase.from("data_export_requests").update({
        status: "ready",
        export_url: signedUrl?.signedUrl || null,
        expires_at: expiresAt,
      }).eq("id", request_id);
    }

    const { data: exportReq } = request_id
      ? await supabase.from("data_export_requests").select("requested_by").eq("id", request_id).single()
      : { data: null };

    if (exportReq) {
      await supabase.from("notifications").insert({
        user_id: exportReq.requested_by,
        title: "Data Export Ready 📦",
        body: "Your data export is ready for download. It expires in 48 hours.",
        type: "system",
        priority: "normal",
        link: "/admin/subscription",
      });
    }

    return jsonResponse({ ok: true, download_url: signedUrl?.signedUrl, expires_at: expiresAt });
  } catch (err) {
    return errorResponse(err);
  }
});
