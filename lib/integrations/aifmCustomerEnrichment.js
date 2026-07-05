const SKIP = new Set([
  "",
  "—",
  "..",
  ".",
  "-",
  "--",
  "n/a",
  "na",
  "null",
  "undefined",
  "none",
]);

function cleanMeaningful(value) {
  const text = String(value ?? "").trim();
  if (!text || SKIP.has(text.toLowerCase())) return "";
  return text;
}

function normalizeId(value) {
  const text = String(value ?? "").trim();
  return text || "";
}

export function buildAifmCustomerMap(rows) {
  const map = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const id = normalizeId(row?.id);
    if (!id || map.has(id)) continue;
    map.set(id, row);
  }
  return map;
}

export function enrichAifmJobsWithCustomerDetails(jobs, customerRows) {
  const customerMap = buildAifmCustomerMap(customerRows);
  let matched = 0;

  const enrichedJobs = (Array.isArray(jobs) ? jobs : []).map((job) => {
    const customerId = normalizeId(job?.id_customer ?? job?.customer_id ?? job?.idCustomer ?? job?.customerId);
    const customer = customerId ? customerMap.get(customerId) : null;
    if (!customer) return job;

    matched++;

    return {
      ...job,
      customer_name: cleanMeaningful(customer.customer_name) || job.customer_name || null,
      customer_firstName: cleanMeaningful(customer.first_name) || job.customer_firstName || null,
      customer_lastName: cleanMeaningful(customer.last_name) || job.customer_lastName || null,
      customer_phone: cleanMeaningful(customer.phone) || job.customer_phone || null,
      customer_email: cleanMeaningful(customer.email) || job.customer_email || null,
      customer_account_number: cleanMeaningful(customer.account_number) || job.customer_account_number || null,
      aifm_customer_details: customer,
    };
  });

  return {
    jobs: enrichedJobs,
    matched,
    totalCustomers: customerMap.size,
  };
}
