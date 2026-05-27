/**
 * Mock SAP data set. Small enough to load into memory, large enough to feel
 * realistic in demos. Designed to support Vendor/Customer 360 queries that
 * showcase a variety of KPIs and edge cases.
 *
 * Field names match SAP S/4HANA OData V2 conventions so tool code is identical
 * against mock and real systems.
 */

export const MOCK_BUSINESS_PARTNERS = [
  {
    BusinessPartner: '1000234',
    BusinessPartnerFullName: 'Tata Steel Limited',
    BusinessPartnerCategory: '2', // Organization
    BusinessPartnerGrouping: 'BP02',
    IsSupplier: true,
    IsCustomer: false,
    BusinessPartnerIsBlocked: false,
    Country: 'IN',
    AddressID: 'ADD-1000234',
    CityName: 'Mumbai',
    Region: 'MH',
    PaymentTerms: '0001', // Net 30
    CreditLimit: 50000000,
    Currency: 'INR',
    LastChangeDate: '2026-04-15'
  },
  {
    BusinessPartner: '1000235',
    BusinessPartnerFullName: 'Reliance Industries Limited',
    BusinessPartnerCategory: '2',
    BusinessPartnerGrouping: 'BP02',
    IsSupplier: true,
    IsCustomer: true,
    BusinessPartnerIsBlocked: false,
    Country: 'IN',
    AddressID: 'ADD-1000235',
    CityName: 'Mumbai',
    Region: 'MH',
    PaymentTerms: '0002', // Net 45
    CreditLimit: 200000000,
    Currency: 'INR',
    LastChangeDate: '2026-05-02'
  },
  {
    BusinessPartner: '1000236',
    BusinessPartnerFullName: 'Infosys Limited',
    BusinessPartnerCategory: '2',
    BusinessPartnerGrouping: 'BP02',
    IsSupplier: true,
    IsCustomer: false,
    BusinessPartnerIsBlocked: false,
    Country: 'IN',
    AddressID: 'ADD-1000236',
    CityName: 'Bengaluru',
    Region: 'KA',
    PaymentTerms: '0001',
    Currency: 'INR',
    LastChangeDate: '2026-03-20'
  },
  {
    BusinessPartner: '1000237',
    BusinessPartnerFullName: 'Hindustan Unilever Limited',
    BusinessPartnerCategory: '2',
    BusinessPartnerGrouping: 'BP01', // Customer group
    IsSupplier: false,
    IsCustomer: true,
    BusinessPartnerIsBlocked: false,
    Country: 'IN',
    CityName: 'Mumbai',
    Region: 'MH',
    PaymentTerms: '0003',
    CreditLimit: 100000000,
    Currency: 'INR',
    LastChangeDate: '2026-05-10'
  },
  {
    BusinessPartner: '1000238',
    BusinessPartnerFullName: 'ACME Manufacturing Corp',
    BusinessPartnerCategory: '2',
    BusinessPartnerGrouping: 'BP02',
    IsSupplier: true,
    IsCustomer: false,
    BusinessPartnerIsBlocked: true, // BLOCKED — useful for "anomaly" demos
    Country: 'US',
    CityName: 'Chicago',
    Region: 'IL',
    PaymentTerms: '0001',
    Currency: 'USD',
    LastChangeDate: '2026-02-28'
  },
  {
    BusinessPartner: '1000239',
    BusinessPartnerFullName: 'Bosch India Pvt Ltd',
    BusinessPartnerCategory: '2',
    BusinessPartnerGrouping: 'BP02',
    IsSupplier: true,
    IsCustomer: false,
    BusinessPartnerIsBlocked: false,
    Country: 'IN',
    CityName: 'Bengaluru',
    Region: 'KA',
    PaymentTerms: '0001',
    Currency: 'INR',
    LastChangeDate: '2026-04-30'
  }
];

