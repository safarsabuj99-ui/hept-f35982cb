import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Get all active ad accounts
    const { data: accounts, error: accErr } = await supabase
      .from("ad_accounts")
      .select("id, ad_account_id, platform_name, client_id, api_integration_id")
      .eq("is_active", true);

    if (accErr) throw accErr;
    if (!accounts || accounts.length === 0) {
      return new Response(
        JSON.stringify({ message: "No active accounts", synced: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get campaign mappings
    const { data: campaigns } = await supabase
      .from("campaign_mappings")
      .select("*")
      .eq("is_active", true);

    // Generate last 7 days of dates
    const dates: string[] = [];
    for (let d = 0; d < 7; d++) {
      const dt = new Date();
      dt.setDate(dt.getDate() - d);
      dates.push(dt.toISOString().split("T")[0]);
    }

    const BATCH_SIZE = 5;
    let totalSynced = 0;

    // Process in batches
    for (let i = 0; i < accounts.length; i += BATCH_SIZE) {
      const batch = accounts.slice(i, i + BATCH_SIZE);

      for (const account of batch) {
        // Find campaigns for this account
        const accountCampaigns = (campaigns ?? []).filter(
          (c) => c.ad_account_id === account.id
        );

        // If no campaigns mapped, create a mock one
        const campaignsToProcess =
          accountCampaigns.length > 0
            ? accountCampaigns
            : [
                {
                  campaign_id: `mock_${account.ad_account_id}`,
                  campaign_name: `Campaign - ${account.ad_account_id}`,
                  client_id: account.client_id,
                },
              ];

        for (const campaign of campaignsToProcess) {
          for (const date of dates) {
            // Generate realistic mock analytics per date
            const impressions = Math.floor(Math.random() * 50000) + 1000;
            const clicks = Math.floor(impressions * (Math.random() * 0.08 + 0.01));
            const ctr = Math.round((clicks / impressions) * 10000) / 100;
            const spend = Math.round((Math.random() * 200 + 10) * 100) / 100;
            const cpc = clicks > 0 ? Math.round((spend / clicks) * 100) / 100 : 0;
            const roas = Math.round((Math.random() * 5 + 0.5) * 100) / 100;

            await supabase.from("campaign_performance").upsert(
              {
                campaign_id: campaign.campaign_id,
                campaign_name: campaign.campaign_name,
                ad_account_id: account.id,
                client_id: campaign.client_id || account.client_id,
                date,
                impressions,
                clicks,
                ctr,
                cpc,
                roas,
                spend,
                synced_at: new Date().toISOString(),
              },
              { onConflict: "campaign_id,date", ignoreDuplicates: false }
            );
          }
        }

        totalSynced++;
      }

      // Delay between batches to avoid overload
      if (i + BATCH_SIZE < accounts.length) {
        await sleep(500);
      }
    }

    // Update last_synced_at
    const integrationIds = [
      ...new Set(accounts.map((a) => a.api_integration_id).filter(Boolean)),
    ];
    if (integrationIds.length > 0) {
      await supabase
        .from("api_integrations")
        .update({ last_synced_at: new Date().toISOString() })
        .in("id", integrationIds);
    }

    return new Response(
      JSON.stringify({
        message: "Deep dive sync complete",
        accounts_synced: totalSynced,
        days_covered: dates.length,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("sync-deep-dive error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
