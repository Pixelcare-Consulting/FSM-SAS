/**
 * Database Schema Checker
 * Checks if the required tables exist in Supabase
 */

// Try to load dotenv if available
try {
  const dotenv = require('dotenv');
  dotenv.config({ path: '.env.local' });
  dotenv.config({ path: '.env' });
} catch (e) {
  // dotenv not installed
}

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('❌ Error: Supabase environment variables are not set!');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function checkDatabase() {
  console.log('🔍 Checking Supabase database schema...\n');

  const requiredTables = [
    'users',
    'technicians',
    'customer',
    'jobs',
    'job_tasks',
    'technician_jobs',
    'technician_hours'
  ];

  const results = {};

  for (const table of requiredTables) {
    try {
      // Try to query the table
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .limit(1);

      if (error) {
        if (error.code === '42P01') {
          // Table does not exist
          results[table] = { exists: false, error: 'Table does not exist' };
        } else {
          results[table] = { exists: true, error: error.message };
        }
      } else {
        results[table] = { exists: true, columns: 'OK' };
      }
    } catch (err) {
      results[table] = { exists: false, error: err.message };
    }
  }

  // Check users table columns specifically
  console.log('📊 Table Status:');
  console.log('─'.repeat(50));
  
  for (const [table, status] of Object.entries(results)) {
    if (status.exists) {
      console.log(`✅ ${table.padEnd(20)} - Exists`);
    } else {
      console.log(`❌ ${table.padEnd(20)} - Missing: ${status.error}`);
    }
  }

  // Check users table structure
  console.log('\n🔍 Checking users table structure...');
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .limit(0);

    if (error && error.message.includes('password')) {
      console.log('❌ Users table exists but is missing the "password" column');
      console.log('\n💡 Solution:');
      console.log('   1. Go to your Supabase dashboard');
      console.log('   2. Navigate to SQL Editor');
      console.log('   3. Run the schema file: lib/supabase/fsm-schema.sql');
      console.log('   4. Or manually add the password column:');
      console.log('      ALTER TABLE users ADD COLUMN password VARCHAR(255);');
    } else if (!error) {
      console.log('✅ Users table structure looks correct');
    }
  } catch (err) {
    console.log('⚠️  Could not check users table structure');
  }

  console.log('\n📋 Next Steps:');
  if (!results.users?.exists) {
    console.log('   1. Run the schema SQL file in Supabase SQL Editor:');
    console.log('      File: lib/supabase/fsm-schema.sql');
    console.log('   2. Or use the Supabase CLI to apply migrations');
    console.log('   3. Then run this script again to verify');
  } else if (results.users.exists && results.users.error?.includes('password')) {
    console.log('   1. Add the missing password column to users table');
    console.log('   2. Run: ALTER TABLE users ADD COLUMN password VARCHAR(255) NOT NULL;');
  } else {
    console.log('   ✅ Database schema looks good!');
    console.log('   You can now create test users with: pnpm test:create-user');
  }
}

checkDatabase()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

