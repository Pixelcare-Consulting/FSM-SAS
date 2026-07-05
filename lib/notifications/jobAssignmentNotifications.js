/**
 * @deprecated In-app notifications are inserted via `emitJobStakeholderNotifications`
 * (`lib/notifications/jobStakeholderNotificationsClient.js`) → POST `/api/notifications/job-stakeholders`
 * so inserts use the service role and ADMIN users are notified. Kept for reference only.
 */
export async function notifyJobTechniciansAssigned(_supabase, _params) {
  console.warn(
    '[notifyJobTechniciansAssigned] is deprecated. Use emitJobStakeholderNotifications from jobStakeholderNotificationsClient.js'
  );
}
