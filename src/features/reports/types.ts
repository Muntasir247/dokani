export interface ReportFilterOptions {
  tenantId: string;
  storeId?: string | null;
  cashierId?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  daysThreshold?: number;
}

export interface HourlySalesPoint {
  hour: number;
  revenuePoisha: number;
  invoices: number;
}

export interface TopProductSummary {
  product_name: string;
  sku: string;
  quantity_sold: number;
  revenue_poisha: number;
}

export interface DashboardAnalyticsResponse {
  targetDate: string;
  today: {
    invoices: number;
    revenuePoisha: number;
    costPoisha?: number; // Omitted or 0 for Cashiers
    grossProfitPoisha?: number; // Omitted or 0 for Cashiers
    grossMarginPercentage?: number; // Omitted or 0 for Cashiers
    averageBasketPoisha: number;
    paidPoisha: number;
    duePoisha: number;
  };
  comparison: {
    yesterdayRevenuePoisha: number;
    yesterdayInvoices: number;
    diffYesterdayPoisha: number;
    pctChangeYesterday: number;
    lastWeekRevenuePoisha: number;
    diffLastWeekPoisha: number;
    pctChangeLastWeek: number;
  };
  hourlySales: HourlySalesPoint[];
  topProducts: TopProductSummary[];
  lowStockCount: number;
  dues: {
    pendingCustomers: number;
    totalDuePoisha: number;
  };
}

export interface ProfitMarginItem {
  key: string;
  name: string;
  category?: string;
  brand?: string;
  quantitySold: number;
  revenuePoisha: number;
  costPoisha: number;
  grossProfitPoisha: number;
  marginPercentage: number;
}

export interface InventoryValuationItem {
  tenantId: string;
  productName: string;
  variantId: string;
  sku: string;
  barcode: string | null;
  categoryName: string;
  brandName: string;
  currentStock: number;
  unitCostPoisha: number;
  unitRetailPoisha: number;
  totalCostValuePoisha: number;
  totalRetailValuePoisha: number;
  potentialProfitPoisha: number;
  marginPercentage: number;
}

export interface DeadStockItem {
  productName: string;
  variantId: string;
  sku: string;
  barcode: string | null;
  categoryName: string;
  currentStock: number;
  unitCostPoisha: number;
  deadStockValuePoisha: number;
  lastSoldAt: string | null;
  daysWithoutSales: number;
}

export interface CustomerAgingDebtor {
  customerId: string;
  customerName: string;
  phone: string | null;
  totalBalancePoisha: number;
  bucket0To30: number;
  bucket31To60: number;
  bucket61To90: number;
  bucket90Plus: number;
}

export interface CustomerAgingReport {
  totalDuePoisha: number;
  agingBuckets: {
    current0To30Poisha: number;
    days31To60Poisha: number;
    days61To90Poisha: number;
    days90PlusPoisha: number;
  };
  topDebtors: CustomerAgingDebtor[];
}

export interface CashDrawerShiftItem {
  id: string;
  cashierId: string;
  cashierName?: string;
  storeId: string;
  storeName?: string;
  openedAt: string;
  closedAt: string | null;
  openingFloatPoisha: number;
  closingCountedPoisha: number | null;
  expectedCashPoisha: number | null;
  cashVariancePoisha: number | null;
  status: "open" | "closed";
  notes?: string | null;
}

export interface ExpensesVsRevenueReport {
  periodStart: string;
  periodEnd: string;
  grossRevenuePoisha: number;
  costOfGoodsSoldPoisha: number;
  grossProfitPoisha: number;
  grossMarginPct: number;
  totalExpensesPoisha: number;
  expensesByCategory: Array<{ category: string; amountPoisha: number }>;
  netProfitPoisha: number;
  netMarginPct: number;
}

export interface TaxSummaryReport {
  tenantName: string;
  vatBinNumber: string | null;
  taxPeriodStart: string;
  taxPeriodEnd: string;
  totalTaxableSalesPoisha: number;
  totalVatCollectedPoisha: number;
  invoicesCount: number;
}
