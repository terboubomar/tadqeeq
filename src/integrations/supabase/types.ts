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
      ads_roi_analyses: {
        Row: {
          created_at: string
          created_by: string | null
          date_from: string
          date_to: string
          gmv: number
          id: string
          orders: Json | null
          orders_file_name: string | null
          platform: string
          report: Json
          source_file_name: string | null
          spent: number
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date_from: string
          date_to: string
          gmv?: number
          id?: string
          orders?: Json | null
          orders_file_name?: string | null
          platform?: string
          report: Json
          source_file_name?: string | null
          spent?: number
          updated_at?: string
          user_id: string
          workspace_id?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date_from?: string
          date_to?: string
          gmv?: number
          id?: string
          orders?: Json | null
          orders_file_name?: string | null
          platform?: string
          report?: Json
          source_file_name?: string | null
          spent?: number
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ads_roi_analyses_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ads_roi_analyses_workspace_owner_fkey"
            columns: ["workspace_id", "user_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "owner_user_id"]
          },
        ]
      }
      ads_roi_brand_settings: {
        Row: {
          brand_key: string
          commission_rate: number | null
          food_cost_rate: number | null
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          brand_key: string
          commission_rate?: number | null
          food_cost_rate?: number | null
          updated_at?: string
          user_id: string
          workspace_id?: string
        }
        Update: {
          brand_key?: string
          commission_rate?: number | null
          food_cost_rate?: number | null
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ads_roi_brand_settings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ads_roi_brand_settings_workspace_owner_fkey"
            columns: ["workspace_id", "user_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "owner_user_id"]
          },
        ]
      }
      ai_usage: {
        Row: {
          actor_user_id: string | null
          created_at: string
          exception_id: string | null
          feature: string
          id: string
          model: string
          period_id: string | null
          prompt_version: string
          status: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          exception_id?: string | null
          feature: string
          id?: string
          model: string
          period_id?: string | null
          prompt_version: string
          status?: string
          user_id: string
          workspace_id?: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          exception_id?: string | null
          feature?: string
          id?: string
          model?: string
          period_id?: string | null
          prompt_version?: string
          status?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_workspace_owner_fkey"
            columns: ["workspace_id", "user_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "owner_user_id"]
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
          workspace_id: string
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
          workspace_id?: string
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
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_source_files_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_source_files_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_source_files_workspace_owner_fkey"
            columns: ["workspace_id", "user_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "owner_user_id"]
          },
        ]
      }
      branch_registry: {
        Row: {
          active: boolean
          created_at: string
          hungerstation_id: string | null
          id: string
          jahez_id: string | null
          keeta_id: string | null
          name: string
          ninja_id: string | null
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          hungerstation_id?: string | null
          id?: string
          jahez_id?: string | null
          keeta_id?: string | null
          name: string
          ninja_id?: string | null
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          hungerstation_id?: string | null
          id?: string
          jahez_id?: string | null
          keeta_id?: string | null
          name?: string
          ninja_id?: string | null
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "branch_registry_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_registry_workspace_owner_fkey"
            columns: ["workspace_id", "user_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "owner_user_id"]
          },
        ]
      }
      client_notes: {
        Row: {
          author_email: string | null
          author_user_id: string | null
          body: string
          created_at: string
          id: string
          workspace_id: string
        }
        Insert: {
          author_email?: string | null
          author_user_id?: string | null
          body: string
          created_at?: string
          id?: string
          workspace_id: string
        }
        Update: {
          author_email?: string | null
          author_user_id?: string | null
          body?: string
          created_at?: string
          id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_notes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      compensation_appeal_marks: {
        Row: {
          branch_id: string | null
          order_number: string
          submitted_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          branch_id?: string | null
          order_number: string
          submitted_at?: string
          user_id?: string
          workspace_id?: string
        }
        Update: {
          branch_id?: string | null
          order_number?: string
          submitted_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "compensation_appeal_marks_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branch_registry"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compensation_appeal_marks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compensation_appeal_marks_workspace_owner_fkey"
            columns: ["workspace_id", "user_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "owner_user_id"]
          },
        ]
      }
      compensation_cases: {
        Row: {
          aggregator_case_reference: string | null
          audit_context: Json
          branch_id: string | null
          branch_name: string | null
          compensation_amount: number
          compensation_reason: string
          created_at: string
          draft_ar: string
          draft_en: string
          employee_explanation: string
          evidence_id: string | null
          id: string
          order_number: string
          period_id: string | null
          platform: string
          status: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          aggregator_case_reference?: string | null
          audit_context?: Json
          branch_id?: string | null
          branch_name?: string | null
          compensation_amount?: number
          compensation_reason: string
          created_at?: string
          draft_ar: string
          draft_en: string
          employee_explanation: string
          evidence_id?: string | null
          id?: string
          order_number: string
          period_id?: string | null
          platform: string
          status?: string
          updated_at?: string
          user_id: string
          workspace_id?: string
        }
        Update: {
          aggregator_case_reference?: string | null
          audit_context?: Json
          branch_id?: string | null
          branch_name?: string | null
          compensation_amount?: number
          compensation_reason?: string
          created_at?: string
          draft_ar?: string
          draft_en?: string
          employee_explanation?: string
          evidence_id?: string | null
          id?: string
          order_number?: string
          period_id?: string | null
          platform?: string
          status?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "compensation_cases_branch_workspace_fkey"
            columns: ["branch_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "branch_registry"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "compensation_cases_evidence_owner_fkey"
            columns: ["evidence_id", "user_id"]
            isOneToOne: false
            referencedRelation: "telegram_order_evidence"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "compensation_cases_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compensation_cases_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compensation_cases_workspace_owner_fkey"
            columns: ["workspace_id", "user_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "owner_user_id"]
          },
        ]
      }
      contact_messages: {
        Row: {
          company: string | null
          created_at: string
          email: string
          handled_at: string | null
          handled_by: string | null
          id: string
          ip_hash: string | null
          message: string
          mobile: string
          name: string
          status: string
          topic: string
        }
        Insert: {
          company?: string | null
          created_at?: string
          email: string
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          ip_hash?: string | null
          message: string
          mobile: string
          name: string
          status?: string
          topic: string
        }
        Update: {
          company?: string | null
          created_at?: string
          email?: string
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          ip_hash?: string | null
          message?: string
          mobile?: string
          name?: string
          status?: string
          topic?: string
        }
        Relationships: []
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
          workspace_id: string
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
          workspace_id?: string
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
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_documents_version_owner_fkey"
            columns: ["version_id", "contract_id", "user_id"]
            isOneToOne: false
            referencedRelation: "contract_versions"
            referencedColumns: ["id", "contract_id", "user_id"]
          },
          {
            foreignKeyName: "contract_documents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_documents_workspace_owner_fkey"
            columns: ["workspace_id", "user_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "owner_user_id"]
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
          workspace_id: string
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
          workspace_id?: string
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
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_fee_rules_version_owner_fkey"
            columns: ["version_id", "contract_id", "user_id"]
            isOneToOne: false
            referencedRelation: "contract_versions"
            referencedColumns: ["id", "contract_id", "user_id"]
          },
          {
            foreignKeyName: "contract_fee_rules_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_fee_rules_workspace_owner_fkey"
            columns: ["workspace_id", "user_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "owner_user_id"]
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
          workspace_id: string
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
          workspace_id?: string
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
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_rule_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_rule_events_workspace_owner_fkey"
            columns: ["workspace_id", "user_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "owner_user_id"]
          },
        ]
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
          workspace_id: string
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
          workspace_id?: string
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
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_versions_contract_owner_fkey"
            columns: ["contract_id", "user_id"]
            isOneToOne: false
            referencedRelation: "platform_contracts"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "contract_versions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_versions_workspace_owner_fkey"
            columns: ["workspace_id", "user_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "owner_user_id"]
          },
        ]
      }
      email_signin_codes: {
        Row: {
          attempts: number
          code_hash: string | null
          created_at: string
          expires_at: string | null
          last_sent_at: string | null
          sends: number
          session_id: string
          user_id: string
          verified_at: string | null
        }
        Insert: {
          attempts?: number
          code_hash?: string | null
          created_at?: string
          expires_at?: string | null
          last_sent_at?: string | null
          sends?: number
          session_id: string
          user_id: string
          verified_at?: string | null
        }
        Update: {
          attempts?: number
          code_hash?: string | null
          created_at?: string
          expires_at?: string | null
          last_sent_at?: string | null
          sends?: number
          session_id?: string
          user_id?: string
          verified_at?: string | null
        }
        Relationships: []
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
          workspace_id: string
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
          workspace_id?: string
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
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exception_events_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exception_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exception_events_workspace_owner_fkey"
            columns: ["workspace_id", "user_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "owner_user_id"]
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
          workspace_id: string
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
          workspace_id?: string
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
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "format_change_alerts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "format_change_alerts_workspace_owner_fkey"
            columns: ["workspace_id", "user_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "owner_user_id"]
          },
        ]
      }
      format_column_aliases: {
        Row: {
          canonical: string
          created_at: string
          created_by: string | null
          observed: string
          platform: string
          source: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          canonical: string
          created_at?: string
          created_by?: string | null
          observed: string
          platform: string
          source: string
          user_id: string
          workspace_id?: string
        }
        Update: {
          canonical?: string
          created_at?: string
          created_by?: string | null
          observed?: string
          platform?: string
          source?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "format_column_aliases_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "format_column_aliases_workspace_owner_fkey"
            columns: ["workspace_id", "user_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "owner_user_id"]
          },
        ]
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
          workspace_id: string
        }
        Insert: {
          confirmed_at?: string
          created_at?: string
          hs_branch_id: string
          id?: string
          invoice_branch_name: string
          updated_at?: string
          user_id: string
          workspace_id?: string
        }
        Update: {
          confirmed_at?: string
          created_at?: string
          hs_branch_id?: string
          id?: string
          invoice_branch_name?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hungerstation_branch_mappings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hungerstation_branch_mappings_workspace_owner_fkey"
            columns: ["workspace_id", "user_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "owner_user_id"]
          },
        ]
      }
      journal_account_settings: {
        Row: {
          account_code: string
          account_key: string
          account_name: string
          updated_at: string
          updated_by: string | null
          user_id: string
          workspace_id: string
        }
        Insert: {
          account_code?: string
          account_key: string
          account_name?: string
          updated_at?: string
          updated_by?: string | null
          user_id: string
          workspace_id?: string
        }
        Update: {
          account_code?: string
          account_key?: string
          account_name?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_account_settings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_account_settings_workspace_owner_fkey"
            columns: ["workspace_id", "user_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "owner_user_id"]
          },
        ]
      }
      mcp_audit_requests: {
        Row: {
          bank_fee_pct: number | null
          completed_at: string | null
          created_at: string
          expires_at: string
          id: string
          label: string | null
          period_id: string | null
          platform: string
          status: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          bank_fee_pct?: number | null
          completed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          label?: string | null
          period_id?: string | null
          platform: string
          status?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          bank_fee_pct?: number | null
          completed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          label?: string | null
          period_id?: string | null
          platform?: string
          status?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcp_audit_requests_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mcp_audit_requests_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      operation_adjustments: {
        Row: {
          amount: number
          branch_name: string | null
          business_date: string
          comment: string | null
          fingerprint: string
          order_id: string
          platform: string
          raw_data: Json
          reason: string | null
          source_import_id: string
          transaction_type: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          amount: number
          branch_name?: string | null
          business_date: string
          comment?: string | null
          fingerprint: string
          order_id: string
          platform?: string
          raw_data: Json
          reason?: string | null
          source_import_id: string
          transaction_type: string
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          amount?: number
          branch_name?: string | null
          business_date?: string
          comment?: string | null
          fingerprint?: string
          order_id?: string
          platform?: string
          raw_data?: Json
          reason?: string | null
          source_import_id?: string
          transaction_type?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "operation_adjustments_source_import_id_fkey"
            columns: ["source_import_id"]
            isOneToOne: false
            referencedRelation: "operation_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_adjustments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_adjustments_workspace_owner_fkey"
            columns: ["workspace_id", "user_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "owner_user_id"]
          },
        ]
      }
      operation_imports: {
        Row: {
          business_date: string
          created_at: string
          created_by: string | null
          id: string
          original_name: string
          platform: string
          row_count: number
          sha256: string
          source_kind: string
          summary: Json
          user_id: string
          workspace_id: string
        }
        Insert: {
          business_date: string
          created_at?: string
          created_by?: string | null
          id?: string
          original_name: string
          platform: string
          row_count: number
          sha256: string
          source_kind: string
          summary: Json
          user_id: string
          workspace_id?: string
        }
        Update: {
          business_date?: string
          created_at?: string
          created_by?: string | null
          id?: string
          original_name?: string
          platform?: string
          row_count?: number
          sha256?: string
          source_kind?: string
          summary?: Json
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "operation_imports_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_imports_workspace_owner_fkey"
            columns: ["workspace_id", "user_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "owner_user_id"]
          },
        ]
      }
      operation_orders: {
        Row: {
          branch_id: string | null
          branch_name: string | null
          business_date: string
          charges_total: number
          complaint: boolean
          complaint_reason: string | null
          delivery_amount: number
          delivery_mode: string | null
          gross_sales: number
          order_id: string
          platform: string
          raw_data: Json
          refund_amount: number | null
          refund_type: string | null
          settlement_amount: number
          source_import_id: string
          status: string | null
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          branch_id?: string | null
          branch_name?: string | null
          business_date: string
          charges_total?: number
          complaint?: boolean
          complaint_reason?: string | null
          delivery_amount?: number
          delivery_mode?: string | null
          gross_sales?: number
          order_id: string
          platform: string
          raw_data: Json
          refund_amount?: number | null
          refund_type?: string | null
          settlement_amount?: number
          source_import_id: string
          status?: string | null
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          branch_id?: string | null
          branch_name?: string | null
          business_date?: string
          charges_total?: number
          complaint?: boolean
          complaint_reason?: string | null
          delivery_amount?: number
          delivery_mode?: string | null
          gross_sales?: number
          order_id?: string
          platform?: string
          raw_data?: Json
          refund_amount?: number | null
          refund_type?: string | null
          settlement_amount?: number
          source_import_id?: string
          status?: string | null
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "operation_orders_source_import_id_fkey"
            columns: ["source_import_id"]
            isOneToOne: false
            referencedRelation: "operation_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_orders_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_orders_workspace_owner_fkey"
            columns: ["workspace_id", "user_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "owner_user_id"]
          },
        ]
      }
      ops_audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_user_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json
          workspace_id: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json
          workspace_id?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json
          workspace_id?: string | null
        }
        Relationships: []
      }
      ops_staff: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          method: string
          notes: string | null
          paid_on: string
          receipt_path: string | null
          recorded_by: string | null
          reference: string | null
          subscription_id: string | null
          workspace_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          method?: string
          notes?: string | null
          paid_on?: string
          receipt_path?: string | null
          recorded_by?: string | null
          reference?: string | null
          subscription_id?: string | null
          workspace_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          method?: string
          notes?: string | null
          paid_on?: string
          receipt_path?: string | null
          recorded_by?: string | null
          reference?: string | null
          subscription_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
          workspace_id: string
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
          workspace_id?: string
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
          workspace_id?: string
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
          {
            foreignKeyName: "periods_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "periods_workspace_owner_fkey"
            columns: ["workspace_id", "user_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "owner_user_id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      platform_column_snapshots: {
        Row: {
          columns: Json
          platform: string
          source: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          columns?: Json
          platform: string
          source: string
          updated_at?: string
          user_id: string
          workspace_id?: string
        }
        Update: {
          columns?: Json
          platform?: string
          source?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_column_snapshots_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_column_snapshots_workspace_owner_fkey"
            columns: ["workspace_id", "user_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "owner_user_id"]
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
          workspace_id: string
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
          workspace_id?: string
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
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_contracts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_contracts_workspace_owner_fkey"
            columns: ["workspace_id", "user_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "owner_user_id"]
          },
        ]
      }
      profiles: {
        Row: {
          active_workspace_id: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          active_workspace_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          active_workspace_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_active_workspace_id_fkey"
            columns: ["active_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
          workspace_id: string
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
          workspace_id?: string
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
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotion_audits_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_audits_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_audits_workspace_owner_fkey"
            columns: ["workspace_id", "user_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "owner_user_id"]
          },
        ]
      }
      recovery_case_details: {
        Row: {
          accepted_amount: number | null
          approved_claim_amount: number | null
          branch_id: string | null
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
          workspace_id: string
        }
        Insert: {
          accepted_amount?: number | null
          approved_claim_amount?: number | null
          branch_id?: string | null
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
          workspace_id?: string
        }
        Update: {
          accepted_amount?: number | null
          approved_claim_amount?: number | null
          branch_id?: string | null
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
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recovery_case_details_branch_workspace_fkey"
            columns: ["branch_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "branch_registry"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "recovery_case_details_source_period_id_fkey"
            columns: ["source_period_id"]
            isOneToOne: false
            referencedRelation: "periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recovery_case_details_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recovery_case_details_workspace_owner_fkey"
            columns: ["workspace_id", "user_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "owner_user_id"]
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
          workspace_id: string
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
          workspace_id?: string
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
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recovery_case_documents_recovery_case_id_fkey"
            columns: ["recovery_case_id"]
            isOneToOne: false
            referencedRelation: "recovery_case_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recovery_case_documents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recovery_case_documents_workspace_owner_fkey"
            columns: ["workspace_id", "user_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "owner_user_id"]
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
          workspace_id: string
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
          workspace_id?: string
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
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recovery_case_events_recovery_case_id_fkey"
            columns: ["recovery_case_id"]
            isOneToOne: false
            referencedRelation: "recovery_case_details"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recovery_case_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recovery_case_events_workspace_owner_fkey"
            columns: ["workspace_id", "user_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "owner_user_id"]
          },
        ]
      }
      smart_watch_acceptances: {
        Row: {
          accepted_rate: number
          branch_key: string
          branch_name: string | null
          created_at: string
          created_by: string | null
          metric: string
          period_id: string | null
          platform: string
          typical_rate: number | null
          user_id: string
          workspace_id: string
        }
        Insert: {
          accepted_rate: number
          branch_key: string
          branch_name?: string | null
          created_at?: string
          created_by?: string | null
          metric: string
          period_id?: string | null
          platform: string
          typical_rate?: number | null
          user_id: string
          workspace_id?: string
        }
        Update: {
          accepted_rate?: number
          branch_key?: string
          branch_name?: string | null
          created_at?: string
          created_by?: string | null
          metric?: string
          period_id?: string | null
          platform?: string
          typical_rate?: number | null
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "smart_watch_acceptances_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "smart_watch_acceptances_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "smart_watch_acceptances_workspace_owner_fkey"
            columns: ["workspace_id", "user_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "owner_user_id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          active: boolean
          code: string | null
          created_at: string
          custom_price: boolean
          cycle: string
          description: string | null
          features: Json
          highlighted: boolean
          id: string
          name: string
          order_limit: number | null
          price: number
          price_yearly: number | null
          pricing: string
          sort_order: number
          upload_limit: number | null
          workspace_limit: number | null
        }
        Insert: {
          active?: boolean
          code?: string | null
          created_at?: string
          custom_price?: boolean
          cycle?: string
          description?: string | null
          features?: Json
          highlighted?: boolean
          id?: string
          name: string
          order_limit?: number | null
          price?: number
          price_yearly?: number | null
          pricing?: string
          sort_order?: number
          upload_limit?: number | null
          workspace_limit?: number | null
        }
        Update: {
          active?: boolean
          code?: string | null
          created_at?: string
          custom_price?: boolean
          cycle?: string
          description?: string | null
          features?: Json
          highlighted?: boolean
          id?: string
          name?: string
          order_limit?: number | null
          price?: number
          price_yearly?: number | null
          pricing?: string
          sort_order?: number
          upload_limit?: number | null
          workspace_limit?: number | null
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          addons: Json
          branch_count: number
          created_at: string
          cycle: string
          ends_on: string | null
          id: string
          notes: string | null
          plan_id: string | null
          price: number
          starts_on: string
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          addons?: Json
          branch_count?: number
          created_at?: string
          cycle?: string
          ends_on?: string | null
          id?: string
          notes?: string | null
          plan_id?: string | null
          price?: number
          starts_on?: string
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          addons?: Json
          branch_count?: number
          created_at?: string
          cycle?: string
          ends_on?: string | null
          id?: string
          notes?: string | null
          plan_id?: string | null
          price?: number
          starts_on?: string
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_branch_chats: {
        Row: {
          active: boolean
          branch_id: string
          branch_key: string
          branch_name: string
          connect_code_expires_at: string | null
          connect_code_hash: string | null
          connected_at: string | null
          created_at: string
          id: string
          last_message_at: string | null
          telegram_chat_id: number | null
          telegram_chat_title: string | null
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          active?: boolean
          branch_id: string
          branch_key: string
          branch_name: string
          connect_code_expires_at?: string | null
          connect_code_hash?: string | null
          connected_at?: string | null
          created_at?: string
          id?: string
          last_message_at?: string | null
          telegram_chat_id?: number | null
          telegram_chat_title?: string | null
          updated_at?: string
          user_id: string
          workspace_id?: string
        }
        Update: {
          active?: boolean
          branch_id?: string
          branch_key?: string
          branch_name?: string
          connect_code_expires_at?: string | null
          connect_code_hash?: string | null
          connected_at?: string | null
          created_at?: string
          id?: string
          last_message_at?: string | null
          telegram_chat_id?: number | null
          telegram_chat_title?: string | null
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_branch_chats_branch_workspace_fkey"
            columns: ["branch_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "branch_registry"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "telegram_branch_chats_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_branch_chats_workspace_owner_fkey"
            columns: ["workspace_id", "user_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "owner_user_id"]
          },
        ]
      }
      telegram_order_evidence: {
        Row: {
          branch_chat_id: string
          branch_id: string
          caption: string | null
          captured_at: string
          created_at: string
          duration_seconds: number | null
          file_size_bytes: number | null
          id: string
          media_type: string
          order_lookup_key: string
          order_number: string
          sender_name: string | null
          sender_telegram_id: number | null
          telegram_chat_id: number
          telegram_file_id: string
          telegram_file_unique_id: string
          telegram_message_id: number
          thumbnail_file_id: string | null
          thumbnail_storage_path: string | null
          user_id: string
          workspace_id: string
        }
        Insert: {
          branch_chat_id: string
          branch_id: string
          caption?: string | null
          captured_at: string
          created_at?: string
          duration_seconds?: number | null
          file_size_bytes?: number | null
          id?: string
          media_type: string
          order_lookup_key: string
          order_number: string
          sender_name?: string | null
          sender_telegram_id?: number | null
          telegram_chat_id: number
          telegram_file_id: string
          telegram_file_unique_id: string
          telegram_message_id: number
          thumbnail_file_id?: string | null
          thumbnail_storage_path?: string | null
          user_id: string
          workspace_id?: string
        }
        Update: {
          branch_chat_id?: string
          branch_id?: string
          caption?: string | null
          captured_at?: string
          created_at?: string
          duration_seconds?: number | null
          file_size_bytes?: number | null
          id?: string
          media_type?: string
          order_lookup_key?: string
          order_number?: string
          sender_name?: string | null
          sender_telegram_id?: number | null
          telegram_chat_id?: number
          telegram_file_id?: string
          telegram_file_unique_id?: string
          telegram_message_id?: number
          thumbnail_file_id?: string | null
          thumbnail_storage_path?: string | null
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "telegram_order_evidence_branch_owner_fkey"
            columns: ["branch_chat_id", "user_id"]
            isOneToOne: false
            referencedRelation: "telegram_branch_chats"
            referencedColumns: ["id", "user_id"]
          },
          {
            foreignKeyName: "telegram_order_evidence_branch_workspace_fkey"
            columns: ["branch_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "branch_registry"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "telegram_order_evidence_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "telegram_order_evidence_workspace_owner_fkey"
            columns: ["workspace_id", "user_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id", "owner_user_id"]
          },
        ]
      }
      workspace_audit_events: {
        Row: {
          actor_user_id: string
          created_at: string
          entity_id: string | null
          entity_type: string
          event_type: string
          id: string
          metadata: Json
          workspace_id: string
        }
        Insert: {
          actor_user_id: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          event_type: string
          id?: string
          metadata?: Json
          workspace_id: string
        }
        Update: {
          actor_user_id?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          event_type?: string
          id?: string
          metadata?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_audit_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_member_branches: {
        Row: {
          branch_id: string
          created_at: string
          workspace_id: string
          workspace_member_id: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          workspace_id: string
          workspace_member_id: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          workspace_id?: string
          workspace_member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_member_branches_branch_id_workspace_id_fkey"
            columns: ["branch_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "branch_registry"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "workspace_member_branches_workspace_member_id_workspace_id_fkey"
            columns: ["workspace_member_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "workspace_members"
            referencedColumns: ["id", "workspace_id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          id: string
          invited_by: string | null
          joined_at: string | null
          role: string
          status: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_by?: string | null
          joined_at?: string | null
          role: string
          status?: string
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_by?: string | null
          joined_at?: string | null
          role?: string
          status?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_onboarding: {
        Row: {
          activated_at: string | null
          admin_note: string | null
          branch_count: number | null
          brand_name: string | null
          contact_email: string | null
          contact_mobile: string | null
          contact_name: string | null
          contact_national_id: string | null
          cr_number: string | null
          created_at: string
          legal_name: string | null
          logo_path: string | null
          meeting_at: string | null
          meeting_note: string | null
          paid_at: string | null
          status: string
          submitted_at: string | null
          updated_at: string
          vat_number: string | null
          workspace_id: string
        }
        Insert: {
          activated_at?: string | null
          admin_note?: string | null
          branch_count?: number | null
          brand_name?: string | null
          contact_email?: string | null
          contact_mobile?: string | null
          contact_name?: string | null
          contact_national_id?: string | null
          cr_number?: string | null
          created_at?: string
          legal_name?: string | null
          logo_path?: string | null
          meeting_at?: string | null
          meeting_note?: string | null
          paid_at?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          vat_number?: string | null
          workspace_id: string
        }
        Update: {
          activated_at?: string | null
          admin_note?: string | null
          branch_count?: number | null
          brand_name?: string | null
          contact_email?: string | null
          contact_mobile?: string | null
          contact_name?: string | null
          contact_national_id?: string | null
          cr_number?: string | null
          created_at?: string
          legal_name?: string | null
          logo_path?: string | null
          meeting_at?: string | null
          meeting_note?: string | null
          paid_at?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          vat_number?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_onboarding_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_user_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_user_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_user_id?: string
          updated_at?: string
        }
        Relationships: []
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
      ensure_my_workspace: { Args: never; Returns: string }
      import_operation_snapshot: {
        Args: {
          p_adjustments: Json
          p_business_date: string
          p_orders: Json
          p_original_name: string
          p_platform: string
          p_sha256: string
          p_source_kind: string
          p_summary: Json
        }
        Returns: Json
      }
      is_platform_admin: { Args: never; Returns: boolean }
      mcp_access: { Args: never; Returns: Json }
      mcp_complete_audit_request: {
        Args: { p_period_id: string; p_request_id: string }
        Returns: boolean
      }
      mcp_create_audit_request: {
        Args: { p_bank_fee_pct: number; p_label: string; p_platform: string }
        Returns: string
      }
      my_workspace_plan: { Args: { p_workspace_id: string }; Returns: Json }
      create_account_workspace: { Args: { p_name: string }; Returns: string }
      switch_my_workspace: { Args: { p_workspace_id: string }; Returns: string }
      ops_role: { Args: never; Returns: string }
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
