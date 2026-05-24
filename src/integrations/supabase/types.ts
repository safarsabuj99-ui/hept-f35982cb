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
      acquisition_costs: {
        Row: {
          amount_bdt: number
          cost_type: Database["public"]["Enums"]["acquisition_cost_type"]
          created_at: string
          date: string
          description: string | null
          id: string
          org_id: string | null
        }
        Insert: {
          amount_bdt?: number
          cost_type: Database["public"]["Enums"]["acquisition_cost_type"]
          created_at?: string
          date?: string
          description?: string | null
          id?: string
          org_id?: string | null
        }
        Update: {
          amount_bdt?: number
          cost_type?: Database["public"]["Enums"]["acquisition_cost_type"]
          created_at?: string
          date?: string
          description?: string | null
          id?: string
          org_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "acquisition_costs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
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
      affiliate_conversions: {
        Row: {
          affiliate_id: string
          commission_bdt: number | null
          created_at: string
          first_payment_at: string | null
          id: string
          link_id: string | null
          paid_at: string | null
          payment_amount_bdt: number | null
          qualified_at: string | null
          referred_org_id: string | null
          referred_org_name: string | null
          signup_at: string
          status: string
        }
        Insert: {
          affiliate_id: string
          commission_bdt?: number | null
          created_at?: string
          first_payment_at?: string | null
          id?: string
          link_id?: string | null
          paid_at?: string | null
          payment_amount_bdt?: number | null
          qualified_at?: string | null
          referred_org_id?: string | null
          referred_org_name?: string | null
          signup_at?: string
          status?: string
        }
        Update: {
          affiliate_id?: string
          commission_bdt?: number | null
          created_at?: string
          first_payment_at?: string | null
          id?: string
          link_id?: string | null
          paid_at?: string | null
          payment_amount_bdt?: number | null
          qualified_at?: string | null
          referred_org_id?: string | null
          referred_org_name?: string | null
          signup_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_conversions_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_conversions_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "affiliate_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "affiliate_conversions_referred_org_id_fkey"
            columns: ["referred_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_links: {
        Row: {
          affiliate_id: string
          clicks: number
          code: string
          created_at: string
          id: string
          is_active: boolean
          label: string
        }
        Insert: {
          affiliate_id: string
          clicks?: number
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
        }
        Update: {
          affiliate_id?: string
          clicks?: number
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_links_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliate_payouts: {
        Row: {
          admin_note: string | null
          affiliate_id: string
          amount_bdt: number
          id: string
          payment_details: Json | null
          payment_method: string | null
          processed_at: string | null
          requested_at: string
          status: string
        }
        Insert: {
          admin_note?: string | null
          affiliate_id: string
          amount_bdt: number
          id?: string
          payment_details?: Json | null
          payment_method?: string | null
          processed_at?: string | null
          requested_at?: string
          status?: string
        }
        Update: {
          admin_note?: string | null
          affiliate_id?: string
          amount_bdt?: number
          id?: string
          payment_details?: Json | null
          payment_method?: string | null
          processed_at?: string | null
          requested_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_payouts_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliates: {
        Row: {
          commission_rate: number
          commission_type: string
          created_at: string
          email: string
          full_name: string
          id: string
          payment_details: Json | null
          payment_method: string | null
          phone: string | null
          status: string
          total_earnings_bdt: number
          total_paid_bdt: number
          user_id: string
        }
        Insert: {
          commission_rate?: number
          commission_type?: string
          created_at?: string
          email: string
          full_name: string
          id?: string
          payment_details?: Json | null
          payment_method?: string | null
          phone?: string | null
          status?: string
          total_earnings_bdt?: number
          total_paid_bdt?: number
          user_id: string
        }
        Update: {
          commission_rate?: number
          commission_type?: string
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          payment_details?: Json | null
          payment_method?: string | null
          phone?: string | null
          status?: string
          total_earnings_bdt?: number
          total_paid_bdt?: number
          user_id?: string
        }
        Relationships: []
      }
      agency_accounts: {
        Row: {
          account_number: string | null
          created_at: string
          current_balance_bdt: number
          default_out_fee_flat_bdt: number
          default_out_fee_percent: number
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
          default_out_fee_flat_bdt?: number
          default_out_fee_percent?: number
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
          default_out_fee_flat_bdt?: number
          default_out_fee_percent?: number
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
      ai_agent_memory: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          key: string
          org_id: string
          scope: string
          scope_id: string | null
          source: string
          updated_at: string
          value: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          key: string
          org_id: string
          scope: string
          scope_id?: string | null
          source?: string
          updated_at?: string
          value: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          key?: string
          org_id?: string
          scope?: string
          scope_id?: string | null
          source?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      ai_campaign_draft_versions: {
        Row: {
          change_note: string | null
          created_at: string
          draft_id: string
          draft_json: Json
          edited_by: string | null
          id: string
          org_id: string
          version: number
        }
        Insert: {
          change_note?: string | null
          created_at?: string
          draft_id: string
          draft_json: Json
          edited_by?: string | null
          id?: string
          org_id: string
          version: number
        }
        Update: {
          change_note?: string | null
          created_at?: string
          draft_id?: string
          draft_json?: Json
          edited_by?: string | null
          id?: string
          org_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_campaign_draft_versions_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "ai_campaign_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_campaign_draft_versions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_campaign_drafts: {
        Row: {
          ad_account_id: string
          client_id: string
          created_at: string
          draft_json: Json | null
          error: string | null
          id: string
          objective: string | null
          org_id: string
          pending_action_id: string | null
          platform: Database["public"]["Enums"]["ad_platform"]
          platform_ids: Json
          product_brief: string
          product_images: Json
          product_name: string | null
          product_url: string | null
          research_json: Json | null
          status: string
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          ad_account_id: string
          client_id: string
          created_at?: string
          draft_json?: Json | null
          error?: string | null
          id?: string
          objective?: string | null
          org_id: string
          pending_action_id?: string | null
          platform: Database["public"]["Enums"]["ad_platform"]
          platform_ids?: Json
          product_brief?: string
          product_images?: Json
          product_name?: string | null
          product_url?: string | null
          research_json?: Json | null
          status?: string
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          ad_account_id?: string
          client_id?: string
          created_at?: string
          draft_json?: Json | null
          error?: string | null
          id?: string
          objective?: string | null
          org_id?: string
          pending_action_id?: string | null
          platform?: Database["public"]["Enums"]["ad_platform"]
          platform_ids?: Json
          product_brief?: string
          product_images?: Json
          product_name?: string | null
          product_url?: string | null
          research_json?: Json | null
          status?: string
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_campaign_drafts_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "ad_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_campaign_drafts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_campaign_publish_logs: {
        Row: {
          created_at: string
          draft_id: string
          error: string | null
          id: string
          node_label: string | null
          node_type: string
          org_id: string
          platform_id: string | null
          request: Json | null
          response: Json | null
          status: string
        }
        Insert: {
          created_at?: string
          draft_id: string
          error?: string | null
          id?: string
          node_label?: string | null
          node_type: string
          org_id: string
          platform_id?: string | null
          request?: Json | null
          response?: Json | null
          status?: string
        }
        Update: {
          created_at?: string
          draft_id?: string
          error?: string | null
          id?: string
          node_label?: string | null
          node_type?: string
          org_id?: string
          platform_id?: string | null
          request?: Json | null
          response?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_campaign_publish_logs_draft_id_fkey"
            columns: ["draft_id"]
            isOneToOne: false
            referencedRelation: "ai_campaign_drafts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_campaign_publish_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_messages: {
        Row: {
          cost_usd: number | null
          created_at: string
          id: string
          model: string | null
          org_id: string
          parts: Json
          provider: string | null
          role: string
          thread_id: string
          tokens_in: number | null
          tokens_out: number | null
        }
        Insert: {
          cost_usd?: number | null
          created_at?: string
          id?: string
          model?: string | null
          org_id: string
          parts?: Json
          provider?: string | null
          role: string
          thread_id: string
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Update: {
          cost_usd?: number | null
          created_at?: string
          id?: string
          model?: string | null
          org_id?: string
          parts?: Json
          provider?: string | null
          role?: string
          thread_id?: string
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "ai_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_pending_actions: {
        Row: {
          args: Json
          created_at: string
          decided_at: string | null
          error: string | null
          executed_at: string | null
          id: string
          message_id: string | null
          org_id: string
          result: Json | null
          status: string
          summary: string
          thread_id: string | null
          tool_name: string
          user_id: string
        }
        Insert: {
          args?: Json
          created_at?: string
          decided_at?: string | null
          error?: string | null
          executed_at?: string | null
          id?: string
          message_id?: string | null
          org_id: string
          result?: Json | null
          status?: string
          summary: string
          thread_id?: string | null
          tool_name: string
          user_id: string
        }
        Update: {
          args?: Json
          created_at?: string
          decided_at?: string | null
          error?: string | null
          executed_at?: string | null
          id?: string
          message_id?: string | null
          org_id?: string
          result?: Json | null
          status?: string
          summary?: string
          thread_id?: string | null
          tool_name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_pending_actions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "ai_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_pending_actions_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "ai_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_provider_configs: {
        Row: {
          api_key: string | null
          created_at: string
          default_model: string | null
          id: string
          is_active: boolean
          monthly_budget_usd: number
          oauth_token: string | null
          org_id: string
          provider: string
          updated_at: string
          usage_month: string
          usage_this_month_usd: number
        }
        Insert: {
          api_key?: string | null
          created_at?: string
          default_model?: string | null
          id?: string
          is_active?: boolean
          monthly_budget_usd?: number
          oauth_token?: string | null
          org_id: string
          provider: string
          updated_at?: string
          usage_month?: string
          usage_this_month_usd?: number
        }
        Update: {
          api_key?: string | null
          created_at?: string
          default_model?: string | null
          id?: string
          is_active?: boolean
          monthly_budget_usd?: number
          oauth_token?: string | null
          org_id?: string
          provider?: string
          updated_at?: string
          usage_month?: string
          usage_this_month_usd?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_provider_configs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_reports: {
        Row: {
          client_id: string | null
          created_at: string
          created_by: string
          date_from: string
          date_to: string
          id: string
          model: string
          org_id: string
          payload: Json
          provider: string
          summary: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          created_by: string
          date_from: string
          date_to: string
          id?: string
          model: string
          org_id: string
          payload?: Json
          provider: string
          summary?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string
          created_by?: string
          date_from?: string
          date_to?: string
          id?: string
          model?: string
          org_id?: string
          payload?: Json
          provider?: string
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_reports_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_scheduled_missions: {
        Row: {
          created_at: string
          cron: string
          enabled: boolean
          id: string
          last_run_at: string | null
          last_thread_id: string | null
          mode: string
          next_run_at: string | null
          notify: boolean
          org_id: string
          prompt: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          cron?: string
          enabled?: boolean
          id?: string
          last_run_at?: string | null
          last_thread_id?: string | null
          mode?: string
          next_run_at?: string | null
          notify?: boolean
          org_id: string
          prompt: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          cron?: string
          enabled?: boolean
          id?: string
          last_run_at?: string | null
          last_thread_id?: string | null
          mode?: string
          next_run_at?: string | null
          notify?: boolean
          org_id?: string
          prompt?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_threads: {
        Row: {
          context_client_id: string | null
          created_at: string
          id: string
          mode: string
          model: string | null
          org_id: string
          provider: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          context_client_id?: string | null
          created_at?: string
          id?: string
          mode?: string
          model?: string | null
          org_id: string
          provider?: string | null
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          context_client_id?: string | null
          created_at?: string
          id?: string
          mode?: string
          model?: string | null
          org_id?: string
          provider?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_threads_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_tool_calls: {
        Row: {
          args: Json
          created_at: string
          error: string | null
          id: string
          latency_ms: number | null
          message_id: string | null
          org_id: string
          result: Json | null
          status: string
          thread_id: string
          tool_name: string
          user_id: string
        }
        Insert: {
          args?: Json
          created_at?: string
          error?: string | null
          id?: string
          latency_ms?: number | null
          message_id?: string | null
          org_id: string
          result?: Json | null
          status?: string
          thread_id: string
          tool_name: string
          user_id: string
        }
        Update: {
          args?: Json
          created_at?: string
          error?: string | null
          id?: string
          latency_ms?: number | null
          message_id?: string | null
          org_id?: string
          result?: Json | null
          status?: string
          thread_id?: string
          tool_name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_tool_calls_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "ai_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_tool_calls_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "ai_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_log: {
        Row: {
          cost_usd: number
          created_at: string
          id: string
          model: string
          org_id: string
          provider: string
          tokens_in: number
          tokens_out: number
          user_id: string | null
        }
        Insert: {
          cost_usd?: number
          created_at?: string
          id?: string
          model: string
          org_id: string
          provider: string
          tokens_in?: number
          tokens_out?: number
          user_id?: string | null
        }
        Update: {
          cost_usd?: number
          created_at?: string
          id?: string
          model?: string
          org_id?: string
          provider?: string
          tokens_in?: number
          tokens_out?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          task_count: number
          title: string
          total_budget_usd: number
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
          task_count?: number
          title?: string
          total_budget_usd?: number
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
          task_count?: number
          title?: string
          total_budget_usd?: number
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
      campaign_tasks: {
        Row: {
          ad_caption: string | null
          budget_usd: number
          created_at: string
          creative_link: string
          id: string
          objective: Database["public"]["Enums"]["campaign_objective"]
          platform: Database["public"]["Enums"]["ad_platform"]
          product_name: string | null
          quantity: number
          rejection_reason: string | null
          request_id: string
          status: Database["public"]["Enums"]["campaign_task_status"]
        }
        Insert: {
          ad_caption?: string | null
          budget_usd?: number
          created_at?: string
          creative_link?: string
          id?: string
          objective: Database["public"]["Enums"]["campaign_objective"]
          platform: Database["public"]["Enums"]["ad_platform"]
          product_name?: string | null
          quantity?: number
          rejection_reason?: string | null
          request_id: string
          status?: Database["public"]["Enums"]["campaign_task_status"]
        }
        Update: {
          ad_caption?: string | null
          budget_usd?: number
          created_at?: string
          creative_link?: string
          id?: string
          objective?: Database["public"]["Enums"]["campaign_objective"]
          platform?: Database["public"]["Enums"]["ad_platform"]
          product_name?: string | null
          quantity?: number
          rejection_reason?: string | null
          request_id?: string
          status?: Database["public"]["Enums"]["campaign_task_status"]
        }
        Relationships: [
          {
            foreignKeyName: "campaign_tasks_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "campaign_requests"
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
          pause_attempt_count: number
          pause_confirmed_at: string | null
          pause_error: string | null
          pause_requested_at: string | null
          pause_required: boolean
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
          pause_attempt_count?: number
          pause_confirmed_at?: string | null
          pause_error?: string | null
          pause_requested_at?: string | null
          pause_required?: boolean
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
          pause_attempt_count?: number
          pause_confirmed_at?: string | null
          pause_error?: string | null
          pause_requested_at?: string | null
          pause_required?: boolean
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
      cash_flow_snapshots: {
        Row: {
          carry_forward_bdt: number
          closing_balance_bdt: number
          created_at: string
          created_by: string
          id: string
          note: string | null
          opening_balance_bdt: number
          org_id: string | null
          period_start_date: string
          snapshot_date: string
          take_home_profit_bdt: number
          variance_bdt: number
        }
        Insert: {
          carry_forward_bdt?: number
          closing_balance_bdt?: number
          created_at?: string
          created_by: string
          id?: string
          note?: string | null
          opening_balance_bdt?: number
          org_id?: string | null
          period_start_date: string
          snapshot_date?: string
          take_home_profit_bdt?: number
          variance_bdt?: number
        }
        Update: {
          carry_forward_bdt?: number
          closing_balance_bdt?: number
          created_at?: string
          created_by?: string
          id?: string
          note?: string | null
          opening_balance_bdt?: number
          org_id?: string | null
          period_start_date?: string
          snapshot_date?: string
          take_home_profit_bdt?: number
          variance_bdt?: number
        }
        Relationships: []
      }
      cash_withdrawal_returns: {
        Row: {
          amount_bdt: number
          created_at: string
          created_by: string
          date: string
          id: string
          note: string | null
          org_id: string | null
          to_account_id: string
          withdrawal_id: string
        }
        Insert: {
          amount_bdt: number
          created_at?: string
          created_by: string
          date?: string
          id?: string
          note?: string | null
          org_id?: string | null
          to_account_id: string
          withdrawal_id: string
        }
        Update: {
          amount_bdt?: number
          created_at?: string
          created_by?: string
          date?: string
          id?: string
          note?: string | null
          org_id?: string | null
          to_account_id?: string
          withdrawal_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_withdrawal_returns_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_withdrawal_returns_to_account_id_fkey"
            columns: ["to_account_id"]
            isOneToOne: false
            referencedRelation: "agency_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_withdrawal_returns_withdrawal_id_fkey"
            columns: ["withdrawal_id"]
            isOneToOne: false
            referencedRelation: "cash_withdrawals"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_withdrawals: {
        Row: {
          amount_bdt: number
          borrower_name: string
          category: Database["public"]["Enums"]["withdrawal_category"]
          created_at: string
          created_by: string
          date: string
          expected_return_date: string | null
          from_account_id: string
          id: string
          note: string | null
          org_id: string | null
          parent_withdrawal_id: string | null
          returned_bdt: number
          status: Database["public"]["Enums"]["withdrawal_status"]
          updated_at: string
        }
        Insert: {
          amount_bdt: number
          borrower_name?: string
          category: Database["public"]["Enums"]["withdrawal_category"]
          created_at?: string
          created_by: string
          date?: string
          expected_return_date?: string | null
          from_account_id: string
          id?: string
          note?: string | null
          org_id?: string | null
          parent_withdrawal_id?: string | null
          returned_bdt?: number
          status?: Database["public"]["Enums"]["withdrawal_status"]
          updated_at?: string
        }
        Update: {
          amount_bdt?: number
          borrower_name?: string
          category?: Database["public"]["Enums"]["withdrawal_category"]
          created_at?: string
          created_by?: string
          date?: string
          expected_return_date?: string | null
          from_account_id?: string
          id?: string
          note?: string | null
          org_id?: string | null
          parent_withdrawal_id?: string | null
          returned_bdt?: number
          status?: Database["public"]["Enums"]["withdrawal_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_withdrawals_from_account_id_fkey"
            columns: ["from_account_id"]
            isOneToOne: false
            referencedRelation: "agency_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_withdrawals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_withdrawals_parent_withdrawal_id_fkey"
            columns: ["parent_withdrawal_id"]
            isOneToOne: false
            referencedRelation: "cash_withdrawals"
            referencedColumns: ["id"]
          },
        ]
      }
      client_notices: {
        Row: {
          created_at: string
          created_by: string
          ends_at: string | null
          id: string
          is_active: boolean
          message: string
          org_id: string | null
          starts_at: string
          target_ids: string[] | null
          target_type: string
          title: string
          type: string
        }
        Insert: {
          created_at?: string
          created_by: string
          ends_at?: string | null
          id?: string
          is_active?: boolean
          message: string
          org_id?: string | null
          starts_at?: string
          target_ids?: string[] | null
          target_type?: string
          title: string
          type?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          ends_at?: string | null
          id?: string
          is_active?: boolean
          message?: string
          org_id?: string | null
          starts_at?: string
          target_ids?: string[] | null
          target_type?: string
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_notices_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      currency_rates: {
        Row: {
          created_at: string
          from_currency: string
          id: string
          rate: number
          source: string
          to_currency: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          from_currency?: string
          id?: string
          rate?: number
          source?: string
          to_currency?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          from_currency?: string
          id?: string
          rate?: number
          source?: string
          to_currency?: string
          updated_at?: string
        }
        Relationships: []
      }
      daily_ad_spend: {
        Row: {
          ad_account_id: string
          campaign_name: string
          client_id: string | null
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
          client_id?: string | null
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
          client_id?: string | null
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
          budget: number
          campaign_id: string
          clicks: number
          conversations_instant_msg: number
          conversations_tiktok_dm: number
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
          leads_tiktok_dm: number
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
          budget?: number
          campaign_id: string
          clicks?: number
          conversations_instant_msg?: number
          conversations_tiktok_dm?: number
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
          leads_tiktok_dm?: number
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
          budget?: number
          campaign_id?: string
          clicks?: number
          conversations_instant_msg?: number
          conversations_tiktok_dm?: number
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
          leads_tiktok_dm?: number
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
      data_export_requests: {
        Row: {
          created_at: string
          expires_at: string | null
          export_url: string | null
          id: string
          org_id: string
          requested_by: string
          status: Database["public"]["Enums"]["export_request_status"]
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          export_url?: string | null
          id?: string
          org_id: string
          requested_by: string
          status?: Database["public"]["Enums"]["export_request_status"]
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          export_url?: string | null
          id?: string
          org_id?: string
          requested_by?: string
          status?: Database["public"]["Enums"]["export_request_status"]
        }
        Relationships: [
          {
            foreignKeyName: "data_export_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      document_acceptances: {
        Row: {
          accepted_at: string
          document_id: string
          id: string
          ip_address: string | null
          org_id: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          accepted_at?: string
          document_id: string
          id?: string
          ip_address?: string | null
          org_id?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          accepted_at?: string
          document_id?: string
          id?: string
          ip_address?: string | null
          org_id?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_acceptances_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "legal_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_acceptances_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      dunning_runs: {
        Row: {
          created_at: string
          current_step: number
          id: string
          invoice_id: string | null
          last_action_at: string | null
          org_id: string
          recovery_amount_bdt: number
          schedule_id: string | null
          started_at: string
          status: Database["public"]["Enums"]["dunning_status"]
          subscription_id: string | null
        }
        Insert: {
          created_at?: string
          current_step?: number
          id?: string
          invoice_id?: string | null
          last_action_at?: string | null
          org_id: string
          recovery_amount_bdt?: number
          schedule_id?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["dunning_status"]
          subscription_id?: string | null
        }
        Update: {
          created_at?: string
          current_step?: number
          id?: string
          invoice_id?: string | null
          last_action_at?: string | null
          org_id?: string
          recovery_amount_bdt?: number
          schedule_id?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["dunning_status"]
          subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dunning_runs_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "platform_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dunning_runs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dunning_runs_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "dunning_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dunning_runs_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "organization_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      dunning_schedules: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          name: string
          steps: Json
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          steps?: Json
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          steps?: Json
        }
        Relationships: []
      }
      email_log: {
        Row: {
          created_at: string
          error: string | null
          id: string
          org_id: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["email_send_status"]
          subject: string
          template_key: string | null
          to_email: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          org_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["email_send_status"]
          subject?: string
          template_key?: string | null
          to_email: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          org_id?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["email_send_status"]
          subject?: string
          template_key?: string | null
          to_email?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      email_schedules: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          template_key: string
          trigger_config: Json
          trigger_type: Database["public"]["Enums"]["email_trigger_type"]
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          template_key: string
          trigger_config?: Json
          trigger_type?: Database["public"]["Enums"]["email_trigger_type"]
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          template_key?: string
          trigger_config?: Json
          trigger_type?: Database["public"]["Enums"]["email_trigger_type"]
        }
        Relationships: [
          {
            foreignKeyName: "email_schedules_template_key_fkey"
            columns: ["template_key"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["key"]
          },
        ]
      }
      email_templates: {
        Row: {
          body_html: string
          body_text: string
          created_at: string
          id: string
          is_active: boolean
          key: string
          subject_bn: string
          subject_en: string
          variables: Json
        }
        Insert: {
          body_html?: string
          body_text?: string
          created_at?: string
          id?: string
          is_active?: boolean
          key: string
          subject_bn?: string
          subject_en?: string
          variables?: Json
        }
        Update: {
          body_html?: string
          body_text?: string
          created_at?: string
          id?: string
          is_active?: boolean
          key?: string
          subject_bn?: string
          subject_en?: string
          variables?: Json
        }
        Relationships: []
      }
      feature_usage_events: {
        Row: {
          created_at: string
          event_count: number
          feature_key: string
          id: string
          last_used_at: string | null
          org_id: string
          period: string
        }
        Insert: {
          created_at?: string
          event_count?: number
          feature_key: string
          id?: string
          last_used_at?: string | null
          org_id: string
          period?: string
        }
        Update: {
          created_at?: string
          event_count?: number
          feature_key?: string
          id?: string
          last_used_at?: string | null
          org_id?: string
          period?: string
        }
        Relationships: [
          {
            foreignKeyName: "feature_usage_events_org_id_fkey"
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
          fee_bdt: number
          fee_expense_id: string | null
          fee_percent: number | null
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
          fee_bdt?: number
          fee_expense_id?: string | null
          fee_percent?: number | null
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
          fee_bdt?: number
          fee_expense_id?: string | null
          fee_percent?: number | null
          from_account_id?: string
          id?: string
          note?: string | null
          org_id?: string | null
          to_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fund_transfers_fee_expense_id_fkey"
            columns: ["fee_expense_id"]
            isOneToOne: false
            referencedRelation: "agency_expenses"
            referencedColumns: ["id"]
          },
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
      gateway_transactions: {
        Row: {
          amount_bdt: number
          created_at: string
          gateway: Database["public"]["Enums"]["payment_gateway_type"]
          gateway_response: Json | null
          gateway_txn_id: string | null
          id: string
          invoice_id: string | null
          org_id: string
          status: Database["public"]["Enums"]["gateway_txn_status"]
          subscription_id: string | null
        }
        Insert: {
          amount_bdt?: number
          created_at?: string
          gateway: Database["public"]["Enums"]["payment_gateway_type"]
          gateway_response?: Json | null
          gateway_txn_id?: string | null
          id?: string
          invoice_id?: string | null
          org_id: string
          status?: Database["public"]["Enums"]["gateway_txn_status"]
          subscription_id?: string | null
        }
        Update: {
          amount_bdt?: number
          created_at?: string
          gateway?: Database["public"]["Enums"]["payment_gateway_type"]
          gateway_response?: Json | null
          gateway_txn_id?: string | null
          id?: string
          invoice_id?: string | null
          org_id?: string
          status?: Database["public"]["Enums"]["gateway_txn_status"]
          subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gateway_transactions_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "platform_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gateway_transactions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gateway_transactions_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "organization_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      guard_pause_jobs: {
        Row: {
          attempts: number
          available_at: string
          campaign_id: string
          created_at: string
          id: number
          last_error: string | null
          status: string
        }
        Insert: {
          attempts?: number
          available_at?: string
          campaign_id: string
          created_at?: string
          id?: number
          last_error?: string | null
          status?: string
        }
        Update: {
          attempts?: number
          available_at?: string
          campaign_id?: string
          created_at?: string
          id?: number
          last_error?: string | null
          status?: string
        }
        Relationships: []
      }
      legal_documents: {
        Row: {
          content_html: string
          created_at: string
          effective_date: string
          id: string
          is_current: boolean
          title: string
          type: Database["public"]["Enums"]["legal_doc_type"]
          version: string
        }
        Insert: {
          content_html?: string
          created_at?: string
          effective_date?: string
          id?: string
          is_current?: boolean
          title: string
          type: Database["public"]["Enums"]["legal_doc_type"]
          version?: string
        }
        Update: {
          content_html?: string
          created_at?: string
          effective_date?: string
          id?: string
          is_current?: boolean
          title?: string
          type?: Database["public"]["Enums"]["legal_doc_type"]
          version?: string
        }
        Relationships: []
      }
      liquid_fund_entries: {
        Row: {
          account_id: string
          amount_bdt: number
          created_at: string
          created_by: string
          date: string
          id: string
          note: string | null
          org_id: string | null
          source: string
          type: string
        }
        Insert: {
          account_id: string
          amount_bdt: number
          created_at?: string
          created_by: string
          date?: string
          id?: string
          note?: string | null
          org_id?: string | null
          source?: string
          type?: string
        }
        Update: {
          account_id?: string
          amount_bdt?: number
          created_at?: string
          created_by?: string
          date?: string
          id?: string
          note?: string | null
          org_id?: string | null
          source?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "liquid_fund_entries_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "agency_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liquid_fund_entries_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      liquid_fund_loan_returns: {
        Row: {
          amount_bdt: number
          created_at: string
          created_by: string
          date: string
          id: string
          loan_id: string
          note: string | null
          org_id: string | null
          to_account_id: string
        }
        Insert: {
          amount_bdt?: number
          created_at?: string
          created_by: string
          date?: string
          id?: string
          loan_id: string
          note?: string | null
          org_id?: string | null
          to_account_id: string
        }
        Update: {
          amount_bdt?: number
          created_at?: string
          created_by?: string
          date?: string
          id?: string
          loan_id?: string
          note?: string | null
          org_id?: string | null
          to_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "liquid_fund_loan_returns_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "liquid_fund_loans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liquid_fund_loan_returns_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liquid_fund_loan_returns_to_account_id_fkey"
            columns: ["to_account_id"]
            isOneToOne: false
            referencedRelation: "agency_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      liquid_fund_loans: {
        Row: {
          amount_bdt: number
          created_at: string
          created_by: string
          date: string
          expected_return_date: string | null
          id: string
          lender_name: string
          liquid_fund_id: string | null
          note: string | null
          org_id: string | null
          returned_bdt: number
          status: Database["public"]["Enums"]["withdrawal_status"]
          to_account_id: string
        }
        Insert: {
          amount_bdt?: number
          created_at?: string
          created_by: string
          date?: string
          expected_return_date?: string | null
          id?: string
          lender_name?: string
          liquid_fund_id?: string | null
          note?: string | null
          org_id?: string | null
          returned_bdt?: number
          status?: Database["public"]["Enums"]["withdrawal_status"]
          to_account_id: string
        }
        Update: {
          amount_bdt?: number
          created_at?: string
          created_by?: string
          date?: string
          expected_return_date?: string | null
          id?: string
          lender_name?: string
          liquid_fund_id?: string | null
          note?: string | null
          org_id?: string | null
          returned_bdt?: number
          status?: Database["public"]["Enums"]["withdrawal_status"]
          to_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "liquid_fund_loans_liquid_fund_id_fkey"
            columns: ["liquid_fund_id"]
            isOneToOne: false
            referencedRelation: "liquid_fund_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liquid_fund_loans_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "liquid_fund_loans_to_account_id_fkey"
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
      mrr_snapshots: {
        Row: {
          active_count: number
          churned_mrr: number
          contraction_mrr: number
          created_at: string
          downgrade_mrr: number
          expansion_mrr: number
          id: string
          new_mrr: number
          reactivation_mrr: number
          snapshot_month: string
          total_mrr: number
          upgrade_mrr: number
        }
        Insert: {
          active_count?: number
          churned_mrr?: number
          contraction_mrr?: number
          created_at?: string
          downgrade_mrr?: number
          expansion_mrr?: number
          id?: string
          new_mrr?: number
          reactivation_mrr?: number
          snapshot_month: string
          total_mrr?: number
          upgrade_mrr?: number
        }
        Update: {
          active_count?: number
          churned_mrr?: number
          contraction_mrr?: number
          created_at?: string
          downgrade_mrr?: number
          expansion_mrr?: number
          id?: string
          new_mrr?: number
          reactivation_mrr?: number
          snapshot_month?: string
          total_mrr?: number
          upgrade_mrr?: number
        }
        Relationships: []
      }
      notification_mutes: {
        Row: {
          created_at: string
          group_key: string
          id: string
          muted_until: string
          user_id: string
        }
        Insert: {
          created_at?: string
          group_key: string
          id?: string
          muted_until: string
          user_id: string
        }
        Update: {
          created_at?: string
          group_key?: string
          id?: string
          muted_until?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          channel: string
          created_at: string
          email_enabled: boolean
          enabled: boolean
          id: string
          min_priority: string
          sound_enabled: boolean
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          channel?: string
          created_at?: string
          email_enabled?: boolean
          enabled?: boolean
          id?: string
          min_priority?: string
          sound_enabled?: boolean
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          email_enabled?: boolean
          enabled?: boolean
          id?: string
          min_priority?: string
          sound_enabled?: boolean
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_user_settings: {
        Row: {
          created_at: string
          digest_enabled: boolean
          digest_hour: number
          dnd_until: string | null
          quiet_end: string | null
          quiet_start: string | null
          quiet_timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          digest_enabled?: boolean
          digest_hour?: number
          dnd_until?: string | null
          quiet_end?: string | null
          quiet_start?: string | null
          quiet_timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          digest_enabled?: boolean
          digest_hour?: number
          dnd_until?: string | null
          quiet_end?: string | null
          quiet_start?: string | null
          quiet_timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          archived_at: string | null
          body: string
          created_at: string
          group_key: string | null
          id: string
          is_pinned: boolean
          is_read: boolean
          link: string | null
          org_id: string | null
          priority: string
          snoozed_until: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          body?: string
          created_at?: string
          group_key?: string | null
          id?: string
          is_pinned?: boolean
          is_read?: boolean
          link?: string | null
          org_id?: string | null
          priority?: string
          snoozed_until?: string | null
          title: string
          type?: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Update: {
          archived_at?: string | null
          body?: string
          created_at?: string
          group_key?: string | null
          id?: string
          is_pinned?: boolean
          is_read?: boolean
          link?: string | null
          org_id?: string | null
          priority?: string
          snoozed_until?: string | null
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_subscriptions: {
        Row: {
          amount_bdt: number
          auto_renew: boolean
          billing_currency: string
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
          auto_renew?: boolean
          billing_currency?: string
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
          auto_renew?: boolean
          billing_currency?: string
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
          accent_color: string
          allowed_features: Json
          brand_name: string
          created_at: string
          grace_period_days: number
          id: string
          logo_url: string | null
          max_ad_accounts: number
          max_clients: number
          max_managers: number
          name: string
          notes: string | null
          owner_user_id: string
          plan: Database["public"]["Enums"]["org_plan"]
          primary_color: string
          referred_by_affiliate_id: string | null
          referred_by_code: string | null
          slug: string
          status: Database["public"]["Enums"]["org_status"]
          status_changed_at: string
          suspension_reason: string | null
          trial_ends_at: string | null
        }
        Insert: {
          accent_color?: string
          allowed_features?: Json
          brand_name?: string
          created_at?: string
          grace_period_days?: number
          id?: string
          logo_url?: string | null
          max_ad_accounts?: number
          max_clients?: number
          max_managers?: number
          name: string
          notes?: string | null
          owner_user_id: string
          plan?: Database["public"]["Enums"]["org_plan"]
          primary_color?: string
          referred_by_affiliate_id?: string | null
          referred_by_code?: string | null
          slug: string
          status?: Database["public"]["Enums"]["org_status"]
          status_changed_at?: string
          suspension_reason?: string | null
          trial_ends_at?: string | null
        }
        Update: {
          accent_color?: string
          allowed_features?: Json
          brand_name?: string
          created_at?: string
          grace_period_days?: number
          id?: string
          logo_url?: string | null
          max_ad_accounts?: number
          max_clients?: number
          max_managers?: number
          name?: string
          notes?: string | null
          owner_user_id?: string
          plan?: Database["public"]["Enums"]["org_plan"]
          primary_color?: string
          referred_by_affiliate_id?: string | null
          referred_by_code?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["org_status"]
          status_changed_at?: string
          suspension_reason?: string | null
          trial_ends_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organizations_referred_by_affiliate_id_fkey"
            columns: ["referred_by_affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
        ]
      }
      overage_charges: {
        Row: {
          actual_usage: number
          billing_period: string
          created_at: string
          id: string
          included_limit: number
          invoice_id: string | null
          metric_type: Database["public"]["Enums"]["metering_metric"]
          org_id: string
          overage_units: number
          rate_per_unit_bdt: number
          total_bdt: number
        }
        Insert: {
          actual_usage?: number
          billing_period: string
          created_at?: string
          id?: string
          included_limit?: number
          invoice_id?: string | null
          metric_type: Database["public"]["Enums"]["metering_metric"]
          org_id: string
          overage_units?: number
          rate_per_unit_bdt?: number
          total_bdt?: number
        }
        Update: {
          actual_usage?: number
          billing_period?: string
          created_at?: string
          id?: string
          included_limit?: number
          invoice_id?: string | null
          metric_type?: Database["public"]["Enums"]["metering_metric"]
          org_id?: string
          overage_units?: number
          rate_per_unit_bdt?: number
          total_bdt?: number
        }
        Relationships: [
          {
            foreignKeyName: "overage_charges_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "platform_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overage_charges_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_gateway_config: {
        Row: {
          config: Json
          created_at: string
          gateway: Database["public"]["Enums"]["payment_gateway_type"]
          id: string
          is_active: boolean
          org_id: string | null
        }
        Insert: {
          config?: Json
          created_at?: string
          gateway?: Database["public"]["Enums"]["payment_gateway_type"]
          id?: string
          is_active?: boolean
          org_id?: string | null
        }
        Update: {
          config?: Json
          created_at?: string
          gateway?: Database["public"]["Enums"]["payment_gateway_type"]
          id?: string
          is_active?: boolean
          org_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_gateway_config_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_requests: {
        Row: {
          admin_note: string | null
          amount_bdt: number
          client_id: string
          created_at: string
          exchange_rate_snapshot: Json | null
          final_amount_usd: number | null
          id: string
          org_id: string | null
          payment_date: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          platform: string | null
          platform_amounts: Json | null
          proof_image_url: string | null
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
          exchange_rate_snapshot?: Json | null
          final_amount_usd?: number | null
          id?: string
          org_id?: string | null
          payment_date?: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          platform?: string | null
          platform_amounts?: Json | null
          proof_image_url?: string | null
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
          exchange_rate_snapshot?: Json | null
          final_amount_usd?: number | null
          id?: string
          org_id?: string | null
          payment_date?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          platform?: string | null
          platform_amounts?: Json | null
          proof_image_url?: string | null
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
      plan_change_log: {
        Row: {
          cancellation_reason: string | null
          created_at: string
          effective_date: string
          from_cycle: string | null
          from_plan: string
          id: string
          org_id: string
          proration_charge_bdt: number
          proration_credit_bdt: number
          status: Database["public"]["Enums"]["plan_change_status"]
          to_cycle: string | null
          to_plan: string
        }
        Insert: {
          cancellation_reason?: string | null
          created_at?: string
          effective_date?: string
          from_cycle?: string | null
          from_plan: string
          id?: string
          org_id: string
          proration_charge_bdt?: number
          proration_credit_bdt?: number
          status?: Database["public"]["Enums"]["plan_change_status"]
          to_cycle?: string | null
          to_plan: string
        }
        Update: {
          cancellation_reason?: string | null
          created_at?: string
          effective_date?: string
          from_cycle?: string | null
          from_plan?: string
          id?: string
          org_id?: string
          proration_charge_bdt?: number
          proration_credit_bdt?: number
          status?: Database["public"]["Enums"]["plan_change_status"]
          to_cycle?: string | null
          to_plan?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_change_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_upgrade_requests: {
        Row: {
          admin_note: string | null
          created_at: string
          current_plan: string
          id: string
          org_id: string
          requested_billing_cycle: string
          requested_plan: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          admin_note?: string | null
          created_at?: string
          current_plan: string
          id?: string
          org_id: string
          requested_billing_cycle?: string
          requested_plan: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          admin_note?: string | null
          created_at?: string
          current_plan?: string
          id?: string
          org_id?: string
          requested_billing_cycle?: string
          requested_plan?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_upgrade_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_accounts: {
        Row: {
          account_number: string | null
          created_at: string
          current_balance_bdt: number
          id: string
          is_active: boolean
          name: string
          type: string
        }
        Insert: {
          account_number?: string | null
          created_at?: string
          current_balance_bdt?: number
          id?: string
          is_active?: boolean
          name: string
          type?: string
        }
        Update: {
          account_number?: string | null
          created_at?: string
          current_balance_bdt?: number
          id?: string
          is_active?: boolean
          name?: string
          type?: string
        }
        Relationships: []
      }
      platform_announcements: {
        Row: {
          body: string
          created_at: string
          ends_at: string | null
          id: string
          is_active: boolean
          starts_at: string
          target_plan: string | null
          title: string
          type: Database["public"]["Enums"]["announcement_type"]
        }
        Insert: {
          body: string
          created_at?: string
          ends_at?: string | null
          id?: string
          is_active?: boolean
          starts_at?: string
          target_plan?: string | null
          title: string
          type?: Database["public"]["Enums"]["announcement_type"]
        }
        Update: {
          body?: string
          created_at?: string
          ends_at?: string | null
          id?: string
          is_active?: boolean
          starts_at?: string
          target_plan?: string | null
          title?: string
          type?: Database["public"]["Enums"]["announcement_type"]
        }
        Relationships: []
      }
      platform_costs: {
        Row: {
          amount_bdt: number
          category: string
          created_at: string
          id: string
          notes: string | null
          org_id: string | null
          period: string
        }
        Insert: {
          amount_bdt?: number
          category?: string
          created_at?: string
          id?: string
          notes?: string | null
          org_id?: string | null
          period: string
        }
        Update: {
          amount_bdt?: number
          category?: string
          created_at?: string
          id?: string
          notes?: string | null
          org_id?: string | null
          period?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_costs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_expenses: {
        Row: {
          amount_bdt: number
          category: string
          created_at: string
          created_by: string
          date: string
          description: string | null
          id: string
          paid_from_account_id: string | null
        }
        Insert: {
          amount_bdt?: number
          category?: string
          created_at?: string
          created_by: string
          date?: string
          description?: string | null
          id?: string
          paid_from_account_id?: string | null
        }
        Update: {
          amount_bdt?: number
          category?: string
          created_at?: string
          created_by?: string
          date?: string
          description?: string | null
          id?: string
          paid_from_account_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_expenses_paid_from_account_id_fkey"
            columns: ["paid_from_account_id"]
            isOneToOne: false
            referencedRelation: "platform_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_fund_transfers: {
        Row: {
          amount_bdt: number
          created_at: string
          created_by: string
          from_account_id: string
          id: string
          note: string | null
          to_account_id: string
        }
        Insert: {
          amount_bdt: number
          created_at?: string
          created_by: string
          from_account_id: string
          id?: string
          note?: string | null
          to_account_id: string
        }
        Update: {
          amount_bdt?: number
          created_at?: string
          created_by?: string
          from_account_id?: string
          id?: string
          note?: string | null
          to_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_fund_transfers_from_account_id_fkey"
            columns: ["from_account_id"]
            isOneToOne: false
            referencedRelation: "platform_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_fund_transfers_to_account_id_fkey"
            columns: ["to_account_id"]
            isOneToOne: false
            referencedRelation: "platform_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_invoices: {
        Row: {
          amount_bdt: number
          created_at: string
          currency: string
          due_date: string | null
          id: string
          invoice_number: string
          notes: string | null
          org_id: string
          payment_date: string | null
          payment_method: string | null
          period_end: string
          period_start: string
          status: Database["public"]["Enums"]["invoice_status"]
        }
        Insert: {
          amount_bdt?: number
          created_at?: string
          currency?: string
          due_date?: string | null
          id?: string
          invoice_number: string
          notes?: string | null
          org_id: string
          payment_date?: string | null
          payment_method?: string | null
          period_end: string
          period_start: string
          status?: Database["public"]["Enums"]["invoice_status"]
        }
        Update: {
          amount_bdt?: number
          created_at?: string
          currency?: string
          due_date?: string | null
          id?: string
          invoice_number?: string
          notes?: string | null
          org_id?: string
          payment_date?: string | null
          payment_method?: string | null
          period_end?: string
          period_start?: string
          status?: Database["public"]["Enums"]["invoice_status"]
        }
        Relationships: [
          {
            foreignKeyName: "platform_invoices_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_payment_gateways: {
        Row: {
          created_at: string
          credentials: Json
          display_name: string
          gateway: string
          id: string
          is_enabled: boolean
          last_test_status: string | null
          last_tested_at: string | null
          mode: string
          priority: number
          public_config: Json
          supported_currencies: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          credentials?: Json
          display_name: string
          gateway: string
          id?: string
          is_enabled?: boolean
          last_test_status?: string | null
          last_tested_at?: string | null
          mode?: string
          priority?: number
          public_config?: Json
          supported_currencies?: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          credentials?: Json
          display_name?: string
          gateway?: string
          id?: string
          is_enabled?: boolean
          last_test_status?: string | null
          last_tested_at?: string | null
          mode?: string
          priority?: number
          public_config?: Json
          supported_currencies?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      platform_plans: {
        Row: {
          allow_self_downgrade: boolean
          allow_self_upgrade: boolean
          api_call_limit: number
          created_at: string
          currency: string
          feature_flags: Json
          features: Json
          id: string
          is_active: boolean
          is_popular: boolean
          key: string
          max_ad_accounts: number
          max_clients: number
          max_managers: number
          name: string
          overage_rate_bdt: Json
          price_bdt_monthly: number
          price_bdt_yearly: number
          sort_order: number
          storage_limit_mb: number
          sync_run_limit: number
        }
        Insert: {
          allow_self_downgrade?: boolean
          allow_self_upgrade?: boolean
          api_call_limit?: number
          created_at?: string
          currency?: string
          feature_flags?: Json
          features?: Json
          id?: string
          is_active?: boolean
          is_popular?: boolean
          key: string
          max_ad_accounts?: number
          max_clients?: number
          max_managers?: number
          name: string
          overage_rate_bdt?: Json
          price_bdt_monthly?: number
          price_bdt_yearly?: number
          sort_order?: number
          storage_limit_mb?: number
          sync_run_limit?: number
        }
        Update: {
          allow_self_downgrade?: boolean
          allow_self_upgrade?: boolean
          api_call_limit?: number
          created_at?: string
          currency?: string
          feature_flags?: Json
          features?: Json
          id?: string
          is_active?: boolean
          is_popular?: boolean
          key?: string
          max_ad_accounts?: number
          max_clients?: number
          max_managers?: number
          name?: string
          overage_rate_bdt?: Json
          price_bdt_monthly?: number
          price_bdt_yearly?: number
          sort_order?: number
          storage_limit_mb?: number
          sync_run_limit?: number
        }
        Relationships: []
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
      push_subscriptions: {
        Row: {
          created_at: string
          endpoint: string
          id: string
          keys_auth: string
          keys_p256dh: string
          user_id: string
        }
        Insert: {
          created_at?: string
          endpoint: string
          id?: string
          keys_auth: string
          keys_p256dh: string
          user_id: string
        }
        Update: {
          created_at?: string
          endpoint?: string
          id?: string
          keys_auth?: string
          keys_p256dh?: string
          user_id?: string
        }
        Relationships: []
      }
      referral_codes: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          org_id: string
          program_id: string | null
          uses_count: number
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          org_id: string
          program_id?: string | null
          uses_count?: number
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          org_id?: string
          program_id?: string | null
          uses_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "referral_codes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_codes_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "referral_program"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_program: {
        Row: {
          commission_type: Database["public"]["Enums"]["commission_type"]
          commission_value: number
          created_at: string
          id: string
          is_active: boolean
          max_payouts: number | null
          min_months: number
          name: string
        }
        Insert: {
          commission_type?: Database["public"]["Enums"]["commission_type"]
          commission_value?: number
          created_at?: string
          id?: string
          is_active?: boolean
          max_payouts?: number | null
          min_months?: number
          name?: string
        }
        Update: {
          commission_type?: Database["public"]["Enums"]["commission_type"]
          commission_value?: number
          created_at?: string
          id?: string
          is_active?: boolean
          max_payouts?: number | null
          min_months?: number
          name?: string
        }
        Relationships: []
      }
      referral_tracking: {
        Row: {
          commission_bdt: number
          created_at: string
          id: string
          paid_at: string | null
          qualified_at: string | null
          referral_code_id: string
          referred_org_id: string
          referrer_org_id: string
          status: Database["public"]["Enums"]["referral_status"]
        }
        Insert: {
          commission_bdt?: number
          created_at?: string
          id?: string
          paid_at?: string | null
          qualified_at?: string | null
          referral_code_id: string
          referred_org_id: string
          referrer_org_id: string
          status?: Database["public"]["Enums"]["referral_status"]
        }
        Update: {
          commission_bdt?: number
          created_at?: string
          id?: string
          paid_at?: string | null
          qualified_at?: string | null
          referral_code_id?: string
          referred_org_id?: string
          referrer_org_id?: string
          status?: Database["public"]["Enums"]["referral_status"]
        }
        Relationships: [
          {
            foreignKeyName: "referral_tracking_referral_code_id_fkey"
            columns: ["referral_code_id"]
            isOneToOne: false
            referencedRelation: "referral_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_tracking_referred_org_id_fkey"
            columns: ["referred_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_tracking_referrer_org_id_fkey"
            columns: ["referrer_org_id"]
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
      sla_metrics: {
        Row: {
          avg_resolution_hours: number
          avg_response_hours: number
          created_at: string
          id: string
          month: string
          org_id: string
          satisfaction_score: number | null
          sla_breach_count: number
          tickets_resolved: number
          tickets_total: number
        }
        Insert: {
          avg_resolution_hours?: number
          avg_response_hours?: number
          created_at?: string
          id?: string
          month: string
          org_id: string
          satisfaction_score?: number | null
          sla_breach_count?: number
          tickets_resolved?: number
          tickets_total?: number
        }
        Update: {
          avg_resolution_hours?: number
          avg_response_hours?: number
          created_at?: string
          id?: string
          month?: string
          org_id?: string
          satisfaction_score?: number | null
          sla_breach_count?: number
          tickets_resolved?: number
          tickets_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "sla_metrics_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_payments: {
        Row: {
          admin_note: string | null
          amount_bdt: number
          created_at: string
          gateway_payment_id: string | null
          gateway_provider: string | null
          id: string
          invoice_id: string | null
          org_id: string
          payment_method: string
          proof_image_url: string | null
          requested_billing_cycle: string | null
          requested_plan: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          transaction_reference: string | null
        }
        Insert: {
          admin_note?: string | null
          amount_bdt: number
          created_at?: string
          gateway_payment_id?: string | null
          gateway_provider?: string | null
          id?: string
          invoice_id?: string | null
          org_id: string
          payment_method?: string
          proof_image_url?: string | null
          requested_billing_cycle?: string | null
          requested_plan?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          transaction_reference?: string | null
        }
        Update: {
          admin_note?: string | null
          amount_bdt?: number
          created_at?: string
          gateway_payment_id?: string | null
          gateway_provider?: string | null
          id?: string
          invoice_id?: string | null
          org_id?: string
          payment_method?: string
          proof_image_url?: string | null
          requested_billing_cycle?: string | null
          requested_plan?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          transaction_reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "platform_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_payments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          assigned_to: string | null
          created_at: string
          description: string
          first_response_at: string | null
          id: string
          org_id: string
          priority: Database["public"]["Enums"]["ticket_priority"]
          resolved_at: string | null
          sla_breached: boolean
          status: Database["public"]["Enums"]["ticket_status"]
          subject: string
          tier_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          description?: string
          first_response_at?: string | null
          id?: string
          org_id: string
          priority?: Database["public"]["Enums"]["ticket_priority"]
          resolved_at?: string | null
          sla_breached?: boolean
          status?: Database["public"]["Enums"]["ticket_status"]
          subject: string
          tier_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          description?: string
          first_response_at?: string | null
          id?: string
          org_id?: string
          priority?: Database["public"]["Enums"]["ticket_priority"]
          resolved_at?: string | null
          sla_breached?: boolean
          status?: Database["public"]["Enums"]["ticket_status"]
          subject?: string
          tier_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "support_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tiers: {
        Row: {
          channels: Json
          created_at: string
          dedicated_manager: boolean
          id: string
          plan_key: string
          priority_level: Database["public"]["Enums"]["support_priority_level"]
          resolution_time_hours: number
          response_time_hours: number
        }
        Insert: {
          channels?: Json
          created_at?: string
          dedicated_manager?: boolean
          id?: string
          plan_key: string
          priority_level?: Database["public"]["Enums"]["support_priority_level"]
          resolution_time_hours?: number
          response_time_hours?: number
        }
        Update: {
          channels?: Json
          created_at?: string
          dedicated_manager?: boolean
          id?: string
          plan_key?: string
          priority_level?: Database["public"]["Enums"]["support_priority_level"]
          resolution_time_hours?: number
          response_time_hours?: number
        }
        Relationships: []
      }
      sync_account_stats: {
        Row: {
          ad_account_id: string
          avg_rows_per_day: number | null
          consecutive_failures: number | null
          consecutive_zero_runs: number
          last_error: string | null
          last_fast_lane_at: string | null
          last_fast_lane_rows: number
          last_full_sync_at: string | null
          org_id: string | null
          recommended_chunk_days: number | null
          total_rows_last_sync: number | null
          updated_at: string
        }
        Insert: {
          ad_account_id: string
          avg_rows_per_day?: number | null
          consecutive_failures?: number | null
          consecutive_zero_runs?: number
          last_error?: string | null
          last_fast_lane_at?: string | null
          last_fast_lane_rows?: number
          last_full_sync_at?: string | null
          org_id?: string | null
          recommended_chunk_days?: number | null
          total_rows_last_sync?: number | null
          updated_at?: string
        }
        Update: {
          ad_account_id?: string
          avg_rows_per_day?: number | null
          consecutive_failures?: number | null
          consecutive_zero_runs?: number
          last_error?: string | null
          last_fast_lane_at?: string | null
          last_fast_lane_rows?: number
          last_full_sync_at?: string | null
          org_id?: string | null
          recommended_chunk_days?: number | null
          total_rows_last_sync?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_account_stats_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: true
            referencedRelation: "ad_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_account_stats_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_integrity_alerts: {
        Row: {
          actual_rows: number | null
          ad_account_id: string
          alert_type: string
          created_at: string
          expected_rows: number | null
          id: string
          message: string | null
          missing_date_from: string | null
          missing_date_to: string | null
          org_id: string | null
          resolved: boolean
          resolved_at: string | null
          severity: string
        }
        Insert: {
          actual_rows?: number | null
          ad_account_id: string
          alert_type: string
          created_at?: string
          expected_rows?: number | null
          id?: string
          message?: string | null
          missing_date_from?: string | null
          missing_date_to?: string | null
          org_id?: string | null
          resolved?: boolean
          resolved_at?: string | null
          severity?: string
        }
        Update: {
          actual_rows?: number | null
          ad_account_id?: string
          alert_type?: string
          created_at?: string
          expected_rows?: number | null
          id?: string
          message?: string | null
          missing_date_from?: string | null
          missing_date_to?: string | null
          org_id?: string | null
          resolved?: boolean
          resolved_at?: string | null
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_integrity_alerts_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "ad_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_integrity_alerts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_jobs: {
        Row: {
          ad_account_id: string
          attempts: number
          chunk_index: number | null
          chunk_strategy: string
          chunk_total: number | null
          completed_at: string | null
          created_at: string
          date_from: string | null
          date_to: string | null
          error_code: string | null
          function_name: string
          id: string
          last_error: string | null
          max_attempts: number
          org_id: string | null
          parent_job_id: string | null
          rows_synced: number | null
          scheduled_at: string
          started_at: string | null
          status: string
        }
        Insert: {
          ad_account_id: string
          attempts?: number
          chunk_index?: number | null
          chunk_strategy?: string
          chunk_total?: number | null
          completed_at?: string | null
          created_at?: string
          date_from?: string | null
          date_to?: string | null
          error_code?: string | null
          function_name: string
          id?: string
          last_error?: string | null
          max_attempts?: number
          org_id?: string | null
          parent_job_id?: string | null
          rows_synced?: number | null
          scheduled_at?: string
          started_at?: string | null
          status?: string
        }
        Update: {
          ad_account_id?: string
          attempts?: number
          chunk_index?: number | null
          chunk_strategy?: string
          chunk_total?: number | null
          completed_at?: string | null
          created_at?: string
          date_from?: string | null
          date_to?: string | null
          error_code?: string | null
          function_name?: string
          id?: string
          last_error?: string | null
          max_attempts?: number
          org_id?: string | null
          parent_job_id?: string | null
          rows_synced?: number | null
          scheduled_at?: string
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_jobs_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "ad_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_jobs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_logs: {
        Row: {
          ad_account_id: string
          completed_at: string | null
          created_at: string
          error_code: string | null
          error_message: string | null
          function_name: string
          id: string
          retry_count: number | null
          rows_synced: number | null
          started_at: string
          status: string
        }
        Insert: {
          ad_account_id: string
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          function_name: string
          id?: string
          retry_count?: number | null
          rows_synced?: number | null
          started_at?: string
          status?: string
        }
        Update: {
          ad_account_id?: string
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          function_name?: string
          id?: string
          retry_count?: number | null
          rows_synced?: number | null
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_logs_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "ad_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_reconciliation_log: {
        Row: {
          ad_account_id: string
          api_total_spend: number
          created_at: string
          date_from: string
          date_to: string
          db_total_spend: number
          delta: number
          id: string
          notes: string | null
          org_id: string | null
          platform: Database["public"]["Enums"]["ad_platform"]
          rows_processed: number
        }
        Insert: {
          ad_account_id: string
          api_total_spend?: number
          created_at?: string
          date_from: string
          date_to: string
          db_total_spend?: number
          delta?: number
          id?: string
          notes?: string | null
          org_id?: string | null
          platform: Database["public"]["Enums"]["ad_platform"]
          rows_processed?: number
        }
        Update: {
          ad_account_id?: string
          api_total_spend?: number
          created_at?: string
          date_from?: string
          date_to?: string
          db_total_spend?: number
          delta?: number
          id?: string
          notes?: string | null
          org_id?: string | null
          platform?: Database["public"]["Enums"]["ad_platform"]
          rows_processed?: number
        }
        Relationships: [
          {
            foreignKeyName: "sync_reconciliation_log_ad_account_id_fkey"
            columns: ["ad_account_id"]
            isOneToOne: false
            referencedRelation: "ad_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_reconciliation_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_health_scores: {
        Row: {
          activity_score: number
          computed_at: string
          id: string
          org_id: string
          payment_score: number
          score: number
          usage_score: number
        }
        Insert: {
          activity_score?: number
          computed_at?: string
          id?: string
          org_id: string
          payment_score?: number
          score?: number
          usage_score?: number
        }
        Update: {
          activity_score?: number
          computed_at?: string
          id?: string
          org_id?: string
          payment_score?: number
          score?: number
          usage_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "tenant_health_scores_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_messages: {
        Row: {
          attachments: Json | null
          created_at: string
          id: string
          is_internal: boolean
          message: string
          ticket_id: string
          user_id: string
        }
        Insert: {
          attachments?: Json | null
          created_at?: string
          id?: string
          is_internal?: boolean
          message: string
          ticket_id: string
          user_id: string
        }
        Update: {
          attachments?: Json | null
          created_at?: string
          id?: string
          is_internal?: boolean
          message?: string
          ticket_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
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
      usage_metering_logs: {
        Row: {
          billing_period: string
          id: string
          metric_type: Database["public"]["Enums"]["metering_metric"]
          org_id: string
          recorded_at: string
          value: number
        }
        Insert: {
          billing_period?: string
          id?: string
          metric_type: Database["public"]["Enums"]["metering_metric"]
          org_id: string
          recorded_at?: string
          value?: number
        }
        Update: {
          billing_period?: string
          id?: string
          metric_type?: Database["public"]["Enums"]["metering_metric"]
          org_id?: string
          recorded_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "usage_metering_logs_org_id_fkey"
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
          baseline_balance_usd: number | null
          created_at: string
          created_by: string
          id: string
          metrics: Json | null
          notes: string | null
          org_id: string | null
          snapshot_date: string
        }
        Insert: {
          balance_usd?: number
          baseline_balance_usd?: number | null
          created_at?: string
          created_by: string
          id?: string
          metrics?: Json | null
          notes?: string | null
          org_id?: string | null
          snapshot_date: string
        }
        Update: {
          balance_usd?: number
          baseline_balance_usd?: number | null
          created_at?: string
          created_by?: string
          id?: string
          metrics?: Json | null
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
      usd_manual_spends: {
        Row: {
          amount_usd: number
          category: string
          created_at: string
          created_by: string
          date: string
          description: string | null
          id: string
          notes: string | null
          org_id: string | null
        }
        Insert: {
          amount_usd: number
          category?: string
          created_at?: string
          created_by: string
          date?: string
          description?: string | null
          id?: string
          notes?: string | null
          org_id?: string | null
        }
        Update: {
          amount_usd?: number
          category?: string
          created_at?: string
          created_by?: string
          date?: string
          description?: string | null
          id?: string
          notes?: string | null
          org_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "usd_manual_spends_org_id_fkey"
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
      claim_sync_jobs: {
        Args: { p_limit?: number }
        Returns: {
          ad_account_id: string
          attempts: number
          chunk_index: number
          chunk_strategy: string
          chunk_total: number
          date_from: string
          date_to: string
          function_name: string
          id: string
          max_attempts: number
          org_id: string
          parent_job_id: string
        }[]
      }
      cleanup_old_notifications: { Args: never; Returns: undefined }
      compute_chunk_days: { Args: { p_ad_account_id: string }; Returns: number }
      fmt_money: { Args: { n: number }; Returns: string }
      get_active_gateways_for_currency: {
        Args: { _currency: string }
        Returns: {
          display_name: string
          gateway: string
          id: string
          mode: string
          priority: number
          public_config: Json
          supported_currencies: string[]
        }[]
      }
      get_admin_dashboard_summary:
        | { Args: { p_date_from: string; p_date_to: string }; Returns: Json }
        | {
            Args: { p_date_from: string; p_date_to: string; p_org_id: string }
            Returns: Json
          }
      get_ai_provider_config: {
        Args: { _org_id: string; _provider: string }
        Returns: {
          api_key: string
          default_model: string
          monthly_budget_usd: number
          oauth_token: string
          usage_this_month_usd: number
        }[]
      }
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
      mark_parent_complete: { Args: { p_job_id: string }; Returns: Json }
      normalize_spend: {
        Args: { rate: number; raw_amount: number; raw_currency: string }
        Returns: number
      }
    }
    Enums: {
      account_currency: "USD" | "BDT"
      acquisition_cost_type: "marketing" | "sales" | "onboarding" | "referral"
      ad_platform: "meta" | "tiktok" | "google"
      agency_account_type: "Cash" | "Bank" | "MFS"
      announcement_type: "info" | "warning" | "maintenance"
      app_role: "admin" | "client" | "manager" | "platform_owner" | "affiliate"
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
      campaign_task_status: "pending" | "processing" | "completed" | "rejected"
      commission_type: "percentage" | "fixed_amount"
      dunning_action: "email" | "restrict" | "suspend" | "write_off"
      dunning_status: "active" | "recovered" | "exhausted" | "cancelled"
      email_send_status: "queued" | "sent" | "failed" | "bounced"
      email_trigger_type: "event" | "cron"
      expense_category:
        | "Rent"
        | "Salary"
        | "Software"
        | "Owner_Draw"
        | "Marketing"
        | "Other"
        | "Transfer_Fee"
      export_request_status:
        | "pending"
        | "processing"
        | "ready"
        | "downloaded"
        | "expired"
      gateway_txn_status: "initiated" | "success" | "failed" | "cancelled"
      invoice_status: "draft" | "sent" | "paid" | "overdue" | "void"
      legal_doc_type:
        | "tos"
        | "privacy_policy"
        | "dpa"
        | "sla_agreement"
        | "acceptable_use"
      metering_metric:
        | "api_calls"
        | "storage_mb"
        | "sync_runs"
        | "ad_accounts"
        | "clients"
        | "managers"
      notification_type: "payment" | "guard" | "campaign" | "system"
      org_plan: "starter" | "growth" | "agency_pro"
      org_status:
        | "active"
        | "suspended"
        | "trial"
        | "cancelled"
        | "pending_payment"
      payment_gateway_type: "sslcommerz" | "stripe" | "manual"
      payment_method: "Bank" | "bKash" | "Cash" | "Nagad"
      payment_request_status: "pending" | "approved" | "rejected"
      plan_change_status: "pending" | "completed" | "cancelled"
      referral_status: "pending" | "qualified" | "paid" | "expired"
      subscription_payment_status: "paid" | "pending" | "overdue" | "cancelled"
      support_priority_level: "standard" | "priority" | "dedicated"
      ticket_priority: "low" | "medium" | "high" | "urgent"
      ticket_status: "open" | "in_progress" | "waiting" | "resolved" | "closed"
      transaction_status: "pending_approval" | "completed" | "rejected"
      transaction_type: "credit" | "debit"
      withdrawal_category:
        | "personal_loan"
        | "business_loan"
        | "others_loan"
        | "advance"
        | "other"
      withdrawal_status: "active" | "partially_returned" | "fully_returned"
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
      acquisition_cost_type: ["marketing", "sales", "onboarding", "referral"],
      ad_platform: ["meta", "tiktok", "google"],
      agency_account_type: ["Cash", "Bank", "MFS"],
      announcement_type: ["info", "warning", "maintenance"],
      app_role: ["admin", "client", "manager", "platform_owner", "affiliate"],
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
      campaign_task_status: ["pending", "processing", "completed", "rejected"],
      commission_type: ["percentage", "fixed_amount"],
      dunning_action: ["email", "restrict", "suspend", "write_off"],
      dunning_status: ["active", "recovered", "exhausted", "cancelled"],
      email_send_status: ["queued", "sent", "failed", "bounced"],
      email_trigger_type: ["event", "cron"],
      expense_category: [
        "Rent",
        "Salary",
        "Software",
        "Owner_Draw",
        "Marketing",
        "Other",
        "Transfer_Fee",
      ],
      export_request_status: [
        "pending",
        "processing",
        "ready",
        "downloaded",
        "expired",
      ],
      gateway_txn_status: ["initiated", "success", "failed", "cancelled"],
      invoice_status: ["draft", "sent", "paid", "overdue", "void"],
      legal_doc_type: [
        "tos",
        "privacy_policy",
        "dpa",
        "sla_agreement",
        "acceptable_use",
      ],
      metering_metric: [
        "api_calls",
        "storage_mb",
        "sync_runs",
        "ad_accounts",
        "clients",
        "managers",
      ],
      notification_type: ["payment", "guard", "campaign", "system"],
      org_plan: ["starter", "growth", "agency_pro"],
      org_status: [
        "active",
        "suspended",
        "trial",
        "cancelled",
        "pending_payment",
      ],
      payment_gateway_type: ["sslcommerz", "stripe", "manual"],
      payment_method: ["Bank", "bKash", "Cash", "Nagad"],
      payment_request_status: ["pending", "approved", "rejected"],
      plan_change_status: ["pending", "completed", "cancelled"],
      referral_status: ["pending", "qualified", "paid", "expired"],
      subscription_payment_status: ["paid", "pending", "overdue", "cancelled"],
      support_priority_level: ["standard", "priority", "dedicated"],
      ticket_priority: ["low", "medium", "high", "urgent"],
      ticket_status: ["open", "in_progress", "waiting", "resolved", "closed"],
      transaction_status: ["pending_approval", "completed", "rejected"],
      transaction_type: ["credit", "debit"],
      withdrawal_category: [
        "personal_loan",
        "business_loan",
        "others_loan",
        "advance",
        "other",
      ],
      withdrawal_status: ["active", "partially_returned", "fully_returned"],
    },
  },
} as const
