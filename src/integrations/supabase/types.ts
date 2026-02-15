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
      ad_accounts: {
        Row: {
          account_currency: Database["public"]["Enums"]["account_currency"]
          ad_account_id: string
          api_integration_id: string | null
          client_id: string
          created_at: string
          id: string
          is_active: boolean
          platform_name: Database["public"]["Enums"]["ad_platform"]
        }
        Insert: {
          account_currency?: Database["public"]["Enums"]["account_currency"]
          ad_account_id: string
          api_integration_id?: string | null
          client_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          platform_name: Database["public"]["Enums"]["ad_platform"]
        }
        Update: {
          account_currency?: Database["public"]["Enums"]["account_currency"]
          ad_account_id?: string
          api_integration_id?: string | null
          client_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          platform_name?: Database["public"]["Enums"]["ad_platform"]
        }
        Relationships: [
          {
            foreignKeyName: "ad_accounts_api_integration_id_fkey"
            columns: ["api_integration_id"]
            isOneToOne: false
            referencedRelation: "api_integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      api_integrations: {
        Row: {
          api_token: string
          app_id: string
          created_at: string
          id: string
          instance_name: string | null
          is_active: boolean
          last_synced_at: string | null
          platform: Database["public"]["Enums"]["ad_platform"]
          updated_by: string | null
        }
        Insert: {
          api_token?: string
          app_id?: string
          created_at?: string
          id?: string
          instance_name?: string | null
          is_active?: boolean
          last_synced_at?: string | null
          platform: Database["public"]["Enums"]["ad_platform"]
          updated_by?: string | null
        }
        Update: {
          api_token?: string
          app_id?: string
          created_at?: string
          id?: string
          instance_name?: string | null
          is_active?: boolean
          last_synced_at?: string | null
          platform?: Database["public"]["Enums"]["ad_platform"]
          updated_by?: string | null
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action_type: string
          created_at: string
          description: string
          id: string
          ip_address: string | null
          user_id: string
        }
        Insert: {
          action_type: string
          created_at?: string
          description: string
          id?: string
          ip_address?: string | null
          user_id: string
        }
        Update: {
          action_type?: string
          created_at?: string
          description?: string
          id?: string
          ip_address?: string | null
          user_id?: string
        }
        Relationships: []
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
      profiles: {
        Row: {
          business_name: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          manager_id: string | null
          mapping_keyword: string | null
          phone: string | null
          user_id: string
        }
        Insert: {
          business_name?: string | null
          created_at?: string
          email: string
          full_name: string
          id?: string
          manager_id?: string | null
          mapping_keyword?: string | null
          phone?: string | null
          user_id: string
        }
        Update: {
          business_name?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          manager_id?: string | null
          mapping_keyword?: string | null
          phone?: string | null
          user_id?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          id: string
          key: string
          updated_at: string
          updated_by: string | null
          value: string
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value: string
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: string
        }
        Relationships: []
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
          platform?: Database["public"]["Enums"]["ad_platform"] | null
          status?: Database["public"]["Enums"]["transaction_status"]
          type?: Database["public"]["Enums"]["transaction_type"]
        }
        Relationships: []
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
      app_role: "admin" | "client" | "manager"
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
      app_role: ["admin", "client", "manager"],
      transaction_status: ["pending_approval", "completed", "rejected"],
      transaction_type: ["credit", "debit"],
    },
  },
} as const
