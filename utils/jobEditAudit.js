/**
 * Flat snapshot of job edit form state for audit_logs changes diff.
 */
function stripHtmlForAuditSnapshot(html) {
  if (!html) return '';
  return String(html).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

export function buildJobEditAuditSnapshot({
  formData = {},
  selectedWorkers = [],
  tasks = [],
  selectedContact = null,
} = {}) {
  const workerLabels = (selectedWorkers || [])
    .map((w) => w.label || w.workerName || w.full_name || '')
    .filter(Boolean)
    .sort();

  if (workerLabels.length === 0 && Array.isArray(formData.assignedWorkers)) {
    formData.assignedWorkers.forEach((w) => {
      const name = w.workerName || w.full_name || w.label || '';
      if (name) workerLabels.push(name);
    });
    workerLabels.sort();
  }

  const scheduleParts = [
    formData.startDate,
    formData.startTime,
    formData.endDate,
    formData.endTime,
  ].filter((p) => p != null && String(p).trim() !== '');

  const contactFromPicker = selectedContact
    ? [selectedContact.firstName, selectedContact.middleName, selectedContact.lastName]
        .map((p) => (p != null ? String(p).trim() : ''))
        .filter(Boolean)
        .join(' ')
    : '';
  const contactLabel =
    contactFromPicker ||
    formData.contact?.contactFullname ||
    '';

  return {
    title: formData.jobName || '',
    description: stripHtmlForAuditSnapshot(formData.jobDescription || ''),
    status: formData.jobStatus || formData.status || '',
    priority: formData.priority || '',
    schedule: scheduleParts.join(' '),
    assignedWorkers: workerLabels.join(', '),
    location:
      formData.location?.locationName ||
      formData.location?.location_name ||
      '',
    serviceCall: formData.serviceCallID || '',
    salesOrder: formData.salesOrderID || '',
    contact: contactLabel,
    taskCount: Array.isArray(tasks)
      ? tasks.length
      : Array.isArray(formData.taskList)
        ? formData.taskList.length
        : 0,
  };
}
