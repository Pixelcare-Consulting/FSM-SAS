/** Stable React Query key factory for paginated list caches. */
export const queryKeys = {
  jobsList: (params) => (params ? ['jobs', 'list', params] : ['jobs', 'list']),
  customerJobHistory: (customerId, params) =>
    params
      ? ['customers', customerId, 'job-history', params]
      : ['customers', customerId, 'job-history'],
  customersList: (params) => (params ? ['customers', 'list', params] : ['customers', 'list']),
  followUpsList: (params) => (params ? ['follow-ups', 'list', params] : ['follow-ups', 'list']),
  workersList: (params) => (params ? ['workers', 'list', params] : ['workers', 'list']),
};
