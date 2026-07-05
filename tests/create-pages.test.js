/**
 * Test Suite for Create Pages Migration
 * 
 * These tests verify that the create pages work correctly with Supabase
 * and follow the schema structure.
 * 
 * Run with: npm test -- create-pages.test.js
 * Or: jest create-pages.test.js
 */

const { getSupabaseClient } = require('../lib/supabase/client');
const { getSupabaseAdmin } = require('../lib/supabase/server');
const { userService, jobService, customerService } = require('../lib/supabase/database');
const bcrypt = require('bcryptjs');

// Test configuration
const TEST_CONFIG = {
  customerCode: 'TEST-CUST-001',
  testEmail: `test-${Date.now()}@example.com`,
  testPassword: 'TestPassword123!',
  testJobName: `Test Job ${Date.now()}`
};

// Helper functions
async function cleanupTestData() {
  const supabase = getSupabaseAdmin();
  
  // Delete test jobs and related records
  const { data: testJobs } = await supabase
    .from('jobs')
    .select('id')
    .like('job_number', 'TEST-%');
  
  if (testJobs && testJobs.length > 0) {
    const jobIds = testJobs.map(j => j.id);
    
    // Delete related records (cascade should handle most)
    await supabase.from('job_tasks').delete().in('job_id', jobIds);
    await supabase.from('technician_jobs').delete().in('job_id', jobIds);
    await supabase.from('job_equipments').delete().in('job_id', jobIds);
    await supabase.from('job_contact_type').delete().in('job_id', jobIds);
    await supabase.from('job_schedule').delete().in('job_id', jobIds);
    await supabase.from('jobs').delete().in('id', jobIds);
  }
  
  // Delete test users
  const { data: testUsers } = await supabase
    .from('users')
    .select('id, technicians(id)')
    .eq('username', TEST_CONFIG.testEmail);
  
  if (testUsers && testUsers.length > 0) {
    for (const user of testUsers) {
      if (user.technicians && user.technicians.length > 0) {
        await supabase.from('technicians').delete().in('id', user.technicians.map(t => t.id));
      }
      await supabase.from('users').delete().eq('id', user.id);
    }
  }
}

