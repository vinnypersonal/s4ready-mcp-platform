/**
 * OData query builders for all SAP services used by Vendor 360.
 *
 * Each function returns an ODataQuery object consumed by SapConnector.
 * Business logic stays in the tool handlers; this file is pure query config.
 * All service paths are whitelisted S/4HANA released APIs.
 */

import type { ODataQuery } from '@s4ready/core';

// ── Business Partner ──────────────────────────────────────────────────────

export function buildSearchPartnerQuery(searchTerm: string, limit = 20): ODataQuery {
  // Try both substring search on name and exact match on ID.
  // OData V2 substringof; S/4 Cloud uses contains().
  // Note: IsSupplier/IsCustomer are not selectable on all on-premise releases —
  // use BusinessPartnerCategory (1=Person,2=Organization) instead.
  return {
    servicePath: '/sap/opu/odata/sap/API_BUSINESS_PARTNER',
    entitySet: 'A_BusinessPartner',
    params: {
      $filter: `substringof('${escapeSingleQuote(searchTerm)}',BusinessPartnerFullName) or BusinessPartner eq '${escapeSingleQuote(searchTerm)}'`,
      $select: 'BusinessPartner,BusinessPartnerFullName,BusinessPartnerCategory,BusinessPartnerGrouping,BusinessPartnerIsBlocked',
      $top: String(limit),
      $orderby: 'BusinessPartnerFullName asc'
    }
  };
}

export function buildGetPartnerQuery(partnerId: string): ODataQuery {
  return {
    servicePath: '/sap/opu/odata/sap/API_BUSINESS_PARTNER',
    entitySet: 'A_BusinessPartner',
    params: {
      $filter: `BusinessPartner eq '${escapeSingleQuote(partnerId)}'`,
      $select: 'BusinessPartner,BusinessPartnerFullName,BusinessPartnerCategory,BusinessPartnerGrouping,BusinessPartnerIsBlocked',
      $top: '1'
    }
  };
}

// ── Purchase Orders ───────────────────────────────────────────────────────

export function buildOpenPOsQuery(supplierId: string, limit = 50): ODataQuery {
  return {
    servicePath: '/sap/opu/odata/sap/API_PURCHASEORDER_PROCESS_SRV',
    entitySet: 'A_PurchaseOrder',
    params: {
      $filter: `Supplier eq '${escapeSingleQuote(supplierId)}'`,
      $select: 'PurchaseOrder,Supplier,PurchaseOrderDate,DocumentCurrency,PurchaseOrderNetAmount,OverallSDProcessStatus,PurchasingOrganization,PurchasingGroup',
      $top: String(limit),
      $orderby: 'PurchaseOrderDate desc'
    }
  };
}

export function buildPOsByDateRangeQuery(
  supplierId: string,
  fromDate: string,
  toDate: string,
  limit = 100
): ODataQuery {
  return {
    servicePath: '/sap/opu/odata/sap/API_PURCHASEORDER_PROCESS_SRV',
    entitySet: 'A_PurchaseOrder',
    params: {
      $filter: `Supplier eq '${escapeSingleQuote(supplierId)}' and PurchaseOrderDate ge datetime'${fromDate}T00:00:00' and PurchaseOrderDate le datetime'${toDate}T23:59:59'`,
      $select: 'PurchaseOrder,Supplier,PurchaseOrderDate,DocumentCurrency,PurchaseOrderNetAmount,OverallSDProcessStatus',
      $top: String(limit),
      $orderby: 'PurchaseOrderDate desc'
    }
  };
}

// ── Sales Orders ──────────────────────────────────────────────────────────

export function buildOpenSOsQuery(customerId: string, limit = 50): ODataQuery {
  return {
    servicePath: '/sap/opu/odata/sap/API_SALES_ORDER_SRV',
    entitySet: 'A_SalesOrder',
    params: {
      $filter: `SoldToParty eq '${escapeSingleQuote(customerId)}'`,
      $select: 'SalesOrder,SoldToParty,SalesOrderDate,TransactionCurrency,TotalNetAmount,OverallSDProcessStatus,SalesOrganization,DistributionChannel',
      $top: String(limit),
      $orderby: 'SalesOrderDate desc'
    }
  };
}

// ── Supplier Invoices ─────────────────────────────────────────────────────

export function buildSupplierInvoicesQuery(supplierId: string, limit = 50): ODataQuery {
  return {
    servicePath: '/sap/opu/odata/sap/API_SUPPLIERINVOICE_PROCESS_SRV',
    entitySet: 'A_SupplierInvoice',
    params: {
      // On-premise API uses InvoicingParty (not Supplier) as the vendor field.
      $filter: `InvoicingParty eq '${escapeSingleQuote(supplierId)}'`,
      $select: 'SupplierInvoice,FiscalYear,CompanyCode,InvoicingParty,DocumentDate,PostingDate,DocumentCurrency,InvoiceGrossAmount,PaymentBlockingReason',
      $top: String(limit),
      $orderby: 'DocumentDate desc'
    }
  };
}

