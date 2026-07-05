# Google Forms Table Migration

## Overview

This migration creates a dedicated `google_forms` table for managing Google Forms URLs with proper database structure, indexes, and triggers.

## Migration File

**File:** `create_google_forms_table.sql`

## Table Structure

The `google_forms` table includes:

- `id` (UUID) - Primary key, auto-generated
- `name` (VARCHAR) - Display name for the Google Form (required)
- `url` (TEXT) - Full URL to the Google Form (required)
- `form_id` (VARCHAR) - Extracted form ID from URL for easier reference
- `description` (TEXT) - Optional description
- `is_active` (BOOLEAN) - Whether this form is currently active (default: true)
- `created_at` (TIMESTAMP) - Creation timestamp
- `updated_at` (TIMESTAMP) - Last update timestamp (auto-updated via trigger)
- `deleted_at` (TIMESTAMP) - Soft delete timestamp (NULL if not deleted)

## Constraints

- URL validation: The `check_google_forms_url` constraint ensures URLs contain `docs.google.com/forms`

## Indexes

The following indexes are created for optimal query performance:

- `idx_google_forms_active` - For filtering active forms
- `idx_google_forms_form_id` - For looking up forms by extracted form ID
- `idx_google_forms_created_at` - For sorting by creation date
- `idx_google_forms_deleted_at` - For filtering non-deleted records

## Triggers

- `update_google_forms_updated_at` - Automatically updates `updated_at` timestamp on row updates

## How to Apply

### For New Databases

The table is already included in the main schema file (`lib/supabase/fsm-schema.sql`). Just run the main schema file.

### For Existing Databases

Run the migration file in your Supabase SQL Editor:

```sql
-- Copy and paste the contents of create_google_forms_table.sql
```

Or execute via Supabase CLI:

```bash
supabase db push
```

## Usage

After applying the migration, the settings page (`/dashboard/settings`) will automatically use this table instead of storing data in the `settings` table.

### Example Queries

**Get all active Google Forms:**
```sql
SELECT * FROM google_forms 
WHERE is_active = true 
AND deleted_at IS NULL 
ORDER BY created_at DESC;
```

**Get form by form_id:**
```sql
SELECT * FROM google_forms 
WHERE form_id = 'YOUR_FORM_ID' 
AND deleted_at IS NULL;
```

**Soft delete a form:**
```sql
UPDATE google_forms 
SET deleted_at = NOW() 
WHERE id = 'FORM_UUID';
```

## Migration from Settings Table

If you previously stored Google Forms URLs in the `settings` table, you can migrate the data:

```sql
-- Example migration script (adjust based on your data structure)
INSERT INTO google_forms (name, url, form_id, is_active, created_at, updated_at)
SELECT 
  value->>'name' as name,
  value->>'url' as url,
  -- Extract form_id from URL if needed
  substring(value->>'url' from '/forms/d/e/([^/]+)') as form_id,
  true as is_active,
  NOW() as created_at,
  NOW() as updated_at
FROM settings
WHERE id = 'googleForms'
AND value->'urls' IS NOT NULL
AND jsonb_array_length(value->'urls') > 0
ON CONFLICT DO NOTHING;
```

## Notes

- The table uses soft deletes (`deleted_at`) to preserve data history
- Form IDs are automatically extracted from URLs when saving
- All timestamps are timezone-aware (TIMESTAMP WITH TIME ZONE)

