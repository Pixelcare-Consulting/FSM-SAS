# Test Cases for Create Pages Migration

## Overview

This document contains comprehensive test cases for validating the migrated create pages (`CreateJobs.js` and `create-worker.js`) to ensure they:
1. Work correctly with Supabase
2. Follow the schema structure
3. Create records in all proper tables
4. Handle errors gracefully

## Test Environment Setup

### Prerequisites
1. Supabase project configured
2. All tables from `fsm-schema.sql` created
3. Storage buckets created:
   - `documents`
   - `company_logos`
   - `job_images`
   - `signatures`
4. Test data:
   - At least 1 customer in `customer` table
   - At least 1 location in `locations` table
   - At least 1 equipment in `equipments` table

### Test User
- Create a test admin user in `users` table
- Ensure test user has `role = 'ADMIN'`

---

## Test Suite 1: Job Creation (`CreateJobs.js`)

### TC-JOB-001: Basic Job Creation
**Objective**: Verify a basic job can be created successfully

**Preconditions**:
- User is logged in as admin
- Customer exists in database
- Location exists in database
- At least 1 worker/technician exists

**Test Steps**:
1. Navigate to job creation page
2. Fill in required fields:
   - Customer: Select existing customer
   - Contact: Select contact
   - Location: Select existing location
   - Job Name: "Test Job 001"
   - Job Description: "Test description"
   - Priority: "MEDIUM"
   - Start Date: Today
   - End Date: Today
   - Start Time: "09:00"
   - End Time: "17:00"
   - Assigned Workers: Select at least 1 worker
   - Job Contact Type: Select a type
3. Add at least 1 task:
   - Task Name: "Test Task"
   - Task Description: "Test task description"
4. Click "Create Job"

**Expected Results**:
- ✅ Job created successfully
- ✅ Success toast message displayed
- ✅ Verify in Supabase:
  - 1 record in `jobs` table with:
    - `job_number` matches generated format
    - `title` = "Test Job 001"
    - `customer_id` = selected customer UUID
    - `location_id` = selected location UUID
    - `priority` = "MEDIUM"
    - `status` = "PENDING"
    - `scheduled_start` and `scheduled_end` are correct
  - 1 record in `job_tasks` table with:
    - `job_id` = created job UUID
    - `task_name` = "Test Task"
  - 1 record in `technician_jobs` table with:
    - `job_id` = created job UUID
    - `technician_id` = selected worker's technician UUID
    - `assignment_status` = "ASSIGNED"
  - 1 record in `job_contact_type` table
  - 1 record in `job_schedule` table

**Post-Conditions**:
- Clean up: Delete created job and related records

---

### TC-JOB-002: Job Creation with Multiple Tasks
**Objective**: Verify multiple tasks are created correctly

**Test Steps**:
1. Create a job with 3 tasks:
   - Task 1: "Task A"
   - Task 2: "Task B"
   - Task 3: "Task C"
2. Submit job

**Expected Results**:
- ✅ 3 records in `job_tasks` table
- ✅ Each task has correct `task_order` (1, 2, 3)
- ✅ All tasks linked to same `job_id`

---

### TC-JOB-003: Job Creation with Multiple Workers
**Objective**: Verify multiple worker assignments are created

**Test Steps**:
1. Create a job with 2 workers assigned
2. Submit job

**Expected Results**:
- ✅ 2 records in `technician_jobs` table
- ✅ Each record has different `technician_id`
- ✅ Both linked to same `job_id`
- ✅ Both have `assignment_status` = "ASSIGNED"

---

### TC-JOB-004: Job Creation with Equipment
**Objective**: Verify equipment is linked correctly

**Preconditions**:
- Equipment exists in `equipments` table with known `item_code`

**Test Steps**:
1. Create a job
2. Add equipment with existing `item_code`
3. Submit job

**Expected Results**:
- ✅ 1 record in `job_equipments` table
- ✅ `equipment_id` matches equipment UUID
- ✅ `job_id` matches created job UUID
- ✅ `quantity_used` = 1

---

