# Leads Database Migration

## Overview

This document describes the migration from Google Forms API direct fetching to a structured database schema for leads management. The new system provides full CRUD operations, editable fields, and better integration with the existing workflow.

## Database Schema

### Leads Table

The `leads` table has been added to the database schema with the following structure:

```sql
CREATE TABLE leads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    -- Contact Information
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    salutation VARCHAR(50),
    handphone VARCHAR(50),
    -- Address Information
    block VARCHAR(100),
    unit VARCHAR(100),
    address TEXT,
    -- Service Dates
    first_service_date DATE,
    second_service_date DATE,
    third_service_date DATE,
    fourth_service_date DATE,
    time_slot VARCHAR(255),
    -- Consent & Terms
    agreed_to_terms BOOLEAN DEFAULT false,
    personal_info_consent BOOLEAN DEFAULT false,
    -- Status & Tracking
    status VARCHAR(20) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CONTACTED', 'CONVERTED', 'REJECTED', 'COMPLETED')),
    source VARCHAR(100) DEFAULT 'GOOGLE_FORM',
    notes TEXT,
    -- Conversion tracking (if lead becomes a customer)
    customer_id UUID REFERENCES customer(id) ON DELETE SET NULL,
    converted_at TIMESTAMP WITH TIME ZONE,
    -- Timestamps
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);
```

### Indexes

The following indexes have been created for optimal query performance:

- `idx_leads_email` - For email lookups
- `idx_leads_status` - For status filtering
- `idx_leads_customer_id` - For customer relationship queries
- `idx_leads_submitted_at` - For date-based sorting
- `idx_leads_first_service_date` - For service date filtering
- `idx_leads_source` - For source filtering

### Triggers

An automatic `updated_at` trigger has been added to maintain timestamp consistency.

## API Endpoints

### GET /api/leads
List all leads with optional filters:
- `status` - Filter by status (PENDING, CONTACTED, CONVERTED, REJECTED, COMPLETED)
- `source` - Filter by source
- `email` - Search by email (partial match)
- `search` - General search across name, email, and phone

**Response:**
```json
{
  "leads": [...],
  "total": 10
}
```

### POST /api/leads
Create a new lead.

**Request Body:**
```json
{
  "email": "customer@example.com",
  "fullName": "John Doe",
  "salutation": "Mr",
  "handphone": "+65 9123 4567",
  "block": "3",
  "unit": "#05-03",
  "address": "123 Main Street",
  "firstServiceDate": "2024-02-01",
  "timeSlot": "AM - Time Slot: 9.30am - 12.30pm",
  "agreedToTerms": true,
  "personalInfoConsent": true,
  "status": "PENDING",
  "source": "GOOGLE_FORM"
}
```

### GET /api/leads/[leadId]
Get a single lead by ID.

### PUT /api/leads/[leadId]
Update a lead. All fields are optional - only provided fields will be updated.

### DELETE /api/leads/[leadId]
Soft delete a lead (sets `deleted_at` timestamp).

## Database Service Layer

The `leadService` has been added to `lib/supabase/database.js` with the following methods:

- `getAll(filters, client)` - Get all leads with optional filters
- `findById(id, client)` - Find a lead by ID
- `findByEmail(email, client)` - Find leads by email
- `create(leadData, client)` - Create a new lead
- `update(id, updates, client)` - Update a lead
- `delete(id, client)` - Soft delete a lead
- `convertToCustomer(leadId, customerId, client)` - Convert a lead to a customer
- `bulkCreate(leadsArray, client)` - Create multiple leads at once

## Frontend Changes

### Updated Components

1. **pages/customer-leads/index.js**
   - Changed from fetching Google Forms API to database API
   - Added edit functionality with modal
   - Added delete functionality
   - Added status badges
   - Maintained existing filtering and export functionality

### New Features

1. **Edit Lead Modal**
   - Full form for editing all lead fields
   - Status management
   - Notes field for additional information
   - Real-time validation

2. **Delete Functionality**
   - Soft delete with confirmation
   - Automatic list refresh

3. **Status Management**
   - Visual status badges (Pending, Contacted, Converted, Rejected, Completed)
   - Status can be updated through edit modal

## Data Migration

To migrate existing Google Forms data to the database:

1. Use the existing `/api/google-forms-responses` endpoint to fetch data
2. Transform the data format to match the database schema
3. Use the `bulkCreate` method or POST to `/api/leads` for each lead

Example migration script:
```javascript
// Fetch from Google Forms
const googleData = await fetch('/api/google-forms-responses').then(r => r.json());

// Transform and create in database
const leads = googleData.responses.map(response => ({
  email: response.email,
  full_name: response.fullName,
  salutation: response.salutation,
  handphone: response.handphone,
  block: response.block,
  unit: response.unit,
  address: response.address,
  first_service_date: response.firstServiceDate,
  second_service_date: response.secondServiceDate,
  third_service_date: response.thirdServiceDate,
  fourth_service_date: response.fourthServiceDate,
  time_slot: response.timeSlot,
  agreed_to_terms: response.agreedToTerms === 'Yes',
  personal_info_consent: response.personalInfoConsent === 'Yes',
  submitted_at: response.timestamp,
  source: 'GOOGLE_FORM'
}));

// Bulk create
await fetch('/api/leads', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(leads[0]) // Create one at a time or use bulkCreate
});
```

## Workflow Integration

The leads system now integrates with the existing workflow:

1. **Lead Status Tracking**
   - PENDING - New lead, not yet contacted
   - CONTACTED - Lead has been contacted
   - CONVERTED - Lead converted to customer (linked via `customer_id`)
   - REJECTED - Lead rejected/not interested
   - COMPLETED - Service completed

2. **Customer Conversion**
   - Use `convertToCustomer()` method to link a lead to a customer
   - Automatically sets status to CONVERTED
   - Records conversion timestamp

3. **Notes Field**
   - Add internal notes about the lead
   - Useful for tracking follow-ups and conversations

## Benefits

1. **Editable Fields** - All lead information can now be edited directly
2. **Consistent Storage** - Structured database instead of external API dependency
3. **Better Integration** - Links to customer records when converted
4. **Status Management** - Track lead progression through the sales funnel
5. **Audit Trail** - Timestamps and soft deletes maintain data history
6. **Performance** - Database queries are faster than external API calls
7. **Offline Capability** - Data is stored locally, reducing external dependencies

## Next Steps

1. Run the database migration to create the `leads` table
2. Migrate existing Google Forms data (if needed)
3. Update any other components that reference Google Forms API
4. Consider adding webhook integration to automatically import new Google Forms submissions