export function buildBlockedInvoicesQuery(supplierId: string): ODataQuery {
  return {
    servicePath: '/sap/opu/odata/sap/API_SUPPLIERINVOICE_PROCESS_SRV',
    entitySet: 'A_SupplierInvoice',
    params: {
      $filter: `InvoicingParty eq '${escapeSingleQuote(supplierId)}' and PaymentBlockingReason ne ''`,
      $select: 'SupplierInvoice,FiscalYear,CompanyCode,InvoicingParty,DocumentDate,DocumentCurrency,InvoiceGrossAmount,PaymentBlockingReason',
      $top: '20',
      $orderby: 'DocumentDate desc'
    }
  };
}

// ── AR/AP Line Items ──────────────────────────────────────────────────────

export function buildOpenAPItemsQuery(supplierId: string, limit = 50): ODataQuery {
  return {
    servicePath: '/sap/opu/odata/sap/API_OPLACCTGDOCITEMCUBE_SRV',
    entitySet: 'OperationalAcctgDocItem',
    params: {
      $filter: `Supplier eq '${escapeSingleQuote(supplierId)}' and IsOpenItem eq true`,
      $select: 'AccountingDocument,CompanyCode,FiscalYear,AccountingDocumentItem,Supplier,AmountInTransactionCurrency,TransactionCurrency,DocumentDate,NetDueDate',
      $top: String(limit),
      $orderby: 'NetDueDate asc'
    }
  };
}

export function buildOpenARItemsQuery(customerId: string, limit = 50): ODataQuery {
  return {
    servicePath: '/sap/opu/odata/sap/API_OPLACCTGDOCITEMCUBE_SRV',
    entitySet: 'OperationalAcctgDocItem',
    params: {
      $filter: `Customer eq '${escapeSingleQuote(customerId)}' and IsOpenItem eq true`,
      $select: 'AccountingDocument,CompanyCode,FiscalYear,AccountingDocumentItem,Customer,AmountInTransactionCurrency,TransactionCurrency,DocumentDate,NetDueDate',
      $top: String(limit),
      $orderby: 'NetDueDate asc'
    }
  };
}

// ── Payments ──────────────────────────────────────────────────────────────

export function buildPaymentHistoryQuery(
  partnerId: string,
  partnerType: 'VENDOR' | 'CUSTOMER',
  limit = 20
): ODataQuery {
  const field = partnerType === 'VENDOR' ? 'Supplier' : 'Customer';
  return {
    servicePath: '/sap/opu/odata/sap/API_CLEAREDACCTGDOCITEMCUBE_SRV',
    entitySet: 'ClearedAcctgDocItem',
    params: {
      $filter: `${field} eq '${escapeSingleQuote(partnerId)}'`,
      $select: `AccountingDocument,CompanyCode,FiscalYear,${field},AmountInTransactionCurrency,TransactionCurrency,PostingDate,ClearingDate`,
      $top: String(limit),
      $orderby: 'ClearingDate desc'
    }
  };
}

// ── Quality Notifications ─────────────────────────────────────────────────

export function buildQualityNotificationsQuery(supplierId: string, limit = 20): ODataQuery {
  return {
    servicePath: '/sap/opu/odata/sap/API_QUALITYNOTIFICATION',
    entitySet: 'A_QualityNotification',
    params: {
      $filter: `Supplier eq '${escapeSingleQuote(supplierId)}'`,
      $select: 'QualityNotification,QualityNotificationCategory,NotificationType,Supplier,CreationDate,NotificationText,QualityNotificationStatus',
      $top: String(limit),
      $orderby: 'CreationDate desc'
    }
  };
}

// ── Contracts ─────────────────────────────────────────────────────────────

export function buildActiveContractsQuery(supplierId: string): ODataQuery {
  const today = new Date().toISOString().slice(0, 10);
  return {
    servicePath: '/sap/opu/odata/sap/API_PURGCONTRACT_PROCESS_SRV',
    entitySet: 'A_PurchaseContract',
    params: {
      $filter: `Supplier eq '${escapeSingleQuote(supplierId)}' and ValidityEndDate ge datetime'${today}T00:00:00'`,
      $select: 'PurchaseContract,Supplier,ValidityStartDate,ValidityEndDate,DocumentCurrency,TargetAmount,PurchasingOrganization,PurchasingGroup',
      $top: '10',
      $orderby: 'ValidityEndDate desc'
    }
  };
}

// ── Utilities ─────────────────────────────────────────────────────────────

function escapeSingleQuote(value: string): string {
  return value.replace(/'/g, "''");
}

/** Date N months ago, formatted YYYY-MM-DD */
export function dateMonthsAgo(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}
