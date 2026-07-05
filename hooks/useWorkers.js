// hooks/useWorkers.js
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { useQueryClient } from 'react-query';
import { getSupabaseClient } from '../lib/supabase/client';
import { useWorkersListQuery } from './queries/useWorkersListQuery';

const REALTIME_DEBOUNCE_MS = 400;
const DEFAULT_PAGE_SIZE = 25;

function patchWorkerFromUserRow(worker, userRow) {
  if (!userRow || !worker) return worker;
  const technicians = Array.isArray(userRow.technicians)
    ? userRow.technicians
    : userRow.technicians
      ? [userRow.technicians]
      : worker.technicians;
  const technician = technicians?.[0] || worker.technicians?.[0] || null;
  return {
    ...worker,
    ...userRow,
    role: userRow.role ?? worker.role,
    status: userRow.status ?? worker.status,
    username: userRow.username ?? worker.username,
    email: technician?.email || userRow.username || worker.email,
    activeUser: (userRow.status ?? worker.status) === 'ACTIVE',
    isActive: (userRow.status ?? worker.status) === 'ACTIVE',
    isAdmin: (userRow.role ?? worker.role) === 'ADMIN',
    isFieldWorker: (userRow.role ?? worker.role) === 'TECHNICIAN',
    technicians,
    profilePicture: technician?.avatar_url || worker.profilePicture,
    isOnline:
      technicians?.some((t) => Boolean(t?.is_online)) ||
      Boolean(userRow.is_logged_in) ||
      worker.isOnline,
  };
}

export const useWorkers = ({ pageSize = DEFAULT_PAGE_SIZE } = {}) => {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [includeStats, setIncludeStats] = useState(true);
  const channelRef = useRef(null);
  const debounceRef = useRef(null);
  const searchRef = useRef(search);
  const pageRef = useRef(page);
  const isFirstLoadRef = useRef(true);

  useEffect(() => {
    searchRef.current = search;
  }, [search]);

  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  const workersQueryParams = useMemo(
    () => ({
      page,
      limit: pageSize,
      search,
      includeStats,
    }),
    [page, pageSize, search, includeStats]
  );

  const {
    data: workersData,
    isLoading: loading,
    error: workersQueryError,
    refetch,
    patchRow,
    removeRow,
  } = useWorkersListQuery(workersQueryParams);

  const workers = workersData?.workers || [];
  const totalCount = workersData?.totalCount ?? 0;
  const stats = workersData?.stats || {
    totalUsers: 0,
    active: 0,
    inactive: 0,
    fieldWorkers: 0,
  };
  const error = workersQueryError ?? null;

  useEffect(() => {
    if (isFirstLoadRef.current && workersData) {
      isFirstLoadRef.current = false;
      setIncludeStats(false);
    }
  }, [workersData]);

  const scheduleRealtimeRefresh = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      refetch().catch((err) => {
        console.error('Error updating workers from realtime:', err);
      });
    }, REALTIME_DEBOUNCE_MS);
  }, [refetch]);

  const handleRealtimePayload = useCallback(
    (payload) => {
      const eventType = payload?.eventType;
      const newRow = payload?.new;
      const oldRow = payload?.old;

      if (eventType === 'DELETE' && oldRow?.id) {
        removeRow(oldRow.id);
        return;
      }

      if (eventType === 'INSERT') {
        scheduleRealtimeRefresh();
        return;
      }

      if (eventType === 'UPDATE' && newRow?.id) {
        const existing = workers.find((w) => w.id === newRow.id);
        if (!existing) {
          scheduleRealtimeRefresh();
          return;
        }
        patchRow(patchWorkerFromUserRow(existing, newRow), 'UPDATE');
        return;
      }

      scheduleRealtimeRefresh();
    },
    [workers, patchRow, removeRow, scheduleRealtimeRefresh]
  );

  useEffect(() => {
    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        throw new Error('Supabase client not available');
      }

      const channel = supabase
        .channel('users-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'users',
            filter: 'deleted_at=is.null',
          },
          (payload) => {
            handleRealtimePayload(payload);
          }
        )
        .subscribe();

      channelRef.current = channel;

      return () => {
        if (debounceRef.current) {
          clearTimeout(debounceRef.current);
        }
        if (channelRef.current) {
          supabase.removeChannel(channelRef.current);
        }
      };
    } catch (err) {
      console.error('Error in useWorkers setup:', err);
    }
  }, [handleRealtimePayload]);

  const fetchWorkers = useCallback(async () => {
    setIncludeStats(true);
    const result = await refetch();
    setIncludeStats(false);
    return result.data;
  }, [refetch]);

  const clearCache = useCallback(() => {
    queryClient.removeQueries(['workers']);
  }, [queryClient]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const goToPage = useCallback((nextPage) => {
    const safePage = Math.min(Math.max(1, nextPage), totalPages);
    setPage(safePage);
  }, [totalPages]);

  const updateSearch = useCallback((value) => {
    setSearch(value);
    setPage(1);
  }, []);

  return {
    workers,
    loading,
    error,
    fetchWorkers,
    clearCache,
    page,
    pageSize,
    totalCount,
    totalPages,
    goToPage,
    search,
    updateSearch,
    stats,
  };
};
