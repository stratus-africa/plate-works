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
      audit_logs: {
        Row: {
          action: string
          created_at: string
          device: string | null
          entity: string
          entity_id: string | null
          id: string
          ip_address: string | null
          new_value: Json | null
          old_value: Json | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          device?: string | null
          entity: string
          entity_id?: string | null
          id?: string
          ip_address?: string | null
          new_value?: Json | null
          old_value?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          device?: string | null
          entity?: string
          entity_id?: string | null
          id?: string
          ip_address?: string | null
          new_value?: Json | null
          old_value?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      customers: {
        Row: {
          address: string | null
          company: string
          contact_person: string | null
          created_at: string
          email: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          company: string
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          company?: string
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      cycle_count_lines: {
        Row: {
          counted: boolean
          counted_status: string | null
          counted_warehouse_id: string | null
          created_at: string
          cycle_count_id: string
          discrepancy: boolean
          discrepancy_type: string | null
          expected_status: string | null
          expected_warehouse_id: string | null
          id: string
          item_code: string
          item_type: string
          notes: string | null
          offcut_id: string | null
          plate_id: string | null
          resolved: boolean
          updated_at: string
        }
        Insert: {
          counted?: boolean
          counted_status?: string | null
          counted_warehouse_id?: string | null
          created_at?: string
          cycle_count_id: string
          discrepancy?: boolean
          discrepancy_type?: string | null
          expected_status?: string | null
          expected_warehouse_id?: string | null
          id?: string
          item_code?: string
          item_type?: string
          notes?: string | null
          offcut_id?: string | null
          plate_id?: string | null
          resolved?: boolean
          updated_at?: string
        }
        Update: {
          counted?: boolean
          counted_status?: string | null
          counted_warehouse_id?: string | null
          created_at?: string
          cycle_count_id?: string
          discrepancy?: boolean
          discrepancy_type?: string | null
          expected_status?: string | null
          expected_warehouse_id?: string | null
          id?: string
          item_code?: string
          item_type?: string
          notes?: string | null
          offcut_id?: string | null
          plate_id?: string | null
          resolved?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cycle_count_lines_counted_warehouse_id_fkey"
            columns: ["counted_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cycle_count_lines_cycle_count_id_fkey"
            columns: ["cycle_count_id"]
            isOneToOne: false
            referencedRelation: "cycle_counts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cycle_count_lines_expected_warehouse_id_fkey"
            columns: ["expected_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cycle_count_lines_offcut_id_fkey"
            columns: ["offcut_id"]
            isOneToOne: false
            referencedRelation: "offcuts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cycle_count_lines_plate_id_fkey"
            columns: ["plate_id"]
            isOneToOne: false
            referencedRelation: "plates"
            referencedColumns: ["id"]
          },
        ]
      }
      cycle_counts: {
        Row: {
          completed_at: string | null
          counted_by: string | null
          counted_count: number
          created_at: string
          discrepancy_count: number
          expected_count: number
          id: string
          notes: string | null
          reference: string
          scope: string
          started_at: string
          status: Database["public"]["Enums"]["cycle_count_status"]
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          completed_at?: string | null
          counted_by?: string | null
          counted_count?: number
          created_at?: string
          discrepancy_count?: number
          expected_count?: number
          id?: string
          notes?: string | null
          reference?: string
          scope?: string
          started_at?: string
          status?: Database["public"]["Enums"]["cycle_count_status"]
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          completed_at?: string | null
          counted_by?: string | null
          counted_count?: number
          created_at?: string
          discrepancy_count?: number
          expected_count?: number
          id?: string
          notes?: string | null
          reference?: string
          scope?: string
          started_at?: string
          status?: Database["public"]["Enums"]["cycle_count_status"]
          updated_at?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cycle_counts_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_adjustments: {
        Row: {
          adjustment_type: string
          created_at: string
          cycle_count_id: string | null
          id: string
          item_code: string
          item_type: string
          new_status: string | null
          new_warehouse_id: string | null
          offcut_id: string | null
          old_status: string | null
          old_warehouse_id: string | null
          performed_by: string | null
          plate_id: string | null
          reason: string | null
        }
        Insert: {
          adjustment_type?: string
          created_at?: string
          cycle_count_id?: string | null
          id?: string
          item_code?: string
          item_type?: string
          new_status?: string | null
          new_warehouse_id?: string | null
          offcut_id?: string | null
          old_status?: string | null
          old_warehouse_id?: string | null
          performed_by?: string | null
          plate_id?: string | null
          reason?: string | null
        }
        Update: {
          adjustment_type?: string
          created_at?: string
          cycle_count_id?: string | null
          id?: string
          item_code?: string
          item_type?: string
          new_status?: string | null
          new_warehouse_id?: string | null
          offcut_id?: string | null
          old_status?: string | null
          old_warehouse_id?: string | null
          performed_by?: string | null
          plate_id?: string | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_adjustments_cycle_count_id_fkey"
            columns: ["cycle_count_id"]
            isOneToOne: false
            referencedRelation: "cycle_counts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_adjustments_new_warehouse_id_fkey"
            columns: ["new_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_adjustments_offcut_id_fkey"
            columns: ["offcut_id"]
            isOneToOne: false
            referencedRelation: "offcuts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_adjustments_old_warehouse_id_fkey"
            columns: ["old_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_adjustments_plate_id_fkey"
            columns: ["plate_id"]
            isOneToOne: false
            referencedRelation: "plates"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_transactions: {
        Row: {
          batch_id: string | null
          created_at: string
          id: string
          job_id: string | null
          notes: string | null
          offcut_id: string | null
          performed_by: string | null
          plate_id: string | null
          quantity: number
          reference: string | null
          transaction_type: string
          warehouse_id: string | null
        }
        Insert: {
          batch_id?: string | null
          created_at?: string
          id?: string
          job_id?: string | null
          notes?: string | null
          offcut_id?: string | null
          performed_by?: string | null
          plate_id?: string | null
          quantity?: number
          reference?: string | null
          transaction_type: string
          warehouse_id?: string | null
        }
        Update: {
          batch_id?: string | null
          created_at?: string
          id?: string
          job_id?: string | null
          notes?: string | null
          offcut_id?: string | null
          performed_by?: string | null
          plate_id?: string | null
          quantity?: number
          reference?: string | null
          transaction_type?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transactions_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "plate_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_offcut_id_fkey"
            columns: ["offcut_id"]
            isOneToOne: false
            referencedRelation: "offcuts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_plate_id_fkey"
            columns: ["plate_id"]
            isOneToOne: false
            referencedRelation: "plates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transactions_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          artwork_height: number
          artwork_width: number
          colours: number
          completed_at: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          due_date: string | null
          effective_height: number | null
          effective_width: number | null
          id: string
          job_number: string
          margin_bottom: number
          margin_left: number
          margin_right: number
          margin_top: number
          notes: string | null
          operator_id: string | null
          pieces_per_plate: number
          plates_required: number
          product: string
          quantity: number
          rotated: boolean
          sales_order: string | null
          status: Database["public"]["Enums"]["job_status"]
          updated_at: string
          utilization: number
          waste_area: number
        }
        Insert: {
          artwork_height: number
          artwork_width: number
          colours?: number
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          due_date?: string | null
          effective_height?: number | null
          effective_width?: number | null
          id?: string
          job_number?: string
          margin_bottom?: number
          margin_left?: number
          margin_right?: number
          margin_top?: number
          notes?: string | null
          operator_id?: string | null
          pieces_per_plate?: number
          plates_required?: number
          product: string
          quantity?: number
          rotated?: boolean
          sales_order?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          updated_at?: string
          utilization?: number
          waste_area?: number
        }
        Update: {
          artwork_height?: number
          artwork_width?: number
          colours?: number
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          due_date?: string | null
          effective_height?: number | null
          effective_width?: number | null
          id?: string
          job_number?: string
          margin_bottom?: number
          margin_left?: number
          margin_right?: number
          margin_top?: number
          notes?: string | null
          operator_id?: string | null
          pieces_per_plate?: number
          plates_required?: number
          product?: string
          quantity?: number
          rotated?: boolean
          sales_order?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          updated_at?: string
          utilization?: number
          waste_area?: number
        }
        Relationships: [
          {
            foreignKeyName: "jobs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      manufacturers: {
        Row: {
          active: boolean
          contact_person: string | null
          country: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
        }
        Insert: {
          active?: boolean
          contact_person?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
        }
        Update: {
          active?: boolean
          contact_person?: string | null
          country?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          category: string
          created_at: string
          id: string
          read: boolean
          severity: string
          title: string
        }
        Insert: {
          body?: string | null
          category?: string
          created_at?: string
          id?: string
          read?: boolean
          severity?: string
          title: string
        }
        Update: {
          body?: string | null
          category?: string
          created_at?: string
          id?: string
          read?: boolean
          severity?: string
          title?: string
        }
        Relationships: []
      }
      offcuts: {
        Row: {
          area: number | null
          created_at: string
          height: number
          id: string
          job_id: string | null
          offcut_code: string
          parent_plate_id: string | null
          shape: string
          status: Database["public"]["Enums"]["offcut_status"]
          updated_at: string
          warehouse_id: string | null
          width: number
        }
        Insert: {
          area?: number | null
          created_at?: string
          height: number
          id?: string
          job_id?: string | null
          offcut_code?: string
          parent_plate_id?: string | null
          shape?: string
          status?: Database["public"]["Enums"]["offcut_status"]
          updated_at?: string
          warehouse_id?: string | null
          width: number
        }
        Update: {
          area?: number | null
          created_at?: string
          height?: number
          id?: string
          job_id?: string | null
          offcut_code?: string
          parent_plate_id?: string | null
          shape?: string
          status?: Database["public"]["Enums"]["offcut_status"]
          updated_at?: string
          warehouse_id?: string | null
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "offcuts_parent_plate_id_fkey"
            columns: ["parent_plate_id"]
            isOneToOne: false
            referencedRelation: "plates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offcuts_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      plate_allocations: {
        Row: {
          consumed: boolean
          created_at: string
          id: string
          job_id: string
          offcut_id: string | null
          pieces_placed: number
          plate_id: string | null
          source: string
          used_area: number
          waste_area: number
        }
        Insert: {
          consumed?: boolean
          created_at?: string
          id?: string
          job_id: string
          offcut_id?: string | null
          pieces_placed?: number
          plate_id?: string | null
          source?: string
          used_area?: number
          waste_area?: number
        }
        Update: {
          consumed?: boolean
          created_at?: string
          id?: string
          job_id?: string
          offcut_id?: string | null
          pieces_placed?: number
          plate_id?: string | null
          source?: string
          used_area?: number
          waste_area?: number
        }
        Relationships: [
          {
            foreignKeyName: "plate_allocations_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plate_allocations_offcut_id_fkey"
            columns: ["offcut_id"]
            isOneToOne: false
            referencedRelation: "offcuts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plate_allocations_plate_id_fkey"
            columns: ["plate_id"]
            isOneToOne: false
            referencedRelation: "plates"
            referencedColumns: ["id"]
          },
        ]
      }
      plate_batches: {
        Row: {
          available_plates: number
          batch_number: string
          boxes_received: number
          cost_per_plate: number
          created_at: string
          created_by: string | null
          date_received: string
          id: string
          manufacturer_id: string | null
          pieces_per_box: number
          plate_height: number
          plate_type: string
          plate_width: number
          purchase_order: string | null
          reserved_plates: number
          status: Database["public"]["Enums"]["batch_status"]
          supplier_id: string | null
          thickness: number | null
          total_plates: number
          updated_at: string
          used_plates: number
          warehouse_id: string | null
        }
        Insert: {
          available_plates?: number
          batch_number: string
          boxes_received?: number
          cost_per_plate?: number
          created_at?: string
          created_by?: string | null
          date_received?: string
          id?: string
          manufacturer_id?: string | null
          pieces_per_box?: number
          plate_height?: number
          plate_type?: string
          plate_width?: number
          purchase_order?: string | null
          reserved_plates?: number
          status?: Database["public"]["Enums"]["batch_status"]
          supplier_id?: string | null
          thickness?: number | null
          total_plates?: number
          updated_at?: string
          used_plates?: number
          warehouse_id?: string | null
        }
        Update: {
          available_plates?: number
          batch_number?: string
          boxes_received?: number
          cost_per_plate?: number
          created_at?: string
          created_by?: string | null
          date_received?: string
          id?: string
          manufacturer_id?: string | null
          pieces_per_box?: number
          plate_height?: number
          plate_type?: string
          plate_width?: number
          purchase_order?: string | null
          reserved_plates?: number
          status?: Database["public"]["Enums"]["batch_status"]
          supplier_id?: string | null
          thickness?: number | null
          total_plates?: number
          updated_at?: string
          used_plates?: number
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plate_batches_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "manufacturers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plate_batches_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plate_batches_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      plates: {
        Row: {
          area: number | null
          batch_id: string
          created_at: string
          height: number
          id: string
          plate_code: string
          remaining_area: number
          status: Database["public"]["Enums"]["plate_status"]
          updated_at: string
          warehouse_id: string | null
          width: number
        }
        Insert: {
          area?: number | null
          batch_id: string
          created_at?: string
          height?: number
          id?: string
          plate_code?: string
          remaining_area?: number
          status?: Database["public"]["Enums"]["plate_status"]
          updated_at?: string
          warehouse_id?: string | null
          width?: number
        }
        Update: {
          area?: number | null
          batch_id?: string
          created_at?: string
          height?: number
          id?: string
          plate_code?: string
          remaining_area?: number
          status?: Database["public"]["Enums"]["plate_status"]
          updated_at?: string
          warehouse_id?: string | null
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "plates_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "plate_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plates_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      stock_transfers: {
        Row: {
          created_at: string
          from_warehouse_id: string | null
          id: string
          item_code: string
          item_type: string
          offcut_id: string | null
          performed_by: string | null
          plate_id: string | null
          reason: string | null
          to_warehouse_id: string | null
        }
        Insert: {
          created_at?: string
          from_warehouse_id?: string | null
          id?: string
          item_code?: string
          item_type?: string
          offcut_id?: string | null
          performed_by?: string | null
          plate_id?: string | null
          reason?: string | null
          to_warehouse_id?: string | null
        }
        Update: {
          created_at?: string
          from_warehouse_id?: string | null
          id?: string
          item_code?: string
          item_type?: string
          offcut_id?: string | null
          performed_by?: string | null
          plate_id?: string | null
          reason?: string | null
          to_warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_transfers_from_warehouse_id_fkey"
            columns: ["from_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_offcut_id_fkey"
            columns: ["offcut_id"]
            isOneToOne: false
            referencedRelation: "offcuts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_plate_id_fkey"
            columns: ["plate_id"]
            isOneToOne: false
            referencedRelation: "plates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_transfers_to_warehouse_id_fkey"
            columns: ["to_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          contact_person: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
        }
        Insert: {
          address?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
        }
        Update: {
          address?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      warehouses: {
        Row: {
          code: string
          created_at: string
          id: string
          location: string | null
          name: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          location?: string | null
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          location?: string | null
          name?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role:
        | "administrator"
        | "production_manager"
        | "production_operator"
        | "store_keeper"
        | "management"
      batch_status: "active" | "depleted" | "quarantined"
      cycle_count_status: "draft" | "in_progress" | "completed" | "cancelled"
      job_status:
        | "draft"
        | "pending"
        | "approved"
        | "in_production"
        | "completed"
        | "cancelled"
      offcut_status: "available" | "reserved" | "used" | "scrapped"
      plate_status:
        | "available"
        | "reserved"
        | "partially_used"
        | "fully_consumed"
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
      app_role: [
        "administrator",
        "production_manager",
        "production_operator",
        "store_keeper",
        "management",
      ],
      batch_status: ["active", "depleted", "quarantined"],
      cycle_count_status: ["draft", "in_progress", "completed", "cancelled"],
      job_status: [
        "draft",
        "pending",
        "approved",
        "in_production",
        "completed",
        "cancelled",
      ],
      offcut_status: ["available", "reserved", "used", "scrapped"],
      plate_status: [
        "available",
        "reserved",
        "partially_used",
        "fully_consumed",
      ],
    },
  },
} as const
