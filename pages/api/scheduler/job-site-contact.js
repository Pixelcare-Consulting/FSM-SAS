import { getSupabaseAdmin } from "../../../lib/supabase/server";
import {
  groupRowsByCustomerId,
  resolveJobSiteContactMeta,
} from "../../../lib/scheduler/schedulerSiteContact";

const REST_IN_CHUNK = 100;

function chunkIds(ids) {
  const unique = [...new Set((ids || []).filter(Boolean))];
  const chunks = [];
  for (let i = 0; i < unique.length; i += REST_IN_CHUNK) {
    chunks.push(unique.slice(i, i + REST_IN_CHUNK));
  }
  return chunks;
}

const JOB_CONTACT_SELECT = `
  id,
  customer_id,
  contact_id,
  customer:customer_id ( id, customer_name, customer_address, phone_number, email ),
  location:location_id ( id, location_name )
`;

async function fetchCustomerLocationsByCustomerIdsChunked(supabase, customerIds) {
  const chunks = chunkIds(customerIds);
  if (chunks.length === 0) return [];
  const merged = [];
  for (const batch of chunks) {
    const { data, error } = await supabase
      .from("customer_location")
      .select("id, customer_id, site_id, building, location_id")
      .in("customer_id", batch);
    if (error) {
      console.warn("[SchedulerAPI] customer_location fetch:", error.message);
      break;
    }
    if (data?.length) merged.push(...data);
  }
  return merged;
}

async function fetchContactsByCustomerIdsChunked(supabase, customerIds) {
  const chunks = chunkIds(customerIds);
  if (chunks.length === 0) return [];
  const merged = [];
  for (const batch of chunks) {
    const { data, error } = await supabase
      .from("contacts")
      .select(
        "id, customer_id, customer_location_id, first_name, middle_name, last_name, tel1, tel2, email"
      )
      .in("customer_id", batch);
    if (error) {
      console.warn("[SchedulerAPI] contacts fetch:", error.message);
      break;
    }
    if (data?.length) merged.push(...data);
  }
  return merged;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const jobId = req.query.jobId;
  if (!jobId || Array.isArray(jobId)) {
    return res.status(400).json({ error: "jobId is required" });
  }

  res.setHeader("Cache-Control", "private, no-store, max-age=0, must-revalidate");

  try {
    const supabase = getSupabaseAdmin();
    const { data: job, error } = await supabase
      .from("jobs")
      .select(JOB_CONTACT_SELECT)
      .eq("id", jobId)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) throw error;
    if (!job) return res.status(404).json({ error: "Job not found" });

    const customerId = job.customer_id;
    if (!customerId) return res.status(200).json({});

    const [locsFlat, contactsFlat] = await Promise.all([
      fetchCustomerLocationsByCustomerIdsChunked(supabase, [customerId]),
      fetchContactsByCustomerIdsChunked(supabase, [customerId]),
    ]);

    const siteMeta = resolveJobSiteContactMeta(
      job,
      groupRowsByCustomerId(locsFlat),
      groupRowsByCustomerId(contactsFlat)
    );

    return res.status(200).json(siteMeta || {});
  } catch (error) {
    console.error("[SchedulerAPI] job-site-contact", error);
    return res.status(500).json({
      error: error.message || "Unable to load job site contact.",
    });
  }
}
