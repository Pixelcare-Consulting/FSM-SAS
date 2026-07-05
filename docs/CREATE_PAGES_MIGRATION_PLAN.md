# Create Pages Migration Plan

## Status: ⚠️ NEEDS MIGRATION

The create pages (`CreateJobs.js` and `create-worker.js`) are **NOT** following the schema and still use Firebase.

## Issues Identified

### CreateJobs.js (3249 lines)
1. ❌ Uses Firebase (`setDoc`, `collection`, `doc`, etc.)
2. ❌ Creates flat document structure instead of relational tables
3. ❌ Doesn't create records in:
   - `job_tasks` table (tasks are stored as array in job document)
   - `technician_jobs` table (workers stored as array)
   - `job_contact_type` table (contact type stored in job document)
   - `job_equipments` table (equipment stored as array)
   - `job_schedule` table (schedule stored in job document)

### create-worker.js (384 lines)
1. ❌ Uses Firebase Auth (`createUserWithEmailAndPassword`)
2. ❌ Creates flat user document instead of:
   - `users` table record
   - `technicians` table record (linked via `user_id`)
3. ❌ Doesn't hash passwords with bcrypt

## Required Changes

### For CreateJobs.js:

#### 1. Replace Firebase Imports
```javascript
// OLD
import { db } from "../../../firebase";
import { collection, query, orderBy, limit, getDocs, setDoc, doc, Timestamp } from "firebase/firestore";

// NEW
import { getSupabaseClient } from "../../../lib/supabase/client";
import { jobService, userService, customerService } from "../../../lib/supabase/database";
```

#### 2. Update generateBaseJobNo Function
```javascript
// OLD - Uses Firestore
const generateBaseJobNo = async () => {
  const jobsRef = collection(db, "jobs");
  const q = query(jobsRef, orderBy("jobNo", "desc"), limit(1));
  const snapshot = await getDocs(q);
  // ...
};

// NEW - Uses Supabase
const generateBaseJobNo = async () => {
  const supabase = getSupabaseClient();
  const { data } = await supabase
    .from('jobs')
    .select('job_number')
    .order('job_number', { ascending: false })
    .limit(1)
    .single();
  // Extract and increment job number
};
```

#### 3. Update handleSubmitClick to Follow Schema

The current code creates a single flat document. It needs to:

1. **Get/Create Customer UUID**
   ```javascript
   const customer = await customerService.findByCode(selectedCustomer.cardCode);
   const customerId = customer?.id || await createCustomer(selectedCustomer);
   ```

2. **Get/Create Location UUID**
   ```javascript
   // Find or create location
   const location = await findOrCreateLocation(selectedLocation, customerId);
   ```

3. **Get Service Call UUID** (if provided)
   ```javascript
   const serviceCallId = selectedServiceCall ? await getServiceCallId(selectedServiceCall) : null;
   ```

4. **Create Job Record**
   ```javascript
   const job = await jobService.create({
     customer_id: customerId,
     location_id: location.id,
     service_call_id: serviceCallId,
     job_number: currentJobNo,
     title: formData.jobName,
     description: formData.jobDescription,
     priority: formData.priority.toUpperCase(),
     status: 'PENDING',
     scheduled_start: formattedStartDateTime,
     scheduled_end: formattedEndDateTime
   });
   ```

5. **Create Tasks in job_tasks table**
   ```javascript
   for (let i = 0; i < tasks.length; i++) {
     await supabase.from('job_tasks').insert({
       job_id: job.id,
       task_name: tasks[i].taskName,
       task_description: tasks[i].taskDescription,
       task_order: i + 1,
       is_required: tasks[i].isPriority
     });
   }
   ```

6. **Create Technician Assignments in technician_jobs table**
   ```javascript
   for (const worker of selectedWorkers) {
     // Get technician record for this worker
     const user = await userService.findById(worker.value);
     const technician = user.technicians?.[0];
     
     if (technician) {
       await supabase.from('technician_jobs').insert({
         technician_id: technician.id,
         job_id: job.id,
         assignment_status: 'ASSIGNED'
       });
     }
   }
   ```

7. **Create Job Contact Type**
   ```javascript
   if (selectedJobContactType) {
     await supabase.from('job_contact_type').insert({
       job_id: job.id,
       code: selectedJobContactType.code,
       name: selectedJobContactType.name
     });
   }
   ```

8. **Create Equipment Records in job_equipments table**
   ```javascript
   for (const equipment of formData.equipments) {
     // Find equipment by item_code
     const equipmentRecord = await findEquipmentByCode(equipment.itemCode);
     if (equipmentRecord) {
       await supabase.from('job_equipments').insert({
         job_id: job.id,
         equipment_id: equipmentRecord.id,
         quantity_used: 1,
         notes: equipment.notes
       });
     }
   }
   ```

9. **Create Schedule in job_schedule table**
   ```javascript
   await supabase.from('job_schedule').insert({
     job_id: job.id,
     jsdate: currentDate.toISOString().split('T')[0],
     jedate: endDate.toISOString().split('T')[0],
     jstime: formData.startTime,
     jetime: formData.endTime,
     address: selectedLocation?.address || ''
   });
   ```

### For create-worker.js:

#### 1. Replace Firebase Auth
```javascript
// OLD
import { createUserWithEmailAndPassword } from "firebase/auth";
import { setDoc, doc, collection } from "firebase/firestore";

// NEW
import { getSupabaseClient } from "../../../lib/supabase/client";
import { userService } from "../../../lib/supabase/database";
import bcrypt from 'bcryptjs';
```

#### 2. Update handlePersonalFormSubmit
```javascript
// OLD
const { user } = await createUserWithEmailAndPassword(auth, email, password);
const userData = { uid: user.uid, workerId, ...personalFormData };

// NEW
// Hash password
const hashedPassword = await bcrypt.hash(password, 10);

// Create user in users table
const user = await userService.create({
  username: email,
  password: hashedPassword,
  role: 'TECHNICIAN',
  status: 'ACTIVE'
});

// Create technician record
const supabase = getSupabaseClient();
await supabase.from('technicians').insert({
  user_id: user.id,
  email: email,
  full_name: `${personalFormData.firstName} ${personalFormData.lastName}`,
  phone_number: personalFormData.phoneNumber,
  status: 'ACTIVE'
});
```

## Migration Priority

1. **HIGH**: CreateJobs.js - This is the most critical as it's used frequently
2. **HIGH**: create-worker.js - Needed for user management
3. **MEDIUM**: Update all fetch functions to use Supabase
4. **LOW**: Clean up old Firebase code

## Testing Checklist

After migration:
- [ ] Can create a job successfully
- [ ] Job appears in jobs table with correct foreign keys
- [ ] Tasks are created in job_tasks table
- [ ] Worker assignments are in technician_jobs table
- [ ] Equipment is linked in job_equipments table
- [ ] Schedule is in job_schedule table
- [ ] Can create a worker successfully
- [ ] User record is in users table
- [ ] Technician record is in technicians table with correct user_id
- [ ] Password is hashed with bcrypt

## Estimated Effort

- CreateJobs.js: ~4-6 hours (large file, complex logic)
- create-worker.js: ~1-2 hours (smaller, simpler)
- Testing: ~2-3 hours
- **Total: ~7-11 hours**

