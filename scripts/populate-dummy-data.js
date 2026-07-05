/**
 * Comprehensive Dummy Data Population Script
 * Populates all tables with realistic test data for development/testing
 * 
 * Usage:
 *   node scripts/populate-dummy-data.js
 *   node scripts/populate-dummy-data.js --count 10  (create 10 of each)
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

// Dummy data generators
const firstNames = ['John', 'Jane', 'Michael', 'Sarah', 'David', 'Emily', 'Robert', 'Jessica', 'William', 'Amanda', 'James', 'Lisa', 'Richard', 'Michelle', 'Joseph', 'Kimberly'];
const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Wilson', 'Anderson', 'Thomas', 'Taylor'];
const cities = ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia', 'San Antonio', 'San Diego', 'Dallas', 'San Jose'];
const streets = ['Main St', 'Oak Ave', 'Park Blvd', 'Elm St', 'Maple Dr', 'Cedar Ln', 'Pine Rd', 'First St', 'Second Ave', 'Third Blvd'];
const companies = ['Tech Solutions Inc', 'Global Industries', 'Premier Services', 'Elite Corporation', 'Advanced Systems', 'Prime Solutions', 'Mega Corp', 'Super Services', 'Top Industries', 'Best Company'];
const jobTitles = ['AC Installation', 'AC Maintenance', 'AC Repair', 'Duct Cleaning', 'Filter Replacement', 'System Inspection', 'Emergency Repair', 'Preventive Maintenance', 'System Upgrade', 'Warranty Service'];
const taskNames = ['Inspect unit', 'Clean filters', 'Check refrigerant', 'Test electrical connections', 'Verify thermostat', 'Check ductwork', 'Test airflow', 'Document findings', 'Customer briefing', 'Final inspection'];
const equipmentTypes = ['Air Conditioner', 'Heat Pump', 'Furnace', 'Ductwork', 'Thermostat', 'Air Handler', 'Compressor', 'Evaporator Coil'];
const brands = ['Carrier', 'Trane', 'Lennox', 'Rheem', 'Goodman', 'York', 'Daikin', 'Mitsubishi'];

// Helper functions
function randomElement(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDate(start, end) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function formatDate(date) {
  return date.toISOString().split('T')[0];
}

function formatTime(date) {
  return date.toTimeString().slice(0, 5);
}

// Get existing technicians
async function getTechnicians() {
  const { data, error } = await supabase
    .from('technicians')
    .select('id, user_id, full_name')
    .is('deleted_at', null);
  
  if (error) throw error;
  return data || [];
}

// Create customers
async function createCustomers(count = 5) {
  console.log(`\n📦 Creating ${count} customers...`);
  const customers = [];
  
  for (let i = 0; i < count; i++) {
    const customerCode = `CUST${String(i + 1).padStart(4, '0')}`;
    const companyName = randomElement(companies);
    const city = randomElement(cities);
    const street = randomElement(streets);
    const streetNumber = randomInt(100, 9999);
    
    const { data, error } = await supabase
      .from('customer')
      .insert({
        customer_code: customerCode,
        customer_name: companyName,
        customer_address: `${streetNumber} ${street}, ${city}`,
        phone_number: `+1-${randomInt(200, 999)}-${randomInt(200, 999)}-${randomInt(1000, 9999)}`,
        email: `contact@${companyName.toLowerCase().replace(/\s+/g, '')}.com`
      })
      .select()
      .single();
    
    if (error) {
      console.error(`   ❌ Error creating customer ${customerCode}:`, error.message);
    } else {
      customers.push(data);
      console.log(`   ✅ Created customer: ${customerCode} - ${companyName}`);
    }
  }
  
  return customers;
}

// Create contacts for customers
async function createContacts(customers) {
  console.log(`\n👤 Creating contacts for customers...`);
  const contacts = [];
  
  for (const customer of customers) {
    // Create 1-3 contacts per customer
    const contactCount = randomInt(1, 3);
    
    for (let i = 0; i < contactCount; i++) {
      const firstName = randomElement(firstNames);
      const lastName = randomElement(lastNames);
      const middleName = Math.random() > 0.7 ? randomElement(firstNames) : null;
      
      const { data, error } = await supabase
        .from('contacts')
        .insert({
          customer_id: customer.id,
          first_name: firstName,
          middle_name: middleName,
          last_name: lastName,
          tel1: `+1-${randomInt(200, 999)}-${randomInt(200, 999)}-${randomInt(1000, 9999)}`,
          tel2: Math.random() > 0.5 ? `+1-${randomInt(200, 999)}-${randomInt(200, 999)}-${randomInt(1000, 9999)}` : null,
          email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${customer.customer_name.toLowerCase().replace(/\s+/g, '')}.com`
        })
        .select()
        .single();
      
      if (error) {
        console.error(`   ❌ Error creating contact for ${customer.customer_code}:`, error.message);
      } else {
        contacts.push(data);
        console.log(`   ✅ Created contact: ${firstName} ${lastName} for ${customer.customer_code}`);
      }
    }
  }
  
  return contacts;
}

// Create locations for customers
async function createLocations(customers) {
  console.log(`\n📍 Creating locations for customers...`);
  const locations = [];
  
  for (const customer of customers) {
    // Create 1-2 locations per customer
    const locationCount = randomInt(1, 2);
    
    for (let i = 0; i < locationCount; i++) {
      const city = randomElement(cities);
      const street = randomElement(streets);
      const streetNumber = randomInt(100, 9999);
      const lat = (40.7 + Math.random() * 0.5).toFixed(6);
      const lng = (-74.0 + Math.random() * 0.5).toFixed(6);
      
      const { data, error } = await supabase
        .from('locations')
        .insert({
          customer_id: customer.id,
          location_name: `${customer.customer_name} - ${i === 0 ? 'Main Office' : 'Branch Office'}`,
          current_latitude: lat,
          current_longitude: lng,
          destination_latitude: lat,
          destination_longitude: lng
        })
        .select()
        .single();
      
      if (error) {
        console.error(`   ❌ Error creating location for ${customer.customer_code}:`, error.message);
      } else {
        locations.push(data);
        console.log(`   ✅ Created location: ${data.location_name}`);
      }
    }
  }
  
  return locations;
}

// Create equipments for customers
async function createEquipments(customers, locations) {
  console.log(`\n🔧 Creating equipments for customers...`);
  const equipments = [];
  
  for (const customer of customers) {
    // Create 2-5 equipments per customer
    const equipmentCount = randomInt(2, 5);
    const customerLocations = locations.filter(l => l.customer_id === customer.id);
    
    for (let i = 0; i < equipmentCount; i++) {
      const equipmentType = randomElement(equipmentTypes);
      const brand = randomElement(brands);
      const itemCode = `${customer.customer_code}-EQ${String(i + 1).padStart(3, '0')}`;
      const serialNumber = `SN${randomInt(100000, 999999)}`;
      const modelSeries = `Model-${randomInt(100, 999)}`;
      
      const warrantyStart = randomDate(new Date(2020, 0, 1), new Date());
      const warrantyEnd = new Date(warrantyStart);
      warrantyEnd.setFullYear(warrantyEnd.getFullYear() + randomInt(1, 5));
      
      const { data, error } = await supabase
        .from('equipments')
        .insert({
          customer_id: customer.id,
          item_code: itemCode,
          serial_number: serialNumber,
          model_series: modelSeries,
          item_group: equipmentType,
          brand: brand,
          item_name: `${brand} ${equipmentType}`,
          equipment_location: customerLocations.length > 0 ? customerLocations[0].location_name : 'Main Location',
          warranty_start_date: formatDate(warrantyStart),
          warranty_end_date: formatDate(warrantyEnd),
          equipment_type: equipmentType,
          notes: `Installed at ${customer.customer_name}`
        })
        .select()
        .single();
      
      if (error) {
        console.error(`   ❌ Error creating equipment for ${customer.customer_code}:`, error.message);
      } else {
        equipments.push(data);
        console.log(`   ✅ Created equipment: ${itemCode} - ${brand} ${equipmentType}`);
      }
    }
  }
  
  return equipments;
}

// Create service calls
async function createServiceCalls(customers) {
  console.log(`\n📞 Creating service calls...`);
  const serviceCalls = [];
  
  for (const customer of customers) {
    // Create 0-2 service calls per customer
    const callCount = randomInt(0, 2);
    
    for (let i = 0; i < callCount; i++) {
      const callNumber = `SC-${customer.customer_code}-${String(i + 1).padStart(3, '0')}`;
      const status = randomElement(['OPEN', 'IN_PROGRESS', 'CLOSED']);
      const priority = randomElement(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);
      const subject = randomElement(['AC Not Working', 'Maintenance Request', 'Emergency Repair', 'System Upgrade', 'Warranty Claim']);
      
      const { data, error } = await supabase
        .from('service_call')
        .insert({
          customer_id: customer.id,
          call_number: callNumber,
          subject: subject,
          status: status,
          description: `Service call for ${subject} at ${customer.customer_name}`,
          priority: priority
        })
        .select()
        .single();
      
      if (error) {
        console.error(`   ❌ Error creating service call for ${customer.customer_code}:`, error.message);
      } else {
        serviceCalls.push(data);
        console.log(`   ✅ Created service call: ${callNumber} - ${subject}`);
      }
    }
  }
  
  return serviceCalls;
}

// Create jobs with all related data
async function createJobs(customers, locations, contacts, equipments, serviceCalls, technicians) {
  console.log(`\n💼 Creating jobs...`);
  const jobs = [];
  
  if (technicians.length === 0) {
    console.log('   ⚠️  No technicians found. Jobs will be created without assignments.');
  }
  
  for (let i = 0; i < customers.length; i++) {
    const customer = customers[i];
    const customerLocations = locations.filter(l => l.customer_id === customer.id);
    const customerContacts = contacts.filter(c => c.customer_id === customer.id);
    const customerEquipments = equipments.filter(e => e.customer_id === customer.id);
    const customerServiceCalls = serviceCalls.filter(sc => sc.customer_id === customer.id);
    
    if (customerLocations.length === 0) continue;
    
    // Create 1-3 jobs per customer
    const jobCount = randomInt(1, 3);
    
    for (let j = 0; j < jobCount; j++) {
      const year = new Date().getFullYear();
      const jobNumber = `${year}-${String(i * 3 + j + 1).padStart(6, '0')}`;
      const jobTitle = randomElement(jobTitles);
      const priority = randomElement(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);
      const status = randomElement(['PENDING', 'IN_PROGRESS', 'UPCOMING', 'COMPLETED']);
      
      const startDate = randomDate(new Date(), new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
      const endDate = new Date(startDate);
      endDate.setHours(endDate.getHours() + randomInt(2, 8));
      
      // Create job
      const { data: job, error: jobError } = await supabase
        .from('jobs')
        .insert({
          customer_id: customer.id,
          location_id: customerLocations[0].id,
          service_call_id: customerServiceCalls.length > 0 && Math.random() > 0.5 ? customerServiceCalls[0].id : null,
          job_number: jobNumber,
          title: jobTitle,
          description: `${jobTitle} for ${customer.customer_name}. Professional service with quality guarantee.`,
          priority: priority,
          status: status,
          scheduled_start: startDate.toISOString(),
          scheduled_end: endDate.toISOString()
        })
        .select()
        .single();
      
      if (jobError) {
        console.error(`   ❌ Error creating job:`, jobError.message);
        continue;
      }
      
      console.log(`   ✅ Created job: ${jobNumber} - ${jobTitle}`);
      
      // Create job tasks
      const taskCount = randomInt(2, 5);
      for (let t = 0; t < taskCount; t++) {
        const taskName = randomElement(taskNames);
        
        await supabase
          .from('job_tasks')
          .insert({
            job_id: job.id,
            task_name: taskName,
            task_description: `Complete ${taskName} for job ${jobNumber}`,
            task_order: t + 1,
            is_required: Math.random() > 0.3
          });
      }
      console.log(`      ✅ Created ${taskCount} tasks`);
      
      // Create technician assignments
      if (technicians.length > 0) {
        const assignedTechnicians = technicians.slice(0, randomInt(1, Math.min(3, technicians.length)));
        for (const tech of assignedTechnicians) {
          await supabase
            .from('technician_jobs')
            .insert({
              technician_id: tech.id,
              job_id: job.id,
              assignment_status: randomElement(['ASSIGNED', 'STARTED', 'COMPLETED'])
            });
        }
        console.log(`      ✅ Assigned ${assignedTechnicians.length} technicians`);
      }
      
      // Create job contact type
      if (customerContacts.length > 0) {
        const contact = randomElement(customerContacts);
        await supabase
          .from('job_contact_type')
          .insert({
            job_id: job.id,
            code: randomInt(1, 5),
            name: `${contact.first_name} ${contact.last_name}`
          });
        console.log(`      ✅ Created job contact type`);
      }
      
      // Create job equipments
      if (customerEquipments.length > 0) {
        const selectedEquipments = customerEquipments.slice(0, randomInt(1, Math.min(3, customerEquipments.length)));
        for (const equipment of selectedEquipments) {
          await supabase
            .from('job_equipments')
            .insert({
              job_id: job.id,
              equipment_id: equipment.id,
              quantity_used: randomInt(1, 3),
              notes: `Using ${equipment.item_name} for job ${jobNumber}`
            });
        }
        console.log(`      ✅ Linked ${selectedEquipments.length} equipments`);
      }
      
      // Create job schedule
      await supabase
        .from('job_schedule')
        .insert({
          job_id: job.id,
          jsdate: formatDate(startDate),
          jedate: formatDate(endDate),
          jstime: formatTime(startDate),
          jetime: formatTime(endDate),
          dur_type: 'hours',
          dur: String(Math.round((endDate - startDate) / (1000 * 60 * 60))),
          address: customerLocations[0].location_name || customer.customer_address
        });
      console.log(`      ✅ Created job schedule`);
      
      jobs.push(job);
    }
  }
  
  return jobs;
}

// Create worker schedules
async function createWorkerSchedules(technicians) {
  console.log(`\n📅 Creating worker schedules...`);
  
  if (technicians.length === 0) {
    console.log('   ⚠️  No technicians found. Skipping worker schedules.');
    return;
  }
  
  // Note: Schedules might be stored in a different table or format
  // This is a placeholder - adjust based on your actual schedule storage
  console.log('   ℹ️  Worker schedules are typically managed through the calendar interface.');
  console.log('   ℹ️  Use the schedule creation UI to add schedules for workers.');
}

// Main function
async function populateData() {
  const args = process.argv.slice(2);
  const countIndex = args.indexOf('--count');
  const count = countIndex !== -1 && args[countIndex + 1] ? parseInt(args[countIndex + 1]) : 5;
  
  console.log('🚀 Starting dummy data population...');
  console.log(`📊 Will create ${count} of each main entity\n`);
  
  try {
    // Get existing technicians
    const technicians = await getTechnicians();
    console.log(`👷 Found ${technicians.length} existing technicians`);
    
    // Create customers
    const customers = await createCustomers(count);
    
    // Create contacts
    const contacts = await createContacts(customers);
    
    // Create locations
    const locations = await createLocations(customers);
    
    // Create equipments
    const equipments = await createEquipments(customers, locations);
    
    // Create service calls
    const serviceCalls = await createServiceCalls(customers);
    
    // Create jobs with all related data
    const jobs = await createJobs(customers, locations, contacts, equipments, serviceCalls, technicians);
    
    // Create worker schedules
    await createWorkerSchedules(technicians);
    
    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('✅ Dummy data population complete!');
    console.log('='.repeat(50));
    console.log(`📦 Customers: ${customers.length}`);
    console.log(`👤 Contacts: ${contacts.length}`);
    console.log(`📍 Locations: ${locations.length}`);
    console.log(`🔧 Equipments: ${equipments.length}`);
    console.log(`📞 Service Calls: ${serviceCalls.length}`);
    console.log(`💼 Jobs: ${jobs.length}`);
    console.log(`👷 Technicians: ${technicians.length}`);
    console.log('\n🎉 All dummy data has been created successfully!');
    
  } catch (error) {
    console.error('\n❌ Error populating data:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  populateData()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { populateData };

