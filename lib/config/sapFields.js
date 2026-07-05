// lib/config/sapFields.js

/**
 * SAP Business Partner Field Configuration
 * Configure which fields are available in your SAP B1 system
 */

/**
 * Standard BusinessPartner fields that should be available in all SAP B1 systems
 */
export const STANDARD_BP_FIELDS = [
  'CardCode',
  'CardName',
  'CardType',
  'EmailAddress',
  'Phone1',
  'Phone2',
  'Address',
  'MailAddress',
  'Country',
  'Valid',
  'CreateDate',
  'UpdateDate',
  'City',
  'ZipCode',
  'State',
  'Block',
  'Street',
  'Building',
  'County',
  'FederalTaxID',
  'Currency',
  'CreditLimit',
  'MaxCommitment',
  'DiscountPercent',
  'VatStatus',
  'GroupCode',
  'PriceListNum',
  'IntrestRatePercent',
  'CommissionPercent',
  'CommissionGroupCode',
  'FreeText',
  'SalesPersonCode',
  'BilltoDefault',
  'ShipToDefault',
  'VatGroup',
  'ShippingType',
  'Password',
  'Indicator',
  'IBAN',
  'CreditCardCode',
  'CreditCardNum',
  'CreditCardExpiration',
  'DebitorAccount',
  'OpenDeliveryNotesBalance',
  'OpenOrdersBalance',
  'OpenInvoicesBalance',
  'OpenChecksBalance',
  'ProjectCode',
  'VatGroupLatinAmerica',
  'Website',
  'Cellular',
  'AvarageLate',
  'City2',
  'County2',
  'State2',
  'Country2',
  'Building2',
  'StreetNo2',
  // Navigation properties for addresses
  'BPAddresses'
];

/**
 * Custom/User-defined fields configuration
 * Set to null to disable, or provide the actual field name if it exists
 * 
 * To enable a custom field:
 * 1. Set the value to the actual field name (e.g., 'U_Contract')
 * 2. Make sure the field exists in your SAP B1 system
 * 
 * To disable a custom field:
 * 1. Set the value to null
 */
export const CUSTOM_BP_FIELDS = {
  // Contract status field - commonly used custom field
  contract: null, // Set to 'U_Contract' if this field exists in your system
  
  // Service contract fields
  serviceContract: null, // Set to 'U_ServiceContract' if exists
  contractStartDate: null, // Set to 'U_ContractStart' if exists
  contractEndDate: null, // Set to 'U_ContractEnd' if exists
  
  // Customer classification
  customerType: null, // Set to 'U_CustomerType' if exists
  customerCategory: null, // Set to 'U_Category' if exists
  customerRating: null, // Set to 'U_Rating' if exists
  
  // Service-related fields
  serviceLevel: null, // Set to 'U_ServiceLevel' if exists
  preferredTechnician: null, // Set to 'U_PreferredTech' if exists
  serviceNotes: null, // Set to 'U_ServiceNotes' if exists
  
  // Business fields
  industry: null, // Set to 'U_Industry' if exists
  companySize: null, // Set to 'U_CompanySize' if exists
  annualRevenue: null, // Set to 'U_AnnualRevenue' if exists
  
  // Contact preferences
  preferredContactMethod: null, // Set to 'U_ContactMethod' if exists
  marketingOptIn: null, // Set to 'U_MarketingOptIn' if exists
  
  // Geographic/Territory
  territory: null, // Set to 'U_Territory' if exists
  region: null, // Set to 'U_Region' if exists
  
  // Add more custom fields as needed
  // customField1: null,
  // customField2: null,
};

/**
 * Get all available fields for selection
 * @returns {Array} Array of field names
 */
export function getAvailableFields() {
  const customFields = Object.values(CUSTOM_BP_FIELDS).filter(field => field !== null);
  return [...STANDARD_BP_FIELDS, ...customFields];
}

/**
 * Get only standard fields (safe to use in all systems)
 * @returns {Array} Array of standard field names
 */
export function getStandardFields() {
  return [...STANDARD_BP_FIELDS];
}

/**
 * Get available custom fields
 * @returns {Array} Array of custom field names
 */
export function getCustomFields() {
  return Object.values(CUSTOM_BP_FIELDS).filter(field => field !== null);
}

/**
 * Check if a custom field is enabled
 * @param {string} fieldKey - Custom field key
 * @returns {boolean} True if field is enabled
 */
export function isCustomFieldEnabled(fieldKey) {
  return CUSTOM_BP_FIELDS[fieldKey] !== null;
}

/**
 * Get custom field name by key
 * @param {string} fieldKey - Custom field key
 * @returns {string|null} Field name or null if not enabled
 */
export function getCustomFieldName(fieldKey) {
  return CUSTOM_BP_FIELDS[fieldKey] || null;
}

/**
 * Field selection strategies
 */
export const FIELD_SELECTION_STRATEGY = {
  // Use all available fields (standard + enabled custom fields)
  ALL: 'all',
  
  // Use only standard fields (safest option)
  STANDARD_ONLY: 'standard',
  
  // Use minimal fields for better performance
  MINIMAL: 'minimal',
  
  // Use summary fields for dropdowns/lists
  SUMMARY: 'summary'
};

/**
 * Get fields based on selection strategy
 * @param {string} strategy - Field selection strategy
 * @returns {Array} Array of field names
 */
export function getFieldsByStrategy(strategy = FIELD_SELECTION_STRATEGY.STANDARD_ONLY) {
  switch (strategy) {
    case FIELD_SELECTION_STRATEGY.ALL:
      return getAvailableFields();
      
    case FIELD_SELECTION_STRATEGY.STANDARD_ONLY:
      return getStandardFields();
      
    case FIELD_SELECTION_STRATEGY.MINIMAL:
      return [
        'CardCode',
        'CardName',
        'CardType',
        'EmailAddress',
        'Phone1',
        'Valid'
      ];
      
    case FIELD_SELECTION_STRATEGY.SUMMARY:
      return [
        'CardCode',
        'CardName'
      ];
      
    default:
      return getStandardFields();
  }
}

/**
 * Build filter conditions for custom fields
 * @param {Object} filterParams - Filter parameters
 * @returns {Array} Array of filter conditions
 */
export function buildCustomFieldFilters(filterParams) {
  const conditions = [];
  
  // Contract status filter
  if (filterParams.contractStatus && isCustomFieldEnabled('contract')) {
    const contractField = getCustomFieldName('contract');
    conditions.push(`${contractField} eq '${filterParams.contractStatus === 'Y' ? 'Y' : 'N'}'`);
  }
  
  // Add more custom field filters as needed
  if (filterParams.customerType && isCustomFieldEnabled('customerType')) {
    const customerTypeField = getCustomFieldName('customerType');
    conditions.push(`${customerTypeField} eq '${filterParams.customerType.replace(/'/g, "''")}'`);
  }
  
  if (filterParams.serviceLevel && isCustomFieldEnabled('serviceLevel')) {
    const serviceLevelField = getCustomFieldName('serviceLevel');
    conditions.push(`${serviceLevelField} eq '${filterParams.serviceLevel.replace(/'/g, "''")}'`);
  }
  
  return conditions;
}
