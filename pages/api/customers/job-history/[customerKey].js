import { requireSession } from '../../../../lib/auth/requireSession';
import { getSupabaseAdmin } from '../../../../lib/supabase/server';
import { fetchCustomerJobHistoryPage } from '../../../../lib/jobs/customerJobHistory';
import { getListCache, logResponseSize, setListCache } from '../../../../lib/supabase/listQueryHelpers';

const CACHE_TTL_MS = 30000;

async function resolveCustomerUuid(supabase, rawId) {
  const normalized = String(rawId || '').trim();
  if (!normalized) return null;

  if (/^[0-9a-f-]{36}$/i.test(normalized)) {
    const { data: byId, error } = await supabase
      .from('customer')
      .select('id')
      .eq('id', normalized)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    if (byId?.id) return byId.id;
  }

  const { data: byCode, error: codeError } = await supabase
    .from('customer')
    .select('id')
    .ilike('customer_code', normalized)
    .is('deleted_at', null)
    .maybeSingle();
  if (codeError) throw codeError;
  return byCode?.id ?? null;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await requireSession(req, res);
  if (!session) return;

  res.setHeader('Cache-Control', 'private, max-age=30');

  const customerKey = String(req.query.customerKey || '').trim();
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(Math.max(1, Number(req.query.limit) || 20), 200);
  const search = String(req.query.search || '').trim();

  if (!customerKey) {
    return res.status(400).json({ error: 'Customer id is required' });
  }

  const cacheKey = `customer-job-history:${customerKey}:${page}:${limit}:${search}`;
  const cached = getListCache(cacheKey, CACHE_TTL_MS);
  if (cached) {
    logResponseSize('customers/job-history/[customerKey] (cached)', cached);
    return res.status(200).json(cached);
  }

  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return res.status(503).json({ error: 'Database unavailable' });
    }

    const customerUUID = await resolveCustomerUuid(supabase, customerKey);
    if (!customerUUID) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const payload = await fetchCustomerJobHistoryPage(supabase, customerUUID, {
      page,
      limit,
      search,
    });

    setListCache(cacheKey, payload, CACHE_TTL_MS);
    logResponseSize('customers/job-history/[customerKey]', payload);
    return res.status(200).json(payload);
  } catch (error) {
    console.error('Customer job-history API error:', error);
    return res.status(500).json({
      error: error.message || 'Unable to load customer job history.',
    });
  }
}
