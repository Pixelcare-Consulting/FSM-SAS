/**
 * Test User Creation Script
 * Creates test users for development/testing
 * 
 * Usage:
 *   node scripts/create-test-user.js
 *   OR
 *   node scripts/create-test-user.js --email test@example.com --password test123 --role ADMIN --name "Test Admin"
 */

// Try to load dotenv if available (try both .env and .env.local)
try {
  const dotenv = require('dotenv');
  // Try .env.local first (Next.js convention), then .env
  dotenv.config({ path: '.env.local' });
  dotenv.config({ path: '.env' }); // This will override .env.local if both exist
} catch (e) {
  // dotenv not installed, that's okay - environment variables should be set manually
  // or loaded by the system
}

const { createClient } = require('@supabase/supabase-js');

// Get Supabase credentials
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Debug: Show what we found (without showing full keys)
if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('❌ Error: Supabase environment variables are not set!');
  console.error('\n📋 Current environment variables:');
  console.error(`   NEXT_PUBLIC_SUPABASE_URL: ${supabaseUrl ? '✅ Set (' + supabaseUrl.substring(0, 30) + '...)' : '❌ Missing'}`);
  console.error(`   SUPABASE_SERVICE_ROLE_KEY: ${supabaseServiceRoleKey ? '✅ Set (' + supabaseServiceRoleKey.substring(0, 30) + '...)' : '❌ Missing'}`);
  console.error('\n💡 Please check:');
  console.error('   1. Your .env or .env.local file exists in the project root');
  console.error('   2. The variables are named correctly (case-sensitive)');
  console.error('   3. There are no extra spaces or quotes around the values');
  console.error('   4. If using dotenv, make sure it\'s installed: pnpm add -D dotenv');
  process.exit(1);
}

// Create Supabase admin client
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

/**
 * Create a test user
 */
async function createTestUser(options = {}) {
  const {
    email = 'test@example.com',
    password = 'test123',
    role = 'TECHNICIAN',
    fullName = 'Test User',
    phoneNumber = null,
    status = 'ACTIVE'
  } = options;

  try {
    console.log('\n🔐 Creating test user...');
    console.log(`   Email: ${email}`);
    console.log(`   Role: ${role}`);
    console.log(`   Name: ${fullName}`);

    // Check if user already exists in Supabase Auth
    console.log('   Checking if user already exists...');
    const { data: existingAuthUsers } = await supabase.auth.admin.listUsers();
    const existingAuthUser = existingAuthUsers?.users?.find(u => u.email === email);

    if (existingAuthUser) {
      console.log('⚠️  User already exists in Supabase Auth with this email!');
      return {
        success: false,
        error: 'User already exists in Supabase Auth',
        user: {
          id: existingAuthUser.id,
          email: existingAuthUser.email
        }
      };
    }

    // Also check custom users table
    const { data: existingUser } = await supabase
      .from('users')
      .select('id, username')
      .eq('username', email)
      .is('deleted_at', null)
      .single();

    if (existingUser) {
      console.log('⚠️  User already exists in users table!');
      return {
        success: false,
        error: 'User already exists in users table',
        user: existingUser
      };
    }

    // Create user in Supabase Auth (auth.users)
    console.log('   Creating user in Supabase Auth...');
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true, // Auto-confirm email for test users
      user_metadata: {
        role: role,
        full_name: fullName
      }
    });

    if (authError) {
      throw authError;
    }

    console.log(`   ✅ Auth user created with ID: ${authUser.user.id}`);

    // Create user record in custom users table (for additional details)
    console.log('   Creating user record in users table...');
    const { data: user, error: userError } = await supabase
      .from('users')
      .insert({
        id: authUser.user.id, // Link to auth user
        username: email,
        role: role,
        status: status
      })
      .select()
      .single();

    if (userError) {
      // If user table insert fails, try to clean up auth user
      console.error('   ⚠️  Warning: Failed to create user record, but auth user was created');
      console.error('   You may need to manually delete the auth user:', authUser.user.id);
      throw userError;
    }

    console.log(`   ✅ User record created with ID: ${user.id}`);

    // Create technician record if role is TECHNICIAN
    let technician = null;
    if (role === 'TECHNICIAN') {
      console.log('   Creating technician record...');
      const { data: tech, error: techError } = await supabase
        .from('technicians')
        .insert({
          user_id: user.id,
          email: email,
          full_name: fullName,
          phone_number: phoneNumber,
          status: status
        })
        .select()
        .single();

      if (techError) {
        console.error('   ⚠️  Warning: User created but technician record failed:', techError.message);
      } else {
        technician = tech;
        console.log(`   ✅ Technician created with ID: ${tech.id}`);
      }
    }

    console.log('\n✅ Test user created successfully!');
    console.log('\n📋 Login Credentials:');
    console.log(`   Email: ${email}`);
    console.log(`   Password: ${password}`);
    console.log(`   Role: ${role}`);
    console.log(`\n🔗 Login at: http://localhost:3003/sign-in\n`);

    return {
      success: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        status: user.status
      },
      technician: technician ? {
        id: technician.id,
        email: technician.email,
        full_name: technician.full_name
      } : null
    };

  } catch (error) {
    console.error('\n❌ Error creating test user:', error.message);
    console.error('   Details:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Create multiple test users
 */
async function createMultipleTestUsers() {
  const testUsers = [
    {
      email: 'admin@test.com',
      password: 'admin123',
      role: 'ADMIN',
      fullName: 'Test Admin',
      phoneNumber: '+1234567890'
    },
    {
      email: 'technician@test.com',
      password: 'tech123',
      role: 'TECHNICIAN',
      fullName: 'Test Technician',
      phoneNumber: '+1234567891'
    },
    {
      email: 'technician2@test.com',
      password: 'tech123',
      role: 'TECHNICIAN',
      fullName: 'Test Technician 2',
      phoneNumber: '+1234567892'
    }
  ];

  console.log('🚀 Creating multiple test users...\n');
  
  const results = [];
  for (const userData of testUsers) {
    const result = await createTestUser(userData);
    results.push(result);
    // Small delay between creations
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log('\n📊 Summary:');
  console.log(`   ✅ Created: ${successful}`);
  console.log(`   ❌ Failed: ${failed}`);

  return results;
}

// Main execution
async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Test User Creation Script

Usage:
  node scripts/create-test-user.js [options]
  node scripts/create-test-user.js --multiple

Options:
  --email <email>        User email (default: test@example.com)
  --password <password>  User password (default: test123)
  --role <role>          User role: ADMIN, TECHNICIAN, CUSTOMER (default: TECHNICIAN)
  --name <name>          Full name (default: Test User)
  --phone <phone>        Phone number (optional)
  --multiple             Create multiple test users (admin + 2 technicians)
  --help, -h             Show this help message

Examples:
  node scripts/create-test-user.js
  node scripts/create-test-user.js --email admin@test.com --password admin123 --role ADMIN
  node scripts/create-test-user.js --multiple
    `);
    return;
  }

  if (args.includes('--multiple')) {
    await createMultipleTestUsers();
    return;
  }

  // Parse individual arguments
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.replace('--', '');
    const value = args[i + 1];
    if (key && value) {
      options[key] = value;
    }
  }

  // Map argument names to option names
  if (options.email) options.email = options.email;
  if (options.password) options.password = options.password;
  if (options.role) options.role = options.role.toUpperCase();
  if (options.name) options.fullName = options.name;
  if (options.phone) options.phoneNumber = options.phone;

  await createTestUser(options);
}

// Run if executed directly
if (require.main === module) {
  main()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { createTestUser, createMultipleTestUsers };

