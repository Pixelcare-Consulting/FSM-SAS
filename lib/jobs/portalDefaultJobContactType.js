/**
 * Default Job Contact Type for portal-generated jobs (SAP OCLT sql09: Service = 3).
 * Override via PORTAL_DEFAULT_JOB_CONTACT_TYPE_CODE / _NAME when needed.
 */

/** Match a react-select option for the default Service contact type. */
export function findServiceJobContactTypeOption(options) {
  if (!Array.isArray(options) || options.length === 0) return null;
  const { code, name } = getPortalDefaultJobContactType();
  return (
    options.find(
      (opt) => String(opt.label || '').trim().toLowerCase() === name.toLowerCase()
    ) || options.find((opt) => String(opt.value) === String(code))
  );
}

export function getPortalDefaultJobContactType() {
  const name = (process.env.PORTAL_DEFAULT_JOB_CONTACT_TYPE_NAME || 'Service').trim() || 'Service';
  const codeRaw = process.env.PORTAL_DEFAULT_JOB_CONTACT_TYPE_CODE;
  const parsed = codeRaw != null && String(codeRaw).trim() !== ''
    ? parseInt(String(codeRaw), 10)
    : 3;
  return {
    code: Number.isFinite(parsed) ? parsed : 3,
    name,
  };
}

/** @returns {Promise<boolean>} true when a row was inserted */
export async function insertPortalDefaultJobContactType(supabase, jobId) {
  if (!supabase || !jobId) return false;

  const { code, name } = getPortalDefaultJobContactType();
  const { error } = await supabase.from('job_contact_type').insert({
    job_id: jobId,
    code,
    name,
  });

  if (error) {
    console.warn('insertPortalDefaultJobContactType failed:', error.message);
    return false;
  }

  return true;
}
