import { jobDisplayCustomerName } from '../utils/embeddedCustomerName';
import { uniqueActiveTechnicianJobs } from './uniqueActiveTechnicianJobs';

/** Flat jobs columns + small FK embeds only (no technician_jobs / followups — fetched per page). */
export const SUPABASE_JOB_LIST_BASE_SELECT = `
  id,
  job_number,
  title,
  status,
  priority,
  created_at,
  updated_at,
  scheduled_start,
  scheduled_end,
  description,
  customer_id,
  location_id,
  customer:customer_id(id, customer_name, customer_code),
  location:location_id(id, location_name)
`;

/** @deprecated Use SUPABASE_JOB_LIST_BASE_SELECT + batch relation fetches in list-summary API. */
export const SUPABASE_JOB_LIST_SUMMARY_SELECT = SUPABASE_JOB_LIST_BASE_SELECT;

/** Even slimmer select for dashboard overview charts. */
export const SUPABASE_JOB_OVERVIEW_SELECT = `
  id,
  job_number,
  title,
  status,
  priority,
  created_at,
  updated_at,
  scheduled_start,
  customer_id,
  technician_jobs(
    technician_id,
    assignment_status,
    technician:technician_id(id, full_name)
  )
`;

/** Batch-fetch technician_jobs for visible page job IDs (kept out of main list select). */
export async function fetchTechnicianJobsByJobIds(supabase, jobIds) {
  const map = {};
  if (!jobIds?.length || !supabase) return map;

  const uniqueIds = [...new Set(jobIds.filter(Boolean))];
  const chunkSize = 100;

  for (let i = 0; i < uniqueIds.length; i += chunkSize) {
    const batch = uniqueIds.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from('technician_jobs')
      .select(
        `
        id,
        job_id,
        technician_id,
        assignment_status,
        deleted_at,
        technician:technician_id(id, full_name, email, user_id)
      `
      )
      .in('job_id', batch)
      .is('deleted_at', null);

    if (error) {
      console.warn('technician_jobs batch fetch:', error.message);
      continue;
    }

    for (const row of data || []) {
      if (!row.job_id) continue;
      if (!map[row.job_id]) map[row.job_id] = [];
      map[row.job_id].push(row);
    }
  }

  return map;
}

/** Batch-fetch followups for visible page job IDs (kept out of main list select). */
export async function fetchFollowUpsByJobIds(supabase, jobIds) {
  const map = {};
  if (!jobIds?.length || !supabase) return map;

  const uniqueIds = [...new Set(jobIds.filter(Boolean))];
  const chunkSize = 100;

  for (let i = 0; i < uniqueIds.length; i += chunkSize) {
    const batch = uniqueIds.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from('followups')
      .select('id, job_id, status, type, created_at, deleted_at')
      .in('job_id', batch)
      .is('deleted_at', null);

    if (error) {
      console.warn('followups batch fetch:', error.message);
      continue;
    }

    for (const row of data || []) {
      if (!row.job_id) continue;
      if (!map[row.job_id]) map[row.job_id] = [];
      map[row.job_id].push(row);
    }
  }

  return map;
}

/**
 * Map a slim Supabase job row to the list-jobs.js grid shape.
 */
export function formatJobListSummaryRow(
  job,
  scheduleAddressByJobId = {},
  { technicianJobsByJobId = {}, followUpsByJobId = {} } = {}
) {
  const technicianJobs = technicianJobsByJobId[job.id] ?? job.technician_jobs ?? [];
  const followups = followUpsByJobId[job.id] ?? job.followups ?? [];

  const assignedTechnicians = uniqueActiveTechnicianJobs(technicianJobs).map((tj) => ({
    technicianId: tj.technician_id,
    technicianName: tj.technician?.full_name || 'Unknown Technician',
    assignmentStatus: tj.assignment_status,
    technician: tj.technician,
  }));

  const followUps = (followups || []).filter((fu) => !fu.deleted_at);
  const latestFollowUp =
    followUps.length > 0
      ? followUps.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]
      : null;

  const scheduledStart = job.scheduled_start ? new Date(job.scheduled_start) : null;
  const scheduledEnd = job.scheduled_end ? new Date(job.scheduled_end) : null;

  return {
    id: job.id,
    ...job,
    jobNo: job.job_number || job.jobNo,
    jobName: job.title || job.job_name || job.jobName,
    jobDescription: job.description || '',
    customerID: job.customer_id,
    customerCode: job.customer?.customer_code || '',
    customerName: jobDisplayCustomerName(job),
    location: {
      id: job.location_id,
      locationName: job.location?.location_name || scheduleAddressByJobId[job.id] || '',
    },
    jobStatus: job.status || job.jobStatus,
    priority: job.priority,
    startDate: scheduledStart ? scheduledStart.toISOString().split('T')[0] : null,
    startTime: scheduledStart ? scheduledStart.toTimeString().slice(0, 5) : null,
    endDate: scheduledEnd ? scheduledEnd.toISOString().split('T')[0] : null,
    endTime: scheduledEnd ? scheduledEnd.toTimeString().slice(0, 5) : null,
    assignedWorkers: assignedTechnicians,
    equipments: [],
    followUps: latestFollowUp
      ? {
          [latestFollowUp.id]: {
            status: latestFollowUp.status,
            type: latestFollowUp.type,
            createdAt: latestFollowUp.created_at,
          },
        }
      : {},
    createdAt: job.created_at ? new Date(job.created_at) : new Date(),
    updatedAt: job.updated_at ? new Date(job.updated_at) : new Date(),
  };
}

/**
 * Map slim job row for dashboard overview widgets.
 */
export function formatJobOverviewRow(job) {
  const assignedWorkers = (job.technician_jobs || []).map((tj) => ({
    id: tj.technician_id,
    technicianId: tj.technician_id,
    technicianName: tj.technician?.full_name || 'Unknown',
    technician: tj.technician,
  }));

  const normalizedStatus = job.status || 'PENDING';
  const statusMap = {
    COMPLETED: 'Completed',
    IN_PROGRESS: 'In Progress',
    INPROGRESS: 'In Progress',
    PENDING: 'Created',
    CREATED: 'Created',
    UPCOMING: 'Upcoming',
    OVERDUE: 'Overdue',
    WAITING: 'Waiting',
    CANCELLED: 'Cancelled',
    SCHEDULED: 'Scheduled',
    RESCHEDULED: 'Rescheduled',
    'JOB COMPLETE': 'Completed',
    JOB_COMPLETE: 'Completed',
  };

  const jobStatus = statusMap[normalizedStatus.toUpperCase()] || normalizedStatus;

  return {
    ...job,
    id: job.id,
    jobNo: job.job_number || job.id,
    jobName: job.title || '',
    jobStatus,
    status: normalizedStatus,
    customerName: jobDisplayCustomerName(job),
    customerCode: job.customer?.customer_code || '',
    locationName: job.location?.location_name || '',
    assignedWorkers,
    createdAt: job.created_at ? new Date(job.created_at) : new Date(),
    updatedAt: job.updated_at ? new Date(job.updated_at) : new Date(),
  };
}
