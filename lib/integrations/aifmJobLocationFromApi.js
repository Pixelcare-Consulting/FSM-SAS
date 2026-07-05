/**
 * Resolve formatted service address string from AIFM using [AIFM:<id>] in description.
 *
 * 1) Load job from POST /api/v1/jobs (paginated scan).
 * 2) If `service_location` is embedded on that row, format it.
 * 3) Else if `customer_service_location_id` + `id_customer` are set (common), load that row via
 *    POST /api/v1/customers/service_locations (same as aifm/jobs.js resolve_service_locations).
 */

import { formatAifmLocation } from '../utils/aifmLocationFormat.js';
import {
  authorizeAifmBearer,
  findAifmJobPayloadById,
  fetchAifmServiceLocationRow,
} from './aifmApiClient.js';

/**
 * @param {string} description — jobs.description
 * @param {string|null|undefined} scheduledHintIso — portal jobs.scheduled_start (helps job list date window)
 * @returns {Promise<string|null>}
 */
export async function getServiceAddressFromAifmJobDescription(description, scheduledHintIso) {
  const m = String(description || '').match(/\[AIFM:([^\]]+)\]/);
  const aifmId = m ? m[1].trim() : '';
  if (!aifmId) return null;

  const payload = await findAifmJobPayloadById(aifmId, { scheduledIso: scheduledHintIso || null });
  if (!payload) return null;

  const fromInline = formatAifmLocation(payload);
  if (fromInline) return fromInline;

  const cid = payload.id_customer;
  const slocId = payload.customer_service_location_id;
  if (cid == null || slocId == null) return null;

  const apiToken = (process.env.AIFM_API_TOKEN || '').trim().replace(/^["']|["']$/g, '');
  if (!apiToken) return null;

  const auth = await authorizeAifmBearer(process.env.AIFM_BASE_URL, apiToken);
  if (!auth) return null;

  const row = await fetchAifmServiceLocationRow(auth.base, auth.bearer, cid, slocId);
  if (!row) return null;

  return formatAifmLocation({ service_location: row });
}
