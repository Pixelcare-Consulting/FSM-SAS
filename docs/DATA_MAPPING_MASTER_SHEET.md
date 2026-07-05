# Data Mapping Master Sheet

## Google Form ↔ Portal ↔ SAP BusinessPartners

**Goal:** Ensure data remains consistent across all three layers (Google Form, Portal, SAP)

**Last Updated:** Dec 30 2025

---

## Current Flow Overview

```text
┌─────────────┐      ┌──────────────┐      ┌─────────────┐
│ Google Form │ ───▶ │   Portal     │ ───▶ │     SAP     │
│  (Source)   │      │  (Database)  │      │ (Target)    │
└─────────────┘      └──────────────┘      └─────────────┘
     │                      │                      │
     │                      │                      │
  Questions            Leads Table          BusinessPartners
                      Customer Table            API (sir Chris)
```

### Current Implementation Status

✅ **Google Form → Portal:** Implemented

- Sync endpoint: `POST /api/leads/sync`
- Maps Google Form questions to Portal `leads` table

✅ **Portal → Customer:** Implemented

- When lead is converted, creates customer in Portal `customer` table
- Endpoint: `POST /api/leads/:leadId/create-job`

✅ **Portal → SAP:** **IMPLEMENTED**

- BusinessPartner created in SAP when customer is created from lead
- Sync endpoint: `POST /api/customers/sync-to-sap`
- Automatic sync integrated into lead-to-customer conversion flow

---

## Data Mapping Tables

### 1. Google Form → Portal (Leads Table)

| Google Form Question | Portal Field (leads table) | Data Type | Notes |
| -------------------- | ------------------------- | --------- | ----- |
| Email | `email` | VARCHAR(255) | Required field |
| Full Name | `full_name` | VARCHAR(255) | Required field |
| Salutation | `salutation` | VARCHAR(50) | Optional |
| Handphone / Phone / Mobile | `handphone` | VARCHAR(50) | Optional |
| Block | `block` | VARCHAR(100) | Optional |
| Unit | `unit` | VARCHAR(100) | Optional |
| Address / Location | `address` | TEXT | Optional |
| First Service Date | `first_service_date` | DATE | Optional |
| Second Service Date | `second_service_date` | DATE | Optional |
| Third Service Date | `third_service_date` | DATE | Optional | 
| Fourth Service Date | `fourth_service_date` | DATE | Optional |
| Time Slot | `time_slot` | VARCHAR(255) | Optional |
| Complimentary Service Terms | `agreed_to_terms` | BOOLEAN | Default: false |
| Personal Information Consent | `personal_info_consent` | BOOLEAN | Default: false |
| Response ID | `google_form_response_id` | VARCHAR(255) | Unique identifier for duplicate prevention |
| Submission Timestamp | `submitted_at` | TIMESTAMP | Auto-generated |

**Mapping Logic:** See `pages/api/leads/sync.js` lines 316-356 for question ID mapping

---

### 2. Portal (Leads) → Portal (Customer Table)

When a lead is converted to a customer, the following mapping occurs:

| Portal Field (leads) | Portal Field (customer) | Data Type | Notes |
| -------------------- | ----------------------- | --------- | ----- |
| `full_name` | `customer_name` | VARCHAR(255) | Required |
| `email` | `email` | VARCHAR(255) | Optional (if column exists) |
| `handphone` | `phone_number` | VARCHAR(50) | Optional |
| N/A | `customer_code` | VARCHAR(100) | Auto-generated: `LEAD-{EMAIL_PREFIX}-{TIMESTAMP}` |

**Conversion Logic:** See `pages/api/leads/[leadId]/create-job.js` lines 58-102

---

### 3. Portal (Customer) → SAP BusinessPartners API

**⚠️ THIS MAPPING NEEDS TO BE IMPLEMENTED**

| Portal Field (customer) | SAP BusinessPartner Field | API Field Name | Data Type | Notes |
| ------------------------ | ------------------------- | -------------- | --------- | ----- |
| `customer_code` | Customer Code | `CardCode` | String | **Primary Key** - Unique identifier |
| `customer_name` | Customer Name | `CardName` | String | Required |
| `email` | Email Address | `EmailAddress` | String | Optional |
| `phone_number` | Phone 1 | `Phone1` | String | Optional |
| N/A | Card Type | `CardType` | Enum | Default: `'cCustomer'` for customers |
| N/A | Valid | `Valid` | String | Default: `'tYES'` |

