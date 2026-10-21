import { z } from "zod";

export const posSaleItemSchema = z.object({
  variant_id: z.string().uuid("Invalid variant ID"),
  quantity: z.number().int().positive("Quantity must be at least 1"),
  discount_type: z.enum(["none", "percent", "fixed"]).default("none"),
  discount_value: z.number().nonnegative("Discount value cannot be negative").default(0),
  serials: z.array(z.string().min(1)).optional().default([]),
});

export const posPaymentSchema = z.object({
  method: z.enum(["cash", "bkash", "nagad", "card", "due"]),
  amount: z.number().int().nonnegative("Payment amount cannot be negative"), // In poisha
  reference: z.string().max(100).optional().nullable(),
});

export const createSaleSchema = z.object({
  tenant_id: z.string().uuid("Invalid tenant ID"),
  store_id: z.string().uuid("Invalid store ID"),
  location_id: z.string().uuid("Invalid location ID"),
  customer_id: z.string().uuid("Invalid customer ID").optional().nullable(),
  cashier_id: z.string().uuid("Invalid cashier ID").optional().nullable(),
  items: z.array(posSaleItemSchema).min(1, "Cart must contain at least one item"),
  cart_discount_type: z.enum(["none", "percent", "fixed"]).default("none"),
  cart_discount_value: z.number().nonnegative().default(0),
  payments: z.array(posPaymentSchema).default([]),
  notes: z.string().max(500).optional().nullable(),
  // Client-reported total for tamper detection
  client_reported_total: z.number().int().optional(),
});

export const returnSaleItemSchema = z.object({
  sale_item_id: z.string().uuid("Invalid sale item ID"),
  variant_id: z.string().uuid("Invalid variant ID"),
  quantity: z.number().int().positive("Return quantity must be at least 1"),
  refund_unit_price: z.number().int().nonnegative("Refund price cannot be negative"), // In poisha
  restock: z.boolean().default(true),
  serials: z.array(z.string().min(1)).optional().default([]),
});

export const returnSaleSchema = z.object({
  tenant_id: z.string().uuid("Invalid tenant ID"),
  sale_id: z.string().uuid("Invalid sale ID"),
  store_id: z.string().uuid("Invalid store ID"),
  location_id: z.string().uuid("Invalid location ID"),
  items: z.array(returnSaleItemSchema).min(1, "Must select at least one item to return"),
  refund_method: z.enum(["cash", "bkash", "nagad", "card", "due"]).default("cash"),
  reason: z.string().min(2, "Return reason is required").max(500),
});

export const voidSaleSchema = z.object({
  tenant_id: z.string().uuid("Invalid tenant ID"),
  sale_id: z.string().uuid("Invalid sale ID"),
  reason: z.string().min(3, "Void reason is required (minimum 3 characters)").max(500),
});

export const quickCustomerSchema = z.object({
  tenant_id: z.string().uuid("Invalid tenant ID"),
  name: z.string().min(2, "Customer name must be at least 2 characters").max(100),
  phone: z.string().min(6, "Valid phone number required").max(20),
  email: z.string().email().optional().nullable().or(z.literal("")),
  address: z.string().max(255).optional().nullable(),
  credit_limit: z.number().int().nonnegative().default(0),
  opening_balance: z.number().int().default(0),
});

export type PosSaleItem = z.infer<typeof posSaleItemSchema>;
export type PosPayment = z.infer<typeof posPaymentSchema>;
export type CreateSaleInput = z.infer<typeof createSaleSchema>;
export type ReturnSaleInput = z.infer<typeof returnSaleSchema>;
export type VoidSaleInput = z.infer<typeof voidSaleSchema>;
export type QuickCustomerInput = z.infer<typeof quickCustomerSchema>;
