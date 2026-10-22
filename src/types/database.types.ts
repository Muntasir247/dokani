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
export type CustomerPriceTier = "retail" | "wholesale" | "custom";

export type Database = {
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
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string;
          phone: string | null;
          avatar_url: string | null;
          is_super_admin: boolean;
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
          is_super_admin?: boolean;
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
          is_super_admin?: boolean;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
          version?: number;
        };
        Relationships: [];
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
        Relationships: [
          {
            foreignKeyName: "tenant_members_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tenant_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      tenant_invitations: {
        Row: {
          id: string;
          tenant_id: string;
          email: string;
          role: UserRole;
          token: string;
          invited_by: string | null;
          expires_at: string;
          accepted_at: string | null;
          created_at: string;
          updated_at: string;
          created_by: string | null;
          deleted_at: string | null;
          version: number;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          email: string;
          role?: UserRole;
          token: string;
          invited_by?: string | null;
          expires_at?: string;
          accepted_at?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          email?: string;
          role?: UserRole;
          token?: string;
          invited_by?: string | null;
          expires_at?: string;
          accepted_at?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "tenant_invitations_tenant_id_fkey";
            columns: ["tenant_id"];
            isOneToOne: false;
            referencedRelation: "tenants";
            referencedColumns: ["id"];
          },
        ];
      };
      subscriptions: {
        Row: {
          id: string;
          tenant_id: string;
          plan_tier: PlanTier;
          status: string;
          current_period_start: string;
          current_period_end: string | null;
          trial_ends_at: string | null;
          grace_period_ends_at: string | null;
          cancel_at_period_end: boolean;
          billing_interval: "month" | "year";
          payment_provider: string | null;
          provider_subscription_id: string | null;
          provider_customer_id: string | null;
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
          trial_ends_at?: string | null;
          grace_period_ends_at?: string | null;
          cancel_at_period_end?: boolean;
          billing_interval?: "month" | "year";
          payment_provider?: string | null;
          provider_subscription_id?: string | null;
          provider_customer_id?: string | null;
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
          trial_ends_at?: string | null;
          grace_period_ends_at?: string | null;
          cancel_at_period_end?: boolean;
          billing_interval?: "month" | "year";
          payment_provider?: string | null;
          provider_subscription_id?: string | null;
          provider_customer_id?: string | null;
          max_stores?: number;
          max_products?: number;
          max_staff?: number;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
        Relationships: [];
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
          vat_bin_number: string | null;
          receipt_footer: string | null;
          invoice_prefix: string | null;
          default_paper_size: "80mm" | "a4";
          logo_url: string | null;
          payment_terms: string | null;
          bank_details: string | null;
          tax_enabled: boolean;
          default_tax_rate: number;
          default_currency: string;
          loyalty_enabled: boolean;
          loyalty_earn_rate_poisha: number;
          loyalty_redeem_rate_poisha: number;
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
          vat_bin_number?: string | null;
          receipt_footer?: string | null;
          invoice_prefix?: string | null;
          default_paper_size?: "80mm" | "a4";
          logo_url?: string | null;
          payment_terms?: string | null;
          bank_details?: string | null;
          tax_enabled?: boolean;
          default_tax_rate?: number;
          default_currency?: string;
          loyalty_enabled?: boolean;
          loyalty_earn_rate_poisha?: number;
          loyalty_redeem_rate_poisha?: number;
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
          vat_bin_number?: string | null;
          receipt_footer?: string | null;
          invoice_prefix?: string | null;
          default_paper_size?: "80mm" | "a4";
          logo_url?: string | null;
          payment_terms?: string | null;
          bank_details?: string | null;
          tax_enabled?: boolean;
          default_tax_rate?: number;
          default_currency?: string;
          loyalty_enabled?: boolean;
          loyalty_earn_rate_poisha?: number;
          loyalty_redeem_rate_poisha?: number;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
      };
      products: {
        Row: {
          id: string;
          tenant_id: string;
          category_id: string | null;
          brand_id: string | null;
          name: string;
          description: string | null;
          image_url: string | null;
          has_variants: boolean;
          has_serials: boolean;
          warranty_months: number;
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
          image_url?: string | null;
          has_variants?: boolean;
          has_serials?: boolean;
          warranty_months?: number;
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
          image_url?: string | null;
          has_variants?: boolean;
          has_serials?: boolean;
          warranty_months?: number;
          unit?: string;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
        Relationships: [];
      };
      product_variants: {
        Row: {
          id: string;
          tenant_id: string;
          product_id: string;
          name: string;
          sku: string;
          barcode: string | null;
          image_url: string | null;
          options: Json;
          cost_price: number;
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
          image_url?: string | null;
          options?: Json;
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
          image_url?: string | null;
          options?: Json;
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
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      product_serials: {
        Row: {
          id: string;
          tenant_id: string;
          variant_id: string;
          stock_location_id: string;
          serial_number: string;
          status: SerialStatus;
          warranty_months: number;
          times_sold: number;
          sold_at: string | null;
          sale_id: string | null;
          sale_item_id: string | null;
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
          warranty_months?: number;
          times_sold?: number;
          sold_at?: string | null;
          sale_id?: string | null;
          sale_item_id?: string | null;
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
          warranty_months?: number;
          times_sold?: number;
          sold_at?: string | null;
          sale_id?: string | null;
          sale_item_id?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
        Relationships: [];
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
          price_tier: CustomerPriceTier;
          loyalty_points: number;
          tax_id: string | null;
          company_name: string | null;
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
          price_tier?: CustomerPriceTier;
          loyalty_points?: number;
          tax_id?: string | null;
          company_name?: string | null;
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
          price_tier?: CustomerPriceTier;
          loyalty_points?: number;
          tax_id?: string | null;
          company_name?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
        Relationships: [];
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
          company?: string | null;
          phone?: string | null;
          email?: string | null;
          address?: string | null;
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
          company?: string | null;
          phone?: string | null;
          email?: string | null;
          address?: string | null;
          opening_balance?: number;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
      };
      sales: {
        Row: {
          id: string;
          tenant_id: string;
          store_id: string;
          customer_id: string | null;
          cashier_id: string | null;
          invoice_number: string;
          offline_invoice_number: string | null;
          subtotal: number;
          discount_amount: number;
          tax_amount: number;
          total_amount: number;
          paid_amount: number;
          due_amount: number;
          change_amount: number;
          share_token: string;
          points_earned: number;
          points_redeemed: number;
          notes: string | null;
          status: "completed" | "voided" | "partially_returned" | "returned";
          voided_at: string | null;
          voided_by: string | null;
          void_reason: string | null;
          discount_type: string;
          discount_rate: number;
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
          offline_invoice_number?: string | null;
          subtotal?: number;
          discount_amount?: number;
          tax_amount?: number;
          total_amount?: number;
          paid_amount?: number;
          due_amount?: number;
          change_amount?: number;
          share_token?: string;
          points_earned?: number;
          points_redeemed?: number;
          notes?: string | null;
          status?: "completed" | "voided" | "partially_returned" | "returned";
          voided_at?: string | null;
          voided_by?: string | null;
          void_reason?: string | null;
          discount_type?: string;
          discount_rate?: number;
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
          offline_invoice_number?: string | null;
          subtotal?: number;
          discount_amount?: number;
          tax_amount?: number;
          total_amount?: number;
          paid_amount?: number;
          due_amount?: number;
          change_amount?: number;
          share_token?: string;
          points_earned?: number;
          points_redeemed?: number;
          notes?: string | null;
          status?: "completed" | "voided" | "partially_returned" | "returned";
          voided_at?: string | null;
          voided_by?: string | null;
          void_reason?: string | null;
          discount_type?: string;
          discount_rate?: number;
          sold_at?: string;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
          refund_method: PaymentMethod;
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
          refund_method?: PaymentMethod;
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
          refund_method?: PaymentMethod;
          reason?: string | null;
          created_at?: string;
          updated_at?: string;
          created_by?: string | null;
          deleted_at?: string | null;
          version?: number;
        };
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
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
        Relationships: [];
      };
      branch_invoice_sequences: {
        Row: {
          tenant_id: string;
          store_id: string;
          prefix: string;
          last_seq: number;
          updated_at: string;
        };
        Insert: {
          tenant_id: string;
          store_id: string;
          prefix?: string;
          last_seq?: number;
          updated_at?: string;
        };
        Update: {
          tenant_id?: string;
          store_id?: string;
          prefix?: string;
          last_seq?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      return_items: {
        Row: {
          id: string;
          tenant_id: string;
          return_id: string;
          sale_item_id: string | null;
          variant_id: string;
          quantity: number;
          refund_unit_price: number;
          subtotal: number;
          restock: boolean;
          serial_numbers: string[];
          created_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          return_id: string;
          sale_item_id?: string | null;
          variant_id: string;
          quantity: number;
          refund_unit_price: number;
          subtotal: number;
          restock?: boolean;
          serial_numbers?: string[];
          created_at?: string;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          return_id?: string;
          sale_item_id?: string | null;
          variant_id?: string;
          quantity?: number;
          refund_unit_price?: number;
          subtotal?: number;
          restock?: boolean;
          serial_numbers?: string[];
          created_at?: string;
          created_by?: string | null;
        };
        Relationships: [];
      };
      customer_payments: {
        Row: {
          id: string;
          tenant_id: string;
          customer_id: string;
          sale_id: string | null;
          amount: number;
          payment_method: PaymentMethod;
          reference: string | null;
          notes: string | null;
          paid_at: string;
          created_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          customer_id: string;
          sale_id?: string | null;
          amount: number;
          payment_method?: PaymentMethod;
          reference?: string | null;
          notes?: string | null;
          paid_at?: string;
          created_at?: string;
          created_by?: string | null;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          customer_id?: string;
          sale_id?: string | null;
          amount?: number;
          payment_method?: PaymentMethod;
          reference?: string | null;
          notes?: string | null;
          paid_at?: string;
          created_at?: string;
          created_by?: string | null;
        };
        Relationships: [];
      };
      tenant_devices: {
        Row: {
          id: string;
          tenant_id: string;
          store_id: string;
          device_code: string;
          device_name: string;
          is_revoked: boolean;
          revoked_at: string | null;
          revoked_by: string | null;
          last_sync_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          store_id: string;
          device_code: string;
          device_name: string;
          is_revoked?: boolean;
          revoked_at?: string | null;
          revoked_by?: string | null;
          last_sync_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          store_id?: string;
          device_code?: string;
          device_name?: string;
          is_revoked?: boolean;
          revoked_at?: string | null;
          revoked_by?: string | null;
          last_sync_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      subscription_invoices: {
        Row: {
          id: string;
          tenant_id: string;
          invoice_number: string;
          amount_poisha: number;
          currency: string;
          plan_tier: PlanTier;
          billing_interval: "month" | "year";
          status: "pending" | "paid" | "failed" | "refunded";
          payment_provider: string;
          provider_transaction_id: string | null;
          provider_payload: Json | null;
          period_start: string;
          period_end: string;
          paid_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          invoice_number: string;
          amount_poisha: number;
          currency?: string;
          plan_tier: PlanTier;
          billing_interval?: "month" | "year";
          status?: "pending" | "paid" | "failed" | "refunded";
          payment_provider: string;
          provider_transaction_id?: string | null;
          provider_payload?: Json | null;
          period_start: string;
          period_end: string;
          paid_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          invoice_number?: string;
          amount_poisha?: number;
          currency?: string;
          plan_tier?: PlanTier;
          billing_interval?: "month" | "year";
          status?: "pending" | "paid" | "failed" | "refunded";
          payment_provider?: string;
          provider_transaction_id?: string | null;
          provider_payload?: Json | null;
          period_start?: string;
          period_end?: string;
          paid_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      payment_webhooks_log: {
        Row: {
          id: string;
          provider: string;
          idempotency_key: string;
          event_type: string | null;
          status: string;
          payload: Json;
          error_message: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          provider: string;
          idempotency_key: string;
          event_type?: string | null;
          status?: string;
          payload: Json;
          error_message?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          provider?: string;
          idempotency_key?: string;
          event_type?: string | null;
          status?: string;
          payload?: Json;
          error_message?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      cash_drawer_sessions: {
        Row: {
          id: string;
          tenant_id: string;
          store_id: string;
          cashier_id: string;
          opened_at: string;
          closed_at: string | null;
          opening_float_poisha: number;
          closing_counted_poisha: number | null;
          expected_cash_poisha: number | null;
          cash_variance_poisha: number | null;
          status: "open" | "closed";
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          store_id: string;
          cashier_id: string;
          opened_at?: string;
          closed_at?: string | null;
          opening_float_poisha?: number;
          closing_counted_poisha?: number | null;
          expected_cash_poisha?: number | null;
          cash_variance_poisha?: number | null;
          status?: "open" | "closed";
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          store_id?: string;
          cashier_id?: string;
          opened_at?: string;
          closed_at?: string | null;
          opening_float_poisha?: number;
          closing_counted_poisha?: number | null;
          expected_cash_poisha?: number | null;
          cash_variance_poisha?: number | null;
          status?: "open" | "closed";
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      cash_drawer_transactions: {
        Row: {
          id: string;
          session_id: string;
          tenant_id: string;
          type: "cash_in" | "cash_out";
          amount_poisha: number;
          reason: string;
          performed_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          tenant_id: string;
          type: "cash_in" | "cash_out";
          amount_poisha: number;
          reason: string;
          performed_by: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          tenant_id?: string;
          type?: "cash_in" | "cash_out";
          amount_poisha?: number;
          reason?: string;
          performed_by?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      daily_sales_aggregates: {
        Row: {
          id: string;
          tenant_id: string;
          store_id: string;
          sale_date: string;
          total_invoices: number;
          total_revenue_poisha: number;
          total_cost_poisha: number;
          total_gross_profit_poisha: number;
          total_discount_poisha: number;
          total_tax_poisha: number;
          total_paid_poisha: number;
          total_due_poisha: number;
          cash_paid_poisha: number;
          bkash_paid_poisha: number;
          nagad_paid_poisha: number;
          card_paid_poisha: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          store_id: string;
          sale_date: string;
          total_invoices?: number;
          total_revenue_poisha?: number;
          total_cost_poisha?: number;
          total_gross_profit_poisha?: number;
          total_discount_poisha?: number;
          total_tax_poisha?: number;
          total_paid_poisha?: number;
          total_due_poisha?: number;
          cash_paid_poisha?: number;
          bkash_paid_poisha?: number;
          nagad_paid_poisha?: number;
          card_paid_poisha?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          store_id?: string;
          sale_date?: string;
          total_invoices?: number;
          total_revenue_poisha?: number;
          total_cost_poisha?: number;
          total_gross_profit_poisha?: number;
          total_discount_poisha?: number;
          total_tax_poisha?: number;
          total_paid_poisha?: number;
          total_due_poisha?: number;
          cash_paid_poisha?: number;
          bkash_paid_poisha?: number;
          nagad_paid_poisha?: number;
          card_paid_poisha?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          tenant_id: string;
          type: string;
          title: string;
          message: string;
          data: Json | null;
          is_read: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          type: string;
          title: string;
          message: string;
          data?: Json | null;
          is_read?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          type?: string;
          title?: string;
          message?: string;
          data?: Json | null;
          is_read?: boolean;
          created_at?: string;
        };
        Relationships: [];
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
        Relationships: [];
      };
      view_supplier_balances: {
        Row: {
          supplier_id: string;
          tenant_id: string;
          name: string;
          company: string | null;
          phone: string | null;
          email: string | null;
          address: string | null;
          opening_balance: number;
          total_purchased: number;
          total_paid: number;
          current_due: number;
          last_purchase_at: string | null;
        };
        Relationships: [];
      };
      view_customer_balances: {
        Row: {
          customer_id: string;
          tenant_id: string;
          name: string;
          phone: string | null;
          email: string | null;
          address: string | null;
          credit_limit: number;
          opening_balance: number;
          total_sales_due: number;
          total_payments: number;
          current_due: number;
        };
        Relationships: [];
      };
      view_inventory_valuation: {
        Row: {
          tenant_id: string;
          product_name: string;
          variant_id: string;
          sku: string;
          barcode: string | null;
          category_name: string;
          brand_name: string;
          current_stock: number;
          unit_cost_poisha: number;
          unit_retail_poisha: number;
          total_cost_value_poisha: number;
          total_retail_value_poisha: number;
          potential_profit_poisha: number;
          profit_margin_percentage: number;
        };
        Relationships: [];
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
      is_tenant_member: {
        Args: {
          p_tenant_id: string;
        };
        Returns: boolean;
      };
      has_role: {
        Args: {
          p_tenant_id: string;
          p_roles: UserRole[];
        };
        Returns: boolean;
      };
      get_user_tenant_role: {
        Args: {
          p_tenant_id: string;
        };
        Returns: UserRole | null;
      };
      fn_create_tenant_onboarding: {
        Args: {
          p_tenant_name: string;
          p_slug: string;
          p_store_name: string;
          p_store_code: string;
          p_currency?: string;
          p_timezone?: string;
        };
        Returns: Json;
      };
      fn_invite_staff: {
        Args: {
          p_tenant_id: string;
          p_email: string;
          p_role: UserRole;
        };
        Returns: Json;
      };
      fn_accept_invitation: {
        Args: {
          p_token: string;
        };
        Returns: Json;
      };
      fn_update_member_role: {
        Args: {
          p_tenant_id: string;
          p_member_id: string;
          p_new_role: UserRole;
        };
        Returns: boolean;
      };
      fn_revoke_invitation: {
        Args: {
          p_invitation_id: string;
        };
        Returns: boolean;
      };
      fn_receive_purchase: {
        Args: {
          p_tenant_id: string;
          p_store_id: string;
          p_supplier_id: string;
          p_invoice_number: string;
          p_items: Json;
          p_paid_amount?: number;
          p_notes?: string;
        };
        Returns: Json;
      };
      fn_adjust_stock: {
        Args: {
          p_tenant_id: string;
          p_location_id: string;
          p_variant_id: string;
          p_delta_quantity: number;
          p_reason: string;
          p_notes?: string;
        };
        Returns: Json;
      };
      fn_stock_take: {
        Args: {
          p_tenant_id: string;
          p_location_id: string;
          p_variant_id: string;
          p_counted_quantity: number;
          p_notes?: string;
        };
        Returns: Json;
      };
      fn_transfer_stock: {
        Args: {
          p_tenant_id: string;
          p_from_location_id: string;
          p_to_location_id: string;
          p_variant_id: string;
          p_quantity: number;
          p_serials?: string[];
          p_notes?: string;
        };
        Returns: Json;
      };
      fn_create_sale: {
        Args: {
          p_tenant_id: string;
          p_store_id: string;
          p_location_id: string;
          p_customer_id?: string | null;
          p_cashier_id?: string | null;
          p_items: Json;
          p_cart_discount_type?: string;
          p_cart_discount_value?: number;
          p_payments: Json;
          p_notes?: string | null;
          p_is_offline_sync?: boolean;
          p_client_sale_id?: string | null;
          p_offline_invoice_number?: string | null;
        };
        Returns: Json;
      };
      fn_return_sale: {
        Args: {
          p_tenant_id: string;
          p_sale_id: string;
          p_store_id: string;
          p_location_id: string;
          p_items: Json;
          p_refund_method?: PaymentMethod;
          p_reason?: string | null;
        };
        Returns: Json;
      };
      fn_void_sale: {
        Args: {
          p_tenant_id: string;
          p_sale_id: string;
          p_reason: string;
        };
        Returns: Json;
      };
      fn_revoke_device: {
        Args: {
          p_tenant_id: string;
          p_device_id: string;
        };
        Returns: Json;
      };
      fn_collect_due_payment: {
        Args: {
          p_tenant_id: string;
          p_customer_id: string;
          p_amount: number;
          p_payment_method?: PaymentMethod;
          p_sale_id?: string | null;
          p_reference?: string | null;
          p_notes?: string | null;
        };
        Returns: Json;
      };
      fn_lookup_warranty: {
        Args: {
          p_serial_number: string;
        };
        Returns: Json;
      };
      fn_get_public_invoice: {
        Args: {
          p_share_token: string;
        };
        Returns: Json;
      };
      fn_check_plan_limits: {
        Args: {
          p_tenant_id: string;
          p_resource: string;
        };
        Returns: Json;
      };
      fn_record_subscription_payment: {
        Args: {
          p_tenant_id: string;
          p_plan: PlanTier;
          p_interval: string;
          p_amount_poisha: number;
          p_provider: string;
          p_transaction_id: string;
          p_payload: Json;
          p_max_stores: number;
          p_max_products: number;
          p_max_staff: number;
        };
        Returns: Json;
      };
      fn_admin_extend_trial: {
        Args: {
          p_tenant_id: string;
          p_days: number;
        };
        Returns: Json;
      };
      fn_admin_set_plan: {
        Args: {
          p_tenant_id: string;
          p_plan: PlanTier;
          p_status: string;
          p_max_stores: number;
          p_max_products: number;
          p_max_staff: number;
        };
        Returns: Json;
      };
      fn_get_dashboard_analytics: {
        Args: {
          p_tenant_id: string;
          p_store_id?: string | null;
          p_target_date?: string;
        };
        Returns: Json;
      };
      fn_get_dead_stock: {
        Args: {
          p_tenant_id: string;
          p_store_id?: string | null;
          p_days_threshold?: number;
        };
        Returns: Json;
      };
      fn_get_customer_aging: {
        Args: {
          p_tenant_id: string;
        };
        Returns: Json;
      };
      fn_open_cash_drawer: {
        Args: {
          p_tenant_id: string;
          p_store_id: string;
          p_cashier_id: string;
          p_opening_float_poisha: number;
          p_notes?: string | null;
        };
        Returns: Json;
      };
      fn_add_cash_drawer_tx: {
        Args: {
          p_tenant_id: string;
          p_session_id: string;
          p_type: string;
          p_amount_poisha: number;
          p_reason: string;
          p_performed_by: string;
        };
        Returns: Json;
      };
      fn_close_cash_drawer: {
        Args: {
          p_tenant_id: string;
          p_session_id: string;
          p_counted_cash_poisha: number;
          p_notes?: string | null;
        };
        Returns: Json;
      };
    };
    Enums: {
      user_role: UserRole;
      plan_tier: PlanTier;
      serial_status: SerialStatus;
      movement_type: MovementType;
      payment_method: PaymentMethod;
      sync_op: SyncOp;
      customer_price_tier: CustomerPriceTier;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