### TC-JOB-005: Job Creation with Service Call
**Objective**: Verify service call is linked correctly

**Preconditions**:
- Service call exists in `service_call` table

**Test Steps**:
1. Create a job
2. Select existing service call
3. Submit job

**Expected Results**:
- ✅ Job record has `service_call_id` = selected service call UUID

---

### TC-JOB-006: Recurring Job Creation
**Objective**: Verify recurring jobs are created correctly via the shared recurrence modal

**Test Steps**:
1. Create a job with **Repeat Job** enabled
2. Click **Configure schedule** (or open start date while repeat is on)
3. In **Change Job Start Date** modal, select **MONTHLY**, check **Day of the Week**, choose **First** + **Sun**
4. Click **GET SUMMARY** and verify text mentions first Sunday and 52 occurrences max
5. Click **SAVE**, then submit the job
6. Optionally repeat from Job Calendar (**Repeat Job** action) and Edit Job (**Repeat Job** button)
7. From Scheduler, check **Create as recurring** on Assign Job confirm and verify create page opens the modal

**Expected Results**:
- ✅ Up to 52 records in `jobs` table per recurrence save (including create flow)
- ✅ Each has unique `job_number` (with sequence suffix)
- ✅ All have same base job number prefix
- ✅ All linked to same customer, location
- ✅ All have same tasks, workers, equipment
- ✅ GET SUMMARY shows human-readable schedule including ordinal weekday monthly when configured
- ✅ No **End Repeat** controls anywhere in the UI

---

### TC-JOB-007: Schedule Conflict Detection
**Objective**: Verify schedule conflict detection works

**Preconditions**:
- Worker has existing job scheduled for same time

**Test Steps**:
1. Create a job for a worker
2. Assign same worker to new job with overlapping time
3. Submit job

**Expected Results**:
- ✅ Conflict warning displayed
- ✅ User can choose to proceed or cancel
- ✅ If proceeding, job is still created

---

### TC-JOB-008: Job Creation - Missing Required Fields
**Objective**: Verify validation works correctly

**Test Steps**:
1. Try to create job without filling required fields
2. Click "Create Job"

**Expected Results**:
- ✅ Error toast displayed listing missing fields
- ✅ Job is NOT created
- ✅ No records in any tables

---

### TC-JOB-009: Job Creation - Invalid Customer
**Objective**: Verify error handling for invalid customer

**Test Steps**:
1. Try to create job with non-existent customer code
2. Submit job

**Expected Results**:
- ✅ Error message displayed: "Customer not found"
- ✅ Job is NOT created

---

### TC-JOB-010: Job Creation - Location Auto-Creation
**Objective**: Verify location is created if it doesn't exist

**Test Steps**:
1. Create job with location that doesn't exist in database
2. Submit job

**Expected Results**:
- ✅ New location created in `locations` table
- ✅ Job linked to new location via `location_id`

---

### TC-JOB-011: Job Number Generation
**Objective**: Verify job numbers are generated correctly

**Test Steps**:
1. Create multiple jobs
2. Check job numbers

**Expected Results**:
- ✅ Job numbers follow format: `YYYY-XXXXXX`
- ✅ Numbers increment correctly
- ✅ Each job has unique `job_number`

---

## Test Suite 2: Worker Creation (`create-worker.js`)

### TC-WORKER-001: Basic Worker Creation
**Objective**: Verify a basic worker can be created successfully

**Test Steps**:
1. Navigate to worker creation page
2. Fill Personal tab:
   - Full Name: "John Doe"
   - Email: "john.doe@test.com"
   - Password: "Test123!@#"
   - Phone Number: "1234567890"
3. Click "Next" (Contact tab)
4. Fill Contact tab:
   - Phone: "1234567890"
   - Address: "123 Test St"
5. Click "Next" (Skills tab)
6. Fill Skills tab (optional)
7. Click "Submit"

