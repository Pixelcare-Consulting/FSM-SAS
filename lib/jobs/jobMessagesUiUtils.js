import React from 'react';
import { format } from 'date-fns';
import { Badge } from 'react-bootstrap';

export function truncate(str, n = 160) {
  if (!str) return '';
  return str.length <= n ? str : `${str.slice(0, n)}…`;
}

export function formatTs(iso) {
  if (!iso) return '—';
  try {
    return format(new Date(iso), 'MMM d, yyyy h:mm a');
  } catch {
    return iso;
  }
}

export function formatShortTs(iso) {
  if (!iso) return '';
  try {
    return format(new Date(iso), 'MMM d, h:mm a');
  } catch {
    return '';
  }
}

/**
 * Delivery/read status for a chat bubble (viewer perspective).
 * @returns {{ key: 'sent'|'read'|'unread', label: string }}
 */
export function messageStatusMeta(message) {
  if (!message) return { key: 'sent', label: 'Sent' };
  if (message.isOwn) {
    return { key: 'sent', label: 'Sent' };
  }
  if (message.isUnread) {
    return { key: 'unread', label: 'Unread' };
  }
  const readLabel = message.readAt ? `Read · ${formatShortTs(message.readAt)}` : 'Read';
  return { key: 'read', label: readLabel };
}

export function senderBadge(senderType) {
  const isAdmin = senderType === 'ADMIN';
  return (
    <Badge
      bg={isAdmin ? 'primary' : 'secondary'}
      className="text-uppercase"
      style={{ fontSize: 10 }}
    >
      {isAdmin ? 'Admin' : 'Tech'}
    </Badge>
  );
}

export const FOLDERS = [
  { id: 'all', label: 'Inbox', icon: 'fe fe-inbox', readStatus: 'all', senderType: 'all' },
  { id: 'unread', label: 'Unread', icon: 'fe fe-mail', readStatus: 'unread', senderType: 'all' },
  { id: 'admin', label: 'From admins', icon: 'fe fe-user', readStatus: 'all', senderType: 'ADMIN' },
  {
    id: 'technician',
    label: 'From technicians',
    icon: 'fe fe-users',
    readStatus: 'all',
    senderType: 'TECHNICIAN',
  },
];
