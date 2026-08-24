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
      audit_log: {
        Row: {
          action: string
          after: Json | null
          before: Json | null
          entity: string
          entity_id: string | null
          hospital_id: string | null
          id: string
          occurred_at: string
          user_id: string | null
        }
        Insert: {
          action: string
          after?: Json | null
          before?: Json | null
          entity: string
          entity_id?: string | null
          hospital_id?: string | null
          id?: string
          occurred_at?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          after?: Json | null
          before?: Json | null
          entity?: string
          entity_id?: string | null
          hospital_id?: string | null
          id?: string
          occurred_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      batches: {
        Row: {
          block_reason: string | null
          code: string | null
          created_at: string
          created_by: string | null
          expiration_date: string | null
          hospital_id: string
          id: string
          manufacture_date: string | null
          product_id: string
          status: Database["public"]["Enums"]["batch_status"]
          supplier_id: string | null
          unit_cost: number | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          block_reason?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          expiration_date?: string | null
          hospital_id: string
          id?: string
          manufacture_date?: string | null
          product_id: string
          status?: Database["public"]["Enums"]["batch_status"]
          supplier_id?: string | null
          unit_cost?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          block_reason?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          expiration_date?: string | null
          hospital_id?: string
          id?: string
          manufacture_date?: string | null
          product_id?: string
          status?: Database["public"]["Enums"]["batch_status"]
          supplier_id?: string | null
          unit_cost?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "batches_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          hospital_id: string
          id: string
          name: string
          parent_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          hospital_id: string
          id?: string
          name: string
          parent_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          hospital_id?: string
          id?: string
          name?: string
          parent_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "categories_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      hospitals: {
        Row: {
          active: boolean
          cnpj: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          id: string
          name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          cnpj?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          cnpj?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      movements: {
        Row: {
          adjustment_direction:
            | Database["public"]["Enums"]["adjustment_direction"]
            | null
          batch: string | null
          batch_id: string | null
          browser: string | null
          client_datetime: string | null
          created_at: string
          device: string | null
          document_ref: string | null
          expiration_date: string | null
          hospital_id: string
          id: string
          ip_address: unknown
          movement_reason: string | null
          movement_type: Database["public"]["Enums"]["movement_type"]
          observation: string | null
          occurred_at: string
          override_reason: string | null
          product_id: string
          quantity: number
          reference_id: string | null
          reference_type: string | null
          stock_center_dest_id: string | null
          stock_center_id: string | null
          transfer_group_id: string | null
          type: Database["public"]["Enums"]["movement_kind"] | null
          unit_cost: number | null
          user_id: string | null
        }
        Insert: {
          adjustment_direction?:
            | Database["public"]["Enums"]["adjustment_direction"]
            | null
          batch?: string | null
          batch_id?: string | null
          browser?: string | null
          client_datetime?: string | null
          created_at?: string
          device?: string | null
          document_ref?: string | null
          expiration_date?: string | null
          hospital_id: string
          id?: string
          ip_address?: unknown
          movement_reason?: string | null
          movement_type: Database["public"]["Enums"]["movement_type"]
          observation?: string | null
          occurred_at?: string
          override_reason?: string | null
          product_id: string
          quantity: number
          reference_id?: string | null
          reference_type?: string | null
          stock_center_dest_id?: string | null
          stock_center_id?: string | null
          transfer_group_id?: string | null
          type?: Database["public"]["Enums"]["movement_kind"] | null
          unit_cost?: number | null
          user_id?: string | null
        }
        Update: {
          adjustment_direction?:
            | Database["public"]["Enums"]["adjustment_direction"]
            | null
          batch?: string | null
          batch_id?: string | null
          browser?: string | null
          client_datetime?: string | null
          created_at?: string
          device?: string | null
          document_ref?: string | null
          expiration_date?: string | null
          hospital_id?: string
          id?: string
          ip_address?: unknown
          movement_reason?: string | null
          movement_type?: Database["public"]["Enums"]["movement_type"]
          observation?: string | null
          occurred_at?: string
          override_reason?: string | null
          product_id?: string
          quantity?: number
          reference_id?: string | null
          reference_type?: string | null
          stock_center_dest_id?: string | null
          stock_center_id?: string | null
          transfer_group_id?: string | null
          type?: Database["public"]["Enums"]["movement_kind"] | null
          unit_cost?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "movements_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movements_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movements_stock_center_dest_id_fkey"
            columns: ["stock_center_dest_id"]
            isOneToOne: false
            referencedRelation: "stock_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movements_stock_center_id_fkey"
            columns: ["stock_center_id"]
            isOneToOne: false
            referencedRelation: "stock_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      product_gtins: {
        Row: {
          created_at: string
          created_by: string | null
          gtin: string
          hospital_id: string
          id: string
          packaging_level: string
          product_id: string
          quantity_per_gtin: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          gtin: string
          hospital_id: string
          id?: string
          packaging_level?: string
          product_id: string
          quantity_per_gtin?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          gtin?: string
          hospital_id?: string
          id?: string
          packaging_level?: string
          product_id?: string
          quantity_per_gtin?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_gtins_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_gtins_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          allows_fractioning: boolean
          average_daily_consumption: number | null
          barcode: string | null
          category_id: string | null
          cold_chain: boolean
          consumption_unit: string | null
          controlled_drug: boolean
          created_at: string
          created_by: string | null
          default_supplier_id: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string
          gtin: string | null
          hospital_id: string
          id: string
          internal_code: string | null
          last_purchase_at: string | null
          last_purchase_price: number | null
          lead_time_days: number | null
          manufacturer: string | null
          maximum_stock: number | null
          minimum_stock: number | null
          package_quantity: number
          purchase_unit: string | null
          requires_batch: boolean
          requires_expiration_date: boolean
          short_description: string | null
          unit: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          allows_fractioning?: boolean
          average_daily_consumption?: number | null
          barcode?: string | null
          category_id?: string | null
          cold_chain?: boolean
          consumption_unit?: string | null
          controlled_drug?: boolean
          created_at?: string
          created_by?: string | null
          default_supplier_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description: string
          gtin?: string | null
          hospital_id: string
          id?: string
          internal_code?: string | null
          last_purchase_at?: string | null
          last_purchase_price?: number | null
          lead_time_days?: number | null
          manufacturer?: string | null
          maximum_stock?: number | null
          minimum_stock?: number | null
          package_quantity?: number
          purchase_unit?: string | null
          requires_batch?: boolean
          requires_expiration_date?: boolean
          short_description?: string | null
          unit?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          allows_fractioning?: boolean
          average_daily_consumption?: number | null
          barcode?: string | null
          category_id?: string | null
          cold_chain?: boolean
          consumption_unit?: string | null
          controlled_drug?: boolean
          created_at?: string
          created_by?: string | null
          default_supplier_id?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string
          gtin?: string | null
          hospital_id?: string
          id?: string
          internal_code?: string | null
          last_purchase_at?: string | null
          last_purchase_price?: number | null
          lead_time_days?: number | null
          manufacturer?: string | null
          maximum_stock?: number | null
          minimum_stock?: number | null
          package_quantity?: number
          purchase_unit?: string | null
          requires_batch?: boolean
          requires_expiration_date?: boolean
          short_description?: string | null
          unit?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_default_supplier_id_fkey"
            columns: ["default_supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          email: string | null
          full_name: string | null
          hospital_id: string | null
          id: string
          stock_center_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string | null
          full_name?: string | null
          hospital_id?: string | null
          id: string
          stock_center_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string | null
          full_name?: string | null
          hospital_id?: string | null
          id?: string
          stock_center_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_stock_center_id_fkey"
            columns: ["stock_center_id"]
            isOneToOne: false
            referencedRelation: "stock_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      receipt_items: {
        Row: {
          batch: string | null
          batch_id: string | null
          consumption_quantity: number
          created_at: string
          description: string
          expiration_date: string | null
          gtin: string | null
          hospital_id: string
          id: string
          manufacture_date: string | null
          movement_id: string | null
          package_quantity: number
          product_id: string | null
          purchase_quantity: number
          purchase_unit: string | null
          receipt_id: string
          status: string
          supplier_code: string | null
          unit_cost: number | null
          updated_at: string
        }
        Insert: {
          batch?: string | null
          batch_id?: string | null
          consumption_quantity: number
          created_at?: string
          description: string
          expiration_date?: string | null
          gtin?: string | null
          hospital_id: string
          id?: string
          manufacture_date?: string | null
          movement_id?: string | null
          package_quantity?: number
          product_id?: string | null
          purchase_quantity: number
          purchase_unit?: string | null
          receipt_id: string
          status?: string
          supplier_code?: string | null
          unit_cost?: number | null
          updated_at?: string
        }
        Update: {
          batch?: string | null
          batch_id?: string | null
          consumption_quantity?: number
          created_at?: string
          description?: string
          expiration_date?: string | null
          gtin?: string | null
          hospital_id?: string
          id?: string
          manufacture_date?: string | null
          movement_id?: string | null
          package_quantity?: number
          product_id?: string | null
          purchase_quantity?: number
          purchase_unit?: string | null
          receipt_id?: string
          status?: string
          supplier_code?: string | null
          unit_cost?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipt_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_items_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_items_movement_id_fkey"
            columns: ["movement_id"]
            isOneToOne: false
            referencedRelation: "movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_items_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      receipts: {
        Row: {
          created_at: string
          created_by: string | null
          hospital_id: string
          id: string
          issue_date: string | null
          nfe_key: string | null
          nfe_number: string | null
          nfe_series: string | null
          observation: string | null
          source: Database["public"]["Enums"]["receipt_source"]
          status: Database["public"]["Enums"]["receipt_status"]
          stock_center_id: string | null
          supplier_id: string | null
          total_value: number | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          hospital_id: string
          id?: string
          issue_date?: string | null
          nfe_key?: string | null
          nfe_number?: string | null
          nfe_series?: string | null
          observation?: string | null
          source?: Database["public"]["Enums"]["receipt_source"]
          status?: Database["public"]["Enums"]["receipt_status"]
          stock_center_id?: string | null
          supplier_id?: string | null
          total_value?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          hospital_id?: string
          id?: string
          issue_date?: string | null
          nfe_key?: string | null
          nfe_number?: string | null
          nfe_series?: string | null
          observation?: string | null
          source?: Database["public"]["Enums"]["receipt_source"]
          status?: Database["public"]["Enums"]["receipt_status"]
          stock_center_id?: string | null
          supplier_id?: string | null
          total_value?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "receipts_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_stock_center_id_fkey"
            columns: ["stock_center_id"]
            isOneToOne: false
            referencedRelation: "stock_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_balances: {
        Row: {
          batch_id: string
          created_at: string
          hospital_id: string
          id: string
          location_id: string
          product_id: string
          quantity_available: number | null
          quantity_reserved: number
          quantity_total: number
          updated_at: string
        }
        Insert: {
          batch_id: string
          created_at?: string
          hospital_id: string
          id?: string
          location_id: string
          product_id: string
          quantity_available?: number | null
          quantity_reserved?: number
          quantity_total?: number
          updated_at?: string
        }
        Update: {
          batch_id?: string
          created_at?: string
          hospital_id?: string
          id?: string
          location_id?: string
          product_id?: string
          quantity_available?: number | null
          quantity_reserved?: number
          quantity_total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_balances_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_balances_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_balances_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stock_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_balances_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_centers: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          hospital_id: string
          id: string
          name: string
          type: Database["public"]["Enums"]["stock_center_type"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          hospital_id: string
          id?: string
          name: string
          type?: Database["public"]["Enums"]["stock_center_type"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          hospital_id?: string
          id?: string
          name?: string
          type?: Database["public"]["Enums"]["stock_center_type"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_centers_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_thresholds: {
        Row: {
          created_at: string
          created_by: string | null
          hospital_id: string
          id: string
          location_id: string
          max_quantity: number | null
          min_quantity: number
          product_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          hospital_id: string
          id?: string
          location_id: string
          max_quantity?: number | null
          min_quantity?: number
          product_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          hospital_id?: string
          id?: string
          location_id?: string
          max_quantity?: number | null
          min_quantity?: number
          product_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_thresholds_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_thresholds_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stock_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_thresholds_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          active: boolean
          avg_delivery_days: number | null
          cnpj: string | null
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          delivery_reliability: number | null
          free_shipping_threshold: number | null
          hospital_id: string
          id: string
          minimum_order_value: number | null
          name: string
          payment_terms: string | null
          rating: number | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          avg_delivery_days?: number | null
          cnpj?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          delivery_reliability?: number | null
          free_shipping_threshold?: number | null
          hospital_id: string
          id?: string
          minimum_order_value?: number | null
          name: string
          payment_terms?: string | null
          rating?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          avg_delivery_days?: number | null
          cnpj?: string | null
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          delivery_reliability?: number | null
          free_shipping_threshold?: number | null
          hospital_id?: string
          id?: string
          minimum_order_value?: number | null
          name?: string
          payment_terms?: string | null
          rating?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          hospital_id: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          hospital_id?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          hospital_id?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_stock_alerts: {
        Row: {
          alert_kind: string | null
          description: string | null
          hospital_id: string | null
          metric: number | null
          product_id: string | null
          ref_date: string | null
          stock_center_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_balances_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_balances_location_id_fkey"
            columns: ["stock_center_id"]
            isOneToOne: false
            referencedRelation: "stock_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_balances_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      v_stock_balances: {
        Row: {
          barcode: string | null
          batch_code: string | null
          batch_id: string | null
          batch_status: Database["public"]["Enums"]["batch_status"] | null
          consumption_unit: string | null
          days_to_expire: number | null
          description: string | null
          expiration_date: string | null
          hospital_id: string | null
          id: string | null
          internal_code: string | null
          location_id: string | null
          location_name: string | null
          location_type: Database["public"]["Enums"]["stock_center_type"] | null
          manufacture_date: string | null
          max_quantity: number | null
          min_quantity: number | null
          product_id: string | null
          quantity_available: number | null
          quantity_reserved: number | null
          quantity_total: number | null
          replenishment_status: string | null
          stock_value: number | null
          unit: string | null
          unit_cost: number | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_balances_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_balances_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_balances_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "stock_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_balances_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      v_stock_health: {
        Row: {
          coverage_days: number | null
          current_stock: number | null
          description: string | null
          hospital_id: string | null
          last_movement_at: string | null
          maximum_stock: number | null
          minimum_stock: number | null
          product_id: string | null
          stock_center_id: string | null
          stock_value: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_balances_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_balances_location_id_fkey"
            columns: ["stock_center_id"]
            isOneToOne: false
            referencedRelation: "stock_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_balances_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      can_operate_stock: { Args: { _user_id: string }; Returns: boolean }
      create_product_with_initial_entry: {
        Args: { p_entry: Json; p_product: Json }
        Returns: Json
      }
      current_hospital_id: { Args: never; Returns: string }
      ensure_batch: {
        Args: {
          p_code: string
          p_expiration: string
          p_hospital_id: string
          p_manufacture?: string
          p_product_id: string
          p_supplier_id?: string
          p_unit_cost?: number
        }
        Returns: string
      }
      fefo_allocate: {
        Args: {
          p_location_id: string
          p_product_id: string
          p_quantity: number
        }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin_or_manager: { Args: { _user_id: string }; Returns: boolean }
      process_movement: {
        Args: {
          p_adjustment_direction?: string
          p_allocations: Json
          p_destination_location_id?: string
          p_document_ref?: string
          p_origin_location_id?: string
          p_override_reason?: string
          p_reason?: string
          p_reference_id?: string
          p_reference_type?: string
          p_type: string
          p_user_id?: string
        }
        Returns: Json
      }
      receive_product_batch: { Args: { p: Json }; Returns: Json }
      register_movement: { Args: { p: Json }; Returns: Json }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      adjustment_direction: "increase" | "decrease"
      app_role:
        | "administrator"
        | "warehouse"
        | "pharmacy"
        | "audit"
        | "manager"
        | "read_only"
      batch_status: "ACTIVE" | "BLOCKED" | "EXPIRED"
      movement_kind:
        | "ENTRY"
        | "TRANSFER"
        | "DISPENSE"
        | "RETURN"
        | "LOSS"
        | "ADJUSTMENT"
      movement_type:
        | "initial_entry"
        | "simple_output"
        | "inventory_adjustment"
        | "transfer"
        | "purchase"
        | "return"
        | "consumption"
        | "purchase_entry"
        | "positive_adjustment"
        | "negative_adjustment"
        | "loss"
        | "expired"
      receipt_source: "xml" | "gs1" | "manual"
      receipt_status: "draft" | "completed" | "cancelled"
      stock_center_type:
        | "central_warehouse"
        | "clinical_pharmacy"
        | "surgical_pharmacy"
        | "emergency_pharmacy"
        | "icu_pharmacy"
        | "other"
      stock_status:
        | "healthy"
        | "warning"
        | "near_expiration"
        | "critical"
        | "no_movement"
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
      adjustment_direction: ["increase", "decrease"],
      app_role: [
        "administrator",
        "warehouse",
        "pharmacy",
        "audit",
        "manager",
        "read_only",
      ],
      batch_status: ["ACTIVE", "BLOCKED", "EXPIRED"],
      movement_kind: [
        "ENTRY",
        "TRANSFER",
        "DISPENSE",
        "RETURN",
        "LOSS",
        "ADJUSTMENT",
      ],
      movement_type: [
        "initial_entry",
        "simple_output",
        "inventory_adjustment",
        "transfer",
        "purchase",
        "return",
        "consumption",
        "purchase_entry",
        "positive_adjustment",
        "negative_adjustment",
        "loss",
        "expired",
      ],
      receipt_source: ["xml", "gs1", "manual"],
      receipt_status: ["draft", "completed", "cancelled"],
      stock_center_type: [
        "central_warehouse",
        "clinical_pharmacy",
        "surgical_pharmacy",
        "emergency_pharmacy",
        "icu_pharmacy",
        "other",
      ],
      stock_status: [
        "healthy",
        "warning",
        "near_expiration",
        "critical",
        "no_movement",
      ],
    },
  },
} as const
