# Test User Creation Scripts

This directory contains scripts for creating test users in the Supabase database.

## ⚠️ Important: Database Setup Required

Before creating test users, make sure your Supabase database has the correct schema:

1. **Run the main schema file** in Supabase SQL Editor:
   - File: `lib/supabase/fsm-schema.sql`
   - This creates all required tables

2. **If the `password` column is missing** from the `users` table:
   - Run: `scripts/add-password-column.sql` in Supabase SQL Editor
   - Or manually: `ALTER TABLE users ADD COLUMN password VARCHAR(255) NOT NULL;`

3. **Check your database**:
   ```bash
   pnpm test:check-db
   ```

## Quick Start

### Option 1: Using npm script (Recommended)

Create a single test user:
```bash
pnpm test:create-user
```

Create multiple test users (admin + 2 technicians):
```bash
pnpm test:create-users
```

Check database schema:
```bash
pnpm test:check-db
```

### Option 2: Using Node.js directly

```bash
# Create default test user
node scripts/create-test-user.js

# Create custom user
node scripts/create-test-user.js --email admin@test.com --password admin123 --role ADMIN --name "Admin User"

# Create multiple test users
node scripts/create-test-user.js --multiple
```

### Option 3: Using API endpoint

```bash
curl -X POST http://localhost:3003/api/test/create-user \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "test123",
    "role": "TECHNICIAN",
    "fullName": "Test User"
  }'
```

## Default Test Users

When using `--multiple`, the script creates:

1. **Admin User**
   - Email: `admin@test.com`
   - Password: `admin123`
   - Role: `ADMIN`

2. **Technician 1**
   - Email: `technician@test.com`
   - Password: `tech123`
   - Role: `TECHNICIAN`

3. **Technician 2**
   - Email: `technician2@test.com`
   - Password: `tech123`
   - Role: `TECHNICIAN`

## Command Line Options

```
--email <email>        User email (default: test@example.com)
--password <password>  User password (default: test123)
--role <role>          User role: ADMIN, TECHNICIAN, CUSTOMER (default: TECHNICIAN)
--name <name>          Full name (default: Test User)
--phone <phone>        Phone number (optional)
--multiple             Create multiple test users
--help, -h             Show help message
```

## Examples

```bash
# Create a technician
node scripts/create-test-user.js --email tech@test.com --password tech123 --name "John Doe"

# Create an admin
node scripts/create-test-user.js --email admin@test.com --password admin123 --role ADMIN --name "Admin User"

# Create with phone number
node scripts/create-test-user.js --email user@test.com --password pass123 --name "Jane Doe" --phone "+1234567890"
```

## Requirements

1. **Environment Variables** (in `.env` or `.env.local`):
   ```
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
   ```

2. **Database Schema**: The script assumes the following tables exist:
   - `users` table with columns: `id`, `username`, `password`, `role`, `status`
   - `technicians` table with columns: `id`, `user_id`, `email`, `full_name`, `phone_number`, `status`

## Troubleshooting

### Error: "Could not find the 'password' column"

**Solution:**
1. Go to your Supabase dashboard
2. Navigate to SQL Editor
3. Run the SQL script: `scripts/add-password-column.sql`
4. Or manually run:
   ```sql
   ALTER TABLE users ADD COLUMN password VARCHAR(255) NOT NULL;
   ```

### Error: "Supabase environment variables are not set"

- Make sure `.env` or `.env.local` exists in the project root
- Verify `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set
- Install dotenv: `pnpm add -D dotenv` (already done)

### Error: "User already exists"

- The email is already in use
- Use a different email or delete the existing user first

### Error: "Failed to create technician record"

- User was created but technician record failed
- Check database schema and foreign key constraints
- Verify `user_id` foreign key relationship exists

## What the Script Does

1. ✅ Validates input parameters
2. ✅ Checks if user already exists
3. ✅ Hashes password using bcrypt (10 rounds)
4. ✅ Creates user record in `users` table
5. ✅ Creates technician record in `technicians` table (if role is TECHNICIAN)
6. ✅ Returns login credentials

## Login After Creation

After creating a test user, you can login at:
- **URL**: `http://localhost:3003/sign-in`
- **Email**: The email you provided
- **Password**: The password you provided

## Populate Dummy Data

### Quick Start

Populate all tables with realistic dummy data:

```bash
# Create 5 of each entity (default)
pnpm test:populate-data

# Create 20 of each entity (large dataset)
pnpm test:populate-data:large

# Custom count
node scripts/populate-dummy-data.js --count 10
```

### What Gets Created

The script creates:

1. **Customers** (5-20)
   - Customer codes, names, addresses
   - Phone numbers and emails

2. **Contacts** (1-3 per customer)
   - First, middle, last names
   - Phone numbers and emails
   - Linked to customers

3. **Locations** (1-2 per customer)
   - Location names
   - Coordinates (lat/lng)
   - Linked to customers

4. **Equipments** (2-5 per customer)
   - Item codes, serial numbers
   - Brands, models, types
   - Warranty dates
   - Linked to customers

5. **Service Calls** (0-2 per customer)
   - Call numbers
   - Subjects, descriptions
   - Status and priority
   - Linked to customers

6. **Jobs** (1-3 per customer)
   - Job numbers (year-based)
   - Titles, descriptions
   - Priority and status
   - Scheduled dates/times
   - **Job Tasks** (2-5 per job)
   - **Technician Assignments** (1-3 per job)
   - **Job Contact Types**
   - **Job Equipments** (linked equipment)
   - **Job Schedules**

### Example Output

```
🚀 Starting dummy data population...
📊 Will create 5 of each main entity

👷 Found 3 existing technicians

📦 Creating 5 customers...
   ✅ Created customer: CUST0001 - Tech Solutions Inc
   ✅ Created customer: CUST0002 - Global Industries
   ...

👤 Creating contacts for customers...
   ✅ Created contact: John Smith for CUST0001
   ...

💼 Creating jobs...
   ✅ Created job: 2025-000001 - AC Installation
      ✅ Created 4 tasks
      ✅ Assigned 2 technicians
      ✅ Created job contact type
      ✅ Linked 2 equipments
      ✅ Created job schedule
   ...

==================================================
✅ Dummy data population complete!
==================================================
📦 Customers: 5
👤 Contacts: 12
📍 Locations: 8
🔧 Equipments: 15
📞 Service Calls: 7
💼 Jobs: 12
👷 Technicians: 3
```

### Notes

- **Technicians**: Uses existing technicians from your database
- **Worker Schedules**: Managed through the calendar UI (not auto-generated)
- **Relationships**: All data is properly linked with foreign keys
- **Realistic Data**: Uses realistic names, addresses, and business data

## Security Note

⚠️ **This script is for development/testing only!**
- Never use in production
- The API endpoint (`/api/test/create-user`) is automatically disabled in production
- Always use strong passwords in production
- Never commit test credentials to version control
