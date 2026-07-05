/**
 * Merge AIFM POST /api/v1/customers account rows onto job payloads.
 * Job list from /api/v1/jobs often exposes primary contact in name fields; the customer directory
 * row carries `customer_name` as the account / company and `first_name` / `last_name` as contact.
 */

import { buildAifmCustomerDirectoryMap } from './aifmApiClient.js';

/**
 * @param {unknown[]} jobs
 * @param {unknown[]|null|undefined} directoryRows — `data` from AIFM /api/v1/customers
 * @returns {{ jobs: unknown[], enrichedCount: number, directorySize: number }}
 */
export function enrichAifmJobsWithCustomerDirectory(jobs, directoryRows) {
  const list = Array.isArray(jobs) ? jobs : [];
  const map = buildAifmCustomerDirectoryMap(directoryRows);
  const directorySize = map.size;
  if (directorySize === 0) {
    return { jobs: list, enrichedCount: 0, directorySize: 0 };
  }

  let enrichedCount = 0;
  const out = list.map((job) => {
    if (!job || typeof job !== 'object') return job;
    const cid = job.id_customer ?? job.customer_id ?? job.idCustomer ?? job.customerId;
    if (cid == null) return job;
    const row = map.get(String(cid));
    if (!row || typeof row !== 'object') return job;

    enrichedCount++;
    const accountName = String(row.customer_name ?? '').trim();

    return {
      ...job,
      aifm_customer_account_name: accountName || null,
      aifm_customer_account_number:
        row.account_number != null ? String(row.account_number).trim() || null : null,
      aifm_customer_account_row: row,
    };
  });

  return { jobs: out, enrichedCount, directorySize };
}
