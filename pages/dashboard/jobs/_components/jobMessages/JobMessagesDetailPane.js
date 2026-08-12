import React, { useEffect, useRef } from 'react';
import Link from 'next/link';
import { Button, Form, Spinner } from 'react-bootstrap';
import { ArrowLeft, Mail, MessageSquare, Send } from 'react-feather';
import {
  formatShortTs,
  formatTs,
  messageStatusMeta,
  senderBadge,
  truncate,
} from '@/lib/jobs/jobMessagesUiUtils';
import styles from '../../JobMessages.module.css';

/** Scroll a child into view inside a scroll container without moving the window. */
function scrollWithinContainer(container, child, { align = 'nearest' } = {}) {
  if (!container || !child) return;
  const cRect = container.getBoundingClientRect();
  const eRect = child.getBoundingClientRect();
  if (align === 'end' || eRect.bottom > cRect.bottom) {
    container.scrollTop += eRect.bottom - cRect.bottom + 8;
  } else if (eRect.top < cRect.top) {
    container.scrollTop += eRect.top - cRect.top - 8;
  }
}

function scrollContainerToBottom(container) {
  if (!container) return;
  container.scrollTop = container.scrollHeight;
}

function ThreadSkeleton() {
  const rows = [
    { side: 'tech', width: '58%' },
    { side: 'admin', width: '46%' },
    { side: 'tech', width: '64%' },
    { side: 'admin', width: '52%' },
    { side: 'tech', width: '40%' },
  ];
  return (
    <div className={styles.chatSkeleton} aria-busy="true" aria-label="Loading conversation">
      {rows.map((row, index) => (
        <div
          key={`sk-${index}`}
          className={`${styles.chatSkeletonRow}${
            row.side === 'admin' ? ` ${styles.chatSkeletonRowAdmin}` : ''
          }`}
        >
          <div className={styles.chatSkeletonBubble} style={{ width: row.width }}>
            <span className={styles.chatSkeletonLine} style={{ width: '42%' }} />
            <span className={styles.chatSkeletonLine} style={{ width: '88%' }} />
            <span className={styles.chatSkeletonLine} style={{ width: '64%' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

const JobMessagesDetailPane = ({
  selectedMeta,
  threadMessages = [],
  isLoading = false,
  error = null,
  focusMessageId = null,
  draftMessage = '',
  onDraftChange,
  onSend,
  isSending = false,
  onBack,
  onClose,
  onMarkUnread,
  hiddenOnMobile = false,
}) => {
  const threadEndRef = useRef(null);
  const focusRef = useRef(null);
  const threadScrollRef = useRef(null);
  const lastAutoScrollRef = useRef({ jobId: null, length: 0, lastId: null });

  // Keep chat scrolled inside the pane only — newest messages stay visible at the bottom.
  useEffect(() => {
    if (!selectedMeta?.jobId) return;
    if (isLoading && threadMessages.length === 0) return;

    const container = threadScrollRef.current;
    if (!container) return;

    const jobId = selectedMeta.jobId;
    const length = threadMessages.length;
    const lastId = length ? threadMessages[length - 1]?.id : null;
    const prev = lastAutoScrollRef.current;
    const jobChanged = prev.jobId !== jobId;
    const threadGrew =
      !jobChanged && (length > prev.length || (lastId && lastId !== prev.lastId));

    if (!jobChanged && !threadGrew) return;

    lastAutoScrollRef.current = { jobId, length, lastId };

    const frame = requestAnimationFrame(() => {
      const run = () => {
        // Opening a conversation from the list may jump to that message once.
        // Any newly arrived / sent message should land at the bottom.
        if (jobChanged && focusMessageId && focusRef.current && !threadGrew) {
          scrollWithinContainer(container, focusRef.current, { align: 'nearest' });
          return;
        }
        scrollContainerToBottom(container);
      };
      // Second frame so DOM has the new bubble before measuring scrollHeight.
      requestAnimationFrame(run);
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedMeta?.jobId, focusMessageId, isLoading, threadMessages]);

  const handleComposerKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isSending) onSend?.();
    }
  };

  return (
    <section
      className={`${styles.detailPane}${hiddenOnMobile ? ` ${styles.paneHiddenMobile}` : ''}`}
      aria-label="Job conversation"
    >
      {!selectedMeta ? (
        <div className={styles.detailEmpty}>
          <div className={styles.detailEmptyIcon} aria-hidden>
            <MessageSquare size={28} />
          </div>
          <h2 className={styles.detailEmptyTitle}>Select a conversation</h2>
          <p className={styles.detailEmptyText}>
            Choose a job from the list to open the full chat history and reply.
          </p>
        </div>
      ) : (
        <>
          <div className={styles.detailHeader}>
            <Button
              variant="link"
              size="sm"
              className={styles.backBtn}
              onClick={onBack}
              aria-label="Back to message list"
            >
              <ArrowLeft size={16} />
              Back
            </Button>
            <div className={styles.detailHeaderTop}>
              <div>
                <div className={styles.detailJobHeading}>
                  {selectedMeta.jobNumber || 'Job conversation'}
                </div>
                <div className={styles.detailMeta}>
                  {selectedMeta.customerName ? selectedMeta.customerName : 'Customer'}
                  {selectedMeta.customerCode ? ` (${selectedMeta.customerCode})` : ''}
                  {selectedMeta.jobTitle
                    ? ` · ${truncate(selectedMeta.jobTitle, 60)}`
                    : ''}
                </div>
              </div>
              <Button
                variant="link"
                size="sm"
                className={styles.closeDetailBtn}
                onClick={onClose}
                aria-label="Close conversation"
              >
                <i className="fe fe-x" aria-hidden />
              </Button>
            </div>
            <div className={styles.detailActions}>
              {selectedMeta.jobId ? (
                <Link
                  href={`/dashboard/jobs/${selectedMeta.jobId}`}
                  className="btn btn-primary btn-sm"
                >
                  Open {selectedMeta.jobNumber || 'job'}
                </Link>
              ) : null}
              {!selectedMeta.isUnread && selectedMeta.jobId ? (
                <Button
                  variant="outline-secondary"
                  size="sm"
                  className="d-inline-flex align-items-center gap-1"
                  onClick={() => onMarkUnread?.(selectedMeta)}
                  title="Mark as unread"
                >
                  <Mail size={14} aria-hidden />
                  Mark as unread
                </Button>
              ) : null}
              <span className={styles.detailThreadCount}>
                {isLoading
                  ? 'Loading…'
                  : `${threadMessages.length} ${
                      threadMessages.length === 1 ? 'message' : 'messages'
                    }`}
              </span>
            </div>
          </div>

          <div className={styles.chatThread} ref={threadScrollRef}>
            {error ? (
              <div className={styles.stateBlock}>
                {error.message || 'Failed to load conversation'}
              </div>
            ) : isLoading ? (
              <ThreadSkeleton />
            ) : threadMessages.length === 0 ? (
              <div className={`${styles.stateBlock} ${styles.stateMuted}`}>
                No messages in this job conversation yet. Send the first reply below.
              </div>
            ) : (
              <div className={styles.chatMessages}>
                {threadMessages.map((message) => {
                  const isAdmin = message.senderType === 'ADMIN';
                  const isFocused = focusMessageId && message.id === focusMessageId;
                  const status = messageStatusMeta(message);
                  return (
                    <div
                      key={message.id}
                      ref={isFocused ? focusRef : null}
                      className={`${styles.chatBubbleRow}${
                        isAdmin ? ` ${styles.chatBubbleRowAdmin}` : ` ${styles.chatBubbleRowTech}`
                      }`}
                    >
                      <div
                        className={`${styles.chatBubble}${
                          isAdmin ? ` ${styles.chatBubbleAdmin}` : ` ${styles.chatBubbleTech}`
                        }`}
                      >
                        <div className={styles.chatBubbleHeader}>
                          <span className={styles.chatBubbleSender}>
                            {senderBadge(message.senderType)}
                            <span className={styles.chatBubbleName}>{message.senderName}</span>
                          </span>
                          <time
                            className={styles.chatBubbleTime}
                            dateTime={message.createdAt || undefined}
                            title={formatTs(message.createdAt)}
                          >
                            {formatShortTs(message.createdAt)}
                          </time>
                        </div>
                        {message.imageUrl ? (
                          <div className={styles.chatBubbleImageWrap}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={message.imageUrl}
                              alt="Attachment"
                              className={styles.chatBubbleImage}
                            />
                          </div>
                        ) : null}
                        {message.message ? (
                          <div className={styles.chatBubbleText}>{message.message}</div>
                        ) : !message.imageUrl ? (
                          <div className={styles.chatBubbleText}>—</div>
                        ) : null}
                        <div
                          className={`${styles.chatBubbleStatus} ${
                            status.key === 'unread'
                              ? styles.chatBubbleStatusUnread
                              : status.key === 'sent'
                                ? styles.chatBubbleStatusSent
                                : styles.chatBubbleStatusRead
                          }`}
                        >
                          {status.label}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={threadEndRef} />
              </div>
            )}
          </div>

          <div className={styles.chatComposer}>
            <Form.Control
              as="textarea"
              rows={2}
              value={draftMessage}
              onChange={(e) => onDraftChange?.(e.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder="Type a reply… (Enter to send, Shift+Enter for new line)"
              className={styles.chatComposerInput}
              disabled={isSending || isLoading}
              aria-label="Reply message"
            />
            <Button
              variant="primary"
              className={styles.chatComposerSend}
              onClick={() => onSend?.()}
              disabled={isSending || isLoading || !draftMessage.trim()}
            >
              {isSending ? (
                <Spinner animation="border" size="sm" />
              ) : (
                <>
                  <Send size={14} aria-hidden />
                  Send
                </>
              )}
            </Button>
          </div>
        </>
      )}
    </section>
  );
};

export default JobMessagesDetailPane;
