import { pickMasterlistContactRow } from './pickMasterlistSiteContact.js';

/** Map Supabase job_tasks rows to UI taskList shape. Never fabricate createdAt. */
export function mapJobTasksToTaskList(jobTasks) {
  return (jobTasks || []).map((task, index) => ({
    taskID: task.id || `task-${index}`,
    taskName: task.task_name || '',
    taskDescription: task.task_description || '',
    isPriority: task.is_required || false,
    isDone: task.is_completed === true,
    completedByTechnicianId: task.completed_by_technician_id || null,
    completedByName:
      (Array.isArray(task.completed_by_technician)
        ? task.completed_by_technician[0]?.full_name
        : task.completed_by_technician?.full_name) || null,
    createdAt: task.created_at || null,
    completionDate: null,
  }));
}

export function buildActorInfo(userRecord = null, technicianRecord = null, accountLabel = null) {
  const fullName =
    accountLabel ||
    technicianRecord?.full_name ||
    userRecord?.full_name ||
    userRecord?.username ||
    null;
  const email =
    technicianRecord?.email ||
    userRecord?.email ||
    userRecord?.username ||
    null;
  const username = userRecord?.username || null;

  if (!fullName && !email && !username) {
    return null;
  }

  return {
    fullName,
    email,
    username,
    accountLabel,
  };
}

const stripMasterlistNamePlaceholder = (s) => {
  const t = String(s || '').trim();
  if (t === '-' || t === '—') return '';
  return t;
};

export function mapMasterlistContactToJobContact(contact) {
  if (!contact) return null;
  const fn = stripMasterlistNamePlaceholder(contact.first_name);
  const mn = stripMasterlistNamePlaceholder(contact.middle_name);
  const ln = stripMasterlistNamePlaceholder(contact.last_name);
  const full = [fn, mn, ln].filter(Boolean).join(' ').trim();
  return {
    contactID: contact.id,
    contactFullname: full,
    firstName: fn || undefined,
    middleName: mn || undefined,
    lastName: ln || undefined,
    phoneNumber: contact.tel1 != null ? String(contact.tel1).trim() : '',
    mobilePhone: contact.tel2 != null ? String(contact.tel2).trim() : '',
    email: contact.email != null ? String(contact.email).trim() : '',
  };
}

/** Display fields for mapped job contacts or raw masterlist embeds (tel1 / first_name). */
export function getJobContactDisplayFields(contact) {
  if (!contact || typeof contact !== 'object') {
    return { name: '', officePhone: '', mobilePhone: '', email: '' };
  }
  const fn = stripMasterlistNamePlaceholder(contact.firstName || contact.first_name);
  const mn = stripMasterlistNamePlaceholder(contact.middleName || contact.middle_name);
  const ln = stripMasterlistNamePlaceholder(contact.lastName || contact.last_name);
  const joined = [fn, mn, ln].filter(Boolean).join(' ').trim();
  const name = stripMasterlistNamePlaceholder(
    contact.contactFullname || contact.contact_fullname || joined
  );
  const officePhone = String(
    contact.phoneNumber || contact.tel1 || contact.phone_number || ''
  ).trim();
  const mobilePhone = String(
    contact.mobilePhone || contact.tel2 || contact.mobile_phone || ''
  ).trim();
  const email = String(contact.email || '').trim();
  return { name, officePhone, mobilePhone, email };
}

function didForeignKeyClear(prevId, nextId) {
  if (nextId === undefined) return false;
  return prevId != null && nextId === null;
}

function mergeNestedContact(prevJob, row, nextContactId, contactCleared) {
  if (contactCleared) return null;
  if (nextContactId && row.contact) {
    const raw = row.contact;
    if (raw.contactFullname != null || raw.phoneNumber != null || raw.contactID) {
      return raw;
    }
    return mapMasterlistContactToJobContact(raw) || prevJob.contact;
  }
  return prevJob.contact;
}

function mergeNestedLocation(prevJob, row, nextLocationId, locationCleared) {
  if (locationCleared) return null;
  if (nextLocationId && row.location) return row.location;
  return prevJob.location;
}

