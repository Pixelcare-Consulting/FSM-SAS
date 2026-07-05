/**
 * Create jobs from a lead for all service dates (first, second, third, fourth).
 * POST /api/leads/:leadId/create-jobs
 * Uses same logic as create-job: customer from lead (Name used when not synced), location, then one job per date.
 */

import { createJobsFromLead, LeadJobsAlreadyCreatedError } from '../../../../lib/leads/createJobsFromLead';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { leadId } = req.query;
    if (!leadId) {
      return res.status(400).json({ error: 'Lead ID is required' });
    }

    const { updateLeadStatus = true } = req.body || {};
    const result = await createJobsFromLead(leadId, {
      updateLeadStatus: !!updateLeadStatus,
      req
    });

    return res.status(201).json({
      success: true,
      message:
        result.partial
          ? `Created ${result.createdCount} job(s); ${result.errors.length} date(s) failed.`
          : result.createdCount > 0
            ? `Created ${result.createdCount} job(s) from lead.`
            : 'No new jobs created (all service dates already have jobs).',
      jobs: result.jobs.map((j) => ({
        id: j.id,
        job_number: j.job_number,
        title: j.title,
        status: j.status,
        scheduled_start: j.scheduled_start,
        scheduled_end: j.scheduled_end
      })),
      customer: result.customer
        ? {
            id: result.customer.id,
            customer_code: result.customer.customer_code,
            customer_name: result.customer.customer_name
          }
        : null,
      locationName: result.locationName,
      createdCount: result.createdCount,
      skippedDates: result.skippedDates,
      jobsByServiceDate: result.jobsByServiceDate || {},
      partial: !!result.partial,
      errors: result.errors || [],
    });
  } catch (error) {
    console.error('Error creating jobs from lead:', error);
    if (error instanceof LeadJobsAlreadyCreatedError) {
      return res.status(409).json({
        error: error.message,
        jobsByServiceDate: error.jobsByServiceDate || {},
      });
    }
    const isDuplicate =
      error?.code === '23505' ||
      error?.message?.includes('jobs_job_number_key') ||
      error?.message?.includes('duplicate key');
    const status = error.message === 'Lead not found'
      ? 404
      : error.message?.includes('No service dates')
        ? 400
        : isDuplicate
          ? 409
          : 500;
    return res.status(status).json({
      error: isDuplicate
        ? 'A job with that number already exists. Please try again.'
        : error.message || 'Failed to create jobs from lead',
    });
  }
}