export const MOCK_PURCHASE_ORDERS = [
  // Tata Steel — diverse PO history
  { PurchaseOrder: '4500001234', Supplier: '1000234', PurchaseOrderDate: '2026-05-10',
    DocumentCurrency: 'INR', PurchaseOrderNetAmount: 12500000, OverallSDProcessStatus: 'A',
    PurchasingOrganization: '1000', PurchasingGroup: '001' },
  { PurchaseOrder: '4500001235', Supplier: '1000234', PurchaseOrderDate: '2026-04-22',
    DocumentCurrency: 'INR', PurchaseOrderNetAmount: 8200000, OverallSDProcessStatus: 'C',
    PurchasingOrganization: '1000', PurchasingGroup: '001' },
  { PurchaseOrder: '4500001236', Supplier: '1000234', PurchaseOrderDate: '2026-04-05',
    DocumentCurrency: 'INR', PurchaseOrderNetAmount: 15600000, OverallSDProcessStatus: 'C',
    PurchasingOrganization: '1000', PurchasingGroup: '001' },
  { PurchaseOrder: '4500001237', Supplier: '1000234', PurchaseOrderDate: '2026-03-18',
    DocumentCurrency: 'INR', PurchaseOrderNetAmount: 6700000, OverallSDProcessStatus: 'C',
    PurchasingOrganization: '1000', PurchasingGroup: '001' },
  // Reliance
  { PurchaseOrder: '4500002001', Supplier: '1000235', PurchaseOrderDate: '2026-05-15',
    DocumentCurrency: 'INR', PurchaseOrderNetAmount: 45000000, OverallSDProcessStatus: 'A',
    PurchasingOrganization: '1000', PurchasingGroup: '002' },
  { PurchaseOrder: '4500002002', Supplier: '1000235', PurchaseOrderDate: '2026-04-12',
    DocumentCurrency: 'INR', PurchaseOrderNetAmount: 28000000, OverallSDProcessStatus: 'C',
    PurchasingOrganization: '1000', PurchasingGroup: '002' },
  // Infosys
  { PurchaseOrder: '4500003001', Supplier: '1000236', PurchaseOrderDate: '2026-05-20',
    DocumentCurrency: 'INR', PurchaseOrderNetAmount: 3500000, OverallSDProcessStatus: 'A',
    PurchasingOrganization: '1000', PurchasingGroup: '003' },
  // ACME — blocked vendor with stuck POs
  { PurchaseOrder: '4500004001', Supplier: '1000238', PurchaseOrderDate: '2026-02-15',
    DocumentCurrency: 'USD', PurchaseOrderNetAmount: 50000, OverallSDProcessStatus: 'B',
    PurchasingOrganization: '2000', PurchasingGroup: '004' },
  // Bosch
  { PurchaseOrder: '4500005001', Supplier: '1000239', PurchaseOrderDate: '2026-05-08',
    DocumentCurrency: 'INR', PurchaseOrderNetAmount: 9200000, OverallSDProcessStatus: 'A',
    PurchasingOrganization: '1000', PurchasingGroup: '001' }
];

export const MOCK_SALES_ORDERS = [
  // Reliance as customer
  { SalesOrder: '5000001001', SoldToParty: '1000235', SalesOrderDate: '2026-05-12',
    TransactionCurrency: 'INR', TotalNetAmount: 78000000, OverallSDProcessStatus: 'A',
    SalesOrganization: '1000', DistributionChannel: '10' },
  { SalesOrder: '5000001002', SoldToParty: '1000235', SalesOrderDate: '2026-04-18',
    TransactionCurrency: 'INR', TotalNetAmount: 52000000, OverallSDProcessStatus: 'C',
    SalesOrganization: '1000', DistributionChannel: '10' },
  // Hindustan Unilever as customer
  { SalesOrder: '5000002001', SoldToParty: '1000237', SalesOrderDate: '2026-05-22',
    TransactionCurrency: 'INR', TotalNetAmount: 145000000, OverallSDProcessStatus: 'A',
    SalesOrganization: '1000', DistributionChannel: '10' },
  { SalesOrder: '5000002002', SoldToParty: '1000237', SalesOrderDate: '2026-05-01',
    TransactionCurrency: 'INR', TotalNetAmount: 89000000, OverallSDProcessStatus: 'B',
    SalesOrganization: '1000', DistributionChannel: '10' },
  { SalesOrder: '5000002003', SoldToParty: '1000237', SalesOrderDate: '2026-04-10',
    TransactionCurrency: 'INR', TotalNetAmount: 67000000, OverallSDProcessStatus: 'C',
    SalesOrganization: '1000', DistributionChannel: '10' }
];

