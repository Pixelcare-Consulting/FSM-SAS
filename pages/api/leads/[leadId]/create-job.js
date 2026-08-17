/**
 * API endpoint to create a temporary job from a lead
 * POST /api/leads/:leadId/create-job
 */

import { leadService, customerService, jobService } from '../../../../lib/supabase/database';
import { getSupabaseAdmin } from '../../../../lib/supabase/server';
import sapService from '../../../../lib/services/sapService';
import { syncJobToSAP } from '../../../../lib/services/jobSyncToSap';
import { transformToSAPBusinessPartner, validateBusinessPartnerData } from '../../../../lib/utils/sapBusinessPartnerTransform';
import { ensurePortalCustomerPrimaryContact } from '../../../../lib/customers/ensurePortalCustomerPrimaryContact';
import { buildSingaporeDateTimeUtc, toSingaporeTimeHm } from '../../../../lib/utils/singaporeDateTime';
import { buildLeadLocationName, getCustomerAddressFromLead } from '../../../../lib/utils/leadLocationName';
import { ensurePortalCustomerAddressFromLead } from '../../../../lib/customers/ensurePortalCustomerAddressFromLead';
import { insertPortalDefaultJobContactType } from '../../../../lib/jobs/portalDefaultJobContactType';
import { getNextJobNumber } from '../../../../lib/jobs/getNextJobNumber';
import {
  writeAuditLogFromRequest,
  logJobSyncResult,
  AUDIT_ACTIONS,
  AUDIT_CATEGORIES,
  AUDIT_STATUS,
} from '../../../../lib/services/auditLog';

/** Format a Date as a Singapore-local HH:mm:ss TIME string for job_schedule. */
function toSingaporeScheduleTime(dateValue) {
  if (!dateValue) return null;
  const hm = toSingaporeTimeHm(dateValue);
  return hm ? `${hm}:00` : null;
}

/**
 * Insert a job_schedule row for a lead-generated job so the UI shows a duration.
 * Lead jobs default to a 1-hour duration. Non-fatal: never blocks job creation.
 */
async function insertLeadJobSchedule(supabase, jobId, serviceDate, scheduledStart, scheduledEnd, address) {
  try {
    const { error } = await supabase.from('job_schedule').insert({
      job_id: jobId,
      jsdate: serviceDate,
      jedate: serviceDate,
      jstime: toSingaporeScheduleTime(scheduledStart),
      jetime: toSingaporeScheduleTime(scheduledEnd),
      dur_type: 'hours',
      dur: '1.00',
      address: address || null,
    });
    if (error) {
      console.warn(`create-job: job_schedule insert failed for ${jobId}: ${error.message}`);
    }
  } catch (scheduleError) {
    console.warn(`create-job: job_schedule insert failed for ${jobId}:`, scheduleError?.message);
  }
}

