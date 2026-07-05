# Leads Table Schema Update

## Overview

This document describes the schema update to match the exact Google Sheets column structure from the Google Form responses.

## New Fields Added

The following fields have been added to the `leads` table to store data separately (instead of only in combined fields):

| Column Name | Data Type | Description | Source |
|------------|-----------|-------------|--------|
| `first_name` | VARCHAR(255) | First name from Google Form | "First Name" column |
| `last_name` | VARCHAR(255) | Last name from Google Form | "Last Name" column |
| `building` | VARCHAR(255) | Building name/address component | "Building" column |
| `street` | VARCHAR(255) | Street address component | "Street" column |
| `postcode` | VARCHAR(50) | Postal code | "Postcode" column |
| `country` | VARCHAR(100) | Country name | "Country" column |

## Migration

Run the migration SQL file to add these columns:

```bash
# In Supabase SQL Editor, run:
lib/supabase/migrations/add-leads-detailed-fields.sql
```

Or manually execute:

```sql
ALTER TABLE leads 
ADD COLUMN IF NOT EXISTS first_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS last_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS building VARCHAR(255),
ADD COLUMN IF NOT EXISTS street VARCHAR(255),
ADD COLUMN IF NOT EXISTS postcode VARCHAR(50),
ADD COLUMN IF NOT EXISTS country VARCHAR(100);
```

## Auto-Population Trigger

A database trigger has been created to automatically populate:
- `full_name` from `first_name` + `last_name` (if full_name is empty)
- `address` from `building`, `street`, `postcode`, `country` (if address is empty)

This ensures backward compatibility while storing data in the new detailed format.

## Field Mapping

### Google Sheets → Database

| Google Sheets Column | Database Column(s) | Notes |
|---------------------|-------------------|-------|
| Email Address | `email` | Direct mapping |
| Salutation | `salutation` | Direct mapping |
| First Name | `first_name` | New separate field |
| Last Name | `last_name` | New separate field |
| Handphone Number | `handphone` | Direct mapping |
| Block | `block` | Direct mapping |
| Unit | `unit` | Direct mapping |
| Building | `building` | New separate field |
| Street | `street` | New separate field |
| Postcode | `postcode` | New separate field |
| Country | `country` | New separate field |
| Preferred Date For First Service | `first_service_date` | Direct mapping |
| Preferred Date For Second Service | `second_service_date` | Direct mapping |
| Preferred Date For Third Service | `third_service_date` | Direct mapping |
| Preferred Date For Fourth Service | `fourth_service_date` | Direct mapping |
| Preferred Time Slot | `time_slot` | Direct mapping |
| Agree to Complimentary Service Terms & Conditions | `agreed_to_terms` | Direct mapping |
| Personal Information Collection Consent | `personal_info_consent` | Direct mapping |

## Benefits

1. **Better Data Structure**: Individual fields allow for better querying and filtering
2. **Data Integrity**: Can validate individual components separately
3. **Flexibility**: Can reconstruct combined fields or use individual fields as needed
4. **Backward Compatibility**: Combined fields (`full_name`, `address`) are still populated automatically

## Code Updates

The following files have been updated:

1. **`pages/api/leads/sync.js`**
   - Updated field mapping to match exact Google Sheets column names
   - Added extraction of `firstName`, `lastName`, `building`, `street`, `postcode`, `country`
   - Updated `leadData` transformation to include new fields

2. **`lib/supabase/migrations/add-leads-detailed-fields.sql`**
   - New migration file to add the columns
   - Includes trigger for auto-population

## Testing

After running the migration:

1. Run a sync from Google Forms
2. Verify that new leads have:
   - `first_name` and `last_name` populated separately
   - `building`, `street`, `postcode`, `country` populated separately
   - `full_name` and `address` still populated (via trigger or code)

3. Check existing leads - they will have NULL for new fields (expected)

## Notes

- All new fields are **nullable** (optional)
- The trigger only populates `full_name` and `address` if they are empty
- Existing code that uses `full_name` and `address` will continue to work
- New code can use individual fields for more granular operations