**Address Mapping (from leads → SAP BPAddresses):**

| Portal Field (leads) | SAP BPAddress Field | API Field Name | Data Type | Notes |
| -------------------- | ------------------- | -------------- | --------- | ----- |
| `block` | Block | `Block` | String | Optional |
| `unit` | Building/Floor/Room | `BuildingFloorRoom` | String | Optional |
| `address` | Street | `Street` | String | Optional |
| N/A | Address Type | `AddressType` | Enum | Default: `'bo_ShipTo'` for shipping address |
| N/A | Address Name | `AddressName` | String | Auto-generated from block/unit |
| N/A | Default | `Default` | String | Default: `'tYES'` for first address |
| N/A | Zip Code | `ZipCode` | String | Extract from address if available |
| N/A | City | `City` | String | Extract from address if available |
| N/A | Country | `Country` | String | Default: `'SG'` (Singapore) |

**Contact Employee Mapping (from leads → SAP ContactEmployees):**

| Portal Field (leads) | SAP ContactEmployee Field | API Field Name | Data Type | Notes |
| -------------------- | ------------------------- | -------------- | --------- | ----- |
| `full_name` | Name | `Name` | String | Required |
| `salutation` | N/A | N/A | N/A | Not directly mapped (can be in FirstName) |
| `full_name` (split) | First Name | `FirstName` | String | Extract from full_name |
| `full_name` (split) | Last Name | `LastName` | String | Extract from full_name |
| `handphone` | Phone 1 | `Phone1` | String | Optional |
| `email` | Email | `E_Mail` | String | Optional |
| N/A | Position | `Position` | String | Optional (null for leads) |

**SAP API Endpoint:** `POST {{BaseURL}}/b1s/v1/BusinessPartners`

**Example SAP Request Body Structure:**

```json
{
  "CardCode": "", -- AUTO INCREMENT
  "CardName": "John Doe",
  "CardType": "cCustomer",
  "EmailAddress": "john@example.com",
  "Phone1": "0943843938",
  "Valid": "tYES",
  "BPAddresses": [
    {
      "AddressName": "Main Address",
      "AddressType": "bo_ShipTo",
      "Street": "123 Main Street",
      "Block": "3",
      "BuildingFloorRoom": "#05-03",
      "ZipCode": "218612",
      "City": "Singapore",
      "Country": "SG",
      "Default": "tYES"
    }
  ],
  "ContactEmployees": [
    {
      "Name": "Contact1",
      "FirstName": "John",
      "LastName": "Doe",
      "Phone1": "0943843938",
      "E_Mail": "john@example.com",
      "Position": null
    }
  ]
}
```

---

## Field Mapping Summary

### Key Identifiers

| System | Field Name | Purpose |
| ------ | ---------- | ------- |
| **Google Form** | `responseId` | Unique form submission ID |
| **Portal (Leads)** | `id` (UUID) | Unique lead identifier |
| **Portal (Customer)** | `id` (UUID) | Unique customer identifier |
| **Portal (Customer)** | `customer_code` | Human-readable customer code |
| **SAP** | `CardCode` | **Primary identifier** - Must match Portal `customer_code` |

**⚠️ CRITICAL:** The Portal `customer_code` MUST match SAP `CardCode` for proper synchronization.

---

## Data Flow Sequence

### Current Flow (Google Form → Portal)

1. **User submits Google Form**
   - Form data stored in Google Forms

2. **Manual Sync Triggered** (via Leads page)
   - Calls `POST /api/leads/sync`
   - Authenticates with Google Service Account
   - Fetches form structure and responses
   - Maps question IDs to field names
   - Transforms responses to lead format
   - Checks for duplicates (by `google_form_response_id`)
   - Creates new leads in Portal `leads` table

3. **Lead Displayed in Portal**
   - Leads visible in `/customer-leads` page
   - Status: `PENDING`

4. **Lead Converted to Customer** (when job is created)
   - User clicks "Create Job" from lead
   - Calls `POST /api/leads/:leadId/create-job`
   - Creates or finds customer in Portal `customer` table
   - Creates location from lead address
   - Creates job
   - Updates lead status to `CONVERTED`
   - Links lead to customer via `customer_id`

### Missing Flow (Portal → SAP)

**⚠️ TO BE IMPLEMENTED:**

