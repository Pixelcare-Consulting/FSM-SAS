/**
 * AIFM job → account name (customer directory) → SAP CardCode (C then L).
 * Phase 1: read-only — no customer / sap_lead / jobs DB writes.
 */

import { customerNameSearchVariants } from './aifmSupabaseMasterlistEnrichment.js';
import {
  aifmCustomerNameForImport,
  formatAifmPersonNameLastFirst,
} from '../utils/aifmJobCustomerName.js';
import { formatAifmLocation, sanitizeAifmEmbeddedTagValue } from '../utils/aifmLocationFormat.js';
import {
  computeAifmWorkEndIso,
  parseAifmDateTime,
} from '../utils/aifmJobScheduleTimes.js';
import {
  lookupCardCodeByCustomerName,
  lookupCardCodeByLeadName,
} from '../utils/sapCustomerCardCodeLookup.js';

/** @param {object} job */
export function getAifmCustomerIdFromJob(job) {
  const cid = job?.id_customer ?? job?.customer_id ?? job?.idCustomer ?? job?.customerId;
  if (cid == null) return null;
  const s = String(cid).trim();
  return s || null;
}

/**
 * Site contact on the job row (informational — not used for SAP account lookup).
 * @param {object} job
 */
export function formatAifmJobContactLabel(job) {
  const composed = formatAifmPersonNameLastFirst(
    job?.customer_firstName,
    job?.customer_lastName
  );
  if (composed) return composed;
  const cn = String(job?.customer_name ?? job?.customerName ?? '').trim();
  return cn || null;
}

/**
 * @param {object} job
 * @param {Map<string, object>} directoryMap — from buildAifmCustomerDirectoryMap
 */
export function resolveAifmAccountFromDirectory(job, directoryMap) {
  const idCustomer = getAifmCustomerIdFromJob(job);
  if (!idCustomer) {
    return { idCustomer: null, accountRow: null, accountName: null };
  }
  const accountRow =
    directoryMap instanceof Map ? directoryMap.get(idCustomer) ?? null : null;
  const accountName = accountRow
    ? String(accountRow.customer_name ?? '').trim() || null
    : null;
  return { idCustomer, accountRow, accountName };
}

/**
 * Name variants for SAP OData lookup from AIFM account directory row or plain name.
 * @param {object|string} accountRowOrName
 * @returns {string[]}
 */
export function accountDisplayNamesForSapLookup(accountRowOrName) {
  if (typeof accountRowOrName === 'string') {
    const n = accountRowOrName.trim();
    return n ? customerNameSearchVariants(n) : [];
  }
  if (!accountRowOrName || typeof accountRowOrName !== 'object') return [];

  const out = new Set();
  const customerName = String(accountRowOrName.customer_name ?? '').trim();
  if (customerName) {
    for (const v of customerNameSearchVariants(customerName)) out.add(v);
  }
  const composed = formatAifmPersonNameLastFirst(
    accountRowOrName.first_name,
    accountRowOrName.last_name
  );
  if (composed) {
    for (const v of customerNameSearchVariants(composed)) out.add(v);
  }
  return [...out];
}

/**
 * SAP Customers (C) first, then Leads (L) for each candidate name.
 * @param {string[]} nameVariants
 * @param {object} sessionCookies
 */
