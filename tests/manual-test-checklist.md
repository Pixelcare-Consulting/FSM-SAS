# Manual Test Checklist for Create Pages

Use this checklist when manually testing the create pages in the browser.

## Pre-Test Setup

- [ ] Log in as admin user
- [ ] Verify Supabase connection is working
- [ ] Ensure test customer exists in database
- [ ] Ensure test location exists in database
- [ ] Ensure at least 1 worker/technician exists

---

## Job Creation Manual Tests

### Test 1: Basic Job Creation
- [ ] Navigate to `/dashboard/jobs/create-jobs`
- [ ] Fill in all required fields:
  - [ ] Select customer
  - [ ] Select contact
  - [ ] Select location
  - [ ] Enter job name
  - [ ] Enter job description
  - [ ] Select priority
  - [ ] Select start date
  - [ ] Select end date
  - [ ] Enter start time
  - [ ] Enter end time
  - [ ] Select at least 1 worker
  - [ ] Select job contact type
- [ ] Add at least 1 task
- [ ] Click "Create Job"
- [ ] Verify success message appears
- [ ] Check Supabase database:
  - [ ] Job exists in `jobs` table
  - [ ] Task exists in `job_tasks` table
  - [ ] Worker assignment exists in `technician_jobs` table
  - [ ] Contact type exists in `job_contact_type` table
  - [ ] Schedule exists in `job_schedule` table

### Test 2: Job with Equipment
- [ ] Create job with equipment added
- [ ] Verify equipment appears in `job_equipments` table
- [ ] Verify equipment is linked to job correctly

### Test 3: Job with Service Call
- [ ] Create job with service call selected
- [ ] Verify `service_call_id` is set in job record

### Test 4: Recurring Jobs
- [ ] Enable repeat option
- [ ] Set repeat to daily for 3 days
- [ ] Create job
- [ ] Verify 3 jobs created in database
- [ ] Verify all have unique job numbers
- [ ] Verify all have same base data

### Test 5: Validation
- [ ] Try to create job without customer → Error shown
- [ ] Try to create job without location → Error shown
- [ ] Try to create job without workers → Error shown
- [ ] Try to create job without job name → Error shown
- [ ] Try to create job without dates → Error shown

### Test 6: Schedule Conflict
- [ ] Create job for worker at 9 AM - 5 PM
- [ ] Try to create another job for same worker at 10 AM - 6 PM
- [ ] Verify conflict warning appears
- [ ] Choose to proceed anyway
- [ ] Verify both jobs are created

---

## Worker Creation Manual Tests

### Test 1: Basic Worker Creation
- [ ] Navigate to `/dashboard/workers/create-worker`
- [ ] Fill Personal tab:
  - [ ] Enter full name
  - [ ] Enter email
  - [ ] Enter password
  - [ ] Enter phone number
- [ ] Click "Next" → Contact tab should be enabled
- [ ] Fill Contact tab:
  - [ ] Enter contact information
- [ ] Click "Next" → Skills tab should be enabled
- [ ] Fill Skills tab (optional)
- [ ] Click "Submit"
- [ ] Verify success message
- [ ] Check Supabase database:
  - [ ] User exists in `users` table
  - [ ] Password is hashed (not plain text)
  - [ ] Technician exists in `technicians` table
  - [ ] `technicians.user_id` matches `users.id`
  - [ ] Activity logged in `recent_activities` table

### Test 2: Password Security
- [ ] Create worker with password "TestPassword123"
- [ ] Check database directly
- [ ] Verify password is NOT "TestPassword123"
- [ ] Verify password is bcrypt hash (starts with $2a$ or $2b$)

### Test 3: Validation
- [ ] Try to submit without email → Error shown
- [ ] Try to submit without password → Error shown
- [ ] Try to submit without full name → Error shown
- [ ] Try to proceed to Contact tab without Personal → Tab disabled

### Test 4: Duplicate Email
- [ ] Create worker with email "test@example.com"
- [ ] Try to create another worker with same email
- [ ] Verify error message about duplicate email

### Test 5: Tab Progression
- [ ] Verify Personal tab is enabled initially
- [ ] Verify Contact tab is disabled initially
- [ ] Verify Skills tab is disabled initially
- [ ] Complete Personal tab
- [ ] Verify Contact tab becomes enabled
- [ ] Complete Contact tab
- [ ] Verify Skills tab becomes enabled

---

## Integration Tests

### Test 1: Created Job Appears in List
- [ ] Create a job
- [ ] Navigate to job list page
- [ ] Verify job appears in list
- [ ] Click on job
- [ ] Verify all details are correct
- [ ] Verify tasks are visible
- [ ] Verify workers are visible

### Test 2: Created Worker Can Be Assigned
- [ ] Create a worker
- [ ] Navigate to job creation
- [ ] Verify new worker appears in worker dropdown
- [ ] Assign worker to job
- [ ] Create job
- [ ] Verify assignment in database

### Test 3: Worker Can Login
- [ ] Create worker with email and password
- [ ] Log out
- [ ] Try to log in with created credentials
- [ ] Verify login succeeds

---

## Browser Console Checks

While testing, check browser console for:
- [ ] No Firebase errors
- [ ] No Supabase connection errors
- [ ] No JavaScript errors
- [ ] Network requests to Supabase (not Firebase)

---

## Database Verification Queries

Run these in Supabase SQL Editor after tests:

```sql
-- Check recent jobs
SELECT 
  j.*,
  c.customer_name,
  (SELECT COUNT(*) FROM job_tasks WHERE job_id = j.id) as task_count,
  (SELECT COUNT(*) FROM technician_jobs WHERE job_id = j.id) as worker_count
FROM jobs j
LEFT JOIN customer c ON c.id = j.customer_id
ORDER BY j.created_at DESC
LIMIT 10;

-- Check recent workers
SELECT 
  u.*,
  t.full_name,
  t.email as technician_email
FROM users u
LEFT JOIN technicians t ON t.user_id = u.id
WHERE u.role = 'TECHNICIAN'
ORDER BY u.created_at DESC
LIMIT 10;

-- Check for orphaned records
SELECT 'job_tasks' as table_name, COUNT(*) as orphaned
FROM job_tasks jt
LEFT JOIN jobs j ON j.id = jt.job_id
WHERE j.id IS NULL;
```

---

## Issues Found

Document any issues here:

1. **Issue**: [Description]
   - **Test Case**: [Which test]
   - **Severity**: [Critical/High/Medium/Low]
   - **Steps to Reproduce**: [Steps]
   - **Expected**: [Expected behavior]
   - **Actual**: [Actual behavior]

---

## Test Results Summary

- **Date**: ___________
- **Tester**: ___________
- **Total Tests**: ___________
- **Passed**: ___________
- **Failed**: ___________
- **Blocked**: ___________

### Critical Issues Found
- [ ] None
- [ ] List issues:

### High Priority Issues Found
- [ ] None
- [ ] List issues:

### Notes
[Any additional notes or observations]

