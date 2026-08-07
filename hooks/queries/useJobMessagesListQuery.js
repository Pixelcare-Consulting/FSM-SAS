import { useQuery } from 'react-query';
import { queryKeys } from '../../lib/cache/queryKeys';

const STALE_TIME_MS = 30_000;

function buildJobMessagesSearchParams(params) {
  const searchParams = new URLSearchParams({
    page: String(params.page),
    limit: String(params.limit),
  });
  if (params.search) searchParams.set('search', String(params.search));
  if (params.senderType && params.senderType !== 'all') {
    searchParams.set('senderType', String(params.senderType));
  }
  if (params.jobId) searchParams.set('jobId', String(params.jobId));
  return searchParams;
}

export async function fetchJobMessagesList(params) {
  const response = await fetch(
    `/api/jobs/messages/list-summary?${buildJobMessagesSearchParams(params).toString()}`,
    { cache: 'no-store', credentials: 'same-origin' }
  );
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || body.message || `Failed to load messages (${response.status})`);
  }
  return response.json();
}

export function useJobMessagesListQuery(params, { enabled = true } = {}) {
  return useQuery(
    queryKeys.jobMessagesList(params),
    () => fetchJobMessagesList(params),
    {
      enabled,
      staleTime: STALE_TIME_MS,
      keepPreviousData: true,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
    }
  );
}
