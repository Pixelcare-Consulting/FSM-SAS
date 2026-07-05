/**
 * Pure snapshot builders for audit_logs.changes diffs.
 * Shared by API routes and client-side audit helpers.
 */

function diffSnapshots(before = {}, after = {}) {
  const changes = {};
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  for (const key of keys) {
    const b = before?.[key];
    const a = after?.[key];
    if (JSON.stringify(b) !== JSON.stringify(a)) {
      changes[key] = { before: b ?? null, after: a ?? null };
    }
  }
  return Object.keys(changes).length ? changes : null;
}

export { diffSnapshots };

export function buildLocationDeleteSnapshot(locationRow, addressDetail) {
  if (!locationRow) {
    return {
      siteId: null,
      addressType: null,
      addressStatus: null,
      addressNotes: null,
    };
  }
  return {
    siteId: locationRow.site_id ?? null,
    addressType: locationRow.address_type ?? null,
    addressStatus: addressDetail?.status ?? locationRow.status ?? null,
    addressNotes: addressDetail?.address_notes ?? null,
  };
}

export function buildAddressDetailsSnapshot(row) {
  const empty = {
    addressName: null,
    addressType: null,
    status: null,
    addressNotes: null,
    customerLocationId: null,
  };
  if (!row) return empty;
  return {
    addressName: row.address_name ?? row.addressName ?? null,
    addressType: row.address_type ?? row.addressType ?? null,
    status: row.status ?? null,
    addressNotes: row.address_notes ?? row.addressNotes ?? null,
    customerLocationId:
      row.customer_location_label ??
      row.customerLocationLabel ??
      row.customer_location_id ??
      row.customerLocationId ??
      null,
  };
}

export function buildContactSnapshot(contact) {
  const empty = {
    contactPerson: null,
    contactEmail: null,
    contactPhone: null,
  };
  if (!contact) return empty;

  const first = String(contact.first_name ?? contact.firstName ?? '').trim();
  const last = String(contact.last_name ?? contact.lastName ?? '').trim();
  const parts = [first, last].filter((p) => p && p !== '-');
  const contactPerson =
    parts.length > 0
      ? parts.join(' ')
      : contact.contact_person ?? contact.contactPerson ?? null;

  return {
    contactPerson: contactPerson || null,
    contactEmail: contact.email ?? contact.contact_email ?? null,
    contactPhone: contact.tel1 ?? contact.contact_phone ?? contact.contactPhone ?? null,
  };
}

export function buildCustomerSnapshot(customer) {
  const empty = {
    customerName: null,
    email: null,
    phoneNumber: null,
    customerAddress: null,
  };
  if (!customer) return empty;
  return {
    customerName: customer.customer_name ?? customer.customerName ?? null,
    email: customer.email ?? null,
    phoneNumber: customer.phone_number ?? customer.phoneNumber ?? null,
    customerAddress: customer.customer_address ?? customer.customerAddress ?? null,
  };
}

export function buildFollowUpSnapshot(followUp) {
  const empty = {
    type: null,
    status: null,
    priority: null,
    notes: null,
  };
  if (!followUp) return empty;
  return {
    type: followUp.type ?? null,
    status: followUp.status ?? null,
    priority: followUp.priority ?? null,
    notes: followUp.notes ?? null,
  };
}

export function buildTaskSnapshot(task) {
  const empty = {
    taskName: null,
    taskDescription: null,
    isDone: null,
    isPriority: null,
  };
  if (!task) return empty;
  return {
    taskName: task.taskName ?? task.task_name ?? null,
    taskDescription: task.taskDescription ?? task.task_description ?? null,
    isDone: task.isDone ?? task.is_done ?? false,
    isPriority: task.isPriority ?? task.is_required ?? false,
  };
}

/** Compact schedule snapshot for worker audit logs. */
export function buildScheduleSnapshot(schedules) {
  if (!schedules || typeof schedules !== 'object') return '';
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const parts = [];
  for (const day of days) {
    const d = schedules[day];
    if (!d) continue;
    const shifts = ['morning', 'afternoon', 'evening'];
    for (const shift of shifts) {
      const s = d[shift];
      if (!s?.enabled) continue;
      parts.push(`${day} ${shift}: ${s.start || '?'}–${s.end || '?'}`);
    }
  }
  return parts.join('; ') || '—';
}

/**
 * Combine multiple buildChanges results (or raw changes objects).
 */
export function mergeChanges(...parts) {
  const merged = {};
  for (const part of parts) {
    if (!part || typeof part !== 'object') continue;
    Object.assign(merged, part);
  }
  return Object.keys(merged).length ? merged : null;
}

/**
 * Build changes for a create when before snapshot is empty — never returns null if after has data.
 */
export function buildCreateChanges(before, after) {
  const diff = diffSnapshots(before, after);
  if (diff) return diff;
  const changes = {};
  for (const [key, val] of Object.entries(after || {})) {
    if (val !== null && val !== undefined && val !== '') {
      changes[key] = { before: null, after: val };
    }
  }
  return Object.keys(changes).length ? changes : null;
}
