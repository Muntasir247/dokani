import { z } from "zod";

export const purchaseItemSchema = z.object({
  variant_id: z.string().uuid("Invalid variant ID"),
  quantity: z.number().int().positive("Quantity must be greater than zero"),
  unit_cost: z.number().int().nonnegative("Unit cost must be non-negative in poisha"),
  serials: z.array(z.string()).optional().default([]),
});

export const receivePurchaseSchema = z.object({
  tenant_id: z.string().uuid(),
  store_id: z.string().uuid("Invalid store ID"),
  supplier_id: z.string().uuid("Invalid supplier ID"),
  invoice_number: z.string().min(1, "Invoice number is required").max(100),
  items: z.array(purchaseItemSchema).min(1, "At least one item is required in the purchase"),
  paid_amount: z.number().int().nonnegative("Paid amount cannot be negative").default(0),
  notes: z.string().max(1000).nullable().optional(),
});

export const adjustStockSchema = z.object({
  tenant_id: z.string().uuid(),
  location_id: z.string().uuid("Invalid stock location ID"),
  variant_id: z.string().uuid("Invalid variant ID"),
  delta_quantity: z.number().int().refine((val) => val !== 0, "Adjustment delta cannot be zero"),
  reason: z.string().min(1, "Adjustment reason is required").max(200),
  notes: z.string().max(1000).nullable().optional(),
});

export const stockTakeSchema = z.object({
  tenant_id: z.string().uuid(),
  location_id: z.string().uuid("Invalid stock location ID"),
  variant_id: z.string().uuid("Invalid variant ID"),
  counted_quantity: z.number().int().nonnegative("Counted quantity cannot be negative"),
  notes: z.string().max(1000).nullable().optional(),
});

export const transferStockSchema = z.object({
  tenant_id: z.string().uuid(),
  from_location_id: z.string().uuid("Invalid source location ID"),
  to_location_id: z.string().uuid("Invalid destination location ID"),
  variant_id: z.string().uuid("Invalid variant ID"),
  quantity: z.number().int().positive("Transfer quantity must be positive"),
  serials: z.array(z.string()).optional().default([]),
  notes: z.string().max(1000).nullable().optional(),
}).refine((data) => data.from_location_id !== data.to_location_id, {
  message: "Source and destination locations must be different",
  path: ["to_location_id"],
});

export type ReceivePurchaseInput = z.infer<typeof receivePurchaseSchema>;
export type AdjustStockInput = z.infer<typeof adjustStockSchema>;
export type StockTakeInput = z.infer<typeof stockTakeSchema>;
export type TransferStockInput = z.infer<typeof transferStockSchema>;