5. **Customer Created in SAP** (when customer is created in Portal)

   - Trigger: After customer is created in Portal
   - Endpoint: `POST {{BaseURL}}/b1s/v1/BusinessPartners`
   - Maps Portal customer data to SAP BusinessPartner format
   - Creates BusinessPartner with addresses and contact employees
   - Stores SAP `CardCode` in Portal (should match `customer_code`)

6. **Customer Updated in SAP** (when customer is updated in Portal)
   - Trigger: After customer is updated in Portal
   - Endpoint: `PATCH {{BaseURL}}/b1s/v1/BusinessPartners('{CardCode}')`
   - Syncs updated fields to SAP

---

## Implementation Requirements

### 1. Create SAP BusinessPartner Creation Service

**File:** `lib/services/sapService.js`

Add method:

```javascript
async createBusinessPartner(businessPartnerData, sessionCookies) {
  const endpoint = 'BusinessPartners';
  return await this.makeRequest(endpoint, {
    method: 'POST',
    body: businessPartnerData
  }, sessionCookies);
}
```

### 2. Create API Endpoint for SAP Sync

**File:** `pages/api/customers/sync-to-sap.js` (new file)

- Accepts `customer_id` or `customer_code`
- Fetches customer from Portal
- Transforms to SAP BusinessPartner format
- Creates in SAP via sir Chris API
- Updates Portal customer with SAP CardCode (if different)

### 3. Update Customer Creation Flow

**File:** `pages/api/leads/[leadId]/create-job.js`

After customer is created in Portal (line 100), add:
- Call to sync customer to SAP
- Handle errors gracefully (don't fail job creation if SAP sync fails)

### 4. Data Transformation Logic

Create mapping function:

```javascript
function transformPortalCustomerToSAP(customer, lead) {
  // Transform Portal customer + lead data to SAP BusinessPartner format
  // Handle address mapping
  // Handle contact employee mapping
  // Return SAP-compatible JSON
}
```

---

## Field Validation Rules

### Required Fields

| System | Field | Validation |
| ------ | ----- | ---------- |
| Google Form | Email | Must be valid email format |
| Google Form | Full Name | Must not be empty |
| Portal (Leads) | `email` | Required, unique per response |
| Portal (Leads) | `full_name` | Required |
| Portal (Customer) | `customer_code` | Required, unique |
| Portal (Customer) | `customer_name` | Required |
| SAP | `CardCode` | Required, unique, alphanumeric, max 15 chars |
| SAP | `CardName` | Required, max 100 chars |
| SAP | `CardType` | Required, must be valid enum value |

### Optional Fields

All other fields are optional but should be mapped when available.

---

## Error Handling

### Duplicate Prevention

1. **Google Form → Portal:**
   - Check `google_form_response_id` before creating lead
   - Check `email + submitted_at` as fallback

2. **Portal → SAP:**
   - Check if `CardCode` already exists in SAP before creating
   - If exists, update instead of create

### Sync Failures

- If SAP sync fails, log error but don't fail Portal operation
- Implement retry mechanism for failed syncs
- Store sync status in Portal customer table (e.g., `sap_synced_at`, `sap_sync_error`)

---

## Testing Checklist

- [ ] Google Form sync creates leads correctly
- [ ] Lead to customer conversion works
- [ ] Customer creation triggers SAP sync
- [ ] SAP BusinessPartner created with correct CardCode
- [ ] Address mapping works correctly
- [ ] Contact employee mapping works correctly
- [ ] Duplicate prevention works (same CardCode)
- [ ] Error handling works (SAP unavailable)
- [ ] Data remains consistent across all three systems


---

## Notes


- **SAP API:** This refers to the SAP Service Layer API (BusinessPartners endpoint)
- **CardCode Format:** SAP CardCode has restrictions (alphanumeric, max 15 chars). Portal `customer_code` should follow same format.
- **Address Handling:** SAP uses separate `BPAddresses` collection. Portal stores address as text in `customer_address` field.
- **Contact Employees:** SAP uses `ContactEmployees` collection. Portal stores contact info directly in customer/lead tables.

---

## Future Enhancements

1. **Bidirectional Sync:** SAP → Portal updates
2. **Automatic Sync:** Real-time sync instead of manual trigger
3. **Sync Status Dashboard:** View sync status for all customers
4. **Conflict Resolution:** Handle cases where data differs between systems
5. **Bulk Sync:** Sync multiple customers at once

