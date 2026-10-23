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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      advances: {
        Row: {
          account_id: string | null
          advance_date: string
          amount: number
          business_id: string
          cancel_reason: string | null
          created_at: string
          created_by: string | null
          driver_id: string | null
          id: string
          is_cancelled: boolean
          notes: string | null
          other_name: string | null
          party_id: string | null
          payment_method: string | null
          recipient_type: string
          reference: string | null
          transporter_id: string | null
          trip_id: string | null
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          advance_date?: string
          amount: number
          business_id: string
          cancel_reason?: string | null
          created_at?: string
          created_by?: string | null
          driver_id?: string | null
          id?: string
          is_cancelled?: boolean
          notes?: string | null
          other_name?: string | null
          party_id?: string | null
          payment_method?: string | null
          recipient_type: string
          reference?: string | null
          transporter_id?: string | null
          trip_id?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          advance_date?: string
          amount?: number
          business_id?: string
          cancel_reason?: string | null
          created_at?: string
          created_by?: string | null
          driver_id?: string | null
          id?: string
          is_cancelled?: boolean
          notes?: string | null
          other_name?: string | null
          party_id?: string | null
          payment_method?: string | null
          recipient_type?: string
          reference?: string | null
          transporter_id?: string | null
          trip_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "advances_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "payment_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advances_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advances_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advances_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advances_transporter_id_fkey"
            columns: ["transporter_id"]
            isOneToOne: false
            referencedRelation: "transporters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advances_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          business_id: string
          created_at: string
          id: string
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string
          user_id: string | null
        }
        Insert: {
          action: string
          business_id: string
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name: string
          user_id?: string | null
        }
        Update: {
          action?: string
          business_id?: string
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      business_members: {
        Row: {
          business_id: string
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          business_id: string
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          business_id?: string
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_members_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_settings: {
        Row: {
          address: string | null
          business_id: string
          city: string | null
          date_format: string
          email: string | null
          lr_prefix: string
          phone: string | null
          state: string | null
          trip_prefix: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          business_id: string
          city?: string | null
          date_format?: string
          email?: string | null
          lr_prefix?: string
          phone?: string | null
          state?: string | null
          trip_prefix?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          business_id?: string
          city?: string | null
          date_format?: string
          email?: string | null
          lr_prefix?: string
          phone?: string | null
          state?: string | null
          trip_prefix?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_settings_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      commission_receipts: {
        Row: {
          account_id: string | null
          amount: number
          business_id: string
          commission_id: string
          created_at: string
          created_by: string | null
          driver_id: string
          id: string
          is_reversed: boolean
          notes: string | null
          receipt_date: string
          reference: string | null
          request_id: string
          reversal_reason: string | null
          salary_payment_id: string | null
        }
        Insert: {
          account_id?: string | null
          amount: number
          business_id: string
          commission_id: string
          created_at?: string
          created_by?: string | null
          driver_id: string
          id?: string
          is_reversed?: boolean
          notes?: string | null
          receipt_date?: string
          reference?: string | null
          request_id: string
          reversal_reason?: string | null
          salary_payment_id?: string | null
        }
        Update: {
          account_id?: string | null
          amount?: number
          business_id?: string
          commission_id?: string
          created_at?: string
          created_by?: string | null
          driver_id?: string
          id?: string
          is_reversed?: boolean
          notes?: string | null
          receipt_date?: string
          reference?: string | null
          request_id?: string
          reversal_reason?: string | null
          salary_payment_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commission_receipts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "payment_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_receipts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_receipts_commission_id_fkey"
            columns: ["commission_id"]
            isOneToOne: false
            referencedRelation: "commission_balances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_receipts_commission_id_fkey"
            columns: ["commission_id"]
            isOneToOne: false
            referencedRelation: "driver_commissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_receipts_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_receipts_salary_payment_id_fkey"
            columns: ["salary_payment_id"]
            isOneToOne: false
            referencedRelation: "salary_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      doc_sequences: {
        Row: {
          business_id: string
          doc_type: string
          last_value: number
        }
        Insert: {
          business_id: string
          doc_type: string
          last_value?: number
        }
        Update: {
          business_id?: string
          doc_type?: string
          last_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "doc_sequences_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_commissions: {
        Row: {
          amount: number
          business_id: string
          cancel_reason: string | null
          commission_date: string
          created_at: string
          created_by: string | null
          driver_id: string
          id: string
          is_cancelled: boolean
          lr_id: string | null
          notes: string | null
          reference: string | null
          trip_id: string | null
        }
        Insert: {
          amount: number
          business_id: string
          cancel_reason?: string | null
          commission_date?: string
          created_at?: string
          created_by?: string | null
          driver_id: string
          id?: string
          is_cancelled?: boolean
          lr_id?: string | null
          notes?: string | null
          reference?: string | null
          trip_id?: string | null
        }
        Update: {
          amount?: number
          business_id?: string
          cancel_reason?: string | null
          commission_date?: string
          created_at?: string
          created_by?: string | null
          driver_id?: string
          id?: string
          is_cancelled?: boolean
          lr_id?: string | null
          notes?: string | null
          reference?: string | null
          trip_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_commissions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_commissions_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_commissions_lr_id_fkey"
            columns: ["lr_id"]
            isOneToOne: true
            referencedRelation: "lrs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_commissions_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: true
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      drivers: {
        Row: {
          address: string | null
          business_id: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          joining_date: string | null
          licence_number: string | null
          name: string
          notes: string | null
          phone: string | null
          salary_amount: number | null
          salary_frequency: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          business_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          joining_date?: string | null
          licence_number?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          salary_amount?: number | null
          salary_frequency?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          business_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          joining_date?: string | null
          licence_number?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          salary_amount?: number | null
          salary_frequency?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "drivers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          account_id: string | null
          amount: number
          business_id: string
          cancel_reason: string | null
          category: string
          created_at: string
          created_by: string | null
          expense_date: string
          id: string
          is_cancelled: boolean
          lr_id: string | null
          lr_party_id: string | null
          notes: string | null
          paid_by: string | null
          paid_to: string | null
          payment_method: string | null
          payment_status: string
          reference: string | null
          responsible: string
          responsible_party_id: string | null
          scope: string
          trip_id: string | null
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          amount: number
          business_id: string
          cancel_reason?: string | null
          category: string
          created_at?: string
          created_by?: string | null
          expense_date?: string
          id?: string
          is_cancelled?: boolean
          lr_id?: string | null
          lr_party_id?: string | null
          notes?: string | null
          paid_by?: string | null
          paid_to?: string | null
          payment_method?: string | null
          payment_status?: string
          reference?: string | null
          responsible?: string
          responsible_party_id?: string | null
          scope?: string
          trip_id?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          business_id?: string
          cancel_reason?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          expense_date?: string
          id?: string
          is_cancelled?: boolean
          lr_id?: string | null
          lr_party_id?: string | null
          notes?: string | null
          paid_by?: string | null
          paid_to?: string | null
          payment_method?: string | null
          payment_status?: string
          reference?: string | null
          responsible?: string
          responsible_party_id?: string | null
          scope?: string
          trip_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "payment_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_lr_id_fkey"
            columns: ["lr_id"]
            isOneToOne: false
            referencedRelation: "lrs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_lr_party_id_fkey"
            columns: ["lr_party_id"]
            isOneToOne: false
            referencedRelation: "lr_parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_responsible_party_id_fkey"
            columns: ["responsible_party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_entries: {
        Row: {
          account_id: string
          account_type: string
          business_id: string
          created_at: string
          created_by: string | null
          credit: number
          debit: number
          description: string | null
          entry_date: string
          id: string
          line_kind: string
          reversal_of: string | null
          source_id: string
          source_table: string
        }
        Insert: {
          account_id: string
          account_type: string
          business_id: string
          created_at?: string
          created_by?: string | null
          credit?: number
          debit?: number
          description?: string | null
          entry_date?: string
          id?: string
          line_kind: string
          reversal_of?: string | null
          source_id: string
          source_table: string
        }
        Update: {
          account_id?: string
          account_type?: string
          business_id?: string
          created_at?: string
          created_by?: string | null
          credit?: number
          debit?: number
          description?: string | null
          entry_date?: string
          id?: string
          line_kind?: string
          reversal_of?: string | null
          source_id?: string
          source_table?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_reversal_of_fkey"
            columns: ["reversal_of"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      lr_adjustments: {
        Row: {
          amount: number
          business_id: string
          created_at: string
          created_by: string | null
          id: string
          kind: string
          lr_id: string
          reason: string
        }
        Insert: {
          amount: number
          business_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind: string
          lr_id: string
          reason: string
        }
        Update: {
          amount?: number
          business_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          lr_id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "lr_adjustments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lr_adjustments_lr_id_fkey"
            columns: ["lr_id"]
            isOneToOne: false
            referencedRelation: "lrs"
            referencedColumns: ["id"]
          },
        ]
      }
      lr_parties: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          delivery_point: string | null
          goods_description: string | null
          id: string
          loading_point: string | null
          lr_id: string
          party_id: string
          quantity: number | null
          role: string
          seq: number
          weight: number | null
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by?: string | null
          delivery_point?: string | null
          goods_description?: string | null
          id?: string
          loading_point?: string | null
          lr_id: string
          party_id: string
          quantity?: number | null
          role: string
          seq?: number
          weight?: number | null
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          delivery_point?: string | null
          goods_description?: string | null
          id?: string
          loading_point?: string | null
          lr_id?: string
          party_id?: string
          quantity?: number | null
          role?: string
          seq?: number
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lr_parties_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lr_parties_lr_id_fkey"
            columns: ["lr_id"]
            isOneToOne: false
            referencedRelation: "lrs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lr_parties_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      lrs: {
        Row: {
          additions_total: number
          base_freight: number
          billing_party_id: string | null
          business_id: string
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          commission_amount: number
          commission_cancel_reason: string | null
          commission_date: string | null
          commission_enabled: boolean
          commission_mode: string
          commission_notes: string | null
          commission_payer_party_id: string | null
          commission_reference: string | null
          commission_status: string
          commission_value: number
          created_at: string
          created_by: string | null
          deductions_total: number
          delivery_point: string | null
          delivery_status: string
          direct_payment_amount: number
          direct_payment_enabled: boolean
          driver_id: string | null
          driver_name: string | null
          final_freight: number
          freight_payable: number
          freight_type: string
          goods_description: string | null
          id: string
          loading_point: string | null
          loading_stop_id: string | null
          lr_date: string
          lr_number: string
          notes: string | null
          quantity: number | null
          rate: number | null
          rate_unit: string
          status: string
          transporter_id: string | null
          trip_id: string | null
          unloading_stop_id: string | null
          updated_at: string
          vehicle_number: string | null
          vehicle_type: string | null
          weight: number | null
          weight_unit: string
        }
        Insert: {
          additions_total?: number
          base_freight?: number
          billing_party_id?: string | null
          business_id: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          commission_amount?: number
          commission_cancel_reason?: string | null
          commission_date?: string | null
          commission_enabled?: boolean
          commission_mode?: string
          commission_notes?: string | null
          commission_payer_party_id?: string | null
          commission_reference?: string | null
          commission_status?: string
          commission_value?: number
          created_at?: string
          created_by?: string | null
          deductions_total?: number
          delivery_point?: string | null
          delivery_status?: string
          direct_payment_amount?: number
          direct_payment_enabled?: boolean
          driver_id?: string | null
          driver_name?: string | null
          final_freight?: number
          freight_payable?: number
          freight_type?: string
          goods_description?: string | null
          id?: string
          loading_point?: string | null
          loading_stop_id?: string | null
          lr_date?: string
          lr_number: string
          notes?: string | null
          quantity?: number | null
          rate?: number | null
          rate_unit?: string
          status?: string
          transporter_id?: string | null
          trip_id?: string | null
          unloading_stop_id?: string | null
          updated_at?: string
          vehicle_number?: string | null
          vehicle_type?: string | null
          weight?: number | null
          weight_unit?: string
        }
        Update: {
          additions_total?: number
          base_freight?: number
          billing_party_id?: string | null
          business_id?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          commission_amount?: number
          commission_cancel_reason?: string | null
          commission_date?: string | null
          commission_enabled?: boolean
          commission_mode?: string
          commission_notes?: string | null
          commission_payer_party_id?: string | null
          commission_reference?: string | null
          commission_status?: string
          commission_value?: number
          created_at?: string
          created_by?: string | null
          deductions_total?: number
          delivery_point?: string | null
          delivery_status?: string
          direct_payment_amount?: number
          direct_payment_enabled?: boolean
          driver_id?: string | null
          driver_name?: string | null
          final_freight?: number
          freight_payable?: number
          freight_type?: string
          goods_description?: string | null
          id?: string
          loading_point?: string | null
          loading_stop_id?: string | null
          lr_date?: string
          lr_number?: string
          notes?: string | null
          quantity?: number | null
          rate?: number | null
          rate_unit?: string
          status?: string
          transporter_id?: string | null
          trip_id?: string | null
          unloading_stop_id?: string | null
          updated_at?: string
          vehicle_number?: string | null
          vehicle_type?: string | null
          weight?: number | null
          weight_unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "lrs_billing_party_id_fkey"
            columns: ["billing_party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lrs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lrs_commission_payer_party_id_fkey"
            columns: ["commission_payer_party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lrs_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lrs_loading_stop_id_fkey"
            columns: ["loading_stop_id"]
            isOneToOne: false
            referencedRelation: "trip_stops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lrs_transporter_id_fkey"
            columns: ["transporter_id"]
            isOneToOne: false
            referencedRelation: "transporters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lrs_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lrs_unloading_stop_id_fkey"
            columns: ["unloading_stop_id"]
            isOneToOne: false
            referencedRelation: "trip_stops"
            referencedColumns: ["id"]
          },
        ]
      }
      parties: {
        Row: {
          address: string | null
          alt_phone: string | null
          business_id: string
          city: string | null
          contact_person: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          name_normalized: string | null
          notes: string | null
          opening_balance: number
          opening_date: string | null
          opening_type: string
          phone: string | null
          roles: string[]
          state: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          alt_phone?: string | null
          business_id: string
          city?: string | null
          contact_person?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          name_normalized?: string | null
          notes?: string | null
          opening_balance?: number
          opening_date?: string | null
          opening_type?: string
          phone?: string | null
          roles?: string[]
          state?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          alt_phone?: string | null
          business_id?: string
          city?: string | null
          contact_person?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          name_normalized?: string | null
          notes?: string | null
          opening_balance?: number
          opening_date?: string | null
          opening_type?: string
          phone?: string | null
          roles?: string[]
          state?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "parties_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_accounts: {
        Row: {
          account_holder: string | null
          account_number: string | null
          bank_name: string | null
          business_id: string
          created_at: string
          created_by: string | null
          display_name: string
          id: string
          ifsc: string | null
          is_active: boolean
          opening_balance: number
          opening_date: string | null
          kind: string
          updated_at: string
        }
        Insert: {
          account_holder?: string | null
          account_number?: string | null
          bank_name?: string | null
          business_id: string
          created_at?: string
          created_by?: string | null
          display_name: string
          id?: string
          ifsc?: string | null
          is_active?: boolean
          opening_balance?: number
          opening_date?: string | null
          kind?: string
          updated_at?: string
        }
        Update: {
          account_holder?: string | null
          account_number?: string | null
          bank_name?: string | null
          business_id?: string
          created_at?: string
          created_by?: string | null
          display_name?: string
          id?: string
          ifsc?: string | null
          is_active?: boolean
          opening_balance?: number
          opening_date?: string | null
          kind?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_accounts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_allocations: {
        Row: {
          amount: number
          business_id: string
          created_at: string
          created_by: string | null
          id: string
          lr_id: string
          payment_id: string
          target: string
        }
        Insert: {
          amount: number
          business_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          lr_id: string
          payment_id: string
          target: string
        }
        Update: {
          amount?: number
          business_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          lr_id?: string
          payment_id?: string
          target?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_allocations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_lr_id_fkey"
            columns: ["lr_id"]
            isOneToOne: false
            referencedRelation: "lrs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          account_id: string
          amount: number
          bank_account_number: string | null
          bank_holder: string | null
          bank_ifsc: string | null
          bank_name: string | null
          business_id: string
          created_at: string
          created_by: string | null
          id: string
          is_reversed: boolean
          lr_id: string | null
          mode: string
          notes: string | null
          party_id: string | null
          payer_name: string | null
          payment_date: string
          payment_type: string
          reference: string | null
          reversal_reason: string | null
          transporter_id: string | null
          trip_id: string | null
          txn_reference: string | null
          updated_at: string
          upi_id: string | null
        }
        Insert: {
          account_id: string
          amount: number
          bank_account_number?: string | null
          bank_holder?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          business_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_reversed?: boolean
          lr_id?: string | null
          mode?: string
          notes?: string | null
          party_id?: string | null
          payer_name?: string | null
          payment_date?: string
          payment_type: string
          reference?: string | null
          reversal_reason?: string | null
          transporter_id?: string | null
          trip_id?: string | null
          txn_reference?: string | null
          updated_at?: string
          upi_id?: string | null
        }
        Update: {
          account_id?: string
          amount?: number
          bank_account_number?: string | null
          bank_holder?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          business_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_reversed?: boolean
          lr_id?: string | null
          mode?: string
          notes?: string | null
          party_id?: string | null
          payer_name?: string | null
          payment_date?: string
          payment_type?: string
          reference?: string | null
          reversal_reason?: string | null
          transporter_id?: string | null
          trip_id?: string | null
          txn_reference?: string | null
          updated_at?: string
          upi_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "payment_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_lr_id_fkey"
            columns: ["lr_id"]
            isOneToOne: false
            referencedRelation: "lrs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_transporter_id_fkey"
            columns: ["transporter_id"]
            isOneToOne: false
            referencedRelation: "transporters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      routes: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          destination: string
          distance_km: number | null
          id: string
          is_active: boolean
          notes: string | null
          origin: string
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by?: string | null
          destination: string
          distance_km?: number | null
          id?: string
          is_active?: boolean
          notes?: string | null
          origin: string
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          destination?: string
          distance_km?: number | null
          id?: string
          is_active?: boolean
          notes?: string | null
          origin?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "routes_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      salary_entries: {
        Row: {
          amount: number
          business_id: string
          created_at: string
          created_by: string | null
          driver_id: string
          due_date: string | null
          id: string
          is_cancelled: boolean
          notes: string | null
          period: string
          updated_at: string
        }
        Insert: {
          amount: number
          business_id: string
          created_at?: string
          created_by?: string | null
          driver_id: string
          due_date?: string | null
          id?: string
          is_cancelled?: boolean
          notes?: string | null
          period: string
          updated_at?: string
        }
        Update: {
          amount?: number
          business_id?: string
          created_at?: string
          created_by?: string | null
          driver_id?: string
          due_date?: string | null
          id?: string
          is_cancelled?: boolean
          notes?: string | null
          period?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "salary_entries_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_entries_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
        ]
      }
      salary_payments: {
        Row: {
          account_id: string | null
          amount: number
          business_id: string
          created_at: string
          created_by: string | null
          driver_id: string
          id: string
          is_reversed: boolean
          notes: string | null
          payment_date: string
          payment_method: string | null
          recovered_advance: number
          recovered_commission: number
          reference: string | null
          reversal_reason: string | null
          salary_entry_id: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          amount?: number
          business_id: string
          created_at?: string
          created_by?: string | null
          driver_id: string
          id?: string
          is_reversed?: boolean
          notes?: string | null
          payment_date?: string
          payment_method?: string | null
          recovered_advance?: number
          recovered_commission?: number
          reference?: string | null
          reversal_reason?: string | null
          salary_entry_id: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          business_id?: string
          created_at?: string
          created_by?: string | null
          driver_id?: string
          id?: string
          is_reversed?: boolean
          notes?: string | null
          payment_date?: string
          payment_method?: string | null
          recovered_advance?: number
          recovered_commission?: number
          reference?: string | null
          reversal_reason?: string | null
          salary_entry_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "salary_payments_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "payment_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_payments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_payments_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "salary_payments_salary_entry_id_fkey"
            columns: ["salary_entry_id"]
            isOneToOne: false
            referencedRelation: "salary_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      transporters: {
        Row: {
          business_id: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          name_normalized: string | null
          notes: string | null
          party_id: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          business_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          name_normalized?: string | null
          notes?: string | null
          party_id?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          business_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          name_normalized?: string | null
          notes?: string | null
          party_id?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transporters_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transporters_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_stops: {
        Row: {
          actual_arrival: string | null
          actual_departure: string | null
          business_id: string
          created_at: string
          created_by: string | null
          id: string
          location: string
          notes: string | null
          planned_arrival: string | null
          planned_departure: string | null
          seq: number
          status: string
          stop_type: string
          trip_id: string
        }
        Insert: {
          actual_arrival?: string | null
          actual_departure?: string | null
          business_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          location: string
          notes?: string | null
          planned_arrival?: string | null
          planned_departure?: string | null
          seq?: number
          status?: string
          stop_type?: string
          trip_id: string
        }
        Update: {
          actual_arrival?: string | null
          actual_departure?: string | null
          business_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          location?: string
          notes?: string | null
          planned_arrival?: string | null
          planned_departure?: string | null
          seq?: number
          status?: string
          stop_type?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_stops_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_stops_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          business_id: string
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          commission_amount: number
          commission_cancel_reason: string | null
          commission_date: string | null
          commission_enabled: boolean
          commission_mode: string
          commission_notes: string | null
          commission_reference: string | null
          commission_value: number
          created_at: string
          created_by: string | null
          direction: string
          driver_id: string | null
          driver_name: string | null
          id: string
          journey_type: string
          leg_label: string | null
          market_vehicle_number: string | null
          market_vehicle_type: string | null
          notes: string | null
          parent_trip_id: string | null
          status: string
          transporter_id: string | null
          trip_date: string
          trip_number: string
          updated_at: string
          vehicle_id: string | null
          vehicle_mode: string
        }
        Insert: {
          business_id: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          commission_amount?: number
          commission_cancel_reason?: string | null
          commission_date?: string | null
          commission_enabled?: boolean
          commission_mode?: string
          commission_notes?: string | null
          commission_reference?: string | null
          commission_value?: number
          created_at?: string
          created_by?: string | null
          direction?: string
          driver_id?: string | null
          driver_name?: string | null
          id?: string
          journey_type?: string
          leg_label?: string | null
          market_vehicle_number?: string | null
          market_vehicle_type?: string | null
          notes?: string | null
          parent_trip_id?: string | null
          status?: string
          transporter_id?: string | null
          trip_date?: string
          trip_number: string
          updated_at?: string
          vehicle_id?: string | null
          vehicle_mode?: string
        }
        Update: {
          business_id?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          commission_amount?: number
          commission_cancel_reason?: string | null
          commission_date?: string | null
          commission_enabled?: boolean
          commission_mode?: string
          commission_notes?: string | null
          commission_reference?: string | null
          commission_value?: number
          created_at?: string
          created_by?: string | null
          direction?: string
          driver_id?: string | null
          driver_name?: string | null
          id?: string
          journey_type?: string
          leg_label?: string | null
          market_vehicle_number?: string | null
          market_vehicle_type?: string | null
          notes?: string | null
          parent_trip_id?: string | null
          status?: string
          transporter_id?: string | null
          trip_date?: string
          trip_number?: string
          updated_at?: string
          vehicle_id?: string | null
          vehicle_mode?: string
        }
        Relationships: [
          {
            foreignKeyName: "trips_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_parent_trip_id_fkey"
            columns: ["parent_trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_transporter_id_fkey"
            columns: ["transporter_id"]
            isOneToOne: false
            referencedRelation: "transporters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          business_id: string
          capacity: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          notes: string | null
          registration_normalized: string | null
          registration_number: string
          updated_at: string
          vehicle_type: string | null
        }
        Insert: {
          business_id: string
          capacity?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          registration_normalized?: string | null
          registration_number: string
          updated_at?: string
          vehicle_type?: string | null
        }
        Update: {
          business_id?: string
          capacity?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          registration_normalized?: string | null
          registration_number?: string
          updated_at?: string
          vehicle_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      account_movements: {
        Row: {
          account_id: string | null
          business_id: string | null
          entry_date: string | null
          signed_amount: number | null
          source_id: string | null
          source_table: string | null
        }
        Relationships: []
      }
      payment_account_balances: {
        Row: {
          account_id: string | null
          balance: number | null
          business_id: string | null
          entries_before_opening: number | null
          opening_balance: number | null
          opening_date: string | null
          total_in: number | null
          total_out: number | null
        }
        Relationships: []
      }
      account_balances: {
        Row: {
          account_id: string | null
          account_type: string | null
          balance: number | null
          business_id: string | null
          total_credit: number | null
          total_debit: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_balances: {
        Row: {
          amount: number | null
          business_id: string | null
          cancel_reason: string | null
          cash_received_amount: number | null
          commission_date: string | null
          created_at: string | null
          created_by: string | null
          document_number: string | null
          driver_id: string | null
          id: string | null
          is_cancelled: boolean | null
          lr_id: string | null
          notes: string | null
          pending_amount: number | null
          received_amount: number | null
          reference: string | null
          trip_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_commissions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_commissions_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_commissions_lr_id_fkey"
            columns: ["lr_id"]
            isOneToOne: true
            referencedRelation: "lrs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_commissions_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: true
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      current_business_id: { Args: never; Returns: string }
      get_or_create_transporter: { Args: { p_name: string }; Returns: string }
      get_or_create_transporter_for_party: {
        Args: { p_party_id: string }
        Returns: string
      }
      has_business_role: {
        Args: {
          p_business_id: string
          p_role: Database["public"]["Enums"]["app_role"]
        }
        Returns: boolean
      }
      is_business_member: { Args: { p_business_id: string }; Returns: boolean }
      ledger_set: {
        Args: {
          p_account_id: string
          p_account_type: string
          p_business_id: string
          p_credit: number
          p_debit: number
          p_description: string
          p_entry_date: string
          p_line_kind: string
          p_source_id: string
          p_source_table: string
        }
        Returns: undefined
      }
      lr_billing_party: {
        Args: { p_lr: Database["public"]["Tables"]["lrs"]["Row"] }
        Returns: string
      }
      next_doc_number: {
        Args: { p_business_id: string; p_doc_type: string }
        Returns: string
      }
      post_ledger: {
        Args: {
          p_account_id: string
          p_account_type: string
          p_business_id: string
          p_credit: number
          p_debit: number
          p_description: string
          p_entry_date: string
          p_line_kind: string
          p_source_id: string
          p_source_table: string
        }
        Returns: undefined
      }
      record_commission_receipt: { Args: { p: Json }; Returns: string }
      removal_blockers: {
        Args: { p_history?: boolean; p_id: string; p_table: string }
        Returns: string
      }
      remove_record: {
        Args: {
          p_action: string
          p_confirmation?: string
          p_id: string
          p_reason?: string
          p_table: string
        }
        Returns: undefined
      }
      resolve_driver: {
        Args: { p_business: string; p_name: string }
        Returns: string
      }
      reverse_commission_receipt: {
        Args: { p_id: string; p_reason: string }
        Returns: undefined
      }
      save_lr: { Args: { p: Json }; Returns: string }
      save_trip: { Args: { p: Json }; Returns: string }
      setup_available: { Args: never; Returns: boolean }
      system_rls_status: {
        Args: never
        Returns: {
          rls_enabled: boolean
          table_name: string
        }[]
      }
    }
    Enums: {
      app_role: "owner" | "admin" | "staff"
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
    Enums: {
      app_role: ["owner", "admin", "staff"],
    },
  },
} as const
