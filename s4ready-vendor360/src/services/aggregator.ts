/**
 * Aggregator. Takes raw data fetched in parallel from 8+ SAP OData services
 * and produces a clean, typed Partner360 object ready for:
 *   - AI narrative generation
 *   - Joule card rendering
 *   - REST API response
 *   - Web chat display
 *
 * All currency formatting, KPI computation, date math, and risk flagging
 * lives here. Nothing in the tool handlers does arithmetic.
 */

export interface BusinessPartnerSummary {
  id: string;
  name: string;
  type: 'VENDOR' | 'CUSTOMER' | 'BOTH';
  country: string;
  city?: string;
  isBlocked: boolean;
  paymentTerms?: string;
  creditLimit?: number;
  creditLimitCurrency?: string;
  lastChangeDate?: string;
}

export interface KPIs {
  /** Total PO or SO amount in reporting currency, last N months. */
  totalSpendOrRevenue: number;
  currency: string;
  /** Count of open POs (vendor) or SOs (customer). */
  openDocumentCount: number;
  /** Total overdue AP (vendor) or AR (customer) amount. */
  overdueAmount: number;
  /** Count of overdue documents. */
  overdueCount: number;
  /** Total blocked invoice amount. */
  blockedInvoiceAmount: number;
  blockedInvoiceCount: number;
  /** Count of quality notifications in period. */
  qualityNotificationCount: number;
  /** Active contract count. */
  activeContractCount: number;
  /** Approx on-time-delivery %. null if no data. */
  onTimeDeliveryPct: number | null;
  /** Average payment delay in days (positive = late, negative = early). */
  avgPaymentDelayDays: number | null;
}

export interface RiskFlag {
  severity: 'high' | 'medium' | 'low';
  code: string;
  message: string;
  /** Linked document/entity ID for drill-down. */
  referenceId?: string;
}

export interface TransactionSummary {
  id: string;
  type: 'PO' | 'SO' | 'INVOICE' | 'PAYMENT' | 'CONTRACT';
  date: string;
  amount: number;
  currency: string;
  status?: string;
  isBlocked?: boolean;
}

export interface Partner360 {
  partner: BusinessPartnerSummary;
  kpis: KPIs;
  riskFlags: RiskFlag[];
  recentTransactions: TransactionSummary[];
  narrative?: string; // filled by narrative.ts after aggregation
  fetchedAt: string;
  dataMonthsBack: number;
}

interface RawSapData {
  partner: Record<string, unknown>[];
  purchaseOrders: Record<string, unknown>[];
  salesOrders: Record<string, unknown>[];
  supplierInvoices: Record<string, unknown>[];
  openAPItems: Record<string, unknown>[];
  openARItems: Record<string, unknown>[];
  payments: Record<string, unknown>[];
  qualityNotifications: Record<string, unknown>[];
  contracts: Record<string, unknown>[];
  monthsBack: number;
}

