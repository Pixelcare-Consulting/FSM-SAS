import { useQuery } from 'react-query';
import { queryKeys } from '../../lib/cache/queryKeys';

const STALE_TIME_MS = 15_000;

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
  if (params.readStatus && params.readStatus !== 'all') {
    searchParams.set('readStatus', String(params.readStatus));
  }
  if (params.groupBy) searchParams.set('groupBy', String(params.groupBy));
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

export async function fetchJobMessagesUnreadCount(params = {}) {
  const searchParams = new URLSearchParams();
  if (params.jobId) searchParams.set('jobId', String(params.jobId));
  if (params.senderType && params.senderType !== 'all') {
    searchParams.set('senderType', String(params.senderType));
  }
  const qs = searchParams.toString();
  const response = await fetch(
    `/api/jobs/messages/unread-count${qs ? `?${qs}` : ''}`,
    { cache: 'no-store', credentials: 'same-origin' }
  );
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || body.message || `Failed to load unread count (${response.status})`);
  }
  return response.json();
}

export async function markJobMessagesReadRequest({ messageIds, jobId } = {}) {
  const response = await fetch('/api/jobs/messages/mark-read', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...(Array.isArray(messageIds) ? { messageIds } : {}),
      ...(jobId ? { jobId } : {}),
    }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || body.message || `Failed to mark read (${response.status})`);
  }
  return response.json();
}

export async function markJobMessagesUnreadRequest({ messageIds, jobId } = {}) {
  const response = await fetch('/api/jobs/messages/mark-unread', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...(Array.isArray(messageIds) ? { messageIds } : {}),
      ...(jobId ? { jobId } : {}),
    }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || body.message || `Failed to mark unread (${response.status})`);
  }
  return response.json();
}

export async function sendJobMessageRequest({ jobId, message, senderType = 'ADMIN' } = {}) {
  if (!jobId) throw new Error('jobId is required');
  const messageText = String(message || '').trim();
  if (!messageText) throw new Error('Message cannot be empty');

  const response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/messages`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: messageText,
      sender_type: senderType === 'TECHNICIAN' ? 'TECHNICIAN' : 'ADMIN',
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.success || !body.data) {
    throw new Error(
      body.message || body.error || `Failed to send message (${response.status})`
    );
  }
  return body.data;
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

export function useJobMessagesUnreadCountQuery(params = {}, { enabled = true } = {}) {
  return useQuery(
    queryKeys.jobMessagesUnreadCount(params),
    () => fetchJobMessagesUnreadCount(params),
    {
      enabled,
      staleTime: STALE_TIME_MS,
      refetchOnWindowFocus: true,
      refetchOnMount: true,
      refetchInterval: 60_000,
    }
  );
}
