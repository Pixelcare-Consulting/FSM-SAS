/**
 * Track which SAP company DB a customer was last synced against.
 */

export function getCurrentSapSyncEnvironment() {
  const env = (process.env.SAP_B1_COMPANY_DB || '').trim();
  return env || null;
}

/**
 * Fields to stamp on customer after a successful SAP sync or link.
 */
export function sapSyncStampFields() {
  const now = new Date().toISOString();
  const env = getCurrentSapSyncEnvironment();
  return {
    synced_to_sap_at: now,
    sap_sync_verified_at: now,
    ...(env ? { sap_sync_environment: env } : {}),
  };
}
