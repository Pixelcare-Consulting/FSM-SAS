import { getSupabaseAdmin } from '../../../lib/supabase/server';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Cache-Control', 'private, max-age=300');

  const code = String(req.query.code || '').trim();
  const id = String(req.query.id || '').trim();

  if (!code && !id) {
    return res.status(400).json({ error: 'code or id query parameter is required' });
  }

  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return res.status(503).json({ error: 'Database unavailable' });
    }

    if (id && /^[0-9a-f-]{36}$/i.test(id)) {
      const { data: byId, error: idError } = await supabase
        .from('customer')
        .select('id, customer_code, customer_name')
        .eq('id', id)
        .is('deleted_at', null)
        .maybeSingle();

      if (idError) throw idError;
      if (byId?.id) {
        return res.status(200).json({
          id: byId.id,
          customerId: byId.id,
          customerCode: byId.customer_code,
          customerName: byId.customer_name,
        });
      }
    }

    const normalized = (code || id).toUpperCase();

    const { data: byCode, error: codeError } = await supabase
      .from('customer')
      .select('id, customer_code, customer_name')
      .ilike('customer_code', normalized)
      .is('deleted_at', null)
      .maybeSingle();

    if (codeError) throw codeError;
    if (byCode?.id) {
      return res.status(200).json({
        id: byCode.id,
        customerId: byCode.id,
        customerCode: byCode.customer_code,
        customerName: byCode.customer_name,
      });
    }

    if (id) {
      const { data: byIdFallback, error: idFallbackError } = await supabase
        .from('customer')
        .select('id, customer_code, customer_name')
        .eq('id', id)
        .is('deleted_at', null)
        .maybeSingle();

      if (idFallbackError) throw idFallbackError;
      if (byIdFallback?.id) {
        return res.status(200).json({
          id: byIdFallback.id,
          customerId: byIdFallback.id,
          customerCode: byIdFallback.customer_code,
          customerName: byIdFallback.customer_name,
        });
      }
    }

    return res.status(404).json({ error: 'Customer not found' });
  } catch (error) {
    console.error('Customers resolve-id API error:', error);
    return res.status(500).json({
      error: error.message || 'Unable to resolve customer id.',
    });
  }
}