**Expected Results**:
- ✅ Success message displayed
- ✅ Verify in Supabase:
  - 1 record in `users` table with:
    - `username` = "john.doe@test.com"
    - `password` = bcrypt hashed (NOT plain text)
    - `role` = "TECHNICIAN"
    - `status` = "ACTIVE"
  - 1 record in `technicians` table with:
    - `user_id` = created user UUID
    - `email` = "john.doe@test.com"
    - `full_name` = "John Doe"
    - `phone_number` = "1234567890"
    - `status` = "ACTIVE"
  - 1 record in `recent_activities` table with:
    - `action` = "Worker Created"
    - `type` = "worker_management"

**Post-Conditions**:
- Clean up: Delete created user and technician

---

### TC-WORKER-002: Worker Creation - Password Hashing
**Objective**: Verify password is hashed with bcrypt

**Test Steps**:
1. Create worker with password "TestPassword123"
2. Check database

**Expected Results**:
- ✅ Password in `users.password` is NOT "TestPassword123"
- ✅ Password is bcrypt hash (starts with `$2a$` or `$2b$`)
- ✅ Password can be verified with bcrypt.compare()

---

### TC-WORKER-003: Worker Creation - Missing Required Fields
**Objective**: Verify validation works

**Test Steps**:
1. Try to create worker without email
2. Try to create worker without password
3. Try to create worker without full name

**Expected Results**:
- ✅ Error message displayed for each missing field
- ✅ Cannot proceed to next tab
- ✅ No records created in database

---

### TC-WORKER-004: Worker Creation - Duplicate Email
**Objective**: Verify duplicate email is handled

**Preconditions**:
- User with email "existing@test.com" exists

**Test Steps**:
1. Try to create worker with email "existing@test.com"
2. Submit

**Expected Results**:
- ✅ Error message displayed (unique constraint violation)
- ✅ Worker is NOT created

---

### TC-WORKER-005: Worker Creation - Tab Progression
**Objective**: Verify tabs are enabled/disabled correctly

**Test Steps**:
1. Check initial state
2. Complete Personal tab
3. Check Contact tab state
4. Complete Contact tab
5. Check Skills tab state

**Expected Results**:
- ✅ Initially: Only Personal tab enabled
- ✅ After Personal: Contact tab enabled
- ✅ After Contact: Skills tab enabled
- ✅ Cannot skip tabs

---

### TC-WORKER-006: Worker Creation - Activity Logging
**Objective**: Verify activity is logged

**Test Steps**:
1. Create worker
2. Check `recent_activities` table

**Expected Results**:
- ✅ Record created in `recent_activities`
- ✅ `action` = "Worker Created"
- ✅ `details.brief` contains worker name
- ✅ `type` = "worker_management"
- ✅ `timestamp` is current time

---

## Test Suite 3: Schema Compliance Tests

### TC-SCHEMA-001: Foreign Key Relationships
**Objective**: Verify all foreign keys are correct

**Test Steps**:
1. Create a job with customer, location, workers, equipment
2. Query database to verify relationships

**Expected Results**:
- ✅ `jobs.customer_id` exists in `customer.id`
- ✅ `jobs.location_id` exists in `locations.id`
- ✅ `job_tasks.job_id` exists in `jobs.id`
- ✅ `technician_jobs.job_id` exists in `jobs.id`
- ✅ `technician_jobs.technician_id` exists in `technicians.id`
- ✅ `job_equipments.job_id` exists in `jobs.id`
- ✅ `job_equipments.equipment_id` exists in `equipments.id`
- ✅ `technicians.user_id` exists in `users.id`

---

### TC-SCHEMA-002: Data Types and Constraints
**Objective**: Verify data types match schema

**Test Steps**:
1. Create job and worker
2. Check data types in database

**Expected Results**:
- ✅ UUIDs are valid UUID format
- ✅ Timestamps are TIMESTAMP WITH TIME ZONE
- ✅ Enums match schema (priority, status, etc.)
- ✅ VARCHAR lengths don't exceed limits
- ✅ NOT NULL constraints are satisfied

---

### TC-SCHEMA-003: Cascade Deletes
**Objective**: Verify cascade delete behavior

**Test Steps**:
1. Create job with tasks, assignments, equipment
2. Delete job from database
3. Check related records

