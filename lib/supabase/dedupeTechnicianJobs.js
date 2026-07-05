/**
 * Pick the best technician_jobs row when duplicates exist for the same job.
 */

export function scoreTechnicianJobRow(tj) {
  if (!tj) return -1;
  let score = 0;
  if (String(tj.assignment_status || "").toUpperCase() === "COMPLETED") score += 1000;
  if (tj.completed_at) score += 500;
  if (tj.started_at) score += 250;
  const acc = Number(tj.accumulated_hours);
  if (Number.isFinite(acc) && acc > 0) score += acc;
  const updated = tj.updated_at ? new Date(tj.updated_at).getTime() : 0;
  if (Number.isFinite(updated)) score += updated / 1e15;
  return score;
}

/**
 * @param {object[]} rows technician_jobs for one technician (or one job)
 * @param {'job_id'|'technician_id'} key
 * @returns {object[]}
 */
export function dedupeTechnicianJobRows(rows, key = "job_id") {
  const map = new Map();
  for (const row of rows || []) {
    if (row?.deleted_at != null) continue;
    const k = row[key];
    if (!k) continue;
    const prev = map.get(k);
    if (!prev || scoreTechnicianJobRow(row) > scoreTechnicianJobRow(prev)) {
      map.set(k, row);
    }
  }
  return Array.from(map.values());
}
