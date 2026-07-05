import {
  pickMasterlistContactRow,
  masterlistContactRowToSchedulerFields,
} from "../jobs/pickMasterlistSiteContact";

export function groupRowsByCustomerId(rows) {
  const m = {};
  for (const r of rows || []) {
    const id = r.customer_id;
    if (!id) continue;
    if (!m[id]) m[id] = [];
    m[id].push(r);
  }
  return m;
}

export function resolveJobSiteContactMeta(job, locsByCustomerId, contactsByCustomerId) {
  const cid = job.customer_id;
  if (!cid) return null;

  const customer = job.customer;
  const customerLocations = locsByCustomerId[cid] || [];
  const contactsRows = contactsByCustomerId[cid] || [];

  let matchedCustLoc = null;
  const jobLocId = job.location?.id;
  if (jobLocId) {
    matchedCustLoc = customerLocations.find((cl) => cl.location_id === jobLocId);
  }
  if (!matchedCustLoc && job.location?.location_name) {
    const locName = String(job.location.location_name).trim().toLowerCase();
    matchedCustLoc = customerLocations.find((cl) => {
      const sid = String(cl.site_id || "").trim().toLowerCase();
      const bld = String(cl.building || "").trim().toLowerCase();
      return (sid && locName.includes(sid)) || (bld && locName.includes(bld));
    });
  }

  const siteContactOrder = [];
  if (matchedCustLoc?.id) siteContactOrder.push(matchedCustLoc.id);
  for (const cl of customerLocations) {
    if (cl?.id && (!matchedCustLoc?.id || String(cl.id) !== String(matchedCustLoc.id))) {
      siteContactOrder.push(cl.id);
    }
  }

  let picked = null;
  if (job.contact_id) {
    picked = contactsRows.find((r) => String(r.id) === String(job.contact_id));
  }
  if (!picked) {
    picked = pickMasterlistContactRow(contactsRows, siteContactOrder);
  }
  let fields = picked ? masterlistContactRowToSchedulerFields(picked) : null;

  if (fields) {
    if (!fields.siteContactPhone && customer?.phone_number) {
      fields = { ...fields, siteContactPhone: String(customer.phone_number).trim() };
    }
    if (!fields.siteContactEmail && customer?.email) {
      fields = { ...fields, siteContactEmail: String(customer.email).trim() };
    }
  } else if (customer?.phone_number || customer?.email) {
    fields = {
      siteContactName: "",
      siteContactPhone: customer.phone_number ? String(customer.phone_number).trim() : "",
      siteContactMobile: "",
      siteContactEmail: customer.email ? String(customer.email).trim() : "",
      siteContactId: null,
    };
  }

  if (!fields) return null;

  if (matchedCustLoc?.id && contactsRows.length) {
    const atSite = contactsRows.filter(
      (r) => r.customer_location_id && String(r.customer_location_id) === String(matchedCustLoc.id)
    );
    if (atSite.length > 1) {
      fields = { ...fields, siteContactExtraCount: atSite.length - 1 };
    }
  }

  return fields;
}
