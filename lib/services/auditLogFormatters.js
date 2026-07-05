/** Pure audit description formatters (no server deps — safe for unit tests). */

/** Lifecycle markers for bulk SAP job sync (matches legacy Integration Logs). */
export const JOB_SYNC_LIFECYCLE = {
  STARTED: 'Job Sync Application is started',
  COMPLETED: 'Job Sync processing completed',
};

/** Lifecycle markers for bulk SAP UDT hours push. */
export const SAP_UDT_PUSH_LIFECYCLE = {
  STARTED: 'SAP UDT hours push started',
  COMPLETED: 'SAP UDT hours push completed',
};

/**
 * Human-readable per-job SAP sync line (legacy Integration Logs style).
 */
export function formatJobSyncAuditDescription({ result, jobNumber, jobId } = {}) {
  const jn = jobNumber ?? result?.job_number ?? jobId ?? 'n/a';

  if (!result?.success) {
    const err = result?.error ? `: ${result.error}` : '';
    return `Job sync failed. Job Number: ${jn}${err}`;
  }

  const scId = result.serviceCallNo ?? result.serviceCall?.serviceCallNo ?? null;
  const scOk = result.serviceCall?.ok === true && scId;

  if (scOk) {
    const verb = result.serviceCallMerged ? 'Updated' : 'Added';
    return `The Service Call Job is ${verb}. Service Call ID: ${scId} - Job Number: ${jn}`;
  }

  const verb = result.syncAction === 'update' ? 'Updated' : 'Added';
  const actId = result.sap_activity_id ?? 'n/a';
  return `The SAP Activity is ${verb}. Activity ID: ${actId} - Job Number: ${jn}`;
}

/**
 * Human-readable SAP UDT hours push line.
 */
export function formatSapUdtHoursAuditDescription({
  workerName,
  year,
  month,
  workingHrs,
  code,
  zeroedCount = 0,
  error,
} = {}) {
  const label = workerName || code || 'technician';
  const period = year && month ? `${year}-${String(month).padStart(2, '0')}` : 'n/a';

  if (error) {
    return `SAP UDT hours push failed for ${label} (${period}): ${error}`;
  }

  const hrs = workingHrs != null ? `${workingHrs}h` : 'n/a';
  const zeroed =
    zeroedCount > 0 ? `; zeroed ${zeroedCount} duplicate code(s)` : '';
  return `SAP UDT hours pushed for ${label} (${period}): ${hrs}${zeroed}`;
}

/**
 * Human-readable SAP customer sync line.
 */
export function formatSapCustomerSyncAuditDescription({
  customerName,
  cardCode,
  outcome,
  error,
} = {}) {
  const name = customerName || cardCode || 'customer';

  if (error) {
    return `SAP customer sync failed for ${name}: ${error}`;
  }

  if (outcome === 'exists') {
    return `SAP Business Partner already exists for ${name}${cardCode ? ` (${cardCode})` : ''}`;
  }
  if (outcome === 'created') {
    return `SAP Business Partner created for ${name}${cardCode ? ` (${cardCode})` : ''}`;
  }
  if (outcome === 'linked') {
    return `SAP Business Partner linked for ${name}${cardCode ? ` (${cardCode})` : ''}`;
  }
  if (outcome === 'address_partial') {
    return `SAP Business Partner synced for ${name} with address warning`;
  }

  return `SAP customer synced for ${name}${cardCode ? ` (${cardCode})` : ''}`;
}