export const MOCK_SUPPLIER_INVOICES = [
  // Tata Steel — most invoices on time, two recent ones overdue
  { SupplierInvoice: '1900001234', Supplier: '1000234', InvoicingParty: '1000234',
    DocumentDate: '2026-04-22', PostingDate: '2026-04-25',
    DocumentCurrency: 'INR', InvoiceGrossAmount: 9676000, PaymentBlockingReason: '',
    IsBlocked: false, NetPaymentDays: 30 },
  { SupplierInvoice: '1900001235', Supplier: '1000234', InvoicingParty: '1000234',
    DocumentDate: '2026-04-15', PostingDate: '2026-04-16',
    DocumentCurrency: 'INR', InvoiceGrossAmount: 1900000, PaymentBlockingReason: 'R',
    IsBlocked: true, NetPaymentDays: 30 },
  { SupplierInvoice: '1900001236', Supplier: '1000234', InvoicingParty: '1000234',
    DocumentDate: '2026-04-10', PostingDate: '2026-04-12',
    DocumentCurrency: 'INR', InvoiceGrossAmount: 1900000, PaymentBlockingReason: 'R',
    IsBlocked: true, NetPaymentDays: 30 },
  // Reliance — clean
  { SupplierInvoice: '1900002001', Supplier: '1000235', InvoicingParty: '1000235',
    DocumentDate: '2026-04-25', PostingDate: '2026-04-27',
    DocumentCurrency: 'INR', InvoiceGrossAmount: 33040000, PaymentBlockingReason: '',
    IsBlocked: false, NetPaymentDays: 45 },
  // ACME — old unpaid
  { SupplierInvoice: '1900004001', Supplier: '1000238', InvoicingParty: '1000238',
    DocumentDate: '2026-02-20', PostingDate: '2026-02-22',
    DocumentCurrency: 'USD', InvoiceGrossAmount: 58000, PaymentBlockingReason: 'A',
    IsBlocked: true, NetPaymentDays: 30 }
];

export const MOCK_AR_AP_ITEMS = [
  // Open AP (we owe Tata Steel)
  { AccountingDocument: '1900001234', CompanyCode: '1000', FiscalYear: '2026',
    AccountingDocumentItem: '001', GLAccount: '0021100000',
    Supplier: '1000234', AmountInTransactionCurrency: 9676000,
    TransactionCurrency: 'INR', DocumentDate: '2026-04-22', NetDueDate: '2026-05-22',
    IsOpenItem: true, ClearingDocument: null },
  { AccountingDocument: '1900001235', CompanyCode: '1000', FiscalYear: '2026',
    AccountingDocumentItem: '001', GLAccount: '0021100000',
    Supplier: '1000234', AmountInTransactionCurrency: 1900000,
    TransactionCurrency: 'INR', DocumentDate: '2026-04-15', NetDueDate: '2026-05-15',
    IsOpenItem: true, ClearingDocument: null },
  // Open AR (Hindustan Unilever owes us)
  { AccountingDocument: '1800002001', CompanyCode: '1000', FiscalYear: '2026',
    AccountingDocumentItem: '001', GLAccount: '0011100000',
    Customer: '1000237', AmountInTransactionCurrency: 145000000,
    TransactionCurrency: 'INR', DocumentDate: '2026-05-22', NetDueDate: '2026-06-21',
    IsOpenItem: true, ClearingDocument: null }
];

export const MOCK_PAYMENTS = [
  { AccountingDocument: '1900001230', CompanyCode: '1000', FiscalYear: '2026',
    Supplier: '1000234', AmountInTransactionCurrency: 8200000,
    TransactionCurrency: 'INR', PostingDate: '2026-04-18', ClearingDate: '2026-04-18' },
  { AccountingDocument: '1900001231', CompanyCode: '1000', FiscalYear: '2026',
    Supplier: '1000234', AmountInTransactionCurrency: 15600000,
    TransactionCurrency: 'INR', PostingDate: '2026-03-25', ClearingDate: '2026-03-25' },
  { AccountingDocument: '1900002000', CompanyCode: '1000', FiscalYear: '2026',
    Supplier: '1000235', AmountInTransactionCurrency: 28000000,
    TransactionCurrency: 'INR', PostingDate: '2026-04-15', ClearingDate: '2026-04-15' }
];

export const MOCK_QUALITY_NOTIFICATIONS = [
  { QualityNotification: '900001', QualityNotificationCategory: 'Q1',
    NotificationType: 'Q1', Supplier: '1000234',
    CreationDate: '2026-04-15', NotificationText: 'Material delivered with surface defects',
    QualityNotificationStatus: 'OUTC' },
  { QualityNotification: '900002', QualityNotificationCategory: 'Q1',
    NotificationType: 'Q1', Supplier: '1000238',
    CreationDate: '2026-02-25', NotificationText: 'Batch failed quality inspection',
    QualityNotificationStatus: 'OSNO' }
];

export const MOCK_CONTRACTS = [
  { PurchaseContract: '4600000123', Supplier: '1000234',
    ValidityStartDate: '2026-01-01', ValidityEndDate: '2026-12-31',
    DocumentCurrency: 'INR', TargetAmount: 200000000,
    PurchasingOrganization: '1000', PurchasingGroup: '001' },
  { PurchaseContract: '4600000124', Supplier: '1000235',
    ValidityStartDate: '2025-04-01', ValidityEndDate: '2026-03-31',
    DocumentCurrency: 'INR', TargetAmount: 350000000,
    PurchasingOrganization: '1000', PurchasingGroup: '002' }
];
