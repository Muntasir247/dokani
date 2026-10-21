export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = "owner" | "manager" | "cashier";
export type PlanTier = "free" | "pro" | "business";
export type SerialStatus = "available" | "reserved" | "sold" | "returned" | "rma";
export type MovementType =
  | "purchase"
  | "sale"
  | "return"
  | "adjustment"
  | "transfer_in"
  | "transfer_out";
export type PaymentMethod = "cash" | "bkash" | "nagad" | "card" | "due";
export type SyncOp = "INSERT" | "UPDATE" | "DELETE";

export interface Database {
  public: {
    Tables: {
      tenants: {
        Row: {
          id: string;
          name: string;
          slug: string;
          currency: string;
          timezone: string;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
          version: number;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          currency?: string;
          timezone?: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
          version?: number;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          currency?: string;
          timezone?: string;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
          version?: number;
        };
      };
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string;
          phone: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
          version: number;
        };
        Insert: {
          id: string;
          email: string;
          full_name: string;
          phone?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
          version?: number;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string;
          phone?: string | null;
          avatar_url?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
          version?: number;
        };
      };
      tenant_members: {
        Row: {
          id: string;
          tenant_id: string;
          user_id: string;
          role: UserRole;
          is_active: boolean;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          deleted_at: string | null;
          version: number;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          user_id: string;
          role?: UserRole;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          user_id?: string;
          role?: UserRole;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
      };
      subscriptions: {
        Row: {
          id: string;
          tenant_id: string;
          plan_tier: PlanTier;
          status: string;
          current_period_start: string;
          current_period_end: string | null;
          max_stores: number;
          max_products: number;
          max_staff: number;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          deleted_at: string | null;
          version: number;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          plan_tier?: PlanTier;
          status?: string;
          current_period_start?: string;
          current_period_end?: string | null;
          max_stores?: number;
          max_products?: number;
          max_staff?: number;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          plan_tier?: PlanTier;
          status?: string;
          current_period_start?: string;
          current_period_end?: string | null;
          max_stores?: number;
          max_products?: number;
          max_staff?: number;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
      };
      stores: {
        Row: {
          id: string;
          tenant_id: string;
          name: string;
          code: string;
          address: string | null;
          phone: string | null;
          is_main: boolean;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          deleted_at: string | null;
          version: number;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          name: string;
          code: string;
          address?: string | null;
          phone?: string | null;
          is_main?: boolean;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          name?: string;
          code?: string;
          address?: string | null;
          phone?: string | null;
          is_main?: boolean;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
      };
      stock_locations: {
        Row: {
          id: string;
          tenant_id: string;
          store_id: string;
          name: string;
          is_default: boolean;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          deleted_at: string | null;
          version: number;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          store_id: string;
          name: string;
          is_default?: boolean;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          store_id?: string;
          name?: string;
          is_default?: boolean;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
      };
      categories: {
        Row: {
          id: string;
          tenant_id: string;
          parent_id: string | null;
          name: string;
          slug: string;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          deleted_at: string | null;
          version: number;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          parent_id?: string | null;
          name: string;
          slug: string;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          parent_id?: string | null;
          name?: string;
          slug?: string;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
      };
      brands: {
        Row: {
          id: string;
          tenant_id: string;
          name: string;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          deleted_at: string | null;
          version: number;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          name: string;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          name?: string;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
      };
      products: {
        Row: {
          id: string;
          tenant_id: string;
          category_id: string | null;
          brand_id: string | null;
          name: string;
          description: string | null;
          has_variants: boolean;
          has_serials: boolean;
          unit: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          deleted_at: string | null;
          version: number;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          category_id?: string | null;
          brand_id?: string | null;
          name: string;
          description?: string | null;
          has_variants?: boolean;
          has_serials?: boolean;
          unit?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          category_id?: string | null;
          brand_id?: string | null;
          name?: string;
          description?: string | null;
          has_variants?: boolean;
          has_serials?: boolean;
          unit?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
      };
      product_variants: {
        Row: {
          id: string;
          tenant_id: string;
          product_id: string;
          name: string;
          sku: string;
          barcode: string | null;
          cost_price: number; // Stored as integer poisha
          retail_price: number;
          wholesale_price: number;
          tax_rate: number;
          reorder_point: number;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          deleted_at: string | null;
          version: number;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          product_id: string;
          name?: string;
          sku: string;
          barcode?: string | null;
          cost_price?: number;
          retail_price?: number;
          wholesale_price?: number;
          tax_rate?: number;
          reorder_point?: number;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          product_id?: string;
          name?: string;
          sku?: string;
          barcode?: string | null;
          cost_price?: number;
          retail_price?: number;
          wholesale_price?: number;
          tax_rate?: number;
          reorder_point?: number;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
      };
      product_serials: {
        Row: {
          id: string;
          tenant_id: string;
          variant_id: string;
          stock_location_id: string;
          serial_number: string;
          status: SerialStatus;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          deleted_at: string | null;
          version: number;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          variant_id: string;
          stock_location_id: string;
          serial_number: string;
          status?: SerialStatus;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          variant_id?: string;
          stock_location_id?: string;
          serial_number?: string;
          status?: SerialStatus;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
      };
      customers: {
        Row: {
          id: string;
          tenant_id: string;
          name: string;
          phone: string | null;
          email: string | null;
          address: string | null;
          credit_limit: number;
          opening_balance: number;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          deleted_at: string | null;
          version: number;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          name: string;
          phone?: string | null;
          email?: string | null;
          address?: string | null;
          credit_limit?: number;
          opening_balance?: number;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          name?: string;
          phone?: string | null;
          email?: string | null;
          address?: string | null;
          credit_limit?: number;
          opening_balance?: number;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
      };
      suppliers: {
        Row: {
          id: string;
          tenant_id: string;
          name: string;
          company: string | null;
          phone: string | null;
          email: string | null;
          address: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          deleted_at: string | null;
          version: number;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          name: string;
          company?: string | null;
          phone?: string | null;
          email?: string | null;
          address?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          name?: string;
          company?: string | null;
          phone?: string | null;
          email?: string | null;
          address?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
      };
      purchases: {
        Row: {
          id: string;
          tenant_id: string;
          store_id: string;
          supplier_id: string | null;
          invoice_number: string;
          purchase_date: string;
          total_cost: number;
          paid_amount: number;
          notes: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          deleted_at: string | null;
          version: number;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          store_id: string;
          supplier_id?: string | null;
          invoice_number: string;
          purchase_date?: string;
          total_cost?: number;
          paid_amount?: number;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          store_id?: string;
          supplier_id?: string | null;
          invoice_number?: string;
          purchase_date?: string;
          total_cost?: number;
          paid_amount?: number;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
      };
      purchase_items: {
        Row: {
          id: string;
          tenant_id: string;
          purchase_id: string;
          variant_id: string;
          quantity: number;
          unit_cost: number;
          subtotal: number;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          deleted_at: string | null;
          version: number;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          purchase_id: string;
          variant_id: string;
          quantity: number;
          unit_cost: number;
          subtotal: number;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          purchase_id?: string;
          variant_id?: string;
          quantity?: number;
          unit_cost?: number;
          subtotal?: number;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
      };
      sales: {
        Row: {
          id: string;
          tenant_id: string;
          store_id: string;
          customer_id: string | null;
          cashier_id: string | null;
          invoice_number: string;
          subtotal: number;
          discount_amount: number;
          tax_amount: number;
          total_amount: number;
          paid_amount: number;
          due_amount: number;
          change_amount: number;
          notes: string | null;
          sold_at: string;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          deleted_at: string | null;
          version: number;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          store_id: string;
          customer_id?: string | null;
          cashier_id?: string | null;
          invoice_number: string;
          subtotal?: number;
          discount_amount?: number;
          tax_amount?: number;
          total_amount?: number;
          paid_amount?: number;
          due_amount?: number;
          change_amount?: number;
          notes?: string | null;
          sold_at?: string;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          store_id?: string;
          customer_id?: string | null;
          cashier_id?: string | null;
          invoice_number?: string;
          subtotal?: number;
          discount_amount?: number;
          tax_amount?: number;
          total_amount?: number;
          paid_amount?: number;
          due_amount?: number;
          change_amount?: number;
          notes?: string | null;
          sold_at?: string;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
      };
      sale_items: {
        Row: {
          id: string;
          tenant_id: string;
          sale_id: string;
          variant_id: string;
          quantity: number;
          unit_price: number;
          unit_cost: number;
          discount_amount: number;
          tax_amount: number;
          subtotal: number;
          serial_numbers: string[];
          created_at: string;
          updated_at: string;
          created_by: string | null;
          deleted_at: string | null;
          version: number;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          sale_id: string;
          variant_id: string;
          quantity: number;
          unit_price: number;
          unit_cost?: number;
          discount_amount?: number;
          tax_amount?: number;
          subtotal: number;
          serial_numbers?: string[];
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          sale_id?: string;
          variant_id?: string;
          quantity?: number;
          unit_price?: number;
          unit_cost?: number;
          discount_amount?: number;
          tax_amount?: number;
          subtotal?: number;
          serial_numbers?: string[];
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
      };
      sale_payments: {
        Row: {
          id: string;
          tenant_id: string;
          sale_id: string;
          method: PaymentMethod;
          amount: number;
          reference: string | null;
          paid_at: string;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          deleted_at: string | null;
          version: number;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          sale_id: string;
          method: PaymentMethod;
          amount: number;
          reference?: string | null;
          paid_at?: string;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          sale_id?: string;
          method?: PaymentMethod;
          amount?: number;
          reference?: string | null;
          paid_at?: string;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
      };
      returns: {
        Row: {
          id: string;
          tenant_id: string;
          sale_id: string | null;
          store_id: string;
          customer_id: string | null;
          return_number: string;
          refund_amount: number;
          reason: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          deleted_at: string | null;
          version: number;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          sale_id?: string | null;
          store_id: string;
          customer_id?: string | null;
          return_number: string;
          refund_amount?: number;
          reason?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          sale_id?: string | null;
          store_id?: string;
          customer_id?: string | null;
          return_number?: string;
          refund_amount?: number;
          reason?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
      };
      stock_movements: {
        Row: {
          id: string;
          tenant_id: string;
          location_id: string;
          variant_id: string;
          type: MovementType;
          quantity: number;
          unit_cost: number;
          reference_id: string | null;
          reference_type: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          deleted_at: string | null;
          version: number;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          location_id: string;
          variant_id: string;
          type: MovementType;
          quantity: number;
          unit_cost?: number;
          reference_id?: string | null;
          reference_type?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          location_id?: string;
          variant_id?: string;
          type?: MovementType;
          quantity?: number;
          unit_cost?: number;
          reference_id?: string | null;
          reference_type?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
      };
      expenses: {
        Row: {
          id: string;
          tenant_id: string;
          store_id: string;
          category: string;
          amount: number;
          payment_method: PaymentMethod;
          expense_date: string;
          notes: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          deleted_at: string | null;
          version: number;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          store_id: string;
          category: string;
          amount: number;
          payment_method?: PaymentMethod;
          expense_date?: string;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          store_id?: string;
          category?: string;
          amount?: number;
          payment_method?: PaymentMethod;
          expense_date?: string;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
      };
      audit_logs: {
        Row: {
          id: string;
          tenant_id: string;
          actor_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string;
          old_values: Json | null;
          new_values: Json | null;
          ip_address: string | null;
          user_agent: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          actor_id?: string | null;
          action: string;
          entity_type: string;
          entity_id: string;
          old_values?: Json | null;
          new_values?: Json | null;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          actor_id?: string | null;
          action?: string;
          entity_type?: string;
          entity_id?: string;
          old_values?: Json | null;
          new_values?: Json | null;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
      };
      sync_changes: {
        Row: {
          id: string;
          tenant_id: string;
          table_name: string;
          record_id: string;
          op: SyncOp;
          record_version: number;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          table_name: string;
          record_id: string;
          op: SyncOp;
          record_version: number;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          table_name?: string;
          record_id?: string;
          op?: SyncOp;
          record_version?: number;
          updated_at?: string;
        };
      };
      idempotency_keys: {
        Row: {
          id: string;
          tenant_id: string;
          key: string;
          resource_type: string;
          response_status: number;
          response_payload: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          key: string;
          resource_type: string;
          response_status: number;
          response_payload?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          key?: string;
          resource_type?: string;
          response_status?: number;
          response_payload?: Json | null;
          created_at?: string;
        };
      };
    };
    Views: {
      view_current_stock: {
        Row: {
          tenant_id: string;
          location_id: string;
          store_id: string;
          store_name: string;
          location_name: string;
          variant_id: string;
          product_id: string;
          product_name: string;
          variant_name: string;
          sku: string;
          barcode: string | null;
          cost_price: number;
          retail_price: number;
          reorder_point: number;
          current_stock: number;
          total_purchased: number;
          total_sold: number;
          total_returned: number;
          total_adjusted: number;
          total_transferred_in: number;
          total_transferred_out: number;
          last_movement_at: string | null;
          is_low_stock: boolean;
        };
      };
    };
    Functions: {
      fn_get_stock_quantity: {
        Args: {
          p_tenant_id: string;
          p_variant_id: string;
          p_location_id?: string;
        };
        Returns: number;
      };
      fn_has_sufficient_stock: {
        Args: {
          p_tenant_id: string;
          p_location_id: string;
          p_variant_id: string;
          p_requested_quantity: number;
        };
        Returns: boolean;
      };
    };
  };
}
