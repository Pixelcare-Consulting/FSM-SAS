/**
 * Returns active technician_jobs deduplicated by technician_id (first row wins).
 * Multiple rows per technician can exist after reschedules/imports; UI should show each once.
 */
export function uniqueActiveTechnicianJobs(technicianJobs = []) {
  const byTechnicianId = new Map();

  for (const tj of technicianJobs) {
    if (tj.deleted_at != null) continue;
    const techId = tj.technician_id || tj.technician?.id;
    if (!techId || byTechnicianId.has(techId)) continue;
    byTechnicianId.set(techId, tj);
  }

  return Array.from(byTechnicianId.values());
}
