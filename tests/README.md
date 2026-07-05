# Test Suite for Create Pages Migration

This directory contains test cases and scripts for validating the migrated create pages.

## Test Files

1. **`create-pages.test.js`** - Automated unit/integration tests (Jest)
2. **`manual-test-checklist.md`** - Manual testing checklist
3. **`../docs/TEST_CASES.md`** - Comprehensive test case documentation

## Running Tests

### Automated Tests (Jest)

```bash
# Install dependencies (if not already installed)
pnpm install

# Run all tests
pnpm test

# Run specific test file
pnpm test create-pages.test.js

# Run with coverage
pnpm test -- --coverage

# Run in watch mode
pnpm test -- --watch
```

### Manual Tests

1. Open `manual-test-checklist.md`
2. Follow the checklist step by step
3. Document any issues found
4. Verify database state after each test

## Test Configuration

### Environment Variables Required

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### Test Data Setup

Before running tests, ensure:
- Supabase project is configured
- All tables from `fsm-schema.sql` are created
- Test customer exists (or tests will create one)
- Test location exists (or tests will create one)
- At least 1 technician exists (or tests will create one)

## Test Coverage

### Job Creation Tests
- ✅ Basic job creation
- ✅ Multiple tasks
- ✅ Multiple workers
- ✅ Equipment linking
- ✅ Service call linking
- ✅ Recurring jobs
- ✅ Schedule conflicts
- ✅ Validation
- ✅ Error handling

### Worker Creation Tests
- ✅ Basic worker creation
- ✅ Password hashing
- ✅ Validation
- ✅ Duplicate email handling
- ✅ Tab progression

### Schema Compliance Tests
- ✅ Foreign key relationships
- ✅ Data types
- ✅ Cascade deletes
- ✅ Unique constraints

## Troubleshooting

### Tests Fail with Connection Error
- Verify Supabase environment variables are set
- Check Supabase project is accessible
- Verify network connection

### Tests Fail with Foreign Key Errors
- Ensure test data (customer, location) exists
- Check that related records are created before dependent records

### Tests Leave Test Data
- Tests should clean up after themselves
- If test data remains, manually delete using cleanup queries in `TEST_CASES.md`

## Adding New Tests

When adding new tests:

1. Follow the naming convention: `TC-CATEGORY-XXX`
2. Include setup and cleanup
3. Test both success and failure cases
4. Verify database state
5. Document in `TEST_CASES.md`

## Test Results

After running tests, document results in:
- Test execution log
- Issue tracker
- `manual-test-checklist.md` (for manual tests)

