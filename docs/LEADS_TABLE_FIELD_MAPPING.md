# Leads Table Field Mapping Guide

## Current Field Mappings

This document tracks which Google Form fields are currently mapped to the `leads` table in Supabase.

### Currently Mapped Fields

| Google Form Question | Leads Table Column | Data Type | Status |
| -------------------- | ------------------ | --------- | ------ |
| Email | `email` | VARCHAR(255) | ✅ Mapped |
| Full Name | `full_name` | VARCHAR(255) | ✅ Mapped |
| Salutation | `salutation` | VARCHAR(50) | ✅ Mapped |
| Handphone / Phone / Mobile | `handphone` | VARCHAR(50) | ✅ Mapped |
| Block | `block` | VARCHAR(100) | ✅ Mapped |
| Unit | `unit` | VARCHAR(100) | ✅ Mapped |
| Address / Location | `address` | TEXT | ✅ Mapped |
| First Service Date | `first_service_date` | DATE | ✅ Mapped |
| Second Service Date | `second_service_date` | DATE | ✅ Mapped |
| Third Service Date | `third_service_date` | DATE | ✅ Mapped |
| Fourth Service Date | `fourth_service_date` | DATE | ✅ Mapped |
| Time Slot | `time_slot` | VARCHAR(255) | ✅ Mapped |
| Complimentary Service Terms | `agreed_to_terms` | BOOLEAN | ✅ Mapped |
| Personal Information Consent | `personal_info_consent` | BOOLEAN | ✅ Mapped |
| Response ID | `google_form_response_id` | VARCHAR(255) | ✅ Mapped |
| Submission Timestamp | `submitted_at` | TIMESTAMP | ✅ Mapped |

### System Fields (Auto-generated)

| Field | Description | Auto-generated |
| ----- | ----------- | -------------- |
| `id` | Primary key | ✅ UUID |
| `status` | Lead status | ✅ Default: 'PENDING' |
| `source` | Lead source | ✅ Default: 'GOOGLE_FORM' |
| `customer_id` | Linked customer | Set when converted |
| `converted_at` | Conversion timestamp | Set when converted |
| `created_at` | Creation timestamp | ✅ Auto |
| `updated_at` | Update timestamp | ✅ Auto |
| `deleted_at` | Soft delete | NULL if active |

---

## Adding New Fields

### Step 1: Check Console Logs

After running a sync, check the console output for:
- **"All unique fields found in responses"** - This shows all fields from your Google Forms
- **"Sample response structure"** - This shows the exact structure of responses

### Step 2: Identify Unmapped Fields

Compare the fields in the console log with the "Currently Mapped Fields" table above. Any fields not listed need to be added.

### Step 3: Add Column to Database

Run this SQL in your Supabase SQL Editor:

```sql
-- Add new column to leads table
ALTER TABLE leads 
ADD COLUMN new_field_name VARCHAR(255); -- Adjust data type as needed

-- Add comment for documentation
COMMENT ON COLUMN leads.new_field_name IS 'Description of what this field stores';
```

### Step 4: Update Mapping Code

Update `pages/api/leads/sync.js` in the transformation section (around line 164):

```javascript
const leadData = {
  // ... existing fields ...
  new_field_name: response.newFieldName || null, // Add new mapping
};
```

### Step 5: Update Question ID Mapping

Update the question ID mapping function (around line 316) to recognize the new field:

```javascript
// In fetchWithServiceAccount function, add to questionIdMap
if (titleLower.includes('new field') && !questionIdMap['newFieldName']) {
  questionIdMap['newFieldName'] = questionId;
}
```

---

## Common Data Types

| Google Form Field Type | Recommended SQL Type | Notes |
| ---------------------- | -------------------- | ----- |
| Short answer | VARCHAR(255) | For short text |
| Paragraph | TEXT | For long text |
| Multiple choice | VARCHAR(255) | Store selected option |
| Checkboxes | TEXT or JSONB | Store as comma-separated or JSON array |
| Date | DATE | For date-only fields |
| Time | TIME | For time-only fields |
| Date and time | TIMESTAMP | For date+time fields |
| Number | INTEGER or DECIMAL | Based on precision needed |
| Email | VARCHAR(255) | Already have email field |
| Phone | VARCHAR(50) | Already have handphone field |

---

## Example: Adding a New Field

### Scenario: Adding "Company Name" Field

1. **Console shows:** `companyName` field in responses

2. **Add to database:**
```sql
ALTER TABLE leads 
ADD COLUMN company_name VARCHAR(255);

COMMENT ON COLUMN leads.company_name IS 'Company name from Google Form';
```

3. **Update sync.js transformation:**
```javascript
const leadData = {
  // ... existing fields ...
  company_name: response.companyName || null,
};
```

4. **Update question mapping:**
```javascript
if (titleLower.includes('company name') && !questionIdMap['companyName']) {
  questionIdMap['companyName'] = questionId;
}
```

5. **Update frontend display** (if needed):
   - Add to `transformLeadToResponse` function in `pages/customer-leads/index.js`
   - Add column to table display
   - Add to edit form

---

## Field Naming Conventions

- Use `snake_case` for database columns
- Use `camelCase` for JavaScript variables
- Keep names descriptive but concise
- Avoid abbreviations unless widely understood

---

## Testing New Fields

After adding a new field:

1. Run a sync and check console logs
2. Verify the field appears in the database
3. Check that data is being saved correctly
4. Update frontend to display the new field
5. Test editing the field (if applicable)

---

## Notes

- All new fields should be nullable (allow NULL) unless they're required
- Consider adding indexes for fields used in filtering/searching
- Update this document when adding new fields
- Keep field names consistent across the codebase

