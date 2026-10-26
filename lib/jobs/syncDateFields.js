/**
 * Which job date the Sync-to-SAP date range applies to. Shared by the API
 * (column mapping) and the sync modal (labels), so values stay in one place.
 */

export const SYNC_DATE_FIELDS = Object.freeze({
  SCHEDULED: 'SCHEDULED',
  CREATED_AT: 'CREATED_AT',
});

export const DEFAULT_SYNC_DATE_FIELD = SYNC_DATE_FIELDS.SCHEDULED;

/** `from` bounds the range start, `to` bounds the range end. */
export const SYNC_DATE_FIELD_COLUMNS = Object.freeze({
  [SYNC_DATE_FIELDS.SCHEDULED]: Object.freeze({ from: 'scheduled_start', to: 'scheduled_end' }),
  [SYNC_DATE_FIELDS.CREATED_AT]: Object.freeze({ from: 'created_at', to: 'created_at' }),
});

export const SYNC_DATE_FIELD_LABELS = Object.freeze({
  [SYNC_DATE_FIELDS.SCHEDULED]: 'Scheduled Start / End',
  [SYNC_DATE_FIELDS.CREATED_AT]: 'Created Date',
});

export function isSyncDateField(value) {
  return Object.prototype.hasOwnProperty.call(SYNC_DATE_FIELD_COLUMNS, value);
}
