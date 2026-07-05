# Lead to Job Creation Feature

## Overview

This feature allows you to create temporary jobs directly from leads in the Customer Leads page. When a job is created from a lead, the system will:

1. Create or find a customer based on the lead's email
2. Create or find a location based on the lead's address
3. Create a job with scheduling based on the lead's service dates
4. Convert the lead status to "CONVERTED"
5. Link the lead to the created customer

## How to Use

### From the Leads Table

1. Navigate to **Customer Leads** page (`/customer-leads`)
2. Find a lead with at least one service date
3. Click the **"Create Job"** button (green button with briefcase icon) in the Actions column
4. Confirm the action in the dialog
5. The system will create the job and redirect you to the job edit page

### From the Lead Details Modal

1. Click **"View"** on any lead to open the details modal
2. If the lead has a service date and is not already converted, you'll see a **"Create Job from Lead"** button in the footer
3. Click the button to create the job

## Requirements

For a lead to be eligible for job creation:

- ✅ Must have an **email** address
- ✅ Must have a **full name**
- ✅ Must have at least **one service date** (first_service_date, second_service_date, etc.)
- ✅ Lead status must not be **CONVERTED** (already converted leads cannot create another job)

## What Gets Created

### Customer

- **Customer Code**: Auto-generated as `LEAD-{EMAIL_PREFIX}-{TIMESTAMP}`
- **Customer Name**: From lead's `full_name`
- **Email**: From lead's `email`
- **Phone**: From lead's `handphone` (if available)

If a customer with the same email already exists, the system will use that customer instead of creating a new one.

### Location

- **Location Name**: `{block}-{unit}` or `{address}` or "Main Location"
- **Address**: Full address from lead
- **Block**: From lead's `block` field
- **Unit**: From lead's `unit` field

If a location with the same name already exists for the customer, the system will use that location instead of creating a new one.

### Job

- **Job Number**: Auto-generated in format `YYYY-XXXXXX`
- **Title**: `Service for {lead.full_name}` or custom title if provided
- **Description**: From lead's `notes` or default description
- **Priority**: `MEDIUM` (default, can be customized)
- **Status**: `PENDING` (default, can be customized)
- **Scheduled Start**: First service date + time from `time_slot`
- **Scheduled End**: Calculated based on time slot (default 3.5 hours duration)

### Time Slot Parsing

The system attempts to parse the time slot from the lead's `time_slot` field. It looks for patterns like:
- `"AM - Time Slot: 9.30am - 12.30pm"`
- `"9:30am - 12:30pm"`
- `"9.30am - 12.30pm"`

If no time slot is found or parsing fails, it defaults to:
- **Start**: 9:00 AM
- **End**: 12:30 PM

## API Endpoint

### POST `/api/leads/:id/create-job`

Creates a job from a lead.

**Request Body:**
```json
{
  "use_first_service_date": true,
  "use_second_service_date": false,
  "use_third_service_date": false,
  "use_fourth_service_date": false,
  "job_title": "Custom Job Title (optional)",
  "job_description": "Custom Description (optional)",
  "priority": "MEDIUM",
  "status": "PENDING"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Job created successfully from lead",
  "job": {
    "id": "uuid",
    "job_number": "2024-000123",
    "title": "Service for John Doe",
    "status": "PENDING",
    "scheduled_start": "2024-01-15T09:00:00Z",
    "scheduled_end": "2024-01-15T12:30:00Z"
  },
  "customer": {
    "id": "uuid",
    "customer_code": "LEAD-JOHNDOE-123456",
    "customer_name": "John Doe"
  },
  "location": {
    "id": "uuid",
    "location_name": "123-456"
  },
  "lead": {
    "id": "uuid",
    "status": "CONVERTED"
  }
}
```

## Lead Status Updates

When a job is created from a lead:

1. **Lead Status** is updated to `CONVERTED`
2. **Lead Customer ID** is set to the created/found customer
3. **Lead Converted At** timestamp is set
4. **Lead Notes** are updated with job creation information

## Error Handling

### Common Errors

1. **"No service date available"**
   - **Cause**: Lead doesn't have any service dates set
   - **Solution**: Edit the lead and add at least one service date

2. **"Lead must have email and full name"**
   - **Cause**: Required fields are missing
   - **Solution**: Edit the lead and add the missing information

3. **"Failed to create location"**
   - **Cause**: Database error when creating location
   - **Solution**: Check database connection and location table schema

4. **"Failed to create job"**
   - **Cause**: Database error when creating job
   - **Solution**: Check database connection and job table schema

## UI Features

### Button States

- **Enabled**: Lead has service date and is not converted
- **Disabled**: Lead is missing service date or already converted
- **Loading**: Shows spinner and "Creating..." text during job creation

### Visual Indicators

- **Green "Create Job" button**: Available for eligible leads
- **Status badge**: Shows "CONVERTED" for leads that already have jobs
- **Tooltip**: Hover over disabled button to see why it's disabled

## Integration with Existing Flow

This feature integrates seamlessly with the existing job creation workflow:

1. Job is created using the same `jobService.create()` method
2. Job follows the same validation and structure as manually created jobs
3. Job can be edited, assigned workers, and managed like any other job
4. Job appears in the jobs list and can be tracked normally

## Future Enhancements

Potential improvements for future versions:

1. **Bulk Job Creation**: Create multiple jobs from multiple leads at once
2. **Service Date Selection**: Choose which service date(s) to use for job creation
3. **Job Template**: Use predefined job templates for different lead types
4. **Auto-Assignment**: Automatically assign workers based on lead data
5. **Email Notification**: Send notification to customer when job is created
6. **Multiple Jobs**: Create separate jobs for each service date in the lead

## Technical Details

### Files Modified/Created

1. **`pages/api/leads/[id]/create-job.js`** (NEW)
   - API endpoint for creating jobs from leads

2. **`pages/customer-leads/index.js`** (MODIFIED)
   - Added "Create Job" button in table actions
   - Added "Create Job from Lead" button in modal footer
   - Added `handleCreateJob` function
   - Added `creatingJob` state for loading indicator

3. **`docs/GOOGLE_FORMS_INTEGRATION_FLOWCHART.md`** (NEW)
   - Complete flowchart of the Google Forms integration

4. **`docs/LEAD_TO_JOB_CREATION_FEATURE.md`** (THIS FILE)
   - Documentation for this feature

### Dependencies

- Uses existing `jobService`, `customerService`, and `leadService` from `lib/supabase/database.js`
- Uses `getSupabaseAdmin()` for database operations
- Requires proper database schema with `customer`, `locations`, `jobs`, and `leads` tables

## Testing Checklist

- [ ] Create job from lead with first service date
- [ ] Create job from lead with second service date
- [ ] Verify customer is created correctly
- [ ] Verify location is created correctly
- [ ] Verify job scheduling matches lead service date
- [ ] Verify lead status updates to CONVERTED
- [ ] Verify existing customer is reused (by email)
- [ ] Verify existing location is reused (by name)
- [ ] Test error handling for missing service date
- [ ] Test error handling for missing email/name
- [ ] Verify button is disabled for converted leads
- [ ] Verify redirect to job edit page after creation