export function aggregate(raw: RawSapData): Partner360 {
  const p = raw.partner[0] ?? {};

  const isVendor = Boolean(p.IsSupplier);
  const isCustomer = Boolean(p.IsCustomer);
  const partnerType: BusinessPartnerSummary['type'] =
    isVendor && isCustomer ? 'BOTH' : isVendor ? 'VENDOR' : 'CUSTOMER';

  const partner: BusinessPartnerSummary = {
    id: String(p.BusinessPartner ?? ''),
    name: String(p.BusinessPartnerFullName ?? 'Unknown'),
    type: partnerType,
    country: String(p.Country ?? ''),
    city: p.CityName ? String(p.CityName) : undefined,
    isBlocked: Boolean(p.BusinessPartnerIsBlocked),
    paymentTerms: p.PaymentTerms ? String(p.PaymentTerms) : undefined,
    creditLimit: p.CreditLimit ? Number(p.CreditLimit) : undefined,
    creditLimitCurrency: p.Currency ? String(p.Currency) : undefined,
    lastChangeDate: p.LastChangeDate ? String(p.LastChangeDate) : undefined
  };

  // ── KPI computation ──────────────────────────────────────────────────────

  const primaryCurrency = String(p.Currency ?? 'INR');

  // Total spend (vendor: sum of PO amounts) or revenue (customer: sum of SO amounts)
  const primaryDocs = partnerType === 'CUSTOMER' ? raw.salesOrders : raw.purchaseOrders;
  const totalSpendOrRevenue = sum(primaryDocs, 'PurchaseOrderNetAmount', 'TotalNetAmount');

  const openDocs = primaryDocs.filter(d =>
    ['A', 'B'].includes(String(d.OverallSDProcessStatus ?? ''))
  );

  // Overdue: open AP/AR items where NetDueDate < today
  const today = new Date();
  const openItems = partnerType === 'VENDOR' ? raw.openAPItems : raw.openARItems;
  const overdueItems = openItems.filter(item => {
    const due = item.NetDueDate ? new Date(String(item.NetDueDate)) : null;
    return due && due < today;
  });
  const overdueAmount = sum(overdueItems, 'AmountInTransactionCurrency');

  // Blocked invoices
  const blockedInvoices = raw.supplierInvoices.filter(i => Boolean(i.IsBlocked));
  const blockedInvoiceAmount = sum(blockedInvoices, 'InvoiceGrossAmount');

  // On-time delivery: % of POs (OverallSDProcessStatus = 'C') delivered within
  // agreed terms. Approximate: we use status C = delivered, B = partial.
  const deliveredDocs = primaryDocs.filter(d => d.OverallSDProcessStatus === 'C');
  const onTimeDeliveryPct = primaryDocs.length > 0
    ? Math.round((deliveredDocs.length / primaryDocs.length) * 100)
    : null;

  // Average payment delay: days between NetDueDate and ClearingDate
  const delays: number[] = [];
  for (const pmt of raw.payments) {
    const clearing = pmt.ClearingDate ? new Date(String(pmt.ClearingDate)) : null;
    const posting = pmt.PostingDate ? new Date(String(pmt.PostingDate)) : null;
    if (clearing && posting) {
      delays.push((clearing.getTime() - posting.getTime()) / 86_400_000);
    }
  }
  const avgPaymentDelayDays = delays.length > 0
    ? Math.round(delays.reduce((a, b) => a + b, 0) / delays.length)
    : null;

  const kpis: KPIs = {
    totalSpendOrRevenue,
    currency: primaryCurrency,
    openDocumentCount: openDocs.length,
    overdueAmount,
    overdueCount: overdueItems.length,
    blockedInvoiceAmount,
    blockedInvoiceCount: blockedInvoices.length,
    qualityNotificationCount: raw.qualityNotifications.length,
    activeContractCount: raw.contracts.length,
    onTimeDeliveryPct,
    avgPaymentDelayDays
  };

  // ── Risk flags ───────────────────────────────────────────────────────────

  const riskFlags: RiskFlag[] = [];

  if (partner.isBlocked) {
    riskFlags.push({
      severity: 'high',
      code: 'PARTNER_BLOCKED',
      message: `${partner.name} is blocked in SAP. No new transactions can be posted.`
    });
  }

  if (blockedInvoices.length > 0) {
    const firstBlocked = blockedInvoices[0];
    riskFlags.push({
      severity: 'high',
      code: 'BLOCKED_INVOICES',
      message: `${blockedInvoices.length} blocked invoice(s) totalling ${fmt(blockedInvoiceAmount, primaryCurrency)}. Reason: ${String(firstBlocked.PaymentBlockingReason ?? 'unknown')}.`,
      referenceId: String(firstBlocked.SupplierInvoice ?? '')
    });
  }

  if (overdueItems.length > 0) {
    riskFlags.push({
      severity: overdueItems.length > 3 ? 'high' : 'medium',
      code: 'OVERDUE_PAYMENTS',
      message: `${overdueItems.length} overdue payment(s) totalling ${fmt(overdueAmount, primaryCurrency)}.`
    });
  }

  if (raw.qualityNotifications.length > 0) {
    riskFlags.push({
      severity: raw.qualityNotifications.length > 2 ? 'medium' : 'low',
      code: 'QUALITY_ISSUES',
      message: `${raw.qualityNotifications.length} quality notification(s) raised in the last ${raw.monthsBack} months.`
    });
  }

  if (kpis.onTimeDeliveryPct !== null && kpis.onTimeDeliveryPct < 80) {
    riskFlags.push({
      severity: 'medium',
      code: 'LOW_OTD',
      message: `On-time delivery is ${kpis.onTimeDeliveryPct}%, below the 80% threshold.`
    });
  }

  // ── Recent transactions ───────────────────────────────────────────────────

  const recentTransactions: TransactionSummary[] = [
    ...raw.purchaseOrders.slice(0, 5).map(d => ({
      id: String(d.PurchaseOrder ?? ''),
      type: 'PO' as const,
      date: String(d.PurchaseOrderDate ?? ''),
      amount: Number(d.PurchaseOrderNetAmount ?? 0),
      currency: String(d.DocumentCurrency ?? primaryCurrency),
      status: String(d.OverallSDProcessStatus ?? ''),
      isBlocked: false
    })),
    ...raw.salesOrders.slice(0, 5).map(d => ({
      id: String(d.SalesOrder ?? ''),
      type: 'SO' as const,
      date: String(d.SalesOrderDate ?? ''),
      amount: Number(d.TotalNetAmount ?? 0),
      currency: String(d.TransactionCurrency ?? primaryCurrency),
      status: String(d.OverallSDProcessStatus ?? '')
    })),
    ...raw.supplierInvoices.slice(0, 5).map(d => ({
      id: String(d.SupplierInvoice ?? ''),
      type: 'INVOICE' as const,
      date: String(d.DocumentDate ?? ''),
      amount: Number(d.InvoiceGrossAmount ?? 0),
      currency: String(d.DocumentCurrency ?? primaryCurrency),
      isBlocked: Boolean(d.IsBlocked)
    })),
    ...raw.payments.slice(0, 3).map(d => ({
      id: String(d.AccountingDocument ?? ''),
      type: 'PAYMENT' as const,
      date: String(d.ClearingDate ?? d.PostingDate ?? ''),
      amount: Number(d.AmountInTransactionCurrency ?? 0),
      currency: String(d.TransactionCurrency ?? primaryCurrency)
    }))
  ]
    .filter(t => t.id)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 15);

  return {
    partner,
    kpis,
    riskFlags,
    recentTransactions,
    fetchedAt: new Date().toISOString(),
    dataMonthsBack: raw.monthsBack
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────

function sum(items: Record<string, unknown>[], ...fields: string[]): number {
  return items.reduce((acc, item) => {
    for (const field of fields) {
      const v = Number(item[field]);
      if (!isNaN(v)) return acc + v;
    }
    return acc;
  }, 0);
}

function fmt(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0
    }).format(amount);
  } catch {
    return `${currency} ${amount.toLocaleString()}`;
  }
}
