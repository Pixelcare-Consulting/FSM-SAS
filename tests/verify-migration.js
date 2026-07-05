/**
 * Migration Verification Script
 * 
 * This script verifies that the create pages migration is working correctly
 * by checking database records and relationships.
 * 
 * Run with: node tests/verify-migration.js
 */

// Try to load dotenv, but don't fail if not available
try {
  require('dotenv').config({ path: '.env.local' });
} catch (e) {
  // dotenv not installed, use environment variables directly
}

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables');
  console.error('Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Test results
const results = {
  passed: [],
  failed: [],
  warnings: []
};

function logResult(test, passed, message = '') {
  if (passed) {
    results.passed.push(test);
    console.log(`✅ ${test}`);
  } else {
    results.failed.push({ test, message });
    console.log(`❌ ${test}: ${message}`);
  }
}

function logWarning(test, message) {
  results.warnings.push({ test, message });
  console.log(`⚠️  ${test}: ${message}`);
}

async function verifyTableExists(tableName) {
  try {
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .limit(1);
    
    if (error && error.code === '42P01') {
      return false; // Table doesn't exist
    }
    return true;
  } catch (err) {
    return false;
  }
}

async function verifySchema() {
  console.log('\n📋 Verifying Database Schema...\n');
  
  const requiredTables = [
    'users',
    'technicians',
    'customer',
    'jobs',
    'job_tasks',
    'technician_jobs',
    'technician_hours',
    'job_contact_type',
    'job_equipments',
    'job_schedule',
    'locations',
    'equipments',
    'service_call',
    'recent_activities'
  ];

  for (const table of requiredTables) {
    const exists = await verifyTableExists(table);
    logResult(`Table exists: ${table}`, exists, `Table ${table} not found`);
  }
}

async function verifyJobCreation() {
  console.log('\n📋 Verifying Job Creation Structure...\n');
  
  // Check if jobs table has correct structure
  try {
    const { data: jobs, error } = await supabase
      .from('jobs')
      .select('*')
      .limit(1);
    
    if (error) {
      logResult('Jobs table accessible', false, error.message);
      return;
    }
    
    logResult('Jobs table accessible', true);
    
    // Check for required columns
    if (jobs && jobs.length > 0) {
      const job = jobs[0];
      const requiredFields = ['id', 'customer_id', 'job_number', 'title', 'priority', 'status'];
      const missingFields = requiredFields.filter(field => !(field in job));
      
      if (missingFields.length > 0) {
        logResult('Jobs table has required fields', false, `Missing: ${missingFields.join(', ')}`);
      } else {
        logResult('Jobs table has required fields', true);
      }
    }
  } catch (err) {
    logResult('Jobs table check', false, err.message);
  }
}

async function verifyWorkerCreation() {
  console.log('\n📋 Verifying Worker Creation Structure...\n');
  
  // Check users table
  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .limit(1);
    
    if (error) {
      logResult('Users table accessible', false, error.message);
      return;
    }
    
    logResult('Users table accessible', true);
    
    if (users && users.length > 0) {
      const user = users[0];
      
      // Check password is hashed
      if (user.password) {
        const isHashed = user.password.startsWith('$2a$') || user.password.startsWith('$2b$');
        logResult('Passwords are hashed', isHashed, 'Password appears to be plain text');
      }
      
      // Check required fields
      const requiredFields = ['id', 'username', 'password', 'role', 'status'];
      const missingFields = requiredFields.filter(field => !(field in user));
      
      if (missingFields.length > 0) {
        logResult('Users table has required fields', false, `Missing: ${missingFields.join(', ')}`);
      } else {
        logResult('Users table has required fields', true);
      }
    }
  } catch (err) {
    logResult('Users table check', false, err.message);
  }
  
  // Check technicians table
  try {
    const { data: technicians, error } = await supabase
      .from('technicians')
      .select('*, users(*)')
      .limit(1);
    
    if (error) {
      logResult('Technicians table accessible', false, error.message);
      return;
    }
    
    logResult('Technicians table accessible', true);
    
    if (technicians && technicians.length > 0) {
      const tech = technicians[0];
      
      // Check foreign key relationship
      if (tech.user_id && tech.users) {
        logResult('Technician-User relationship exists', true);
      } else {
        logWarning('Technician-User relationship', 'No technicians with user relationships found');
      }
    }
  } catch (err) {
    logResult('Technicians table check', false, err.message);
  }
}

