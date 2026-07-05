# Testing Guide for Create Pages Migration

This guide provides step-by-step instructions for testing the migrated create pages.

## Quick Start

### Option 1: Automated Verification Script
```bash
# Run the verification script
pnpm test:verify
# or
node tests/verify-migration.js
```

This script will:
- ✅ Check if all required tables exist
- ✅ Verify table structures
- ✅ Check foreign key relationships
- ✅ Verify constraints
- ✅ Check password hashing

### Option 2: SQL Verification Queries
1. Open Supabase SQL Editor
2. Run queries from `tests/quick-verification.sql`
3. Review results

### Option 3: Manual Testing
1. Follow `tests/manual-test-checklist.md`
2. Test each scenario in the browser
3. Verify database after each test

---

## Test Scenarios

### Scenario 1: Create a Simple Job

**Steps**:
1. Navigate to `/dashboard/jobs/create-jobs`
2. Fill required fields
3. Add 1 task
4. Assign 1 worker
5. Submit

**Verify in Database**:
```sql
-- Get the created job
SELECT * FROM jobs WHERE job_number = 'YOUR_JOB_NUMBER';

-- Verify tasks
SELECT * FROM job_tasks WHERE job_id = 'JOB_UUID';

-- Verify worker assignment
SELECT * FROM technician_jobs WHERE job_id = 'JOB_UUID';
```

**Expected**:
- ✅ 1 record in `jobs`
- ✅ 1 record in `job_tasks`
- ✅ 1 record in `technician_jobs`
- ✅ 1 record in `job_schedule`
- ✅ 1 record in `job_contact_type`

---

### Scenario 2: Create a Worker

**Steps**:
1. Navigate to `/dashboard/workers/create-worker`
2. Fill Personal tab (name, email, password)
3. Fill Contact tab
4. Fill Skills tab (optional)
5. Submit

**Verify in Database**:
```sql
-- Get the created user
SELECT * FROM users WHERE username = 'test@example.com';

-- Get the technician
SELECT * FROM technicians WHERE user_id = 'USER_UUID';

-- Verify password is hashed
SELECT 
  username,
  CASE 
    WHEN password LIKE '$2a$%' THEN 'Hashed ✅'
    ELSE 'NOT HASHED ❌'
  END as password_status
FROM users WHERE username = 'test@example.com';
```

**Expected**:
- ✅ 1 record in `users` with hashed password
- ✅ 1 record in `technicians` with `user_id` foreign key
- ✅ Password is bcrypt hash (starts with `$2a$` or `$2b$`)

---

### Scenario 3: Create Job with All Features

**Steps**:
1. Create job with:
   - Customer
   - Location
   - Service Call
   - 3 Tasks
   - 2 Workers
   - 2 Equipment items
2. Submit

**Verify in Database**:
```sql
SELECT 
  j.job_number,
  (SELECT COUNT(*) FROM job_tasks WHERE job_id = j.id) as tasks,
  (SELECT COUNT(*) FROM technician_jobs WHERE job_id = j.id) as workers,
  (SELECT COUNT(*) FROM job_equipments WHERE job_id = j.id) as equipment
FROM jobs j
WHERE j.job_number = 'YOUR_JOB_NUMBER';
```

**Expected**:
- ✅ 1 job record
- ✅ 3 task records
- ✅ 2 worker assignment records
- ✅ 2 equipment link records
- ✅ All foreign keys correct

---

## Common Issues and Solutions

### Issue: "Customer not found" Error
**Solution**: 
- Ensure customer exists in `customer` table
- Check `customer_code` matches exactly

### Issue: "Supabase client not available"
**Solution**:
- Check environment variables are set
- Verify `.env.local` file exists
- Restart development server

### Issue: Password not hashed
**Solution**:
- Check `bcryptjs` is installed: `pnpm list bcryptjs`
- Verify `handlePersonalFormSubmit` uses `bcrypt.hash()`

### Issue: Foreign key constraint error
**Solution**:
- Verify related records exist before creating dependent records
- Check UUIDs are correct format
- Ensure records aren't soft-deleted (`deleted_at IS NULL`)

### Issue: Duplicate key error
**Solution**:
- Check unique constraints (job_number, username, email)
- Use unique identifiers for test data

---

## Verification Checklist

After testing, verify:

- [ ] Jobs are created in `jobs` table
- [ ] Tasks are in `job_tasks` table (not as array)
- [ ] Workers are in `technician_jobs` table (not as array)
- [ ] Equipment is in `job_equipments` table (not as array)
- [ ] Schedule is in `job_schedule` table
- [ ] Users are in `users` table with hashed passwords
- [ ] Technicians are in `technicians` table with `user_id` FK
- [ ] All foreign keys are valid UUIDs
- [ ] No orphaned records
- [ ] Unique constraints work
- [ ] Cascade deletes work

---

## Performance Testing

### Test: Create 10 Jobs
```bash
# Time how long it takes to create 10 jobs
# Expected: < 30 seconds
```

### Test: Create Job with 50 Tasks
```bash
# Create job with 50 tasks
# Expected: All tasks created, reasonable performance
```

---

## Database Health Check

Run this query regularly to check database health:

```sql
-- Overall health check
SELECT 
  (SELECT COUNT(*) FROM jobs WHERE deleted_at IS NULL) as active_jobs,
  (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL) as active_users,
  (SELECT COUNT(*) FROM technicians WHERE deleted_at IS NULL) as active_technicians,
  (SELECT COUNT(*) FROM job_tasks) as total_tasks,
  (SELECT COUNT(*) FROM technician_jobs WHERE deleted_at IS NULL) as active_assignments,
  (SELECT COUNT(*) FROM jobs WHERE created_at > NOW() - INTERVAL '24 hours') as jobs_today;
```

---

## Reporting Issues

When reporting issues, include:

1. **Test Case**: Which test case failed
2. **Steps**: Exact steps to reproduce
3. **Expected**: What should happen
4. **Actual**: What actually happened
5. **Database State**: Relevant database records
6. **Error Messages**: Full error messages
7. **Browser Console**: Any console errors
8. **Network Tab**: Failed requests

---

## Next Steps After Testing

1. ✅ Fix any issues found
2. ✅ Re-test fixed issues
3. ✅ Document any edge cases
4. ✅ Update migration status
5. ✅ Prepare for production deployment