**Expected Results**:
- ✅ Job deleted
- ✅ Related `job_tasks` deleted (CASCADE)
- ✅ Related `technician_jobs` deleted (CASCADE)
- ✅ Related `job_equipments` deleted (CASCADE)
- ✅ Related `job_contact_type` deleted (CASCADE)
- ✅ Related `job_schedule` deleted (CASCADE)

---

### TC-SCHEMA-004: Unique Constraints
**Objective**: Verify unique constraints work

**Test Steps**:
1. Try to create job with duplicate `job_number`
2. Try to create user with duplicate `username`
3. Try to create technician with duplicate `email`

**Expected Results**:
- ✅ Error on duplicate `job_number`
- ✅ Error on duplicate `username`
- ✅ Error on duplicate `email`

---

## Test Suite 4: Error Handling Tests

### TC-ERROR-001: Network Error Handling
**Objective**: Verify graceful handling of network errors

**Test Steps**:
1. Disconnect network
2. Try to create job/worker
3. Reconnect network

**Expected Results**:
- ✅ Error message displayed
- ✅ No partial data created
- ✅ Can retry after reconnection

---

### TC-ERROR-002: Invalid Data Handling
**Objective**: Verify invalid data is rejected

**Test Steps**:
1. Try to create job with invalid date format
2. Try to create worker with invalid email format
3. Try to create job with invalid priority value

**Expected Results**:
- ✅ Validation errors displayed
- ✅ No records created
- ✅ Clear error messages

---

### TC-ERROR-003: Missing Related Records
**Objective**: Verify handling of missing foreign key references

**Test Steps**:
1. Try to create job with non-existent customer UUID
2. Try to create technician with non-existent user UUID

**Expected Results**:
- ✅ Foreign key constraint error
- ✅ Clear error message
- ✅ No records created

---

## Test Suite 5: Integration Tests

### TC-INT-001: Job Creation → Job View
**Objective**: Verify created job appears in job list/view

**Test Steps**:
1. Create a job
2. Navigate to job list
3. Find created job
4. Open job details

**Expected Results**:
- ✅ Job appears in list
- ✅ All job details visible
- ✅ Tasks visible
- ✅ Assigned workers visible
- ✅ Equipment visible

---

### TC-INT-002: Worker Creation → Worker List
**Objective**: Verify created worker appears in worker list

**Test Steps**:
1. Create a worker
2. Navigate to worker list
3. Find created worker

**Expected Results**:
- ✅ Worker appears in list
- ✅ Worker details correct
- ✅ Can view worker profile

---

### TC-INT-003: Worker Creation → Job Assignment
**Objective**: Verify new worker can be assigned to jobs

**Test Steps**:
1. Create a worker
2. Create a job
3. Assign new worker to job

**Expected Results**:
- ✅ Worker appears in worker selection dropdown
- ✅ Can assign worker to job
- ✅ Assignment created in `technician_jobs` table

---

## Test Suite 6: Performance Tests

### TC-PERF-001: Multiple Job Creation
**Objective**: Verify performance with multiple jobs

**Test Steps**:
1. Create 10 jobs in sequence
2. Measure time
3. Check database

**Expected Results**:
- ✅ All jobs created successfully
- ✅ Reasonable performance (< 30 seconds for 10 jobs)
- ✅ All records in database

---

### TC-PERF-002: Job with Many Tasks
**Objective**: Verify performance with many tasks

**Test Steps**:
1. Create job with 50 tasks
2. Submit

**Expected Results**:
- ✅ All tasks created
- ✅ Reasonable performance
- ✅ All tasks in `job_tasks` table

---

## Test Execution Checklist

### Pre-Test Setup
- [ ] Supabase project configured
- [ ] All tables created from schema
- [ ] Storage buckets created
- [ ] Test data prepared
- [ ] Test user created

