/**
 * Shared helpers for recording customer payments against jobs.
 */

import { derivePaymentStatus, normalizeBankReference } from './dbsInwardCreditMatch';

const DBS_SOURCE = 'dbs_inward_credit';
const MANUAL_SOURCE = 'manual';

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} jobId
 */
export async function sumJobPaymentsCents(supabase, jobId) {
  const { data, error } = await supabase
    .from('job_payments')
    .select('amount_cents')
    .eq('job_id', jobId);

  if (error) {
    throw new Error(`Failed to sum job payments: ${error.message}`);
  }

  return (data || []).reduce((sum, row) => sum + (Number(row.amount_cents) || 0), 0);
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {object} opts
 * @param {string} opts.jobId
 * @param {object} opts.job
 * @param {number} opts.amountCents
 * @param {string} [opts.source]
 * @param {string | null} [opts.bankReference]
 * @param {string | null} [opts.paidAt]
 * @param {object | null} [opts.rawPayload]
 * @param {boolean} [opts.idempotent=false]
 */
export async function recordJobPayment(supabase, {
  jobId,
  job,
  amountCents,
  source = MANUAL_SOURCE,
  bankReference = null,
  paidAt = null,
  rawPayload = null,
  idempotent = false,
}) {
  const normalizedRef = normalizeBankReference(bankReference);
  const paidAtIso = paidAt ? new Date(paidAt).toISOString() : new Date().toISOString();

  if (idempotent && normalizedRef) {
    const { data: existing } = await supabase
      .from('job_payments')
      .select('id, job_id, amount_cents')
      .eq('source', source)
      .eq('bank_reference', normalizedRef)
      .maybeSingle();

    if (existing) {
      return {
        payment: existing,
        duplicate: true,
        paymentStatus: job?.payment_status || 'paid',
      };
    }
  }

  const existingTotal = await sumJobPaymentsCents(supabase, jobId);
  const paymentStatus = derivePaymentStatus(job, amountCents, existingTotal);

  const insertPayload = {
    job_id: jobId,
    amount_cents: amountCents,
    paid_at: paidAtIso,
    bank_reference: normalizedRef,
    source,
    raw_payload: rawPayload,
  };

  const { data: payment, error: insertError } = await supabase
    .from('job_payments')
    .insert(insertPayload)
    .select('*')
    .single();

  if (insertError) {
    if (idempotent && normalizedRef && insertError.code === '23505') {
      const { data: existing } = await supabase
        .from('job_payments')
        .select('*')
        .eq('source', source)
        .eq('bank_reference', normalizedRef)
        .maybeSingle();
      return {
        payment: existing,
        duplicate: true,
        paymentStatus: job?.payment_status || 'paid',
      };
    }
    throw new Error(`Failed to insert job payment: ${insertError.message}`);
  }

  const { error: updateError } = await supabase
    .from('jobs')
    .update({
      payment_status: paymentStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId);

  if (updateError) {
    throw new Error(`Failed to update job payment status: ${updateError.message}`);
  }

  return { payment, duplicate: false, paymentStatus };
}

export { DBS_SOURCE, MANUAL_SOURCE };
