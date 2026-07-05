import { useCallback } from 'react';
import { useQuery, useQueryClient } from 'react-query';
import { queryKeys } from '../../lib/cache/queryKeys';
import { patchListPage, removeListRow } from '../../lib/cache/patchListCache';

const STALE_TIME_MS = 60_000;

function buildJobsListSearchParams(params) {
  const searchParams = new URLSearchParams();
  const entries = {
    page: params.page,
    limit: params.limit,
    search: params.search,
    status: params.status,
    statusValues: params.statusValues,
    priority: params.priority,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    sort: params.sort,
    sortDir: params.sortDir,
  };
  Object.entries(entries).forEach(([key, value]) => {
    if (value != null && value !== '') {
      searchParams.set(key, String(value));
    }
  });
  return searchParams;
}

async function fetchJobsList(params) {
  const response = await fetch(`/api/jobs/list-summary?${buildJobsListSearchParams(params).toString()}`, {
    cache: 'no-store',
    credentials: 'same-origin',
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Failed to load jobs (${response.status})`);
  }
  return response.json();
}

export function useJobsListQuery(params, { enabled = true } = {}) {
  const queryClient = useQueryClient();
  const queryKey = queryKeys.jobsList(params);

  const query = useQuery(queryKey, () => fetchJobsList(params), {
    enabled,
    staleTime: STALE_TIME_MS,
    keepPreviousData: true,
    refetchOnWindowFocus: false,
  });

  const patchRow = useCallback(
    (row, eventType = 'UPDATE') => {
      patchListPage(queryClient, queryKeys.jobsList(), row, {
        itemsKey: 'jobs',
        idField: 'id',
        eventType,
      });
    },
    [queryClient]
  );

  const removeRow = useCallback(
    (rowId) => {
      removeListRow(queryClient, queryKeys.jobsList(), rowId, {
        itemsKey: 'jobs',
        idField: 'id',
      });
    },
    [queryClient]
  );

  return {
    ...query,
    patchRow,
    removeRow,
  };
}
