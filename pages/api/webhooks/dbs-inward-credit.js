import { getSupabaseAdmin } from '../../../lib/supabase/server';
import {
  writeAuditLogFromRequest,
  AUDIT_ACTIONS,
  AUDIT_CATEGORIES,
  AUDIT_STATUS,
  AUDIT_SOURCE,
  buildChanges,
} from '../../../lib/services/auditLog';
import {
  extractAmountCents,
  findJobByInwardCredit,
  normalizeBankReference,
} from '../../../lib/services/dbsInwardCreditMatch';
import { DBS_SOURCE, recordJobPayment } from '../../../lib/services/jobPaymentReconciliation';

function verifyWebhookSecret(req) {
  const expected = process.env.DBS_WEBHOOK_SECRET;
  if (!expected) return true;

  const header =
    req.headers['x-dbs-webhook-secret'] ||
    req.headers['x-webhook-secret'] ||
    req.headers.authorization;

  if (!header) return false;
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    return header.slice(7) === expected;
  }
  return header === expected;
}

/**
 * POST /api/webhooks/dbs-inward-credit
 * Scaffold for DBS RAPID inward credit notifications.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!verifyWebhookSecret(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (e) {
    console.warn('[dbs-inward-credit]', e?.message);
    return res.status(503).json({ error: 'Server misconfigured' });
  }

  const payload = req.body && typeof req.body === 'object' ? req.body : {};

  try {
    const { job, matchedReference, matchField } = await findJobByInwardCredit(supabase, payload);

    if (!job) {
      void writeAuditLogFromRequest(req, {
        action: AUDIT_ACTIONS.JOB_PAYMENT_RECEIVED,
        category: AUDIT_CATEGORIES.JOB,
        source: AUDIT_SOURCE.SYSTEM,
        entityType: 'job_payment_webhook',
        description: 'DBS inward credit received — no matching job',
        details: {
          matchedReference,
          matchField,
          source: DBS_SOURCE,
        },
        status: AUDIT_STATUS.WARNING,
      });
      return res.status(202).json({ ok: false, reason: 'no_matching_job', matchedReference });
    }

    const amountCents = extractAmountCents(payload);
    if (!amountCents || amountCents <= 0) {
      return res.status(400).json({ error: 'amount is required in webhook payload' });
    }

    const bankReference =
      normalizeBankReference(
        payload.transactionReference ||
          payload.transaction_reference ||
          payload.endToEndId ||
          payload.end_to_end_id ||
          payload.bankReference ||
          payload.bank_reference
      ) || `dbs-${matchedReference || job.id}-${amountCents}`;

    const result = await recordJobPayment(supabase, {
      jobId: job.id,
      job,
      amountCents,
      source: DBS_SOURCE,
      bankReference,
      paidAt: payload.valueDate || payload.value_date || payload.transactionDate || null,
      rawPayload: payload,
      idempotent: true,
    });

    void writeAuditLogFromRequest(req, {
      action: AUDIT_ACTIONS.JOB_PAYMENT_RECEIVED,
      category: AUDIT_CATEGORIES.JOB,
      source: AUDIT_SOURCE.SYSTEM,
      entityType: 'job',
      entityId: job.id,
      entityLabel: job.job_number || job.id,
      description: result.duplicate
        ? 'DBS inward credit webhook — duplicate ignored'
        : 'DBS inward credit matched to job',
      details: {
        source: DBS_SOURCE,
        amount_cents: amountCents,
        bank_reference: bankReference,
        matchedReference,
        matchField,
        duplicate: result.duplicate,
      },
      changes: result.duplicate
        ? null
        : buildChanges(
            { payment_status: job.payment_status || 'pending' },
            { payment_status: result.paymentStatus }
          ),
      status: AUDIT_STATUS.SUCCESS,
    });

    return res.status(200).json({
      ok: true,
      job_id: job.id,
      job_number: job.job_number,
      payment_status: result.paymentStatus,
      duplicate: result.duplicate,
      payment_id: result.payment?.id || null,
    });
  } catch (e) {
    console.error('[dbs-inward-credit]', e);
    return res.status(500).json({ error: e?.message || 'Webhook processing failed' });
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
  },
};
