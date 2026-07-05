/**
 * Build merge fields for transactional job emails (server-side).
 * Import only from API routes — not from client components.
 */

import { EMAIL_ADDRESS_RE } from './emailConstants';
import { pickMasterlistContactRow } from '../jobs/pickMasterlistSiteContact';
import {
  formatSingaporeCompletedAt,
  formatSingaporeScheduledRange,
} from '../utils/singaporeDateTime';

/**
 * @param {import('next').NextApiRequest} req
 * @returns {string}
 */
export function requestAppOrigin(req) {
  const xfProto = req.headers['x-forwarded-proto'];
  const proto = Array.isArray(xfProto) ? xfProto[0] : xfProto || 'http';
  const xfHost = req.headers['x-forwarded-host'];
  const host = Array.isArray(xfHost) ? xfHost[0] : xfHost || req.headers.host;
  if (!host || typeof host !== 'string') return '';
  return `${proto}://${host}`;
}

/** @param {unknown} loc */
function formatServiceLocationLine(loc) {
  if (!loc || typeof loc !== 'object') return '';
  const o = loc;
  const building = o.building ? String(o.building).trim() : '';
  const block = o.block ? String(o.block).trim() : '';
  const countryName = o.country_name || o.country || '';
  const zipCode = o.zip_code || '';
  const city = o.city || '';
  const state = o.state || o.state_province || '';

  const numberedStreet = [o.street_number, o.street]
    .map((p) => (p == null ? '' : String(p).trim()))
    .filter(Boolean)
    .join(' ');

  let streetAddress = '';
  const rawAddr = o.street ?? o.address ?? o.location_name ?? o.locationName;
  if (typeof rawAddr === 'string' && rawAddr.trim()) {
    streetAddress = rawAddr.trim();
  } else if (rawAddr && typeof rawAddr === 'object') {
    const a = rawAddr;
    const nested = [
      a.streetNo || a.street_number,
      a.streetAddress || a.street,
      a.block,
      a.buildingNo || a.building,
      a.city,
      a.stateProvince || a.state,
      a.postalCode || a.zip_code,
      a.country,
    ]
      .map((p) => (p == null ? '' : String(p).trim()))
      .filter(Boolean);
    streetAddress = nested.join(', ');
  }

  if (!streetAddress && numberedStreet) {
    streetAddress = numberedStreet;
  }

  const fullAddressParts = [streetAddress, building, block, city, state, countryName, zipCode].filter(
    Boolean
  );
  return fullAddressParts.join(', ');
}

/**
 * @param {Array<Record<string, unknown>>} contacts
 */
function buildContactsSummaryLine(contacts) {
  if (!contacts || !contacts.length) return '';
  const parts = [];
  for (const c of contacts) {
    if (!c || typeof c !== 'object') continue;
    const first = c.first_name != null ? String(c.first_name).trim() : '';
    const mid = c.middle_name != null ? String(c.middle_name).trim() : '';
    const last = c.last_name != null ? String(c.last_name).trim() : '';
    const name = [first, mid, last].filter(Boolean).join(' ');
    const email = c.email != null ? String(c.email).trim() : '';
    const tel = c.tel1 != null ? String(c.tel1).trim() : '';
    const segs = [name, email, tel].filter(Boolean);
    if (segs.length) parts.push(segs.join(' — '));
  }
  return parts.join('; ');
}

/**
 * @param {object | null | undefined} matchedCustLoc
 * @param {Array<Record<string, unknown>>} customerLocations
 */
function buildSiteContactOrder(matchedCustLoc, customerLocations) {
  const siteContactOrder = [];
  if (matchedCustLoc?.id) {
    siteContactOrder.push(matchedCustLoc.id);
  }
  for (const cl of customerLocations || []) {
    if (cl?.id && (!matchedCustLoc?.id || String(cl.id) !== String(matchedCustLoc.id))) {
      siteContactOrder.push(cl.id);
    }
  }
  return siteContactOrder;
}

/**
 * @param {Record<string, unknown>} job
 * @param {Array<Record<string, unknown>>} customerLocations
 */
function matchCustomerLocationForJob(job, customerLocations) {
  if (!customerLocations?.length) return null;
  const location = job.location && typeof job.location === 'object' ? job.location : {};
  const jobLocationId = location.id;

  if (jobLocationId) {
    const hit = customerLocations.find((cl) => cl.location_id === jobLocationId);
    if (hit) return hit;
  }

  if (location.location_name) {
    const locName = String(location.location_name).trim().toLowerCase();
    return (
      customerLocations.find((cl) => {
        const sid = String(cl.site_id || '').trim().toLowerCase();
        const bld = String(cl.building || '').trim().toLowerCase();
        return (sid && locName.includes(sid)) || (bld && locName.includes(bld));
      }) || null
    );
  }

  return null;
}