### Test Execution
- [ ] TC-JOB-001: Basic Job Creation
- [ ] TC-JOB-002: Multiple Tasks
- [ ] TC-JOB-003: Multiple Workers
- [ ] TC-JOB-004: Equipment Linking
- [ ] TC-JOB-005: Service Call Linking
- [ ] TC-JOB-006: Recurring Jobs
- [ ] TC-JOB-007: Schedule Conflicts
- [ ] TC-JOB-008: Validation
- [ ] TC-JOB-009: Invalid Customer
- [ ] TC-JOB-010: Location Auto-Creation
- [ ] TC-JOB-011: Job Number Generation
- [ ] TC-WORKER-001: Basic Worker Creation
- [ ] TC-WORKER-002: Password Hashing
- [ ] TC-WORKER-003: Validation
- [ ] TC-WORKER-004: Duplicate Email
- [ ] TC-WORKER-005: Tab Progression
- [ ] TC-WORKER-006: Activity Logging
- [ ] TC-SCHEMA-001: Foreign Keys
- [ ] TC-SCHEMA-002: Data Types
- [ ] TC-SCHEMA-003: Cascade Deletes
- [ ] TC-SCHEMA-004: Unique Constraints
- [ ] TC-ERROR-001: Network Errors
- [ ] TC-ERROR-002: Invalid Data
- [ ] TC-ERROR-003: Missing References
- [ ] TC-INT-001: Job Integration
- [ ] TC-INT-002: Worker Integration
- [ ] TC-INT-003: Worker Assignment
- [ ] TC-PERF-001: Multiple Jobs
- [ ] TC-PERF-002: Many Tasks

### Post-Test Cleanup
- [ ] Delete all test data
- [ ] Verify database is clean
- [ ] Document any issues found

---

## SQL Queries for Verification

### Verify Job Creation
```sql
-- Check job and all related records
SELECT 
  j.id,
  j.job_number,
  j.title,
  j.customer_id,
  j.location_id,
  j.service_call_id,
  (SELECT COUNT(*) FROM job_tasks WHERE job_id = j.id) as task_count,
  (SELECT COUNT(*) FROM technician_jobs WHERE job_id = j.id) as worker_count,
  (SELECT COUNT(*) FROM job_equipments WHERE job_id = j.id) as equipment_count
FROM jobs j
WHERE j.job_number = 'YOUR_JOB_NUMBER';
```

### Verify Worker Creation
```sql
-- Check user and technician relationship
SELECT 
  u.id as user_id,
  u.username,
  u.role,
  u.status as user_status,
  t.id as technician_id,
  t.full_name,
  t.email,
  t.status as technician_status
FROM users u
LEFT JOIN technicians t ON t.user_id = u.id
WHERE u.username = 'test@example.com';
```

### Verify Foreign Key Integrity
```sql
-- Check for orphaned records
SELECT 'job_tasks' as table_name, COUNT(*) as orphaned_count
FROM job_tasks jt
LEFT JOIN jobs j ON j.id = jt.job_id
WHERE j.id IS NULL

UNION ALL

SELECT 'technician_jobs', COUNT(*)
FROM technician_jobs tj
LEFT JOIN jobs j ON j.id = tj.job_id
WHERE j.id IS NULL

UNION ALL

SELECT 'technician_jobs (technician)', COUNT(*)
FROM technician_jobs tj
LEFT JOIN technicians t ON t.id = tj.technician_id
WHERE t.id IS NULL;
```

---

## Bug Report Template

If you find issues during testing, use this template:

```
**Test Case**: TC-XXX-XXX
**Severity**: Critical / High / Medium / Low
**Description**: [What happened]
**Steps to Reproduce**:
1. [Step 1]
2. [Step 2]
3. [Step 3]
**Expected Result**: [What should happen]
**Actual Result**: [What actually happened]
**Database State**: [Any relevant database records]
**Error Messages**: [Any error messages]
**Screenshots**: [If applicable]
```

---

## Notes

1. **Test Data**: Use unique identifiers (timestamps, UUIDs) to avoid conflicts
2. **Cleanup**: Always clean up test data after each test
3. **Isolation**: Each test should be independent
4. **Database State**: Verify database state before and after each test
5. **Error Messages**: Document all error messages for debugging

