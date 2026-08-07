import React, { useCallback, useMemo, useState } from 'react';
import { useQueryClient } from 'react-query';
import { Container } from 'react-bootstrap';
import Cookies from 'js-cookie';
import toast from 'react-hot-toast';
import { GeeksSEO } from 'widgets';
import { DashboardHeader } from 'sub-components';
import { useEnterToSearch } from '@/hooks/useEnterToSearch';
import {
  markJobMessagesReadRequest,
  sendJobMessageRequest,
  useJobMessagesListQuery,
  useJobMessagesUnreadCountQuery,
} from '../../../hooks/queries/useJobMessagesListQuery';
import JobMessagesFilterRail from './_components/jobMessages/JobMessagesFilterRail';
import JobMessagesListPane from './_components/jobMessages/JobMessagesListPane';
import JobMessagesDetailPane from './_components/jobMessages/JobMessagesDetailPane';
import { FOLDERS } from '@/lib/jobs/jobMessagesUiUtils';
import styles from './JobMessages.module.css';

const JobMessagesHistoryPage = () => {
  const queryClient = useQueryClient();
  const {
    draft: searchDraft,
    setDraft: setSearchDraft,
    applied: searchApplied,
    clear: clearSearch,
    onKeyDown: onSearchKeyDown,
  } = useEnterToSearch();
  const [folderId, setFolderId] = useState('all');
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [pageState, setPageState] = useState({ resetKey: '', page: 1 });
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [selectedMeta, setSelectedMeta] = useState(null);
  const [focusMessageId, setFocusMessageId] = useState(null);
  const [draftMessage, setDraftMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  const activeFolder = FOLDERS.find((f) => f.id === folderId) || FOLDERS[0];
  const senderType = activeFolder.senderType;
  const readStatus = activeFolder.readStatus;

  const listResetKey = `${searchApplied}\0${folderId}\0${itemsPerPage}`;
  const currentPage = pageState.resetKey === listResetKey ? pageState.page : 1;
  const setCurrentPage = (page) => {
    setPageState({ resetKey: listResetKey, page });
  };

  const listParams = useMemo(
    () => ({
      page: currentPage,
      limit: itemsPerPage,
      search: searchApplied,
      senderType,
      readStatus,
      groupBy: 'job',
    }),
    [currentPage, itemsPerPage, searchApplied, senderType, readStatus]
  );

  const threadParams = useMemo(
    () => ({
      page: 1,
      limit: 200,
      jobId: selectedJobId || '',
      senderType: 'all',
      readStatus: 'all',
    }),
    [selectedJobId]
  );

  const { data, isLoading, isFetching, error } = useJobMessagesListQuery(listParams);
  const {
    data: threadData,
    isLoading: threadLoading,
    isFetching: threadFetching,
    error: threadError,
  } = useJobMessagesListQuery(threadParams, { enabled: Boolean(selectedJobId) });
  const { data: unreadPayload } = useJobMessagesUnreadCountQuery({});

  const rows = useMemo(() => data?.messages || [], [data?.messages]);
  const totalCount = data?.totalCount ?? 0;
  const unreadCount = data?.unreadCount ?? unreadPayload?.unreadCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / itemsPerPage));
  const hasActiveFilters = searchApplied.length > 0 || folderId !== 'all';

  const selectedMetaFromList = useMemo(() => {
    if (!selectedJobId) return null;
    return rows.find((r) => r.jobId === selectedJobId) || null;
  }, [rows, selectedJobId]);

  const conversationMeta = selectedMetaFromList || selectedMeta;

  const threadMessages = useMemo(() => {
    const list = threadData?.messages || [];
    return [...list].sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return ta - tb;
    });
  }, [threadData?.messages]);

  // keepPreviousData can briefly show the previous job's thread — treat that as loading.
  const threadBelongsToSelection =
    !selectedJobId ||
    threadMessages.length === 0 ||
    threadMessages.every((m) => !m.jobId || m.jobId === selectedJobId);

  const visibleThreadMessages = threadBelongsToSelection ? threadMessages : [];

  const isThreadSkeleton =
    Boolean(selectedJobId) &&
    (threadLoading || threadFetching) &&
    (!threadBelongsToSelection || visibleThreadMessages.length === 0);

  const markJobRead = useCallback(
    async (jobId) => {
      if (!jobId) return;
      try {
        await markJobMessagesReadRequest({ jobId });
        // Refresh unread badge only — list already patched optimistically (avoids scroll reset).
        void queryClient.invalidateQueries(['jobs', 'messages', 'unread-count']);
      } catch (err) {
        console.warn('mark read failed', err?.message);
      }
    },
    [queryClient]
  );

  const onSelectRow = async (row) => {
    if (!row?.jobId) return;

    // Keep the page from jumping when selection / unread badge updates reflow the header.
    const pageScrollY = typeof window !== 'undefined' ? window.scrollY : 0;
    const restorePageScroll = () => {
      if (typeof window === 'undefined') return;
      window.scrollTo(0, pageScrollY);
    };

    setSelectedJobId(row.jobId);
    setSelectedMeta(row);
    setFocusMessageId(row.id);
    setDraftMessage('');
    requestAnimationFrame(restorePageScroll);

    if (row.isUnread) {
      const readAtNow = new Date().toISOString();
      queryClient.setQueriesData(['jobs', 'messages', 'list'], (old) => {
        if (!old?.messages) return old;
        let cleared = 0;
        const messages = old.messages.map((m) => {
          if (m.jobId === row.jobId && m.isUnread) {
            cleared += 1;
            return { ...m, isUnread: false, readAt: m.readAt || readAtNow };
          }
          return m;
        });
        return {
          ...old,
          messages,
          unreadCount:
            typeof old.unreadCount === 'number'
              ? Math.max(0, old.unreadCount - Math.max(cleared, 1))
              : old.unreadCount,
        };
      });
      queryClient.setQueriesData(['jobs', 'messages', 'unread-count'], (old) => {
        if (!old || typeof old.unreadCount !== 'number') return old;
        return {
          ...old,
          unreadCount: Math.max(0, old.unreadCount - 1),
        };
      });
      await markJobRead(row.jobId);
      requestAnimationFrame(restorePageScroll);
    }
  };

  const clearSelection = () => {
    setSelectedJobId(null);
    setSelectedMeta(null);
    setFocusMessageId(null);
    setDraftMessage('');
  };

  const clearAllFilters = () => {
    clearSearch();
    setFolderId('all');
    setCurrentPage(1);
    clearSelection();
  };

  const handleFolderChange = (nextFolderId) => {
    setFolderId(nextFolderId);
    setCurrentPage(1);
    clearSelection();
  };

  const handleSendMessage = async () => {
    if (!selectedJobId || isSending) return;
    const text = draftMessage.trim();
    if (!text) {
      toast.error('Please enter a message');
      return;
    }

    setIsSending(true);
    try {
      const role = Cookies.get('role') || 'ADMIN';
      const senderTypeValue = role === 'TECHNICIAN' ? 'TECHNICIAN' : 'ADMIN';
      const dataRow = await sendJobMessageRequest({
        jobId: selectedJobId,
        message: text,
        senderType: senderTypeValue,
      });
      setDraftMessage('');
      setFocusMessageId(null);

      const optimistic = {
        id: dataRow.id,
        jobId: dataRow.job_id || selectedJobId,
        jobNumber: conversationMeta?.jobNumber || null,
        jobTitle: conversationMeta?.jobTitle || null,
        customerName: conversationMeta?.customerName || null,
        customerCode: conversationMeta?.customerCode || null,
        senderType: dataRow.sender_type === 'TECHNICIAN' ? 'TECHNICIAN' : 'ADMIN',
        senderName:
          dataRow.sender_type === 'TECHNICIAN'
            ? 'Technician'
            : Cookies.get('username') || Cookies.get('fullName') || 'Admin',
        message: dataRow.message || text,
        imageUrl: dataRow.image_url || null,
        createdAt: dataRow.created_at || new Date().toISOString(),
        isUnread: false,
        isOwn: true,
        readAt: null,
      };

      queryClient.setQueriesData(['jobs', 'messages', 'list'], (old) => {
        if (!old?.messages) return old;

        // Conversation inbox (grouped by job): refresh preview row only.
        if (old.groupBy === 'job') {
          return {
            ...old,
            messages: old.messages.map((m) =>
              m.jobId === selectedJobId
                ? {
                    ...m,
                    id: optimistic.id,
                    message: optimistic.message,
                    senderType: optimistic.senderType,
                    senderName: optimistic.senderName,
                    createdAt: optimistic.createdAt,
                    isUnread: false,
                    messageCount: (m.messageCount || 1) + 1,
                  }
                : m
            ),
          };
        }

        // Open job thread: append so newest stays at the bottom after ascending sort.
        const isThisJobThread =
          old.messages.length > 0 &&
          old.messages.every((m) => m.jobId === selectedJobId);
        if (!isThisJobThread) return old;
        if (old.messages.some((m) => String(m.id) === String(optimistic.id))) {
          return old;
        }
        return {
          ...old,
          messages: [...old.messages, optimistic],
          totalCount: (old.totalCount || old.messages.length) + 1,
        };
      });

      toast.success('Message sent');
    } catch (err) {
      toast.error(err?.message || 'Failed to send message');
    } finally {
      setIsSending(false);
    }
  };

  const showMobileDetail = Boolean(selectedJobId);

  return (
    <>
      <GeeksSEO title="Job Messages | SAS&ME Portal" />
      <Container fluid className={`px-3 px-lg-4 pb-4 ${styles.pageRoot}`}>
        <DashboardHeader
          title="Job Messages"
          subtitle="One conversation per job — open a row to read the full chat and reply."
          breadcrumbs={[
            { icon: 'fe fe-home', label: 'Dashboard', href: '/dashboard' },
            { label: 'Jobs', href: '/jobs' },
            { label: 'Job Messages' },
          ]}
          stats={
            unreadCount > 0
              ? [{ label: 'Unread', value: unreadCount > 99 ? '99+' : unreadCount }]
              : []
          }
        />

        <div className={styles.workspace}>
          <div
            className={`${styles.filterCol}${showMobileDetail ? ` ${styles.paneHiddenMobile}` : ''}`}
          >
            <JobMessagesFilterRail
              folderId={folderId}
              unreadCount={unreadCount}
              onFolderChange={handleFolderChange}
            />
          </div>

          <JobMessagesListPane
            searchDraft={searchDraft}
            setSearchDraft={setSearchDraft}
            onSearchKeyDown={onSearchKeyDown}
            itemsPerPage={itemsPerPage}
            onItemsPerPageChange={(n) => {
              setItemsPerPage(n);
              setCurrentPage(1);
            }}
            hasActiveFilters={hasActiveFilters}
            onClearFilters={clearAllFilters}
            rows={rows}
            totalCount={totalCount}
            isLoading={isLoading}
            isFetching={isFetching}
            error={error}
            selectedJobId={selectedJobId}
            onSelectRow={onSelectRow}
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            hiddenOnMobile={showMobileDetail}
          />

          <JobMessagesDetailPane
            selectedMeta={conversationMeta}
            threadMessages={visibleThreadMessages}
            isLoading={isThreadSkeleton}
            error={threadError}
            focusMessageId={focusMessageId}
            draftMessage={draftMessage}
            onDraftChange={setDraftMessage}
            onSend={handleSendMessage}
            isSending={isSending}
            onBack={clearSelection}
            onClose={clearSelection}
            hiddenOnMobile={!showMobileDetail}
          />
        </div>
      </Container>
    </>
  );
};

export default JobMessagesHistoryPage;