/**
 * @param {Awaited<ReturnType<typeof fetchJobBundleForEmail>>} bundle
 */
export function resolveSiteContactRow(bundle) {
  if (!bundle) return null;
  const job = bundle.job;
  if (job?.contact_id) {
    if (bundle.contact && String(bundle.contact.id) === String(job.contact_id)) {
      return bundle.contact;
    }
    const hit = (bundle.contacts || []).find(
      (c) => c?.id && String(c.id) === String(job.contact_id),
    );
    if (hit) return hit;
  }
  const siteContactOrder = buildSiteContactOrder(bundle.matchedCustLoc, bundle.customerLocations);
  return pickMasterlistContactRow(bundle.contacts || [], siteContactOrder);
}

/**
 * Site-aware To address — matches job detail Customer Details email row.
 * @param {Awaited<ReturnType<typeof fetchJobBundleForEmail>>} bundle
 */
export function resolveSiteContactEmail(bundle) {
  if (!bundle) return '';
  const picked = resolveSiteContactRow(bundle);
  const pe = picked?.email != null ? String(picked.email).trim() : '';
  if (pe && EMAIL_ADDRESS_RE.test(pe)) return pe;

  const customer = bundle.job.customer && typeof bundle.job.customer === 'object' ? bundle.job.customer : {};
  const ce = customer.email != null ? String(customer.email).trim() : '';
  if (ce && EMAIL_ADDRESS_RE.test(ce)) return ce;
  return '';
}

/**
 * Resolve staff email: technician row by user_id, else username if looks like email.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string | null | undefined} userId
 */
export async function resolveUserDeliverableEmail(supabase, userId) {
  if (!userId) return null;
  const { data: tech } = await supabase
    .from('technicians')
    .select('email')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle();
  const te = tech?.email && String(tech.email).trim();
  if (te && EMAIL_ADDRESS_RE.test(te)) return te;

  const { data: user } = await supabase
    .from('users')
    .select('username')
    .eq('id', userId)
    .is('deleted_at', null)
    .maybeSingle();
  const un = user?.username && String(user.username).trim();
  if (un && EMAIL_ADDRESS_RE.test(un)) return un;
  return null;
}

/**
 * Fetch job + relations for email merge tags.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} jobId
 */
export async function fetchJobBundleForEmail(supabase, jobId) {
  const { data: job, error } = await supabase
    .from('jobs')
    .select(
      `
      id,
      job_number,
      title,
      description,
      status,
      scheduled_start,
      scheduled_end,
      created_by,
      customer_id,
      contact_id,
      customer:customer_id ( id, customer_name, email, phone_number ),
      contact:contact_id ( id, first_name, middle_name, last_name, email, tel1, tel2, customer_location_id ),
      location:location_id ( * )
    `
    )
    .eq('id', jobId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) throw error;
  if (!job) return null;

  const customerId = job.customer_id;
  let contacts = [];
  let customerLocations = [];
  let matchedCustLoc = null;
  if (customerId) {
    const { data: locRows } = await supabase
      .from('customer_location')
      .select('id, location_id, site_id, building')
      .eq('customer_id', customerId)
      .order('site_id', { ascending: true });
    customerLocations = locRows || [];
    matchedCustLoc = matchCustomerLocationForJob(job, customerLocations);

    const { data: cRows } = await supabase
      .from('contacts')
      .select('id, first_name, middle_name, last_name, email, tel1, tel2, customer_location_id')
      .eq('customer_id', customerId)
      .limit(25);
    contacts = cRows || [];
  }

  const { data: tjRows, error: tjErr } = await supabase
    .from('technician_jobs')
    .select(
      `
      technician_id,
      technician:technician_id ( id, full_name, email )
    `
    )
    .eq('job_id', jobId)
    .is('deleted_at', null);

  if (tjErr) throw tjErr;

  const technicians = (tjRows || [])
    .map((r) => r.technician)
    .filter(Boolean);

  return { job, contacts, technicians, customerLocations, matchedCustLoc, contact: job.contact || null };
}

