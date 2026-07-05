/**
 * Link AIFM identifiers to Supabase service_call + sales_order for SAP sync.
 * - personal_job_id → service_call.call_number → jobs.service_call_id
 * - job_po_number → sales_order.document_number → jobs.sales_order_id
 */

const AIFM_MARKER_RE = /\[AIFM:(\d+)\]/i;
const PO_LINE_RE = /^PO:\s*(.+)$/im;

/**
 * @param {string|null|undefined} description
 * @returns {string|null}
 */
export function extractAifmIdFromDescription(description) {
  const m = String(description ?? '').match(AIFM_MARKER_RE);
  return m ? m[1] : null;
}

/**
 * @param {string|null|undefined} description
 * @returns {string|null}
 */
export function extractAifmPoFromDescription(description) {
  const m = String(description ?? '').match(PO_LINE_RE);
  if (!m) return null;
  const po = String(m[1]).trim();
  return po || null;
}

function normalizeCallNumber(value) {
  const s = String(value ?? '').trim();
  return s || null;
}

function normalizePoNumber(value) {
  const s = String(value ?? '').trim();
  return s || null;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ customerId: string, callNumber: string, subject?: string }} params
 */
export async function upsertServiceCall({ supabase, customerId, callNumber, subject }) {
  const num = normalizeCallNumber(callNumber);
  if (!num) return { id: null, created: false, skipped: true, reason: 'empty_call_number' };
  if (!customerId) return { id: null, created: false, skipped: true, reason: 'missing_customer_id' };

  const { data: existing, error: findErr } = await supabase
    .from('service_call')
    .select('id, customer_id')
    .eq('call_number', num)
    .is('deleted_at', null)
    .maybeSingle();

  if (findErr) throw findErr;
  if (existing?.id) {
    if (existing.customer_id !== customerId) {
      await supabase.from('service_call').update({ customer_id: customerId }).eq('id', existing.id);
    }
    return { id: existing.id, created: false };
  }

  const { data: created, error: insErr } = await supabase
    .from('service_call')
    .insert({
      customer_id: customerId,
      call_number: num,
      subject: subject || `Service Call ${num}`,
      status: 'OPEN',
      priority: 'MEDIUM',
    })
    .select('id')
    .single();

  if (insErr) throw insErr;
  return { id: created.id, created: true };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ documentNumber: string, documentStatus?: string|null, documentTotal?: number|null }} params
 */
export async function upsertSalesOrder({ supabase, documentNumber, documentStatus = null, documentTotal = null }) {
  const doc = normalizePoNumber(documentNumber);
  if (!doc) return { id: null, created: false, skipped: true, reason: 'empty_document_number' };

  const { data: existing, error: findErr } = await supabase
    .from('sales_order')
    .select('id')
    .eq('document_number', doc)
    .is('deleted_at', null)
    .maybeSingle();

  if (findErr) throw findErr;
  if (existing?.id) return { id: existing.id, created: false };

  const { data: created, error: insErr } = await supabase
    .from('sales_order')
    .insert({
      document_number: doc,
      document_status: documentStatus,
      document_total: documentTotal,
    })
    .select('id')
    .single();

  if (insErr) throw insErr;
  return { id: created.id, created: true };
}

/**
 * Apply AIFM personal_job_id + job_po_number to portal job FKs.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{
 *   jobId: string,
 *   customerId: string|null,
 *   personalJobId?: string|null,
 *   poNumber?: string|null,
 *   jobTitle?: string|null,
 * }} params
 */
export async function applyAifmSapIdentifiers({
  supabase,
  jobId,
  customerId,
  personalJobId,
  poNumber,
  jobTitle,
}) {
  const callNum = normalizeCallNumber(personalJobId);
  const po = normalizePoNumber(poNumber);

  if (!callNum && !po) {
    return {
      ok: true,
      skipped: true,
      reason: 'no_identifiers',
      serviceCallId: null,
      salesOrderId: null,
    };
  }

  let serviceCallId = null;
  let salesOrderId = null;
  const details = {};

  if (callNum) {
    if (!customerId) {
      details.serviceCall = { skipped: true, reason: 'missing_customer_id' };
    } else {
      const sc = await upsertServiceCall({
        supabase,
        customerId,
        callNumber: callNum,
        subject: jobTitle ? String(jobTitle).slice(0, 255) : undefined,
      });
      serviceCallId = sc.id;
      details.serviceCall = sc;
    }
  }

  if (po) {
    const so = await upsertSalesOrder({ supabase, documentNumber: po });
    salesOrderId = so.id;
    details.salesOrder = so;
  }

  const patch = {};
  if (serviceCallId) patch.service_call_id = serviceCallId;
  if (salesOrderId) patch.sales_order_id = salesOrderId;

  if (Object.keys(patch).length) {
    const { error: updErr } = await supabase.from('jobs').update(patch).eq('id', jobId);
    if (updErr) throw updErr;
  }

  return {
    ok: true,
    serviceCallId,
    salesOrderId,
    details,
  };
}
