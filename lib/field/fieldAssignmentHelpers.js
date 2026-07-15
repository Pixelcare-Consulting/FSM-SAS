/**
 * Field BFF helpers — ownership checks aligned with MOBILE_TECHNICIAN_LABOR_CONTRACT.
 */

const ASSIGNMENT_SELECT =
  'id, job_id, technician_id, assignment_status, started_at, completed_at, accumulated_hours, technician_remarks, service_notes, updated_at, deleted_at';

/**
 * Resolve technician row id from a session user (users.technicians embed).
 * @param {object} user
 * @returns {string|null}
 */
export function resolveTechnicianIdFromUser(user) {
  if (!user) return null;
  const technicians = user.technicians;
  if (Array.isArray(technicians) && technicians[0]?.id) {
    return technicians[0].id;
  }
  if (technicians && typeof technicians === 'object' && technicians.id) {
    return technicians.id;
  }
  return null;
}

/**
 * Load a technician_jobs row owned by the given technician (not soft-deleted).
 * @param {object} supabase
 * @param {string} technicianJobId
 * @param {string} technicianId
 * @returns {Promise<{ assignment: object|null, error: string|null, status?: number }>}
 */
export async function loadOwnedAssignment(supabase, technicianJobId, technicianId) {
  if (!technicianJobId || !technicianId) {
    return { assignment: null, error: 'technicianJobId is required', status: 400 };
  }

  const { data, error } = await supabase
    .from('technician_jobs')
    .select(ASSIGNMENT_SELECT)
    .eq('id', technicianJobId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    console.error('[field] loadOwnedAssignment', error.message);
    return { assignment: null, error: 'Failed to load assignment', status: 500 };
  }

  if (!data) {
    return { assignment: null, error: 'Assignment not found', status: 404 };
  }

  if (data.technician_id !== technicianId) {
    return { assignment: null, error: 'Forbidden — assignment not owned by technician', status: 403 };
  }

  return { assignment: data, error: null };
}

/**
 * Insert or replace job_signatures for an owned assignment.
 * @param {object} supabase
 * @param {{
 *   technicianJobId: string,
 *   signatureImageUrl: string,
 *   customerName: string,
 *   customerFeedback?: string|null,
 *   signedAt?: string|null,
 * }} payload
 */
export async function upsertJobSignature(supabase, payload) {
  const {
    technicianJobId,
    signatureImageUrl,
    customerName,
    customerFeedback = null,
    signedAt = null,
  } = payload;

  const row = {
    technician_job_id: technicianJobId,
    signature_image_url: signatureImageUrl,
    customer_name: customerName,
    customer_feedback: customerFeedback || null,
    signed_at: signedAt || new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('job_signatures')
    .upsert(row, { onConflict: 'technician_job_id' })
    .select('id, technician_job_id, signature_image_url, customer_name, customer_feedback, signed_at, created_at')
    .single();

  if (error) {
    console.error('[field] upsertJobSignature', error.message);
    return { signature: null, error: error.message };
  }
  return { signature: data, error: null };
}

export { ASSIGNMENT_SELECT };