/**
 * @param {object} opts
 * @param {Awaited<ReturnType<typeof fetchJobBundleForEmail>>} opts.bundle
 * @param {string} opts.appOrigin
 * @param {string | null} [opts.primaryTechnicianId] — for assignment: who the mail is for
 * @param {Date | string} [opts.completedAt]
 * @param {Partial<Record<string, string>>} [opts.followUp]
 * @param {Record<string, unknown>} [opts.mergedSettings] — for company_name from fromName
 */
export function buildMergeVarsFromBundle({
  bundle,
  appOrigin,
  primaryTechnicianId = null,
  completedAt = null,
  followUp = {},
  mergedSettings = {},
}) {
  if (!bundle) return {};

  const { job, contacts, technicians } = bundle;
  const customer = job.customer && typeof job.customer === 'object' ? job.customer : {};
  const location = job.location && typeof job.location === 'object' ? job.location : {};

  const locationName =
    (location.location_name && String(location.location_name).trim()) ||
    (customer.customer_name && String(customer.customer_name).trim()) ||
    '';
  const serviceLocation = formatServiceLocationLine(location);

  const siteContact = resolveSiteContactRow(bundle);
  const contactName = siteContact
    ? [siteContact.first_name, siteContact.middle_name, siteContact.last_name]
        .map((x) => (x != null ? String(x).trim() : ''))
        .filter(Boolean)
        .join(' ')
    : '';
  const contactEmail =
    siteContact?.email != null
      ? String(siteContact.email).trim()
      : customer.email != null
        ? String(customer.email).trim()
        : '';
  const contactPhone = siteContact?.tel1 != null ? String(siteContact.tel1).trim() : '';

  const techForName = primaryTechnicianId
    ? technicians.find((t) => t && String(t.id) === String(primaryTechnicianId))
    : null;
  const technicianName =
    (techForName?.full_name && String(techForName.full_name).trim()) ||
    technicians.map((t) => t?.full_name && String(t.full_name).trim()).filter(Boolean).join(', ') ||
    '';

  const origin = (appOrigin || '').replace(/\/$/, '');
  const jobUrl = origin ? `${origin}/dashboard/jobs/${job.id}` : `/dashboard/jobs/${job.id}`;

  const fromName = mergedSettings?.fromName != null ? String(mergedSettings.fromName).trim() : '';
  const companyName =
    String((followUp.company_name != null && followUp.company_name) || '').trim() ||
    fromName ||
    'Your company';

  /** @type {Record<string, string>} */
  const base = {
    job_number: job.job_number != null ? String(job.job_number) : '',
    job_title: job.title != null ? String(job.title) : '',
    customer_name: customer.customer_name != null ? String(customer.customer_name) : '',
    location_name: locationName,
    service_location: serviceLocation,
    contacts: buildContactsSummaryLine(contacts),
    contact_name: contactName,
    contact_email: contactEmail,
    contact_phone: contactPhone,
    technician_name: technicianName,
    scheduled_date: formatSingaporeScheduledRange(job.scheduled_start, job.scheduled_end),
    job_url: jobUrl,
    company_name: companyName,
  };

  if (completedAt) {
    base.completed_at = formatSingaporeCompletedAt(completedAt);
  }

  if (followUp && typeof followUp === 'object') {
    for (const [k, v] of Object.entries(followUp)) {
      if (v != null && typeof v === 'string') base[k] = v;
    }
  }

  const followUrl = origin ? `${origin}/dashboard/jobs/${job.id}` : `/dashboard/jobs/${job.id}`;
  if (!base.follow_up_url) base.follow_up_url = followUrl;

  return base;
}

export function resolveCustomerToEmail(bundle) {
  return resolveSiteContactEmail(bundle);
}

/**
 * Display label for emails (technician full_name preferred, else username).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string | null | undefined} userId
 */
export async function resolveUserDisplayName(supabase, userId) {
  if (!userId) return '';
  const { data: tech } = await supabase
    .from('technicians')
    .select('full_name')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle();
  const fn = tech?.full_name != null ? String(tech.full_name).trim() : '';
  if (fn) return fn;
  const { data: user } = await supabase
    .from('users')
    .select('username')
    .eq('id', userId)
    .is('deleted_at', null)
    .maybeSingle();
  return user?.username != null ? String(user.username).trim() : '';
}

/**
 * Assigned technician emails from bundle
 */
export function collectTechnicianEmails(bundle) {
  if (!bundle?.technicians?.length) return [];
  return [
    ...new Set(
      bundle.technicians
        .map((t) => (t?.email != null ? String(t.email).trim() : ''))
        .filter((e) => EMAIL_ADDRESS_RE.test(e))
    ),
  ];
}
