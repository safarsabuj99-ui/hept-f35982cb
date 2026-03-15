export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      ad_account_clients: {
        Row: {
          ad_account_id: string
          client_id: string
          created_at: string
          id: string
          mapping_keyword: string
          org_id: string | null
        }
        Insert: {
          ad_account_id: string
          client_id: string
          created_at?: string
          id?: string
          mapping_keyword?: string
          org_id?: string | null
        }
        Update: {
          ad_account_id?: string
          client_id?: string
          created_at?: string
          id?: string
          mapping_keyword?: string
          org_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_account_clients_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "ad_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_account_clients_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_accounts: {
        Row: {
          account_currency: Database["public"]["Enums"]["account_currency"]
          account_name: string
          account_spending_limit: number | null
          ad_account_id: string
          api_integration_id: string | null
          billing_type: Database["public"]["Enums"]["billing_type"]
          card_last_4: string | null
          client_id: string | null
          created_at: string
          current_threshold_spend: number | null
          exchange_rate: number | null
          id: string
          is_active: boolean
          next_billing_date: string | null
          org_id: string | null
          platform_name: Database["public"]["Enums"]["ad_platform"]
          threshold_limit: number | null
        }
        Insert: {
          account_currency?: Database["public"]["Enums"]["account_currency"]
          account_name?: string
          account_spending_limit?: number | null
          ad_account_id: string
          api_integration_id?: string | null
          billing_type?: Database["public"]["Enums"]["billing_type"]
          card_last_4?: string | null
          client_id?: string | null
          created_at?: string
          current_threshold_spend?: number | null
          exchange_rate?: number | null
          id?: string
          is_active?: boolean
          next_billing_date?: string | null
          org_id?: string | null
          platform_name: Database["public"]["Enums"]["ad_platform"]
          threshold_limit?: number | null
        }
        Update: {
          account_currency?: Database["public"]["Enums"]["account_currency"]
          account_name?: string
          account_spending_limit?: number | null
          ad_account_id?: string
          api_integration_id?: string | null
          billing_type?: Database["public"]["Enums"]["billing_type"]
          card_last_4?: string | null
          client_id?: string | null
          created_at?: string
          current_threshold_spend?: number | null
          exchange_rate?: number | null
          id?: string
          is_active?: boolean
          next_billing_date?: string | null
          org_id?: string | null
          platform_name?: Database["public"]["Enums"]["ad_platform"]
          threshold_limit?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_accounts_api_integration_id_fkey"
            columns: ["api_integration_id"]
            isOneToOne: false
            referencedRelation: "api_integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_accounts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_accounts: {
        Row: {
          account_number: string | null
          created_at: string
          current_balance_bdt: number
          id: string
          is_active: boolean
          name: string
          org_id: string | null
          type: Database["public"]["Enums"]["agency_account_type"]
        }
        Insert: {
          account_number?: string | null
          created_at?: string
          current_balance_bdt?: number
          id?: string
          is_active?: boolean
          name: string
          org_id?: string | null
          type: Database["public"]["Enums"]["agency_account_type"]
        }
        Update: {
          account_number?: string | null
          created_at?: string
          current_balance_bdt?: number
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string | null
          type?: Database["public"]["Enums"]["agency_account_type"]
        }
        Relationships: [
          {
            foreignKeyName: "agency_accounts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      agency_expenses: {
        Row: {
          amount_bdt: number
          category: Database["public"]["Enums"]["expense_category"]
          created_at: string
          created_by: string
          date: string
          description: string | null
          id: string
          org_id: string | null
          paid_from_account_id: string | null
        }
        Insert: {
          amount_bdt: number
          category: Database["public"]["Enums"]["expense_category"]
          created_at?: string
          created_by: string
          date?: string
          description?: string | null
          id?: string
          org_id?: string | null
          paid_from_account_id?: string | null
        }
        Update: {
          amount_bdt?: number
          category?: Database["public"]["Enums"]["expense_category"]
          created_at?: string
          created_by?: string
          date?: string
          description?: string | null
          id?: string
          org_id?: string | null
          paid_from_account_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agency_expenses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agency_expenses_paid_from_account_id_fkey"
            columns: ["paid_from_account_id"]
            isOneToOne: false
            referencedRelation: "agency_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      api_integrations: {
        Row: {
          api_token: string
          app_id: string
          connection_status: string
          created_at: string
          id: string
          instance_name: string | null
          is_active: boolean
          last_synced_at: string | null
          org_id: string | null
          platform: Database["public"]["Enums"]["ad_platform"]
          token_expiry_date: string | null
          updated_by: string | null
        }
        Insert: {
          api_token?: string
          app_id?: string
          connection_status?: string
          created_at?: string
          id?: string
          instance_name?: string | null
          is_active?: boolean
          last_synced_at?: string | null
          org_id?: string | null
          platform: Database["public"]["Enums"]["ad_platform"]
          token_expiry_date?: string | null
          updated_by?: string | null
        }
        Update: {
          api_token?: string
          app_id?: string
          connection_status?: string
          created_at?: string
          id?: string
          instance_name?: string | null
          is_active?: boolean
          last_synced_at?: string | null
          org_id?: string | null
          platform?: Database["public"]["Enums"]["ad_platform"]
          token_expiry_date?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_integrations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action_type: string
          created_at: string
          description: string
          id: string
          ip_address: string | null
          org_id: string | null
          user_id: string
        }
        Insert: {
          action_type: string
          created_at?: string
          description: string
          id?: string
          ip_address?: string | null
          org_id?: string | null
          user_id: string
        }
        Update: {
          action_type?: string
          created_at?: string
          description?: string
          id?: string
          ip_address?: string | null
          org_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_notifications: {
        Row: {
          ad_account_id: string
          alert_type: string
          client_id: string
          created_at: string
          id: string
          is_read: boolean
          message: string
          org_id: string | null
          priority: string
          usage_percent: number | null
        }
        Insert: {
          ad_account_id: string
          alert_type: string
          client_id: string
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          org_id?: string | null
          priority?: string
          usage_percent?: number | null
        }
        Update: {
          ad_account_id?: string
          alert_type?: string
          client_id?: string
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          org_id?: string | null
          priority?: string
          usage_percent?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_notifications_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "ad_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_notifications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_mappings: {
        Row: {
          ad_account_id: string | null
          campaign_id: string
          campaign_name: string
          client_id: string | null
          created_at: string
          id: string
          is_active: boolean
          org_id: string | null
          platform: Database["public"]["Enums"]["ad_platform"]
        }
        Insert: {
          ad_account_id?: string | null
          campaign_id: string
          campaign_name: string
          client_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          org_id?: string | null
          platform: Database["public"]["Enums"]["ad_platform"]
        }
        Update: {
          ad_account_id?: string | null
          campaign_id?: string
          campaign_name?: string
          client_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          org_id?: string | null
          platform?: Database["public"]["Enums"]["ad_platform"]
        }
        Relationships: [
          {
            foreignKeyName: "campaign_mappings_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "ad_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_mappings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_performance: {
        Row: {
          ad_account_id: string
          campaign_id: string
          campaign_name: string
          clicks: number
          client_id: string | null
          conversion_value: number
          cpc: number
          ctr: number
          date: string
          id: string
          impressions: number
          org_id: string | null
          results: number
          roas: number
          spend: number
          status: string
          synced_at: string
        }
        Insert: {
          ad_account_id: string
          campaign_id: string
          campaign_name?: string
          clicks?: number
          client_id?: string | null
          conversion_value?: number
          cpc?: number
          ctr?: number
          date?: string
          id?: string
          impressions?: number
          org_id?: string | null
          results?: number
          roas?: number
          spend?: number
          status?: string
          synced_at?: string
        }
        Update: {
          ad_account_id?: string
          campaign_id?: string
          campaign_name?: string
          clicks?: number
          client_id?: string | null
          conversion_value?: number
          cpc?: number
          ctr?: number
          date?: string
          id?: string
          impressions?: number
          org_id?: string | null
          results?: number
          roas?: number
          spend?: number
          status?: string
          synced_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_performance_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "ad_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_performance_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_requests: {
        Row: {
          ad_caption: string | null
          budget_usd: number
          client_id: string
          created_at: string
          creative_link: string
          duration_days: number
          id: string
          landing_page_url: string | null
          objective: Database["public"]["Enums"]["campaign_objective"]
          org_id: string | null
          platform: Database["public"]["Enums"]["ad_platform"]
          rejection_reason: string | null
          start_date: string
          status: Database["public"]["Enums"]["campaign_request_status"]
          target_audience_note: string | null
          updated_at: string
        }
        Insert: {
          ad_caption?: string | null
          budget_usd: number
          client_id: string
          created_at?: string
          creative_link: string
          duration_days?: number
          id?: string
          landing_page_url?: string | null
          objective: Database["public"]["Enums"]["campaign_objective"]
          org_id?: string | null
          platform: Database["public"]["Enums"]["ad_platform"]
          rejection_reason?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["campaign_request_status"]
          target_audience_note?: string | null
          updated_at?: string
        }
        Update: {
          ad_caption?: string | null
          budget_usd?: number
          client_id?: string
          created_at?: string
          creative_link?: string
          duration_days?: number
          id?: string
          landing_page_url?: string | null
          objective?: Database["public"]["Enums"]["campaign_objective"]
          org_id?: string | null
          platform?: Database["public"]["Enums"]["ad_platform"]
          rejection_reason?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["campaign_request_status"]
          target_audience_note?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          ad_account_id: string
          client_id: string | null
          created_at: string
          id: string
          name: string
          objective: string
          org_id: string | null
          original_name_tag: string
          platform: Database["public"]["Enums"]["ad_platform"]
          platform_id: string
          status: string
          updated_at: string
        }
        Insert: {
          ad_account_id: string
          client_id?: string | null
          created_at?: string
          id?: string
          name?: string
          objective?: string
          org_id?: string | null
          original_name_tag?: string
          platform: Database["public"]["Enums"]["ad_platform"]
          platform_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          ad_account_id?: string
          client_id?: string | null
          created_at?: string
          id?: string
          name?: string
          objective?: string
          org_id?: string | null
          original_name_tag?: string
          platform?: Database["public"]["Enums"]["ad_platform"]
          platform_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "ad_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_ad_spend: {
        Row: {
          ad_account_id: string
          campaign_name: string
          date: string
          exchange_rate_used: number
          final_billable_usd: number
          id: string
          org_id: string | null
          raw_currency: Database["public"]["Enums"]["account_currency"]
          raw_spend_amount: number
          synced_at: string
        }
        Insert: {
          ad_account_id: string
          campaign_name?: string
          date?: string
          exchange_rate_used?: number
          final_billable_usd?: number
          id?: string
          org_id?: string | null
          raw_currency?: Database["public"]["Enums"]["account_currency"]
          raw_spend_amount?: number
          synced_at?: string
        }
        Update: {
          ad_account_id?: string
          campaign_name?: string
          date?: string
          exchange_rate_used?: number
          final_billable_usd?: number
          id?: string
          org_id?: string | null
          raw_currency?: Database["public"]["Enums"]["account_currency"]
          raw_spend_amount?: number
          synced_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_ad_spend_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "ad_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_ad_spend_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_metrics: {
        Row: {
          add_to_cart: number
          campaign_id: string
          clicks: number
          conversion_value: number
          cost_per_message: number
          cost_per_purchase: number
          cpc: number
          cpm: number
          create_order: number
          ctr: number
          data_date: string
          id: string
          impressions: number
          initiate_checkout: number
          messaging_conversations: number
          new_messaging_contacts: number
          org_id: string | null
          purchase: number
          reach: number
          results: number
          roas: number
          spend: number
          synced_at: string
          view_content: number
        }
        Insert: {
          add_to_cart?: number
          campaign_id: string
          clicks?: number
          conversion_value?: number
          cost_per_message?: number
          cost_per_purchase?: number
          cpc?: number
          cpm?: number
          create_order?: number
          ctr?: number
          data_date: string
          id?: string
          impressions?: number
          initiate_checkout?: number
          messaging_conversations?: number
          new_messaging_contacts?: number
          org_id?: string | null
          purchase?: number
          reach?: number
          results?: number
          roas?: number
          spend?: number
          synced_at?: string
          view_content?: number
        }
        Update: {
          add_to_cart?: number
          campaign_id?: string
          clicks?: number
          conversion_value?: number
          cost_per_message?: number
          cost_per_purchase?: number
          cpc?: number
          cpm?: number
          create_order?: number
          ctr?: number
          data_date?: string
          id?: string
          impressions?: number
          initiate_checkout?: number
          messaging_conversations?: number
          new_messaging_contacts?: number
          org_id?: string | null
          purchase?: number
          reach?: number
          results?: number
          roas?: number
          spend?: number
          synced_at?: string
          view_content?: number
        }
        Relationships: [
          {
            foreignKeyName: "daily_metrics_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_metrics_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      fund_transfers: {
        Row: {
          amount_bdt: number
          created_at: string
          created_by: string
          from_account_id: string
          id: string
          note: string | null
          org_id: string | null
          to_account_id: string
        }
        Insert: {
          amount_bdt: number
          created_at?: string
          created_by: string
          from_account_id: string
          id?: string
          note?: string | null
          org_id?: string | null
          to_account_id: string
        }
        Update: {
          amount_bdt?: number
          created_at?: string
          created_by?: string
          from_account_id?: string
          id?: string
          note?: string | null
          org_id?: string | null
          to_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fund_transfers_from_account_id_fkey"
            columns: ["from_account_id"]
            isOneToOne: false
            referencedRelation: "agency_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fund_transfers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fund_transfers_to_account_id_fkey"
            columns: ["to_account_id"]
            isOneToOne: false
            referencedRelation: "agency_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      manager_permissions: {
        Row: {
          can_add_funds: boolean
          can_edit_clients: boolean
          can_log_spend: boolean
          can_view_dashboard: boolean
          can_view_transactions: boolean
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          can_add_funds?: boolean
          can_edit_clients?: boolean
          can_log_spend?: boolean
          can_view_dashboard?: boolean
          can_view_transactions?: boolean
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          can_add_funds?: boolean
          can_edit_clients?: boolean
          can_log_spend?: boolean
          can_view_dashboard?: boolean
          can_view_transactions?: boolean
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      organization_subscriptions: {
        Row: {
          amount_bdt: number
          billing_cycle: Database["public"]["Enums"]["billing_cycle"]
          created_at: string
          current_period_end: string
          current_period_start: string
          id: string
          org_id: string
          payment_method: string | null
          payment_status: Database["public"]["Enums"]["subscription_payment_status"]
          plan: Database["public"]["Enums"]["org_plan"]
          transaction_reference: string | null
          updated_at: string
        }
        Insert: {
          amount_bdt?: number
          billing_cycle?: Database["public"]["Enums"]["billing_cycle"]
          created_at?: string
          current_period_end: string
          current_period_start?: string
          id?: string
          org_id: string
          payment_method?: string | null
          payment_status?: Database["public"]["Enums"]["subscription_payment_status"]
          plan: Database["public"]["Enums"]["org_plan"]
          transaction_reference?: string | null
          updated_at?: string
        }
        Update: {
          amount_bdt?: number
          billing_cycle?: Database["public"]["Enums"]["billing_cycle"]
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          id?: string
          org_id?: string
          payment_method?: string | null
          payment_status?: Database["public"]["Enums"]["subscription_payment_status"]
          plan?: Database["public"]["Enums"]["org_plan"]
          transaction_reference?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_subscriptions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          logo_url: string | null
          max_ad_accounts: number
          max_clients: number
          max_managers: number
          name: string
          owner_user_id: string
          plan: Database["public"]["Enums"]["org_plan"]
          slug: string
          status: Database["public"]["Enums"]["org_status"]
          trial_ends_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          logo_url?: string | null
          max_ad_accounts?: number
          max_clients?: number
          max_managers?: number
          name: string
          owner_user_id: string
          plan?: Database["public"]["Enums"]["org_plan"]
          slug: string
          status?: Database["public"]["Enums"]["org_status"]
          trial_ends_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          logo_url?: string | null
          max_ad_accounts?: number
          max_clients?: number
          max_managers?: number
          name?: string
          owner_user_id?: string
          plan?: Database["public"]["Enums"]["org_plan"]
          slug?: string
          status?: Database["public"]["Enums"]["org_status"]
          trial_ends_at?: string | null
        }
        Relationships: []
      }
      payment_requests: {
        Row: {
          admin_note: string | null
          amount_bdt: number
          client_id: string
          created_at: string
          exchange_rate_snapshot: number | null
          final_amount_usd: number | null
          id: string
          org_id: string | null
          payment_date: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          platform: string | null
          received_in_account_id: string | null
          status: Database["public"]["Enums"]["payment_request_status"]
          transaction_id: string | null
          updated_at: string
        }
        Insert: {
          admin_note?: string | null
          amount_bdt: number
          client_id: string
          created_at?: string
          exchange_rate_snapshot?: number | null
          final_amount_usd?: number | null
          id?: string
          org_id?: string | null
          payment_date?: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          platform?: string | null
          received_in_account_id?: string | null
          status?: Database["public"]["Enums"]["payment_request_status"]
          transaction_id?: string | null
          updated_at?: string
        }
        Update: {
          admin_note?: string | null
          amount_bdt?: number
          client_id?: string
          created_at?: string
          exchange_rate_snapshot?: number | null
          final_amount_usd?: number | null
          id?: string
          org_id?: string | null
          payment_date?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          platform?: string | null
          received_in_account_id?: string | null
          status?: Database["public"]["Enums"]["payment_request_status"]
          transaction_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_requests_received_in_account_id_fkey"
            columns: ["received_in_account_id"]
            isOneToOne: false
            referencedRelation: "agency_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          ad_account_filter_tag: string | null
          auto_pause_balance_usd: number
          auto_pause_threshold_pct: number
          business_name: string | null
          client_permissions: Json
          created_at: string
          custom_exchange_rate: number | null
          data_fetch_start_date: string | null
          email: string
          full_name: string
          guard_paused_at: string | null
          guard_resume_window_hours: number
          id: string
          is_active: boolean
          is_super_admin: boolean
          manager_id: string | null
          mapping_keyword: string | null
          org_id: string | null
          overdraft_limit_usd: number
          permissions: Json
          phone: string | null
          preferred_timezone: string
          pricing_config: Json | null
          system_paused_campaigns: Json
          user_id: string
        }
        Insert: {
          ad_account_filter_tag?: string | null
          auto_pause_balance_usd?: number
          auto_pause_threshold_pct?: number
          business_name?: string | null
          client_permissions?: Json
          created_at?: string
          custom_exchange_rate?: number | null
          data_fetch_start_date?: string | null
          email: string
          full_name: string
          guard_paused_at?: string | null
          guard_resume_window_hours?: number
          id?: string
          is_active?: boolean
          is_super_admin?: boolean
          manager_id?: string | null
          mapping_keyword?: string | null
          org_id?: string | null
          overdraft_limit_usd?: number
          permissions?: Json
          phone?: string | null
          preferred_timezone?: string
          pricing_config?: Json | null
          system_paused_campaigns?: Json
          user_id: string
        }
        Update: {
          ad_account_filter_tag?: string | null
          auto_pause_balance_usd?: number
          auto_pause_threshold_pct?: number
          business_name?: string | null
          client_permissions?: Json
          created_at?: string
          custom_exchange_rate?: number | null
          data_fetch_start_date?: string | null
          email?: string
          full_name?: string
          guard_paused_at?: string | null
          guard_resume_window_hours?: number
          id?: string
          is_active?: boolean
          is_super_admin?: boolean
          manager_id?: string | null
          mapping_keyword?: string | null
          org_id?: string | null
          overdraft_limit_usd?: number
          permissions?: Json
          phone?: string | null
          preferred_timezone?: string
          pricing_config?: Json | null
          system_paused_campaigns?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          id: string
          key: string
          org_id: string | null
          updated_at: string
          updated_by: string | null
          value: string
        }
        Insert: {
          id?: string
          key: string
          org_id?: string | null
          updated_at?: string
          updated_by?: string | null
          value: string
        }
        Update: {
          id?: string
          key?: string
          org_id?: string | null
          updated_at?: string
          updated_by?: string | null
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          client_id: string
          created_at: string
          created_by: string
          date: string
          description: string | null
          exchange_rate: number | null
          id: string
          org_id: string | null
          platform: Database["public"]["Enums"]["ad_platform"] | null
          status: Database["public"]["Enums"]["transaction_status"]
          type: Database["public"]["Enums"]["transaction_type"]
        }
        Insert: {
          amount: number
          client_id: string
          created_at?: string
          created_by: string
          date?: string
          description?: string | null
          exchange_rate?: number | null
          id?: string
          org_id?: string | null
          platform?: Database["public"]["Enums"]["ad_platform"] | null
          status?: Database["public"]["Enums"]["transaction_status"]
          type: Database["public"]["Enums"]["transaction_type"]
        }
        Update: {
          amount?: number
          client_id?: string
          created_at?: string
          created_by?: string
          date?: string
          description?: string | null
          exchange_rate?: number | null
          id?: string
          org_id?: string | null
          platform?: Database["public"]["Enums"]["ad_platform"] | null
          status?: Database["public"]["Enums"]["transaction_status"]
          type?: Database["public"]["Enums"]["transaction_type"]
        }
        Relationships: [
          {
            foreignKeyName: "transactions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      usd_inventory_snapshots: {
        Row: {
          balance_usd: number
          created_at: string
          created_by: string
          id: string
          notes: string | null
          org_id: string | null
          snapshot_date: string
        }
        Insert: {
          balance_usd?: number
          created_at?: string
          created_by: string
          id?: string
          notes?: string | null
          org_id?: string | null
          snapshot_date: string
        }
        Update: {
          balance_usd?: number
          created_at?: string
          created_by?: string
          id?: string
          notes?: string | null
          org_id?: string | null
          snapshot_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "usd_inventory_snapshots_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      usd_purchases: {
        Row: {
          bdt_amount_paid: number
          calculated_rate: number | null
          created_at: string
          created_by: string
          date: string
          id: string
          notes: string | null
          org_id: string | null
          paid_from_account_id: string | null
          usd_received: number
        }
        Insert: {
          bdt_amount_paid: number
          calculated_rate?: number | null
          created_at?: string
          created_by: string
          date?: string
          id?: string
          notes?: string | null
          org_id?: string | null
          paid_from_account_id?: string | null
          usd_received: number
        }
        Update: {
          bdt_amount_paid?: number
          calculated_rate?: number | null
          created_at?: string
          created_by?: string
          date?: string
          id?: string
          notes?: string | null
          org_id?: string | null
          paid_from_account_id?: string | null
          usd_received?: number
        }
        Relationships: [
          {
            foreignKeyName: "usd_purchases_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usd_purchases_paid_from_account_id_fkey"
            columns: ["paid_from_account_id"]
            isOneToOne: false
            referencedRelation: "agency_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_managed_client_ids: {
        Args: { _manager_id: string }
        Returns: string[]
      }
      get_user_org_id: { Args: { _user_id: string }; Returns: string }
      has_permission: {
        Args: { _permission_key: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      normalize_spend: {
        Args: { rate: number; raw_amount: number; raw_currency: string }
        Returns: number
      }
    }
    Enums: {
      account_currency: "USD" | "BDT"
      ad_platform: "meta" | "tiktok" | "google"
      agency_account_type: "Cash" | "Bank" | "MFS"
      app_role: "admin" | "client" | "manager" | "platform_owner"
      billing_cycle: "monthly" | "yearly"
      billing_type: "prepaid" | "threshold_postpaid" | "credit_card"
      campaign_objective:
        | "Message"
        | "Traffic/Website"
        | "Video Views"
        | "Sales"
      campaign_request_status:
        | "pending"
        | "processing"
        | "completed"
        | "rejected"
      expense_category:
        | "Rent"
        | "Salary"
        | "Software"
        | "Owner_Draw"
        | "Marketing"
        | "Other"
      org_plan: "starter" | "growth" | "agency_pro"
      org_status: "active" | "suspended" | "trial" | "cancelled"
      payment_method: "Bank" | "bKash" | "Cash" | "Nagad"
      payment_request_status: "pending" | "approved" | "rejected"
      subscription_payment_status: "paid" | "pending" | "overdue" | "cancelled"
      transaction_status: "pending_approval" | "completed" | "rejected"
      transaction_type: "credit" | "debit"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      account_currency: ["USD", "BDT"],
      ad_platform: ["meta", "tiktok", "google"],
      agency_account_type: ["Cash", "Bank", "MFS"],
      app_role: ["admin", "client", "manager", "platform_owner"],
      billing_cycle: ["monthly", "yearly"],
      billing_type: ["prepaid", "threshold_postpaid", "credit_card"],
      campaign_objective: [
        "Message",
        "Traffic/Website",
        "Video Views",
        "Sales",
      ],
      campaign_request_status: [
        "pending",
        "processing",
        "completed",
        "rejected",
      ],
      expense_category: [
        "Rent",
        "Salary",
        "Software",
        "Owner_Draw",
        "Marketing",
        "Other",
      ],
      org_plan: ["starter", "growth", "agency_pro"],
      org_status: ["active", "suspended", "trial", "cancelled"],
      payment_method: ["Bank", "bKash", "Cash", "Nagad"],
      payment_request_status: ["pending", "approved", "rejected"],
      subscription_payment_status: ["paid", "pending", "overdue", "cancelled"],
      transaction_status: ["pending_approval", "completed", "rejected"],
      transaction_type: ["credit", "debit"],
    },
  },
} as const