export async function resolveSapCardCodeForNameVariants(nameVariants, sessionCookies) {
  const triedNames = [];
  if (!sessionCookies || !Array.isArray(nameVariants) || !nameVariants.length) {
    return {
      cardCode: null,
      cardType: null,
      matchType: null,
      cardName: null,
      triedNames,
    };
  }

  for (const name of nameVariants) {
    const n = String(name || '').trim();
    if (!n || triedNames.includes(n)) continue;
    triedNames.push(n);

    const customerHit = await lookupCardCodeByCustomerName(n, sessionCookies);
    if (customerHit?.cardCode) {
      return {
        cardCode: customerHit.cardCode,
        cardType: 'C',
        matchType: customerHit.match || 'sap_customer',
        cardName: customerHit.cardName ?? null,
        triedNames,
      };
    }

    const leadHit = await lookupCardCodeByLeadName(n, sessionCookies);
    if (leadHit?.cardCode) {
      return {
        cardCode: leadHit.cardCode,
        cardType: 'L',
        matchType: leadHit.match || 'sap_lead',
        cardName: leadHit.cardName ?? null,
        triedNames,
      };
    }
  }

  return {
    cardCode: null,
    cardType: null,
    matchType: null,
    cardName: null,
    triedNames,
  };
}

/**
 * @param {string} accountName — AIFM directory `customer_name`
 * @param {object} sessionCookies
 */
export async function resolveSapCardCodeForAccountName(accountName, sessionCookies) {
  const variants = accountDisplayNamesForSapLookup(accountName);
  return resolveSapCardCodeForNameVariants(variants, sessionCookies);
}

