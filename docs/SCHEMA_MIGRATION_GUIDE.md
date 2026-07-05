# Schema Migration Guide for Create Pages

## Current Issues

The create pages (`CreateJobs.js` and `create-worker.js`) are:
1. ❌ Still using Firebase instead of Supabase
2. ❌ Creating flat document structures instead of relational tables
3. ❌ Not following the schema structure from `fsm-schema.sql`

## Schema Structure

### Jobs Creation Should Create Records In:

1. **`jobs` table** - Main job record
   - `customer_id` (UUID) - Foreign key to customer
   - `location_id` (UUID) - Foreign key to locations
   - `service_call_id` (UUID) - Foreign key to service_call (optional)
   - `job_number` (VARCHAR) - Unique job number
   - `title` (VARCHAR) - Job title
   - `description` (TEXT) - Job description
   - `priority` (VARCHAR) - LOW, MEDIUM, HIGH, URGENT
   - `status` (VARCHAR) - PENDING, IN_PROGRESS, etc.
   - `scheduled_start` (TIMESTAMP) - Start date/time
   - `scheduled_end` (TIMESTAMP) - End date/time

2. **`job_tasks` table** - Tasks for the job
   - `job_id` (UUID) - Foreign key to jobs
   - `task_name` (VARCHAR) - Task name
   - `task_description` (TEXT) - Task description
   - `task_order` (INTEGER) - Order of task
   - `is_required` (BOOLEAN) - Whether task is required

3. **`technician_jobs` table** - Worker assignments
   - `technician_id` (UUID) - Foreign key to technicians
   - `job_id` (UUID) - Foreign key to jobs
   - `assignment_status` (VARCHAR) - ASSIGNED, STARTED, COMPLETED, CANCELLED

4. **`job_contact_type` table** - Contact type for job
   - `job_id` (UUID) - Foreign key to jobs
   - `code` (INTEGER) - Contact type code
   - `name` (VARCHAR) - Contact type name

5. **`job_equipments` table** - Equipment used in job
   - `job_id` (UUID) - Foreign key to jobs
   - `equipment_id` (UUID) - Foreign key to equipments
   - `quantity_used` (INTEGER) - Quantity
   - `notes` (TEXT) - Notes

6. **`job_schedule` table** - Schedule details
   - `job_id` (UUID) - Foreign key to jobs
   - `jsdate` (DATE) - Start date
   - `jedate` (DATE) - End date
   - `jstime` (TIME) - Start time
   - `jetime` (TIME) - End time
   - `address` (TEXT) - Address

### Worker Creation Should Create Records In:

1. **`users` table** - User account
   - `username` (VARCHAR) - Email/username
   - `password` (VARCHAR) - Hashed password (bcrypt)
   - `role` (VARCHAR) - ADMIN, TECHNICIAN, CUSTOMER
   - `status` (VARCHAR) - ACTIVE, INACTIVE, SUSPENDED

2. **`technicians` table** - Technician profile
   - `user_id` (UUID) - Foreign key to users
   - `email` (VARCHAR) - Email
   - `full_name` (VARCHAR) - Full name
   - `phone_number` (VARCHAR) - Phone number
   - `status` (VARCHAR) - ACTIVE, INACTIVE, SUSPENDED

## Migration Steps

### For CreateJobs.js:

1. Replace Firebase imports with Supabase
2. Map form data to schema structure:
   - Get customer UUID from customer_code
   - Get location UUID from location data
   - Get service_call UUID if provided
   - Get technician UUIDs from worker IDs
3. Create job record in `jobs` table
4. Create tasks in `job_tasks` table
5. Create technician assignments in `technician_jobs` table
6. Create job contact type in `job_contact_type` table
7. Create equipment records in `job_equipments` table
8. Create schedule in `job_schedule` table

### For create-worker.js:

1. Replace Firebase Auth with Supabase Auth
2. Hash password with bcrypt
3. Create user record in `users` table
4. Create technician record in `technicians` table linked to user
5. Use Supabase for activity logging

## Data Mapping Examples

### Job Creation Mapping:

```javascript
// Old Firebase structure (flat):
{
  jobID: "000001",
  jobName: "Install AC",
  customerID: "C001",
  assignedWorkers: [{ workerId: "W001" }],
  taskList: [{ taskName: "Install unit" }]
}

// New Supabase structure (relational):
// 1. Create job
const job = await jobService.create({
  customer_id: customerUUID,
  location_id: locationUUID,
  job_number: "000001",
  title: "Install AC",
  priority: "MEDIUM",
  status: "PENDING",
  scheduled_start: "2024-01-01T09:00:00Z",
  scheduled_end: "2024-01-01T17:00:00Z"
});

// 2. Create tasks
for (const task of tasks) {
  await supabase.from('job_tasks').insert({
    job_id: job.id,
    task_name: task.taskName,
    task_description: task.taskDescription,
    task_order: index,
    is_required: task.isPriority
  });
}

// 3. Create technician assignments
for (const worker of selectedWorkers) {
  const technician = await getTechnicianByUserId(worker.value);
  await supabase.from('technician_jobs').insert({
    technician_id: technician.id,
    job_id: job.id,
    assignment_status: 'ASSIGNED'
  });
}
```

### Worker Creation Mapping:

```javascript
// Old Firebase structure:
{
  uid: "firebase-uid",
  email: "worker@example.com",
  firstName: "John",
  lastName: "Doe"
}

// New Supabase structure:
// 1. Hash password
const hashedPassword = await bcrypt.hash(password, 10);

// 2. Create user
const user = await userService.create({
  username: email,
  password: hashedPassword,
  role: 'TECHNICIAN',
  status: 'ACTIVE'
});

// 3. Create technician
await supabase.from('technicians').insert({
  user_id: user.id,
  email: email,
  full_name: `${firstName} ${lastName}`,
  phone_number: phone,
  status: 'ACTIVE'
});
```

