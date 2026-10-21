import { z } from "zod";

export const variantItemSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, "Variant name is required").default("Standard"),
  sku: z.string().min(1, "SKU is required").max(100),
  barcode: z.string().max(100).nullable().optional(),
  image_url: z.string().url().nullable().optional(),
  options: z.record(z.string(), z.string()).optional().default({}),
  cost_price: z.number().int().nonnegative("Cost price must be a non-negative integer in poisha").default(0),
  retail_price: z.number().int().nonnegative("Retail price must be a non-negative integer in poisha"),
  wholesale_price: z.number().int().nonnegative("Wholesale price must be non-negative").default(0),
  tax_rate: z.number().min(0).max(100).default(0),
  reorder_point: z.number().int().nonnegative().default(5),
  opening_stock: z.number().int().nonnegative().default(0),
  serials: z.array(z.string()).optional().default([]),
});

export const createProductSchema = z.object({
  tenant_id: z.string().uuid(),
  category_id: z.string().uuid().nullable().optional(),
  brand_id: z.string().uuid().nullable().optional(),
  name: z.string().min(1, "Product name is required").max(255),
  description: z.string().max(2000).nullable().optional(),
  image_url: z.string().url().nullable().optional(),
  unit: z.string().min(1).max(20).default("pcs"),
  has_variants: z.boolean().default(false),
  has_serials: z.boolean().default(false),
  warranty_months: z.number().int().nonnegative().default(0),
  variants: z.array(variantItemSchema).min(1, "At least one variant is required"),
});

export const updateProductSchema = z.object({
  category_id: z.string().uuid().nullable().optional(),
  brand_id: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(2000).nullable().optional(),
  image_url: z.string().url().nullable().optional(),
  unit: z.string().min(1).max(20).optional(),
  has_serials: z.boolean().optional(),
  warranty_months: z.number().int().nonnegative().optional(),
  is_active: z.boolean().optional(),
});

export const categorySchema = z.object({
  tenant_id: z.string().uuid(),
  parent_id: z.string().uuid().nullable().optional(),
  name: z.string().min(1, "Category name is required").max(100),
  slug: z.string().min(1).max(120).optional(),
});

export const brandSchema = z.object({
  tenant_id: z.string().uuid(),
  name: z.string().min(1, "Brand name is required").max(100),
});

export const supplierSchema = z.object({
  tenant_id: z.string().uuid(),
  name: z.string().min(1, "Supplier name is required").max(200),
  company: z.string().max(200).nullable().optional(),
  phone: z.string().max(50).nullable().optional(),
  email: z.string().email().nullable().optional().or(z.literal("")),
  address: z.string().max(500).nullable().optional(),
  opening_balance: z.number().int().default(0), // in poisha
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type CategoryInput = z.infer<typeof categorySchema>;
export type BrandInput = z.infer<typeof brandSchema>;
export type SupplierInput = z.infer<typeof supplierSchema>;
