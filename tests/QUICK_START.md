# Quick Start - Testing Create Pages

## Fastest Way to Test

### 1. Run Automated Verification (2 minutes)
```bash
pnpm test:verify
```

This will check:
- ✅ All tables exist
- ✅ Schema structure
- ✅ Foreign keys
- ✅ Constraints
- ✅ Password hashing

### 2. Run SQL Verification (5 minutes)
1. Open Supabase Dashboard → SQL Editor
2. Copy all queries from `tests/quick-verification.sql`
3. Run queries
4. Review results

### 3. Manual Test - Create One Job (10 minutes)
1. Navigate to `/dashboard/jobs/create-jobs`
2. Create a simple job with:
   - Customer
   - Location
   - 1 Task
   - 1 Worker
3. Submit
4. Check Supabase:
   ```sql
   SELECT * FROM jobs ORDER BY created_at DESC LIMIT 1;
   SELECT * FROM job_tasks WHERE job_id = 'JOB_ID';
   SELECT * FROM technician_jobs WHERE job_id = 'JOB_ID';
   ```

### 4. Manual Test - Create One Worker (5 minutes)
1. Navigate to `/dashboard/workers/create-worker`
2. Fill all tabs and submit
3. Check Supabase:
   ```sql
   SELECT * FROM users WHERE username = 'EMAIL';
   SELECT * FROM technicians WHERE user_id = 'USER_ID';
   ```

## What to Look For

### ✅ Success Indicators:
- Jobs created in `jobs` table (not Firestore)
- Tasks in `job_tasks` table (not as array in job)
- Workers in `technician_jobs` table (not as array)
- Users have hashed passwords (not plain text)
- Technicians linked via `user_id` foreign key

### ❌ Failure Indicators:
- Errors in browser console
- "Firebase" errors (should be Supabase)
- Data not appearing in database
- Foreign key constraint errors
- Plain text passwords

## Common Quick Fixes

**Issue**: "Supabase client not available"
- Check `.env.local` has Supabase variables
- Restart dev server: `pnpm dev`

**Issue**: "Customer not found"
- Create test customer in Supabase first
- Or use existing customer code

**Issue**: "Table doesn't exist"
- Run SQL schema from `lib/supabase/fsm-schema.sql`
- Check table names match exactly

## Full Test Suite

For comprehensive testing, see:
- `docs/TEST_CASES.md` - All test cases
- `tests/manual-test-checklist.md` - Detailed checklist
- `docs/TESTING_GUIDE.md` - Complete guide

