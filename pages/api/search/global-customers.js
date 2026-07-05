/**
 * GET /api/search/global-customers?q=...
 *
 * @deprecated Prefer `/api/search/global-masterlist` — the global quick search and dashboard
 * search page now use the masterlist endpoint (customers + sap_lead + form leads) only.
 *
 * Portal **form leads only** (Supabase `leads` table). Does **not** query the `customer`
 * table — kept for backward compatibility if anything still calls this route directly.
 */
import { getSupabaseAdmin } from '../../../lib/supabase/server';
import { textMatchesAllSearchTokens } from '../../../lib/utils/multiTokenSearch';

const MAX_LEADS = 5000;

function leadRowBlob(l) {
  return [l.full_name, l.email, l.handphone, l.address, l.block, l.unit, l.building, l.street, l.postcode]
    .filter((f) => f != null && String(f).trim() !== '')
    .map((f) => String(f).toLowerCase())
    .join(' ');
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const q = String(req.query.q || '').trim();
  if (!q) {
    return res.status(200).json({ results: [], totalCount: 0, counts: { customers: 0 } });
  }
  const qLower = q.toLowerCase();
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return res.status(503).json({ error: 'Database unavailable' });
  }

  try {
    const { data: leadRows, error: lErr } = await supabase
      .from('leads')
      .select('id, full_name, email, handphone, address, block, unit, status, customer_id, source, building, street, postcode')
      .is('deleted_at', null)
      .order('submitted_at', { ascending: false })
      .limit(MAX_LEADS);

    if (lErr) {
      console.error('global-customers leads query:', lErr);
      return res.status(200).json({ results: [], totalCount: 0, counts: { customers: 0 } });
    }

    const results = [];
    for (const l of leadRows || []) {
      if (l.customer_id) {
        // Converted to a portal/SAP customer — show once via main SAP search, not as a lead
        continue;
      }
      if (!textMatchesAllSearchTokens(leadRowBlob(l), qLower)) continue;
      const addressLine = [l.address, l.block, l.unit, l.building, l.street, l.postcode].filter(Boolean).join(', ') || 'No address';
      const title = l.full_name || l.email || 'Lead';
      results.push({
        id: `db-lead-${l.id}`,
        type: 'customer',
        customerKind: 'formLead',
        title,
        subtitle: `Form lead · ${l.handphone || l.email || 'No contact'}`,
        address: addressLine,
        link: '/customer-leads',
        rawTitle: title,
        email: l.email,
        tel: l.handphone,
        bpCode: null
      });
    }

    results.sort((a, b) => (a.title || '').localeCompare(b.title || '', undefined, { sensitivity: 'base' }));

    return res.status(200).json({
      results,
      totalCount: results.length,
      counts: { customers: results.length }
    });
  } catch (e) {
    console.error('global-customers:', e);
    return res.status(500).json({ error: e?.message || 'Search failed' });
  }
}