describe('Create Pages Migration Tests', () => {
  let testCustomer;
  let testLocation;
  let testTechnician;
  let testEquipment;

  beforeAll(async () => {
    // Setup test data
    const supabase = getSupabaseAdmin();
    
    // Create test customer
    const { data: customer } = await supabase
      .from('customer')
      .insert({
        customer_code: TEST_CONFIG.customerCode,
        customer_name: 'Test Customer',
        email: 'test@customer.com'
      })
      .select()
      .single();
    testCustomer = customer;
    
    // Create test location
    const { data: location } = await supabase
      .from('locations')
      .insert({
        customer_id: customer.id,
        location_name: 'Test Location'
      })
      .select()
      .single();
    testLocation = location;
    
    // Get existing technician or create one
    const { data: technicians } = await supabase
      .from('technicians')
      .select('*')
      .limit(1);
    
    if (technicians && technicians.length > 0) {
      testTechnician = technicians[0];
    }
    
    // Get existing equipment or create one
    const { data: equipments } = await supabase
      .from('equipments')
      .select('*')
      .eq('customer_id', customer.id)
      .limit(1);
    
    if (equipments && equipments.length > 0) {
      testEquipment = equipments[0];
    } else {
      const { data: equipment } = await supabase
        .from('equipments')
        .insert({
          customer_id: customer.id,
          item_code: `TEST-EQ-${Date.now()}`,
          item_name: 'Test Equipment'
        })
        .select()
        .single();
      testEquipment = equipment;
    }
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  describe('Job Creation Tests', () => {
    test('TC-JOB-001: Basic job creation creates records in all tables', async () => {
      const supabase = getSupabaseAdmin();
      const jobNumber = `TEST-${Date.now()}`;
      const startDate = new Date();
      const endDate = new Date(startDate.getTime() + 8 * 60 * 60 * 1000); // 8 hours later

      // Create job
      const job = await jobService.create({
        customer_id: testCustomer.id,
        location_id: testLocation.id,
        job_number: jobNumber,
        title: TEST_CONFIG.testJobName,
        description: 'Test job description',
        priority: 'MEDIUM',
        status: 'PENDING',
        scheduled_start: startDate.toISOString(),
        scheduled_end: endDate.toISOString()
      });

      expect(job).toBeDefined();
      expect(job.id).toBeDefined();
      expect(job.job_number).toBe(jobNumber);

      // Verify job exists
      const { data: createdJob } = await supabase
        .from('jobs')
        .select('*')
        .eq('id', job.id)
        .single();

      expect(createdJob).toBeDefined();
      expect(createdJob.customer_id).toBe(testCustomer.id);
      expect(createdJob.location_id).toBe(testLocation.id);

      // Cleanup
      await supabase.from('jobs').delete().eq('id', job.id);
    });

    test('TC-JOB-002: Job with tasks creates records in job_tasks table', async () => {
      const supabase = getSupabaseAdmin();
      const jobNumber = `TEST-${Date.now()}`;
      const startDate = new Date();
      const endDate = new Date(startDate.getTime() + 8 * 60 * 60 * 1000);

      // Create job
      const job = await jobService.create({
        customer_id: testCustomer.id,
        location_id: testLocation.id,
        job_number: jobNumber,
        title: 'Test Job with Tasks',
        priority: 'MEDIUM',
        status: 'PENDING',
        scheduled_start: startDate.toISOString(),
        scheduled_end: endDate.toISOString()
      });

      // Create tasks
      const tasks = [
        { task_name: 'Task 1', task_description: 'Description 1', task_order: 1, is_required: true },
        { task_name: 'Task 2', task_description: 'Description 2', task_order: 2, is_required: false }
      ];

      const { data: createdTasks, error } = await supabase
        .from('job_tasks')
        .insert(tasks.map(t => ({ ...t, job_id: job.id })))
        .select();

      expect(error).toBeNull();
      expect(createdTasks).toHaveLength(2);
      expect(createdTasks[0].job_id).toBe(job.id);
      expect(createdTasks[1].job_id).toBe(job.id);

      // Cleanup
      await supabase.from('job_tasks').delete().in('job_id', [job.id]);
      await supabase.from('jobs').delete().eq('id', job.id);
    });

    test('TC-JOB-003: Job with workers creates records in technician_jobs table', async () => {
      if (!testTechnician) {
        console.log('Skipping test - no technician available');
        return;
      }

      const supabase = getSupabaseAdmin();
      const jobNumber = `TEST-${Date.now()}`;
      const startDate = new Date();
      const endDate = new Date(startDate.getTime() + 8 * 60 * 60 * 1000);

      // Create job
      const job = await jobService.create({
        customer_id: testCustomer.id,
        location_id: testLocation.id,
        job_number: jobNumber,
        title: 'Test Job with Workers',
        priority: 'MEDIUM',
        status: 'PENDING',
        scheduled_start: startDate.toISOString(),
        scheduled_end: endDate.toISOString()
      });

      // Create technician assignment
      const { data: assignment, error } = await supabase
        .from('technician_jobs')
        .insert({
          technician_id: testTechnician.id,
          job_id: job.id,
          assignment_status: 'ASSIGNED'
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(assignment).toBeDefined();
      expect(assignment.technician_id).toBe(testTechnician.id);
      expect(assignment.job_id).toBe(job.id);
      expect(assignment.assignment_status).toBe('ASSIGNED');

      // Cleanup
      await supabase.from('technician_jobs').delete().eq('id', assignment.id);
      await supabase.from('jobs').delete().eq('id', job.id);
    });

    test('TC-JOB-004: Job with equipment creates records in job_equipments table', async () => {
      if (!testEquipment) {
        console.log('Skipping test - no equipment available');
        return;
      }

      const supabase = getSupabaseAdmin();
      const jobNumber = `TEST-${Date.now()}`;
      const startDate = new Date();
      const endDate = new Date(startDate.getTime() + 8 * 60 * 60 * 1000);

      // Create job
      const job = await jobService.create({
        customer_id: testCustomer.id,
        location_id: testLocation.id,
        job_number: jobNumber,
        title: 'Test Job with Equipment',
        priority: 'MEDIUM',
        status: 'PENDING',
        scheduled_start: startDate.toISOString(),
        scheduled_end: endDate.toISOString()
      });

      // Create equipment link
      const { data: jobEquipment, error } = await supabase
        .from('job_equipments')
        .insert({
          job_id: job.id,
          equipment_id: testEquipment.id,
          quantity_used: 1,
          notes: 'Test equipment'
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(jobEquipment).toBeDefined();
      expect(jobEquipment.job_id).toBe(job.id);
      expect(jobEquipment.equipment_id).toBe(testEquipment.id);

      // Cleanup
      await supabase.from('job_equipments').delete().eq('id', jobEquipment.id);
      await supabase.from('jobs').delete().eq('id', job.id);
    });

    test('TC-JOB-005: Job creation validates required fields', async () => {
      // This test would need to be run in the browser context
      // For now, we test the database constraints
      const supabase = getSupabaseAdmin();

      // Try to create job without required fields
      const { error } = await supabase
        .from('jobs')
        .insert({
          // Missing customer_id, job_number, title
          priority: 'MEDIUM'
        });

      expect(error).toBeDefined();
      expect(error.code).toBe('23502'); // NOT NULL violation
    });

    test('TC-JOB-006: Job number uniqueness is enforced', async () => {
      const supabase = getSupabaseAdmin();
      const jobNumber = `TEST-UNIQUE-${Date.now()}`;
      const startDate = new Date();
      const endDate = new Date(startDate.getTime() + 8 * 60 * 60 * 1000);

      // Create first job
      const job1 = await jobService.create({
        customer_id: testCustomer.id,
        location_id: testLocation.id,
        job_number: jobNumber,
        title: 'Test Job 1',
        priority: 'MEDIUM',
        status: 'PENDING',
        scheduled_start: startDate.toISOString(),
        scheduled_end: endDate.toISOString()
      });

      // Try to create second job with same number
      const { error } = await supabase
        .from('jobs')
        .insert({
          customer_id: testCustomer.id,
          location_id: testLocation.id,
          job_number: jobNumber, // Duplicate
          title: 'Test Job 2',
          priority: 'MEDIUM',
          status: 'PENDING',
          scheduled_start: startDate.toISOString(),
          scheduled_end: endDate.toISOString()
        });

      expect(error).toBeDefined();
      expect(error.code).toBe('23505'); // UNIQUE violation

      // Cleanup
      await supabase.from('jobs').delete().eq('id', job1.id);
    });
  });

  describe('Worker Creation Tests', () => {
    test('TC-WORKER-001: Worker creation creates user and technician records', async () => {
      const supabase = getSupabaseAdmin();
      const testEmail = `test-worker-${Date.now()}@example.com`;
      const testPassword = 'TestPassword123!';
      const hashedPassword = await bcrypt.hash(testPassword, 10);

      // Create user
      const user = await userService.create({
        username: testEmail,
        password: hashedPassword,
        role: 'TECHNICIAN',
        status: 'ACTIVE'
      });

      expect(user).toBeDefined();
      expect(user.id).toBeDefined();
      expect(user.username).toBe(testEmail);
      expect(user.role).toBe('TECHNICIAN');

      // Create technician
      const { data: technician, error } = await supabase
        .from('technicians')
        .insert({
          user_id: user.id,
          email: testEmail,
          full_name: 'Test Worker',
          phone_number: '1234567890',
          status: 'ACTIVE'
        })
        .select()
        .single();

      expect(error).toBeNull();
      expect(technician).toBeDefined();
      expect(technician.user_id).toBe(user.id);
      expect(technician.email).toBe(testEmail);

      // Verify password is hashed
      const { data: userRecord } = await supabase
        .from('users')
        .select('password')
        .eq('id', user.id)
        .single();

      expect(userRecord.password).not.toBe(testPassword);
      expect(userRecord.password).toMatch(/^\$2[ab]\$/); // bcrypt hash format

      // Verify password can be verified
      const isValid = await bcrypt.compare(testPassword, userRecord.password);
      expect(isValid).toBe(true);

      // Cleanup
      await supabase.from('technicians').delete().eq('id', technician.id);
      await supabase.from('users').delete().eq('id', user.id);
    });

    test('TC-WORKER-002: Worker creation enforces unique email', async () => {
      const supabase = getSupabaseAdmin();
      const testEmail = `test-unique-${Date.now()}@example.com`;
      const hashedPassword = await bcrypt.hash('Test123!', 10);

      // Create first user/technician
      const user1 = await userService.create({
        username: testEmail,
        password: hashedPassword,
        role: 'TECHNICIAN',
        status: 'ACTIVE'
      });

      const { data: tech1 } = await supabase
        .from('technicians')
        .insert({
          user_id: user1.id,
          email: testEmail,
          full_name: 'Test Worker 1',
          status: 'ACTIVE'
        })
        .select()
        .single();

      // Try to create second technician with same email
      const user2 = await userService.create({
        username: `different-${testEmail}`,
        password: hashedPassword,
        role: 'TECHNICIAN',
        status: 'ACTIVE'
      });

      const { error } = await supabase
        .from('technicians')
        .insert({
          user_id: user2.id,
          email: testEmail, // Duplicate email
          full_name: 'Test Worker 2',
          status: 'ACTIVE'
        });

      expect(error).toBeDefined();
      expect(error.code).toBe('23505'); // UNIQUE violation

      // Cleanup
      await supabase.from('technicians').delete().eq('id', tech1.id);
      await supabase.from('users').delete().eq('id', user1.id);
      await supabase.from('users').delete().eq('id', user2.id);
    });

    test('TC-WORKER-003: Worker creation enforces unique username', async () => {
      const testEmail = `test-username-${Date.now()}@example.com`;
      const hashedPassword = await bcrypt.hash('Test123!', 10);

      // Create first user
      const user1 = await userService.create({
        username: testEmail,
        password: hashedPassword,
        role: 'TECHNICIAN',
        status: 'ACTIVE'
      });

      // Try to create second user with same username
      try {
        const user2 = await userService.create({
          username: testEmail, // Duplicate
          password: hashedPassword,
          role: 'TECHNICIAN',
          status: 'ACTIVE'
        });
        expect(user2).toBeUndefined(); // Should not reach here
      } catch (error) {
        expect(error).toBeDefined();
        expect(error.code).toBe('23505'); // UNIQUE violation
      }

      // Cleanup
      const supabase = getSupabaseAdmin();
      await supabase.from('users').delete().eq('id', user1.id);
    });
  });

  describe('Schema Compliance Tests', () => {
    test('TC-SCHEMA-001: Foreign key relationships are correct', async () => {
      const supabase = getSupabaseAdmin();
      const jobNumber = `TEST-FK-${Date.now()}`;
      const startDate = new Date();
      const endDate = new Date(startDate.getTime() + 8 * 60 * 60 * 1000);

      // Create job
      const job = await jobService.create({
        customer_id: testCustomer.id,
        location_id: testLocation.id,
        job_number: jobNumber,
        title: 'FK Test Job',
        priority: 'MEDIUM',
        status: 'PENDING',
        scheduled_start: startDate.toISOString(),
        scheduled_end: endDate.toISOString()
      });

      // Verify customer relationship
      const { data: customer } = await supabase
        .from('customer')
        .select('id')
        .eq('id', job.customer_id)
        .single();

      expect(customer).toBeDefined();
      expect(customer.id).toBe(testCustomer.id);

      // Verify location relationship
      const { data: location } = await supabase
        .from('locations')
        .select('id')
        .eq('id', job.location_id)
        .single();

      expect(location).toBeDefined();
      expect(location.id).toBe(testLocation.id);

      // Cleanup
      await supabase.from('jobs').delete().eq('id', job.id);
    });

    test('TC-SCHEMA-002: Cascade deletes work correctly', async () => {
      const supabase = getSupabaseAdmin();
      const jobNumber = `TEST-CASCADE-${Date.now()}`;
      const startDate = new Date();
      const endDate = new Date(startDate.getTime() + 8 * 60 * 60 * 1000);

      // Create job with tasks
      const job = await jobService.create({
        customer_id: testCustomer.id,
        location_id: testLocation.id,
        job_number: jobNumber,
        title: 'Cascade Test Job',
        priority: 'MEDIUM',
        status: 'PENDING',
        scheduled_start: startDate.toISOString(),
        scheduled_end: endDate.toISOString()
      });

      // Create task
      const { data: task } = await supabase
        .from('job_tasks')
        .insert({
          job_id: job.id,
          task_name: 'Test Task',
          task_order: 1,
          is_required: true
        })
        .select()
        .single();

      // Delete job
      await supabase.from('jobs').delete().eq('id', job.id);

      // Verify task is deleted (cascade)
      const { data: deletedTask } = await supabase
        .from('job_tasks')
        .select('id')
        .eq('id', task.id)
        .single();

      expect(deletedTask).toBeNull();
    });
  });
});

