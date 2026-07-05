/**
 * Create or reuse a portal CP##### customer when AIFM has a display name but no SAP CardCode match.
 * Uses the same insert path as POST /api/customers/create (customerService.create).
 */

import { customerService } from '../supabase/database';

const MAX_NAME_LEN = 255;

/** Escape % and _ so ilike(customer_name, value) is a literal match. */
export function escapeIlikeLiteral(str) {
  return String(str).replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

function isDuplicateCodeError(err) {
  const c = err?.code;
  const msg = String(err?.message || '');
  return c === '23505' || msg.includes('duplicate key') || msg.includes('customer_code');
}

/**
 * @param {string} customerName — trimmed display name (from import pipeline or [CUSTOMER:…] tag)
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @returns {Promise<{ id: string, customer_code: string, customer_name: string } | null>}
 */
export async function resolveOrCreatePlaceholderCustomer(customerName, supabase) {
  let name = String(customerName || '').trim();
  if (!name) return null;
  if (name.length > MAX_NAME_LEN) {
    name = name.slice(0, MAX_NAME_LEN);
  }

  const { data: nameRows } = await supabase
    .from('customer')
    .select('id, customer_code, customer_name')
    .ilike('customer_name', escapeIlikeLiteral(name))
    .is('deleted_at', null);

  const cpRow = (nameRows || []).find((r) => /^CP\d+$/i.test(String(r.customer_code || '').trim()));
  if (cpRow) {
    return cpRow;
  }

  for (let attempt = 0; attempt < 8; attempt++) {
    let customer_code;
    try {
      customer_code = await customerService.getNextPortalCardCode(supabase);
    } catch (e) {
      console.error(`[aifmPortalPlaceholderCustomer] getNextPortalCardCode failed: ${e?.message || e}`);
      return null;
    }

    const variants = [
      { customer_code, customer_name: name, source: 'portal' },
      { customer_code, customer_name: name },
    ];

    let dupCode = false;
    for (let v = 0; v < variants.length; v++) {
      const payload = variants[v];
      try {
        const created = await customerService.create(payload, supabase);
        if (created?.id) return created;
      } catch (e) {
        if (isDuplicateCodeError(e)) {
          dupCode = true;
          break;
        }
        const msg = String(e?.message || '');
        const code = e?.code;
        const maybeSource =
          code === 'PGRST204' ||
          code === '42703' ||
          /source|column|check constraint/i.test(msg);
        if (maybeSource && v === 0 && 'source' in payload) {
          console.warn(`[aifmPortalPlaceholderCustomer] create with source failed, trying minimal row: ${msg}`);
          continue;
        }
        console.warn(
          `[aifmPortalPlaceholderCustomer] customerService.create failed: ${msg} code=${code || '—'} details=${e?.details || '—'}`
        );
      }
    }
    if (!dupCode) {
      break;
    }
  }

  console.error(`[aifmPortalPlaceholderCustomer] could not create CP row for "${name}"`);
  return null;
}
