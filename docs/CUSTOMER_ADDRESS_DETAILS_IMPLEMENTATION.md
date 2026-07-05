# Customer Address Details Implementation

## Overview
This document describes the implementation of editable customer address details (Status and Address Notes) in the customers view page. The implementation includes a new Supabase table, API endpoints, and UI updates.

## What Was Implemented

### 1. Database Schema
**File**: `lib/supabase/migrations/create_customer_address_details_table.sql`

Created a new table `customer_address_details` to store editable address information:
- `customer_code` - Links to the customer
- `address_name` - Unique identifier for the address
- `address_type` - Type of address (Shipping, Billing, etc.)
- `status` - Editable status field (Active, Inactive, Pending, Archived)
- `address_notes` - Editable notes field
- Includes RLS policies for security
- Includes triggers for automatic `updated_at` timestamp

### 2. API Endpoints

#### Save/Update Address Details
**File**: `pages/api/customers/address-details.js`
- **Method**: POST
- **Purpose**: Save or update address details (Status and Address Notes)
- **Request Body**:
  ```json
  {
    "customerCode": "C000001",
    "addressName": "19 NASSIM SITE OFFICE",
    "addressType": "bo_ShipTo",
    "status": "Active",
    "addressNotes": "Notes here"
  }
  ```
- **Response**: Returns success status and saved data

#### Get Address Details
**File**: `pages/api/customers/address-details/[customerCode].js`
- **Method**: GET
- **Purpose**: Fetch all address details for a customer
- **Response**: Returns a map of address details keyed by address name

### 3. UI Updates

**File**: `sub-components/customer/ServiceLocationTab.js`

#### Changes Made:
1. **Editable Modal Fields**:
   - Status field is now a dropdown (Active, Inactive, Pending, Archived)
   - Address Notes field is now a textarea that can be edited
   - Other fields remain read-only

2. **Save Functionality**:
   - Added "Save Changes" button in the modal footer
   - Shows loading state while saving
   - Displays success/error toast notifications
   - Updates local state and table display after successful save

3. **Data Loading**:
   - Automatically loads saved address details when component mounts
   - Displays saved values in the table (Status and Address Notes)
   - Loads saved values when opening the modal

4. **User Experience**:
   - Clear indication that Status and Address Notes are editable
   - Loading states during save operations
   - Error handling with user-friendly messages

## How to Use

### 1. Run Database Migration
First, run the SQL migration to create the table in Supabase:

```sql
-- Execute the migration file
-- lib/supabase/migrations/create_customer_address_details_table.sql
```

You can run this in your Supabase SQL editor or via your migration tool.

### 2. Access the Feature
1. Navigate to a customer details page (e.g., `/customers/view/C000001`)
2. Click on the "Address" tab
3. Click "View Details" on any service location
4. Edit the Status dropdown or Address Notes textarea
5. Click "Save Changes" to persist the changes

### 3. Data Flow
1. When the page loads, address details are fetched from Supabase
2. Saved values are displayed in the table
3. When opening the modal, saved values are loaded into the form
4. When saving, data is sent to the API and stored in Supabase
5. The table and modal are updated with the new values

## Technical Details

### Table Structure
```sql
CREATE TABLE customer_address_details (
    id UUID PRIMARY KEY,
    customer_code VARCHAR(100) NOT NULL,
    address_name VARCHAR(255) NOT NULL,
    address_type VARCHAR(50),
    status VARCHAR(50) DEFAULT 'Active',
    address_notes TEXT,
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    deleted_at TIMESTAMP,
    UNIQUE(customer_code, address_name)
);
```

### Status Options
- Active
- Inactive
- Pending
- Archived

### Security
- Row Level Security (RLS) is enabled
- Policies allow all authenticated users to view, insert, update, and delete
- Uses Supabase admin client for server-side operations

## Testing Checklist

- [ ] Database migration runs successfully
- [ ] Can view address details in the modal
- [ ] Can edit Status dropdown
- [ ] Can edit Address Notes textarea
- [ ] Save button saves changes successfully
- [ ] Saved values appear in the table
- [ ] Saved values load correctly when reopening modal
- [ ] Error messages display correctly on save failure
- [ ] Loading states work correctly

## Future Enhancements

Potential improvements:
1. Add validation for Status and Address Notes
2. Add history/audit trail for changes
3. Add bulk edit functionality
4. Add export functionality for address details
5. Add search/filter by status

