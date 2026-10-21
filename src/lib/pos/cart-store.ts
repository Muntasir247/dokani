import { create } from "zustand";
import { UserRole } from "@/types/database.types";
import {
  calculateLinePricing,
  calculateCartTotals,
  CartTotalsResult,
} from "./pricing";

export interface PosVariant {
  id: string;
  productId: string;
  productName: string;
  variantName: string;
  sku: string;
  barcode: string | null;
  retailPricePoisha: number;
  costPricePoisha: number | null;
  taxRateBasisPoints: number;
  hasSerials: boolean;
  categoryId?: string | null;
  warrantyMonths: number;
  currentStock: number;
}

export interface CartItem {
  variantId: string;
  productId: string;
  productName: string;
  variantName: string;
  sku: string;
  barcode: string | null;
  unitPricePoisha: number;
  taxRateBasisPoints: number;
  quantity: number;
  discountType: "none" | "percent" | "fixed";
  discountValue: number;
  hasSerials: boolean;
  selectedSerials: string[];
}

export interface PosCustomer {
  id: string;
  name: string;
  phone: string;
  currentDue: number;
  creditLimit: number;
}

export interface HeldCart {
  id: string;
  name: string;
  timestamp: number;
  items: CartItem[];
  customer: PosCustomer | null;
  cartDiscountType: "none" | "percent" | "fixed";
  cartDiscountValue: number;
}

export interface CartState {
  items: CartItem[];
  cartDiscountType: "none" | "percent" | "fixed";
  cartDiscountValue: number;
  selectedCustomer: PosCustomer | null;
  heldCarts: HeldCart[];
  userRole: UserRole;

  // Actions
  setUserRole: (role: UserRole) => void;
  addItem: (variant: PosVariant, quantity?: number) => void;
  scanBarcode: (barcode: string, catalog: Map<string, PosVariant>) => boolean;
  updateQuantity: (variantId: string, quantity: number) => void;
  setLineDiscount: (
    variantId: string,
    discountType: "none" | "percent" | "fixed",
    discountValue: number
  ) => void;
  setLineSerials: (variantId: string, serials: string[]) => void;
  removeItem: (variantId: string) => void;
  clearCart: () => void;
  setCustomer: (customer: PosCustomer | null) => void;
  setCartDiscount: (type: "none" | "percent" | "fixed", value: number) => void;
  holdCurrentCart: (label?: string) => string;
  resumeHeldCart: (cartId: string) => boolean;
  discardHeldCart: (cartId: string) => void;

  // Computed Totals
  getTotals: () => CartTotalsResult;
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  cartDiscountType: "none",
  cartDiscountValue: 0,
  selectedCustomer: null,
  heldCarts: [],
  userRole: "cashier",

  setUserRole: (role: UserRole) => set({ userRole: role }),

  addItem: (variant: PosVariant, quantity = 1) => {
    set((state) => {
      const existingIndex = state.items.findIndex((item) => item.variantId === variant.id);

      if (existingIndex >= 0) {
        const updated = [...state.items];
        const existing = updated[existingIndex];
        updated[existingIndex] = {
          ...existing,
          quantity: existing.quantity + quantity,
        };
        return { items: updated };
      }

      const newItem: CartItem = {
        variantId: variant.id,
        productId: variant.productId,
        productName: variant.productName,
        variantName: variant.variantName,
        sku: variant.sku,
        barcode: variant.barcode,
        unitPricePoisha: variant.retailPricePoisha,
        taxRateBasisPoints: variant.taxRateBasisPoints,
        quantity,
        discountType: "none",
        discountValue: 0,
        hasSerials: variant.hasSerials,
        selectedSerials: [],
      };

      return { items: [...state.items, newItem] };
    });
  },

  scanBarcode: (barcode: string, catalog: Map<string, PosVariant>) => {
    const trimmed = barcode.trim();
    if (!trimmed) return false;

    const variant = catalog.get(trimmed);
    if (!variant) return false;

    get().addItem(variant, 1);
    return true;
  },

  updateQuantity: (variantId: string, quantity: number) => {
    if (quantity <= 0) {
      get().removeItem(variantId);
      return;
    }

    set((state) => ({
      items: state.items.map((item) =>
        item.variantId === variantId ? { ...item, quantity } : item
      ),
    }));
  },

  setLineDiscount: (variantId, discountType, discountValue) => {
    set((state) => ({
      items: state.items.map((item) =>
        item.variantId === variantId
          ? { ...item, discountType, discountValue: Math.max(0, discountValue) }
          : item
      ),
    }));
  },

  setLineSerials: (variantId, serials) => {
    set((state) => ({
      items: state.items.map((item) =>
        item.variantId === variantId
          ? { ...item, selectedSerials: serials }
          : item
      ),
    }));
  },

  removeItem: (variantId: string) => {
    set((state) => ({
      items: state.items.filter((item) => item.variantId !== variantId),
    }));
  },

  clearCart: () => {
    set({
      items: [],
      cartDiscountType: "none",
      cartDiscountValue: 0,
      selectedCustomer: null,
    });
  },

  setCustomer: (customer) => set({ selectedCustomer: customer }),

  setCartDiscount: (type, value) =>
    set({
      cartDiscountType: type,
      cartDiscountValue: Math.max(0, value),
    }),

  holdCurrentCart: (label) => {
    const state = get();
    if (state.items.length === 0) return "";

    const id = `held_${Date.now()}`;
    const cartName =
      label ||
      (state.selectedCustomer ? `Cart - ${state.selectedCustomer.name}` : `Cart #${state.heldCarts.length + 1}`);

    const heldCart: HeldCart = {
      id,
      name: cartName,
      timestamp: Date.now(),
      items: [...state.items],
      customer: state.selectedCustomer,
      cartDiscountType: state.cartDiscountType,
      cartDiscountValue: state.cartDiscountValue,
    };

    set({
      heldCarts: [...state.heldCarts, heldCart],
      items: [],
      cartDiscountType: "none",
      cartDiscountValue: 0,
      selectedCustomer: null,
    });

    return id;
  },

  resumeHeldCart: (cartId: string) => {
    const state = get();
    const held = state.heldCarts.find((c) => c.id === cartId);
    if (!held) return false;

    set({
      items: [...held.items],
      selectedCustomer: held.customer,
      cartDiscountType: held.cartDiscountType,
      cartDiscountValue: held.cartDiscountValue,
      heldCarts: state.heldCarts.filter((c) => c.id !== cartId),
    });

    return true;
  },

  discardHeldCart: (cartId: string) => {
    set((state) => ({
      heldCarts: state.heldCarts.filter((c) => c.id !== cartId),
    }));
  },

  getTotals: () => {
    const state = get();
    const lines = state.items.map((item) =>
      calculateLinePricing({
        unitPricePoisha: item.unitPricePoisha,
        quantity: item.quantity,
        discountType: item.discountType,
        discountValue: item.discountValue,
        taxRateBasisPoints: item.taxRateBasisPoints,
        role: state.userRole,
      })
    );

    return calculateCartTotals({
      lines,
      cartDiscountType: state.cartDiscountType,
      cartDiscountValue: state.cartDiscountValue,
      role: state.userRole,
    });
  },
}));