export default async function handler(req, res) {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { leadId } = req.query;
    const {
      use_first_service_date = true,
      use_second_service_date = false,
      use_third_service_date = false,
      use_fourth_service_date = false,
      job_title = null,
      job_description = null,
      priority = 'MEDIUM',
      status = 'CREATED'
    } = req.body;

    if (!leadId) {
      return res.status(400).json({ error: 'Lead ID is required' });
    }

    // Get the lead
    const lead = await leadService.findById(leadId);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    // Check if lead already has a customer
    let customerId = lead.customer_id;
    let customer = null;

    const supabase = getSupabaseAdmin();

    if (!customerId) {
      // Create customer from lead using same CP numbering as portal customers (merge leads with Portal)
      let customerCode;
      try {
        customerCode = await customerService.getNextPortalCardCode(supabase);
      } catch (err) {
        console.error('Get next portal card code error:', err);
        return res.status(500).json({
          error: 'Failed to generate customer code',
          message: err.message || 'Please try again.'
        });
      }

      // Check if customer with this email already exists
      // Note: This assumes the customer table has an email column
      // If not, we'll just create a new customer
      let existingCustomer = null;
      try {
        const { data } = await supabase
          .from('customer')
          .select('id, customer_code, customer_name, phone_number, email')
          .eq('email', lead.email)
          .is('deleted_at', null)
          .maybeSingle();
        existingCustomer = data;
      } catch (emailQueryError) {
        // If email column doesn't exist or query fails, just proceed to create
        console.warn('Could not query customer by email, will create new customer:', emailQueryError.message);
      }

      if (existingCustomer) {
        customerId = existingCustomer.id;
        customer = existingCustomer;
      } else {
        // Create new customer
        // Only include email if the column exists in the schema
        const customerData = {
          customer_code: customerCode,
          customer_name: lead.full_name,
          phone_number: lead.handphone || null,
          source: 'portal',
          // Link back to originating lead for traceability
          lead_id: leadId
        };
        
        // Try to add email if column exists (will be ignored if column doesn't exist)
        try {
          customerData.email = lead.email;
        } catch (e) {
          // Email column might not exist, that's okay
        }
        
        customer = await customerService.create(customerData, supabase);
        customerId = customer.id;

        // Sync customer to SAP (non-blocking - don't fail job creation if SAP sync fails)
        try {
          const sessionCookies = sapService.getSessionCookies(req);
          if (sessionCookies) {
            const customerCodeVal = customer.customer_code;
            const isSAPCardCode = typeof customerCodeVal === 'string' && /^[A-Za-z0-9]{1,15}$/.test(customerCodeVal);
            let shouldCreateInSAP = true;
            if (isSAPCardCode) {
              const existsInSAP = await sapService.businessPartnerExists(customerCodeVal, sessionCookies);
              if (existsInSAP) {
                console.log(`ℹ️ Customer ${customerCodeVal} already exists in SAP`);
                shouldCreateInSAP = false;
              }
            }
            if (shouldCreateInSAP) {
              const sapBusinessPartnerData = transformToSAPBusinessPartner(customer, lead);
              const validation = validateBusinessPartnerData(sapBusinessPartnerData);
              if (validation.isValid) {
                const createdBP = await sapService.createBusinessPartner(sapBusinessPartnerData, sessionCookies);
                console.log(`✅ Customer created in SAP with CardCode: ${createdBP.CardCode || 'N/A'}`);
                if (createdBP.CardCode) {
                  await customerService.update(customer.id, {
                    customer_code: createdBP.CardCode
                  });
                  customer.customer_code = createdBP.CardCode;
                  console.log(`✅ Updated customer_code to SAP-generated CardCode: ${createdBP.CardCode}`);
                }
              } else {
                console.warn(`⚠️ SAP sync validation failed for customer ${customer.customer_code}:`, validation.errors);
              }
            }
          } else {
            console.log(`ℹ️ No SAP session available, skipping sync for customer ${customer.customer_code}`);
          }
        } catch (syncError) {
          // Don't fail job creation if SAP sync fails
          console.warn(`⚠️ SAP sync failed for customer ${customer.customer_code} (non-blocking):`, syncError.message);
        }
      }
    } else {
      // Get existing customer
      const { data: existingCustomer } = await supabase
        .from('customer')
        .select('id, customer_code, customer_name, phone_number, email')
        .eq('id', customerId)
        .is('deleted_at', null)
        .maybeSingle();

      if (existingCustomer) {
        customer = existingCustomer;
      }
    }

    try {
      await ensurePortalCustomerPrimaryContact({
        supabase,
        customerId,
        customerName: customer?.customer_name || lead.full_name || lead.email || '',
        phoneNumber: customer?.phone_number || lead.handphone || '',
        email: customer?.email || lead.email || ''
      });
    } catch (contactError) {
      console.warn('Failed to ensure portal customer primary contact:', contactError?.message);
    }

    // Create or find location from lead address
    let locationId = null;
    const locationName = buildLeadLocationName(lead);

    // Check if location exists for this customer
    const { data: existingLocation } = await supabase
      .from('locations')
      .select('id, location_name')
      .eq('customer_id', customerId)
      .eq('location_name', locationName)
      .is('deleted_at', null)
      .maybeSingle();

    if (existingLocation) {
      locationId = existingLocation.id;
    } else {
      // Create new location (locations table: customer_id, location_name, lat/long, timestamps only)
      const { data: newLocation, error: locationError } = await supabase
        .from('locations')
        .insert({
          customer_id: customerId,
          location_name: locationName
        })
        .select()
        .single();

      if (locationError) {
        console.error('Error creating location:', locationError);
        return res.status(500).json({
          error: 'Failed to create location',
          message: locationError.message
        });
      }

      locationId = newLocation.id;
    }

    try {
      await ensurePortalCustomerAddressFromLead({
        supabase,
        customerId,
        lead,
        locationId
      });
    } catch (addrErr) {
      console.warn('create-job: address sync failed:', addrErr?.message);
    }

    // Determine which service date to use
    let serviceDate = null;
    if (use_first_service_date && lead.first_service_date) {
      serviceDate = lead.first_service_date;
    } else if (use_second_service_date && lead.second_service_date) {
      serviceDate = lead.second_service_date;
    } else if (use_third_service_date && lead.third_service_date) {
      serviceDate = lead.third_service_date;
    } else if (use_fourth_service_date && lead.fourth_service_date) {
      serviceDate = lead.fourth_service_date;
    } else if (lead.first_service_date) {
      // Default to first service date if available
      serviceDate = lead.first_service_date;
    }

    if (!serviceDate) {
      return res.status(400).json({
        error: 'No service date available',
        message: 'Please ensure the lead has at least one service date set'
      });
    }

    // Parse time slot to get start and end times
    let scheduledStart = null;
    let scheduledEnd = null;

    if (serviceDate) {
      // Parse time slot (e.g., "AM - Time Slot: 9.30am - 12.30pm")
      let startHour = 9;
      let startMinute = 0;
      let endHour = 12;
      let endMinute = 30;

      if (lead.time_slot) {
        const timeSlotMatch = lead.time_slot.match(/(\d{1,2})\.?(\d{2})?\s*(am|pm)\s*-\s*(\d{1,2})\.?(\d{2})?\s*(am|pm)/i);
        if (timeSlotMatch) {
          startHour = parseInt(timeSlotMatch[1], 10);
          startMinute = parseInt(timeSlotMatch[2] || '0', 10);
          const startAmPm = timeSlotMatch[3].toLowerCase();
          endHour = parseInt(timeSlotMatch[4], 10);
          endMinute = parseInt(timeSlotMatch[5] || '0', 10);
          const endAmPm = timeSlotMatch[6].toLowerCase();

          // Convert to 24-hour format
          if (startAmPm === 'pm' && startHour !== 12) startHour += 12;
          if (startAmPm === 'am' && startHour === 12) startHour = 0;
          if (endAmPm === 'pm' && endHour !== 12) endHour += 12;
          if (endAmPm === 'am' && endHour === 12) endHour = 0;
        }
      }

      scheduledStart = buildSingaporeDateTimeUtc(serviceDate, startHour, startMinute);
      scheduledEnd = buildSingaporeDateTimeUtc(serviceDate, endHour, endMinute);
    }

    // Generate job number (bounded range — same as CreateJobs / migration import)
    const jobNumber = await getNextJobNumber(supabase);

    // Create job
    const jobTitle = job_title || `Service for ${lead.full_name}`;
    const jobDesc = job_description || 
      (lead.notes || `Service request from lead. ${lead.address ? `Address: ${lead.address}` : ''}`);

    const jobData = {
      customer_id: customerId,
      location_id: locationId,
      job_number: jobNumber,
      title: jobTitle,
      description: jobDesc,
      priority: priority,
      status: status,
      scheduled_start: scheduledStart ? scheduledStart.toISOString() : null,
      scheduled_end: scheduledEnd ? scheduledEnd.toISOString() : null,
    };

    const job = await jobService.create(jobData, supabase);
    await insertPortalDefaultJobContactType(supabase, job.id);

    const jobScheduleAddress = getCustomerAddressFromLead(lead) || locationName;
    await insertLeadJobSchedule(supabase, job.id, serviceDate, scheduledStart, scheduledEnd, jobScheduleAddress);

    void writeAuditLogFromRequest(req, {
      action: AUDIT_ACTIONS.JOB_CREATE,
      category: AUDIT_CATEGORIES.JOB,
      entityType: 'job',
      entityId: job.id,
      entityLabel: job.job_number,
      description: `Job ${job.job_number} created from lead`,
      details: {
        job_id: job.id,
        job_number: job.job_number,
        customer_id: customerId,
        lead_id: leadId,
      },
      status: AUDIT_STATUS.SUCCESS,
    });

    // Phase 2: Sync job to SAP Activities (non-blocking)
    const sessionCookies = sapService.getSessionCookies(req);
    if (sessionCookies) {
      try {
        const syncResult = await syncJobToSAP({ jobId: job.id, supabase: getSupabaseAdmin(), sessionCookies });
        void logJobSyncResult({
          req,
          jobId: job.id,
          jobNumber: job.job_number,
          result: syncResult || {},
        });
      } catch (syncErr) {
        console.warn('SAP job sync failed (non-blocking):', syncErr?.message);
        void logJobSyncResult({
          req,
          jobId: job.id,
          jobNumber: job.job_number,
          result: { success: false, error: syncErr?.message, job_number: job.job_number },
        });
      }
    }

    // Update lead status to CONVERTED and link to customer
    await leadService.convertToCustomer(leadId, customerId);

    // Optionally, add a note to the lead about the job creation
    if (lead.notes) {
      await supabase
        .from('leads')
        .update({
          notes: `${lead.notes}\n\nJob created: ${job.job_number} on ${new Date().toISOString()}`
        })
        .eq('id', leadId);
    } else {
      await supabase
        .from('leads')
        .update({
          notes: `Job created: ${job.job_number} on ${new Date().toISOString()}`
        })
        .eq('id', leadId);
    }

    return res.status(201).json({
      success: true,
      message: 'Job created successfully from lead',
      job: {
        id: job.id,
        job_number: job.job_number,
        title: job.title,
        status: job.status,
        scheduled_start: job.scheduled_start,
        scheduled_end: job.scheduled_end
      },
      customer: {
        id: customer.id,
        customer_code: customer.customer_code,
        customer_name: customer.customer_name
      },
      location: {
        id: locationId,
        location_name: locationName
      },
      lead: {
        id: lead.id,
        status: 'CONVERTED'
      }
    });

  } catch (error) {
    console.error('Error creating job from lead:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}

