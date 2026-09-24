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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_usage: {
        Row: {
          created_at: string
          exception_id: string | null
          feature: string
          id: string
          model: string
          period_id: string | null
          prompt_version: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          exception_id?: string | null
          feature: string
          id?: string
          model: string
          period_id?: string | null
          prompt_version: string
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          exception_id?: string | null
          feature?: string
          id?: string
          model?: string
          period_id?: string | null
          prompt_version?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "periods"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_source_files: {
        Row: {
          created_at: string
          format_id: string | null
          id: string
          original_name: string
          period_id: string
          platform: string
          sha256: string
          size_bytes: number
          source_kind: string
          storage_path: string
          user_id: string
        }
        Insert: {
          created_at?: string
          format_id?: string | null
          id?: string
          original_name: string
          period_id: string
          platform: string
          sha256: string
          size_bytes: number
          source_kind: string
          storage_path: string
          user_id: string
        }
        Update: {
          created_at?: string
          format_id?: string | null
          id?: string
          original_name?: string
          period_id?: string
          platform?: string
          sha256?: string
          size_bytes?: number
          source_kind?: string
          storage_path?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_source_files_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "periods"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_documents: {
        Row: {
          contract_id: string
          created_at: string
          id: string
          original_name: string
          sha256: string
          size_bytes: number
          storage_path: string
          user_id: string
          version_id: string
        }
        Insert: {
          contract_id: string
          created_at?: string
          id?: string
          original_name: string
          sha256: string
          size_bytes: number
          storage_path: string
          user_id: string
          version_id: string
        }
        Update: {
          contract_id?: string
          created_at?: string
          id?: string
          original_name?: string
          sha256?: string
          size_bytes?: number
          storage_path?: string
          user_id?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_documents_version_owner_fkey"
            columns: ["version_id", "contract_id", "user_id"]
            isOneToOne: false
            referencedRelation: "contract_versions"
            referencedColumns: ["id", "contract_id", "user_id"]
          },
        ]
      }
      contract_fee_rules: {
        Row: {
          contract_id: string
          created_at: string
          currency: string | null
          funding_source: string | null
          id: string
          notes: string | null
          numeric_value: number | null
          rule_key: string
          rule_type: string
          scope_key: string | null
          scope_type: string
          text_value: string | null
          updated_at: string
          user_id: string
          value_kind: string
          version_id: string
        }
        Insert: {
          contract_id: string
          created_at?: string
          currency?: string | null
          funding_source?: string | null
          id?: string
          notes?: string | null
          numeric_value?: number | null
          rule_key: string
          rule_type: string
          scope_key?: string | null
          scope_type?: string
          text_value?: string | null
          updated_at?: string
          user_id: string
          value_kind: string
          version_id: string
        }
        Update: {
          contract_id?: string
          created_at?: string
          currency?: string | null
          funding_source?: string | null
          id?: string
          notes?: string | null
          numeric_value?: number | null
          rule_key?: string
          rule_type?: string
          scope_key?: string | null
          scope_type?: string
          text_value?: string | null
          updated_at?: string
          user_id?: string
          value_kind?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_fee_rules_version_owner_fkey"
            columns: ["version_id", "contract_id", "user_id"]
            isOneToOne: false
            referencedRelation: "contract_versions"
            referencedColumns: ["id", "contract_id", "user_id"]
          },
        ]
      }
      contract_rule_events: {
        Row: {
          after_data: Json | null
          before_data: Json | null
          contract_id: string
          created_at: string
          entity_id: string
          entity_type: string
          event_type: string
          id: string
          user_id: string
        }
        Insert: {
          after_data?: Json | null
          before_data?: Json | null
          contract_id: string
          created_at?: string
          entity_id: string
          entity_type: string
          event_type: string
          id?: string
          user_id: string
        }
        Update: {
          after_data?: Json | null
          before_data?: Json | null
          contract_id?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          event_type?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      contract_versions: {
        Row: {
          approved_at: string | null
          contract_id: string
          created_at: string
          effective_from: string
          effective_to: string | null
          id: string
          source_note: string | null
          status: string
          updated_at: string
          user_id: string
          version_number: number
        }
        Insert: {
          approved_at?: string | null
          contract_id: string
          created_at?: string
          effective_from: string
          effective_to?: string | null
          id?: string
          source_note?: string | null
          status?: string
          updated_at?: string
          user_id: string
          version_number: number
        }
        Update: {
          approved_at?: string | null
          contract_id?: string
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          source_note?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "contract_versions_contract_owner_fkey"
            columns: ["contract_id", "user_id"]
            isOneToOne: false
            referencedRelation: "platform_contracts"
            referencedColumns: ["id", "user_id"]
          },
        ]
      }
      exception_events: {
        Row: {
          created_at: string
          event_source: string
          exception_id: string
          id: string
          note: string | null
          period_id: string
          recovered_amount: number
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_source?: string
          exception_id: string
          id?: string
          note?: string | null
          period_id: string
          recovered_amount?: number
          status: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_source?: string
          exception_id?: string
          id?: string
          note?: string | null
          period_id?: string
          recovered_amount?: number
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exception_events_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "periods"
            referencedColumns: ["id"]
          },
        ]
      }
      format_change_alerts: {
        Row: {
          created_at: string
          expected_format_id: string
          id: string
          missing_fields: Json
          observed_fields: Json
          original_name: string
          platform: string
          resolved_at: string | null
          sha256: string
          size_bytes: number
          source_kind: string
          source_name: string
          status: string
          storage_path: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expected_format_id: string
          id?: string
          missing_fields?: Json
          observed_fields?: Json
          original_name: string
          platform: string
          resolved_at?: string | null
          sha256: string
          size_bytes: number
          source_kind?: string
          source_name: string
          status?: string
          storage_path: string
          user_id: string
        }
        Update: {
          created_at?: string
          expected_format_id?: string
          id?: string
          missing_fields?: Json
          observed_fields?: Json
          original_name?: string
          platform?: string
          resolved_at?: string | null
          sha256?: string
          size_bytes?: number
          source_kind?: string
          source_name?: string
          status?: string
          storage_path?: string
          user_id?: string
        }
        Relationships: []
      }
      hungerstation_branch_mappings: {
        Row: {
          confirmed_at: string
          created_at: string
          hs_branch_id: string
          id: string
          invoice_branch_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          confirmed_at?: string
          created_at?: string
          hs_branch_id: string
          id?: string
          invoice_branch_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          confirmed_at?: string
          created_at?: string
          hs_branch_id?: string
          id?: string
          invoice_branch_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      periods: {
        Row: {
          branches: Json
          created_at: string
          daily: Json
          engine_version: string
          format_ids: Json
          id: string
          invoice: Json
          label: string
          lineage_id: string
          period_end: string | null
          period_start: string | null
          platform: string
          summary: Json
          superseded_at: string | null
          superseded_by: string | null
          supersedes_period_id: string | null
          user_id: string
        }
        Insert: {
          branches?: Json
          created_at?: string
          daily?: Json
          engine_version?: string
          format_ids?: Json
          id?: string
          invoice?: Json
          label: string
          lineage_id?: string
          period_end?: string | null
          period_start?: string | null
          platform: string
          summary?: Json
          superseded_at?: string | null
          superseded_by?: string | null
          supersedes_period_id?: string | null
          user_id: string
        }
        Update: {
          branches?: Json
          created_at?: string
          daily?: Json
          engine_version?: string
          format_ids?: Json
          id?: string
          invoice?: Json
          label?: string
          lineage_id?: string
          period_end?: string | null
          period_start?: string | null
          platform?: string
          summary?: Json
          superseded_at?: string | null
          superseded_by?: string | null
          supersedes_period_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "periods_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "periods_supersedes_period_id_fkey"
            columns: ["supersedes_period_id"]
            isOneToOne: false
            referencedRelation: "periods"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_contracts: {
        Row: {
          archived_at: string | null
          counterparty: string | null
          created_at: string
          external_reference: string | null
          id: string
          name: string
          platform: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          counterparty?: string | null
          created_at?: string
          external_reference?: string | null
          id?: string
          name: string
          platform: string
          updated_at?: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          counterparty?: string | null
          created_at?: string
          external_reference?: string | null
          id?: string
          name?: string
          platform?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      promotion_audits: {
        Row: {
          advertising_spend: number
          campaign_revenue: number
          cogs_amount: number
          commission_fees: number
          created_at: string
          delivery_campaign_fees: number
          id: string
          name: string
          notes: string | null
          organic_baseline: number
          other_marketplace_fees: number
          payment_fees: number
          period_id: string
          platform_funded_discount: number
          platform_roas: number | null
          restaurant_funded_discount: number
          unknown_funded_discount: number
          updated_at: string
          user_id: string
        }
        Insert: {
          advertising_spend?: number
          campaign_revenue: number
          cogs_amount?: number
          commission_fees?: number
          created_at?: string
          delivery_campaign_fees?: number
          id?: string
          name: string
          notes?: string | null
          organic_baseline: number
          other_marketplace_fees?: number
          payment_fees?: number
          period_id: string
          platform_funded_discount?: number
          platform_roas?: number | null
          restaurant_funded_discount?: number
          unknown_funded_discount?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          advertising_spend?: number
          campaign_revenue?: number
          cogs_amount?: number
          commission_fees?: number
          created_at?: string
          delivery_campaign_fees?: number
          id?: string
          name?: string
          notes?: string | null
          organic_baseline?: number
          other_marketplace_fees?: number
          payment_fees?: number
          period_id?: string
          platform_funded_discount?: number
          platform_roas?: number | null
          restaurant_funded_discount?: number
          unknown_funded_discount?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotion_audits_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "periods"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      recovery_case_details: {
        Row: {
          accepted_amount: number | null
          approved_claim_amount: number | null
          created_at: string
          exception_id: string
          id: string
          lineage_id: string
          platform_case_reference: string | null
          recovered_on: string | null
          response_on: string | null
          source_period_id: string
          submitted_amount: number | null
          submitted_on: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          accepted_amount?: number | null
          approved_claim_amount?: number | null
          created_at?: string
          exception_id: string
          id?: string
          lineage_id: string
          platform_case_reference?: string | null
          recovered_on?: string | null
          response_on?: string | null
          source_period_id: string
          submitted_amount?: number | null
          submitted_on?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          accepted_amount?: number | null
          approved_claim_amount?: number | null
          created_at?: string
          exception_id?: string
          id?: string
          lineage_id?: string
          platform_case_reference?: string | null
          recovered_on?: string | null
          response_on?: string | null
          source_period_id?: string
          submitted_amount?: number | null
          submitted_on?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recovery_case_details_source_period_id_fkey"
            columns: ["source_period_id"]
            isOneToOne: false
            referencedRelation: "periods"
            referencedColumns: ["id"]
          },
        ]
      }
      recovery_case_documents: {
        Row: {
          created_at: string
          exception_id: string
          id: string
          lineage_id: string
          original_name: string
          recovery_case_id: string
          sha256: string
          size_bytes: number
          storage_path: string
          user_id: string
        }
        Insert: {
          created_at?: string
          exception_id: string
          id?: string
          lineage_id: string
          original_name: string
          recovery_case_id: string
          sha256: string
          size_bytes: number
          storage_path: string
          user_id: string
        }
        Update: {
          created_at?: string
          exception_id?: string
          id?: string
          lineage_id?: string
          original_name?: string
          recovery_case_id?: string
          sha256?: string
          size_bytes?: number
          storage_path?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recovery_case_documents_recovery_case_id_fkey"
            columns: ["recovery_case_id"]
            isOneToOne: false
            referencedRelation: "recovery_case_details"
            referencedColumns: ["id"]
          },
        ]
      }
      recovery_case_events: {
        Row: {
          after_data: Json | null
          before_data: Json | null
          created_at: string
          event_type: string
          exception_id: string
          id: string
          lineage_id: string
          recovery_case_id: string
          user_id: string
        }
        Insert: {
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          event_type: string
          exception_id: string
          id?: string
          lineage_id: string
          recovery_case_id: string
          user_id: string
        }
        Update: {
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          event_type?: string
          exception_id?: string
          id?: string
          lineage_id?: string
          recovery_case_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recovery_case_events_recovery_case_id_fkey"
            columns: ["recovery_case_id"]
            isOneToOne: false
            referencedRelation: "recovery_case_details"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_period_reanalysis: {
        Args: {
          p_branches: Json
          p_daily: Json
          p_engine_version: string
          p_format_ids: Json
          p_invoice: Json
          p_old_period_id: string
          p_summary: Json
        }
        Returns: string
      }
      reserve_ai_call: {
        Args: {
          p_exception_id: string
          p_feature: string
          p_limit: number
          p_model: string
          p_period_id: string
          p_prompt_version: string
        }
        Returns: string
      }
      rollback_period_reanalysis: {
        Args: { p_new_period_id: string; p_old_period_id: string }
        Returns: undefined
      }
      set_exception_workflow: {
        Args: { p_exception_id: string; p_patch: Json; p_period_id: string }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
