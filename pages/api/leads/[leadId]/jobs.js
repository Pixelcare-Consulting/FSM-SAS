/**
 * GET /api/leads/:leadId/jobs
 * Returns jobs created from this lead, keyed by service date (first, second, third, fourth).
 * Used to show "View Job" links next to each service date in the lead modal.
 */

import { leadService } from '../../../../lib/supabase/database';
import { getLeadJobsByServiceDate } from '../../../../lib/leads/getLeadJobsByServiceDate';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { leadId } = req.query;
    if (!leadId) {
      return res.status(400).json({ error: 'Lead ID is required' });
    }

    const lead = await leadService.findById(leadId);
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const customerId = lead.customer_id;
    if (!customerId) {
      return res.status(200).json({ jobsByServiceDate: {} });
    }

    const jobsByServiceDate = await getLeadJobsByServiceDate(lead);

    return res.status(200).json({ jobsByServiceDate });
  } catch (error) {
    console.error('Error fetching lead jobs:', error);
    return res.status(500).json({
      error: error.message || 'Failed to fetch jobs for lead'
    });
  }
}