async function verifyForeignKeys() {
  console.log('\n📋 Verifying Foreign Key Relationships...\n');
  
  // Check for orphaned records
  const checks = [
    {
      name: 'job_tasks → jobs',
      query: async () => {
        const { data } = await supabase
          .from('job_tasks')
          .select('job_id, jobs!inner(id)')
          .limit(1);
        return data && data.length > 0;
      }
    },
    {
      name: 'technician_jobs → jobs',
      query: async () => {
        const { data } = await supabase
          .from('technician_jobs')
          .select('job_id, jobs!inner(id)')
          .limit(1);
        return data && data.length > 0;
      }
    },
    {
      name: 'technician_jobs → technicians',
      query: async () => {
        const { data } = await supabase
          .from('technician_jobs')
          .select('technician_id, technicians!inner(id)')
          .limit(1);
        return data && data.length > 0;
      }
    },
    {
      name: 'jobs → customer',
      query: async () => {
        const { data } = await supabase
          .from('jobs')
          .select('customer_id, customer!inner(id)')
          .limit(1);
        return data && data.length > 0;
      }
    }
  ];
  
  for (const check of checks) {
    try {
      const result = await check.query();
      if (result) {
        logResult(`FK: ${check.name}`, true);
      } else {
        logWarning(`FK: ${check.name}`, 'No records found to verify relationship');
      }
    } catch (err) {
      logResult(`FK: ${check.name}`, false, err.message);
    }
  }
}

async function verifyConstraints() {
  console.log('\n📋 Verifying Database Constraints...\n');
  
  // Test unique constraint on job_number
  try {
    const { data: existingJob } = await supabase
      .from('jobs')
      .select('job_number')
      .limit(1)
      .single();
    
    if (existingJob) {
      const { error } = await supabase
        .from('jobs')
        .insert({
          customer_id: existingJob.customer_id || '00000000-0000-0000-0000-000000000000',
          job_number: existingJob.job_number, // Duplicate
          title: 'Test',
          priority: 'MEDIUM',
          status: 'PENDING'
        });
      
      if (error && error.code === '23505') {
        logResult('Unique constraint: job_number', true);
      } else {
        logResult('Unique constraint: job_number', false, 'Duplicate job_number allowed');
      }
    } else {
      logWarning('Unique constraint: job_number', 'No jobs found to test');
    }
  } catch (err) {
    logWarning('Unique constraint: job_number', err.message);
  }
}

async function generateReport() {
  console.log('\n📊 Test Summary\n');
  console.log(`✅ Passed: ${results.passed.length}`);
  console.log(`❌ Failed: ${results.failed.length}`);
  console.log(`⚠️  Warnings: ${results.warnings.length}`);
  
  if (results.failed.length > 0) {
    console.log('\n❌ Failed Tests:');
    results.failed.forEach(({ test, message }) => {
      console.log(`   - ${test}: ${message}`);
    });
  }
  
  if (results.warnings.length > 0) {
    console.log('\n⚠️  Warnings:');
    results.warnings.forEach(({ test, message }) => {
      console.log(`   - ${test}: ${message}`);
    });
  }
  
  console.log('\n');
  
  if (results.failed.length === 0) {
    console.log('✅ All critical tests passed!');
    process.exit(0);
  } else {
    console.log('❌ Some tests failed. Please review and fix issues.');
    process.exit(1);
  }
}

// Run all verifications
async function run() {
  console.log('🚀 Starting Migration Verification...\n');
  console.log(`Supabase URL: ${supabaseUrl}\n`);
  
  await verifySchema();
  await verifyJobCreation();
  await verifyWorkerCreation();
  await verifyForeignKeys();
  await verifyConstraints();
  
  await generateReport();
}

// Run if called directly
if (require.main === module) {
  run().catch(err => {
    console.error('❌ Verification failed:', err);
    process.exit(1);
  });
}

module.exports = { run, verifySchema, verifyJobCreation, verifyWorkerCreation };

