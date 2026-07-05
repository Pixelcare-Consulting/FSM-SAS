/**
 * Idempotent log for transactional job emails (dedupe).
 * Table: job_email_log (see lib/supabase/migrations/create_job_email_log_table.sql)
 */

const JOB_COMPLETED_TEMPLATE = 'jobCompleted';

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} jobId
 * @param {string} [templateKey]
 */
export async function wasJobEmailSent(supabase, jobId, templateKey = JOB_COMPLETED_TEMPLATE) {
  const { data, error } = await supabase
    .from('job_email_log')
    .select('id')
    .eq('job_id', jobId)
    .eq('template_key', templateKey)
    .maybeSingle();

  if (error) {
    // Table may not exist yet in some environments — treat as not sent
    if (error.code === '42P01' || error.code === 'PGRST205') {
      console.warn('[jobEmailLog] table missing, skipping dedupe check');
      return false;
    }
    console.warn('[jobEmailLog] wasJobEmailSent', error.message);
    return false;
  }
  return Boolean(data?.id);
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} jobId
 * @param {string} [templateKey]
 */
export async function recordJobEmailSent(supabase, jobId, templateKey = JOB_COMPLETED_TEMPLATE) {
  const { error } = await supabase.from('job_email_log').insert({
    job_id: jobId,
    template_key: templateKey,
    sent_at: new Date().toISOString(),
  });

  if (error) {
    // Unique violation = another request won the race — still deduped
    if (error.code === '23505') return;
    if (error.code === '42P01' || error.code === 'PGRST205') {
      console.warn('[jobEmailLog] table missing, cannot record send');
      return;
    }
    console.warn('[jobEmailLog] recordJobEmailSent', error.message);
  }
}

export { JOB_COMPLETED_TEMPLATE };