/** Merge flat jobs-row realtime payload without dropping nested relations. */
export function mergeJobHeaderFromRow(prevJob, row) {
  if (!prevJob || !row) return prevJob;

  const prevContactId = prevJob.contact_id;
  const nextContactId = Object.prototype.hasOwnProperty.call(row, 'contact_id')
    ? row.contact_id
    : prevContactId;
  const contactCleared = didForeignKeyClear(prevContactId, nextContactId);

  const prevLocationId = prevJob.location_id;
  const nextLocationId = Object.prototype.hasOwnProperty.call(row, 'location_id')
    ? row.location_id
    : prevLocationId;
  const locationCleared = didForeignKeyClear(prevLocationId, nextLocationId);

  return {
    ...prevJob,
    ...row,
    jobNo: row.job_number ?? prevJob.jobNo,
    jobName: row.title ?? prevJob.jobName,
    jobStatus: row.status ?? prevJob.jobStatus,
    jobType: row.category ?? prevJob.jobType,
    jobDescription: row.description ?? prevJob.jobDescription,
    description: row.description ?? prevJob.description,
    technician_jobs: prevJob.technician_jobs,
    job_tasks: prevJob.job_tasks,
    job_equipments: prevJob.job_equipments,
    taskList: prevJob.taskList,
    customer: prevJob.customer,
    location: mergeNestedLocation(prevJob, row, nextLocationId, locationCleared),
    service_call: prevJob.service_call,
    sales_order: prevJob.sales_order,
    contact: mergeNestedContact(prevJob, row, nextContactId, contactCleared),
    payment_profile: prevJob.payment_profile,
    created_by_user: prevJob.created_by_user,
  };
}

export function isJobRouteIdUuid(jobId) {
  return typeof jobId === 'string' && jobId.includes('-') && jobId.length === 36;
}

export function buildTechnicianLocationsMap(locationRows) {
  const locationsMap = {};
  for (const loc of locationRows || []) {
    const techId = loc.technician_id;
    if (
      !locationsMap[techId] ||
      new Date(loc.tracked_at) > new Date(locationsMap[techId].tracked_at)
    ) {
      locationsMap[techId] = loc;
    }
  }
  return locationsMap;
}

export function resolveMatchedCustomerLocation(normalizedJob, customerLocations) {
  if (!customerLocations?.length) return null;

  let matchedCustLoc = null;
  const jobLocationId = normalizedJob.location?.id;

  if (jobLocationId) {
    matchedCustLoc = customerLocations.find((cl) => cl.location_id === jobLocationId);
  }

  if (!matchedCustLoc && normalizedJob.location?.location_name) {
    const locName = String(normalizedJob.location.location_name).trim().toLowerCase();
    matchedCustLoc = customerLocations.find((cl) => {
      const sid = String(cl.site_id || '').trim().toLowerCase();
      const bld = String(cl.building || '').trim().toLowerCase();
      return (sid && locName.includes(sid)) || (bld && locName.includes(bld));
    });
  }

  return matchedCustLoc;
}

export function resolveJobSiteContact({
  jobData,
  contactsRows,
  customerLocations,
  matchedCustLoc,
  customerPhone,
  customerEmail,
}) {
  const siteContactOrder = [];
  if (matchedCustLoc?.id) {
    siteContactOrder.push(matchedCustLoc.id);
  }
  for (const cl of customerLocations || []) {
    if (cl?.id && (!matchedCustLoc?.id || String(cl.id) !== String(matchedCustLoc.id))) {
      siteContactOrder.push(cl.id);
    }
  }

  let picked = null;
  const savedContactId = jobData.contact_id;
  if (savedContactId) {
    if (jobData.contact && String(jobData.contact.id) === String(savedContactId)) {
      picked = jobData.contact;
    } else {
      picked = (contactsRows || []).find((r) => String(r.id) === String(savedContactId));
    }
  }
  if (!picked) {
    picked = pickMasterlistContactRow(contactsRows || [], siteContactOrder);
  }

  let contact = picked ? mapMasterlistContactToJobContact(picked) : null;
  if (contact) {
    if (!contact.phoneNumber && customerPhone) {
      contact = { ...contact, phoneNumber: String(customerPhone).trim() };
    }
    if (!contact.email && customerEmail) {
      contact = { ...contact, email: String(customerEmail).trim() };
    }
  } else if (customerPhone || customerEmail) {
    contact = {
      contactID: 'portal-primary',
      contactFullname: '',
      firstName: '',
      middleName: '',
      lastName: '',
      phoneNumber: customerPhone ? String(customerPhone).trim() : '',
      mobilePhone: '',
      email: customerEmail ? String(customerEmail).trim() : '',
    };
  }

  return contact;
}