function normalizeNameKey(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * One audit row per AIFM job (no DB writes).
 * @param {object} job
 * @param {Map<string, object>} directoryMap
 * @param {object|null} sessionCookies — null when --skip-sap
 * @param {{ skipSap?: boolean, sapCache?: Map<string, object> }} [options]
 */
export async function buildJobAuditRecord(job, directoryMap, sessionCookies, options = {}) {
  const { skipSap = false, sapCache = new Map() } = options;
  const aifmJobId = job?.id != null ? String(job.id) : null;
  const account = resolveAifmAccountFromDirectory(job, directoryMap);
  const jobContact = formatAifmJobContactLabel(job);
  const jobContactShort =
    String(job?.customer_name ?? job?.customerName ?? '').trim() || null;

  const accountKey = account.accountName
    ? normalizeNameKey(account.accountName)
    : null;
  const contactKey = jobContact ? normalizeNameKey(jobContact) : null;
  const contactDiffersFromAccount = Boolean(
    accountKey && contactKey && accountKey !== contactKey
  );

  const notes = [];
  if (!account.idCustomer) notes.push('missing_id_customer');
  else if (!account.accountRow) notes.push('missing_directory_row');
  else if (!account.accountName) notes.push('missing_account_customer_name');

  let sap = {
    cardCode: null,
    cardType: null,
    matchType: null,
    cardName: null,
    triedNames: [],
  };

  if (!skipSap && sessionCookies && account.accountName) {
    if (accountKey && sapCache.has(accountKey)) {
      sap = sapCache.get(accountKey);
    } else {
      const variants = account.accountRow
        ? accountDisplayNamesForSapLookup(account.accountRow)
        : accountDisplayNamesForSapLookup(account.accountName);
      sap = await resolveSapCardCodeForNameVariants(variants, sessionCookies);
      if (accountKey) sapCache.set(accountKey, sap);
    }
    if (!sap.cardCode) notes.push('no_sap_match');
  } else if (skipSap) {
    notes.push('sap_skipped');
  }

  return {
    aifmJobId,
    idCustomer: account.idCustomer,
    jobContact,
    jobContactShort,
    accountName: account.accountName,
    accountRowPresent: Boolean(account.accountRow),
    contactDiffersFromAccount,
    sapCardCode: sap.cardCode,
    sapCardType: sap.cardType,
    sapMatchType: sap.matchType,
    sapCardName: sap.cardName,
    sapTriedNames: sap.triedNames,
    suggestedCardCode: sap.cardCode,
    notes: notes.join(','),
    jobStartDate: job?.job_start_date ?? null,
    jobEndDate: job?.job_end_date ?? null,
  };
}

function mapAifmPriority(value) {
  const v = (value || '').toString().trim().toLowerCase();
  if (v === 'low') return 'LOW';
  if (v === 'high') return 'HIGH';
  if (v === 'urgent') return 'URGENT';
  return 'MEDIUM';
}

/** Import tier if audit SAP CardCode were applied (mirrors import-jobs.js resolveCustomer). */
export function fsmResolveTierHint(auditRecord) {
  const code = String(auditRecord?.suggestedCardCode || '').trim();
  if (!code) return 'tier3_placeholder';
  if (code.startsWith('L')) return 'tier2b_sap_lead';
  if (code.startsWith('C')) return 'tier1_masterlist_customer';
  return 'tier1_masterlist_customer';
}

/**
 * FSM portal payload preview — same shape as `import-jobs.js` writes to `jobs` (+ resolution metadata).
 * Uses directory account name + audit SAP hit on a synthetic enriched AIFM job row.
 *
 * @param {object} job — raw AIFM job from /api/v1/jobs
 * @param {object} auditRecord — from buildJobAuditRecord
 */
export function buildFsmImportPreview(job, auditRecord) {
  const aifmId = String(auditRecord?.aifmJobId ?? job?.id ?? '');
  const enrichedJob = {
    ...job,
    aifm_customer_account_name: auditRecord?.accountName ?? job?.aifm_customer_account_name,
    sap_card_code: auditRecord?.suggestedCardCode ?? job?.sap_card_code,
    sap_bp_card_name: auditRecord?.sapCardName ?? job?.sap_bp_card_name,
  };

  const importDisplayName = aifmCustomerNameForImport(enrichedJob);
  const importDisplayNameRawJob = aifmCustomerNameForImport(job);
  const locationAddress = formatAifmLocation(job);
  const scheduledStart = parseAifmDateTime(job?.job_start_date, job?.job_start_time);
  const scheduledEnd = computeAifmWorkEndIso(job);

  const aifmDescription = (
    job?.job_description ||
    job?.description ||
    job?.remarks ||
    job?.note ||
    job?.notes ||
    ''
  )
    .toString()
    .trim();

  const customerTagLine =
    importDisplayName && sanitizeAifmEmbeddedTagValue(importDisplayName);
  const addressTagLine =
    locationAddress && sanitizeAifmEmbeddedTagValue(locationAddress);

  const description = [
    `[AIFM:${aifmId}]`,
    customerTagLine ? `[CUSTOMER:${customerTagLine}]` : null,
    addressTagLine ? `[ADDRESS:${addressTagLine}]` : null,
    job?.job_po_number ? `PO: ${job.job_po_number}` : null,
    aifmDescription || null,
  ]
    .filter(Boolean)
    .join('\n');

  const title = ['AIFM Job', aifmId, job?.job_po_number ? `/ PO ${job.job_po_number}` : null]
    .filter(Boolean)
    .join(' ');

  const tierHint = fsmResolveTierHint(auditRecord);

  return {
    aifmJobId: aifmId,
    customerResolution: {
      accountName: auditRecord?.accountName ?? null,
      jobContact: auditRecord?.jobContact ?? null,
      jobContactShort: auditRecord?.jobContactShort ?? null,
      contactDiffersFromAccount: Boolean(auditRecord?.contactDiffersFromAccount),
      importDisplayName,
      importDisplayNameRawJob,
      sap_card_code: auditRecord?.suggestedCardCode ?? null,
      sap_card_type: auditRecord?.sapCardType ?? null,
      sap_card_name: auditRecord?.sapCardName ?? null,
      sap_match_type: auditRecord?.sapMatchType ?? null,
      resolveTierHint: tierHint,
    },
    fsm: {
      title,
      description,
      priority: mapAifmPriority(job?.job_priority),
      status: String(job?.status ?? '554'),
      scheduled_start: scheduledStart,
      scheduled_end: scheduledEnd,
      customer_id: null,
      location_id: null,
      service_call_id: null,
      created_by: null,
    },
    aifmImportPayload: {
      id: job?.id ?? aifmId,
      sap_card_code: auditRecord?.suggestedCardCode ?? null,
      sap_bp_card_name: auditRecord?.sapCardName ?? null,
      sap_card_match: auditRecord?.sapMatchType ?? null,
      aifm_customer_account_name: auditRecord?.accountName ?? null,
      customer_name: importDisplayName,
    },
  };
}

/** Account name for SAP / masterlist — directory only, never job site contact alone. */
export function aifmAccountNameForSapLookup(job) {
  const fromDir = String(job?.aifm_customer_account_name ?? '').trim();
  if (fromDir) return fromDir;
  return null;
}

/**
 * For jobs still missing sap_card_code after Supabase masterlist: live SAP Service Layer (C then L).
 * Dedupes by account name. Does not write to DB.
 *
 * @param {object[]} jobs
 * @param {object} sessionCookies — { b1session, routeid }
 * @param {Map<string, object>} [options.directoryMap] — optional; fills account names when missing
 */
export async function enrichAifmJobsWithLiveSapLookup(jobs, sessionCookies, options = {}) {
  const list = Array.isArray(jobs) ? jobs : [];
  if (!sessionCookies?.b1session || !list.length) {
    return { jobs: list, matched: 0, uniqueNames: 0 };
  }

  const { directoryMap = null } = options;
  const sapByAccount = new Map();

  const namesToResolve = new Set();
  for (const job of list) {
    if ((job?.sap_card_code || '').toString().trim()) continue;
    let accountName = aifmAccountNameForSapLookup(job);
    if (!accountName && directoryMap) {
      accountName = resolveAifmAccountFromDirectory(job, directoryMap).accountName;
    }
    if (accountName) namesToResolve.add(accountName);
  }

  for (const accountName of namesToResolve) {
    const key = normalizeNameKey(accountName);
    if (sapByAccount.has(key)) continue;
    const variants = accountDisplayNamesForSapLookup(accountName);
    const sap = await resolveSapCardCodeForNameVariants(variants, sessionCookies);
    if (sap.cardCode) sapByAccount.set(key, sap);
  }

  let matched = 0;
  const enriched = list.map((job) => {
    if ((job?.sap_card_code || '').toString().trim()) return job;
    let accountName = aifmAccountNameForSapLookup(job);
    if (!accountName && directoryMap) {
      accountName = resolveAifmAccountFromDirectory(job, directoryMap).accountName;
    }
    if (!accountName) return job;
    const sap = sapByAccount.get(normalizeNameKey(accountName));
    if (!sap?.cardCode) return job;
    matched++;
    const matchLabel =
      sap.cardType === 'L' ? `sap_live_lead_${sap.matchType || 'hit'}` : `sap_live_customer_${sap.matchType || 'hit'}`;
    return {
      ...job,
      aifm_customer_account_name: accountName,
      sap_card_code: sap.cardCode,
      sap_bp_card_name: sap.cardName || accountName,
      sap_card_match: matchLabel,
    };
  });

  return { jobs: enriched, matched, uniqueNames: namesToResolve.size };
}

/** Human-readable log line for one audit record. */
export function formatJobAuditLogLine(record) {
  const sap =
    record.sapCardCode != null
      ? `${record.sapCardType || '?'}=${record.sapCardCode}${record.sapMatchType ? ` (${record.sapMatchType})` : ''}`
      : 'SAP=—';
  const suggested =
    record.suggestedCardCode != null ? record.suggestedCardCode : '—';
  const contact = record.jobContact || record.jobContactShort || '—';
  const account = record.accountName || '—';
  return [
    `AIFM ${record.aifmJobId ?? '?'}`,
    `id_customer=${record.idCustomer ?? '—'}`,
    `job_contact=${contact}`,
    `account=${account}`,
    sap,
    `suggested=${suggested}`,
    record.notes ? `notes=${record.notes}` : '',
  ]
    .filter(Boolean)
    .join(' | ');
}
