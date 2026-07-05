# Database Migrations

## Migration: Add Missing Technician Columns

### File: `add-technician-columns.sql`

This migration adds all the missing columns to the `technicians` table that are used in the create worker form.

### Missing Columns Added:

#### Personal Information:
- `first_name` - First name of the technician
- `middle_name` - Middle name of the technician
- `last_name` - Last name of the technician
- `gender` - Gender (MALE, FEMALE, OTHER)
- `date_of_birth` - Date of birth
- `profile_picture` - URL or path to profile picture
- `bio` - Short biography or description

#### Contact Information:
- `primary_phone` - Primary phone number
- `secondary_phone` - Secondary phone number
- `active_phone_1` - Whether primary phone is active
- `active_phone_2` - Whether secondary phone is active
- `street_address` - Street address
- `state_province` - State or province
- `zip_code` - ZIP or postal code

#### Emergency Contact:
- `emergency_contact_name` - Name of emergency contact
- `emergency_contact_phone` - Phone number of emergency contact
- `emergency_relationship` - Relationship to emergency contact

#### Skills:
- `skills` - Array of skills stored as JSONB (defaults to empty array)

### How to Apply:

1. **For existing databases:**
   - Run the migration file in your Supabase SQL Editor:
   ```sql
   -- Copy and paste the contents of add-technician-columns.sql
   ```

2. **For new databases:**
   - The main schema file (`fsm-schema.sql`) has been updated to include all these columns
   - Just run the main schema file

### Notes:

- All new columns are nullable (except where defaults are provided)
- The migration uses `IF NOT EXISTS` to prevent errors if columns already exist
- Indexes are added for commonly queried fields (first_name, last_name, gender, date_of_birth)
- The `phone_number` column is kept for backward compatibility alongside `primary_phone`

---

## Migration: Create Notifications Table

### File: `create_notifications_table.sql`

This migration creates the `notifications` table required for the notification system in the application.

### Table Structure:

- `id` - UUID primary key
- `worker_id` - Foreign key to users table (nullable for global notifications)
- `title` - Notification title (required)
- `message` - Notification message text
- `type` - Notification type
- `read` - Boolean flag for read status (defaults to false)
- `hidden` - Boolean flag for hidden status (defaults to false)
- `created_at` - Timestamp of creation
- `updated_at` - Timestamp of last update (auto-updated via trigger)

### How to Apply:

1. **Open Supabase Dashboard:**
   - Go to your Supabase project dashboard
   - Navigate to the SQL Editor

2. **Run the Migration:**
   - Copy the contents of `create_notifications_table.sql`
   - Paste into the SQL Editor
   - Click "Run" to execute

3. **Verify:**
   - Check that the `notifications` table appears in the Table Editor
   - Verify that indexes and RLS policies were created

### Notes:

- The table supports both user-specific notifications (via `worker_id`) and global notifications (where `worker_id` is null)
- RLS policies allow all authenticated users to view, insert, update, and delete notifications
- The `updated_at` column is automatically maintained via a trigger
- Indexes are created for optimal query performance on `worker_id`, `read`, `hidden`, and `created_at` columns

### Error Resolution:

If you see the error: `Could not find the table 'public.notifications' in the schema cache`, this migration needs to be run. The application will continue to work (returning empty notifications) until the table is created.

---

## Migration: Add current_session_id for Single-Device-Per-User

### File: `add_current_session_id.sql`

This migration adds `current_session_id` to the `users` table to enforce single-device-per-user. When a user logs in on a new device, the previous device's session is invalidated.

### How to Apply:

1. Open Supabase Dashboard → SQL Editor
2. Copy the contents of `add_current_session_id.sql`
3. Run the migration

### Notes:

- After applying, all users must log in again once to receive the new `sessionId` cookie
- Existing sessions (without `sessionId`) will receive 401 and be redirected to sign-in

