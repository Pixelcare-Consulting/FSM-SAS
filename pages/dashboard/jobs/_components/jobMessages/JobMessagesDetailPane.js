import React, { useEffect, useRef } from 'react';
import Link from 'next/link';
import { Button, Form, Spinner } from 'react-bootstrap';
import { ArrowLeft, MessageSquare, Send } from 'react-feather';
import {
  formatShortTs,
  formatTs,
  messageStatusMeta,
  senderBadge,
  truncate,
} from './jobMessagesUtils';
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
  hiddenOnMobile = false,
}) => {
  const threadEndRef = useRef(null);
  const focusRef = useRef(null);
  const threadScrollRef = useRef(null);
  const lastAutoScrollKeyRef = useRef('');

  // Auto-scroll only inside the chat pane (never the page), and only when the
  // selected job / focus message changes or the thread first loads.
  useEffect(() => {
    if (!selectedMeta?.jobId) return;
    if (isLoading && threadMessages.length === 0) return;

    const container = threadScrollRef.current;
    if (!container) return;

    const key = `${selectedMeta.jobId}:${focusMessageId || 'end'}:${threadMessages.length > 0 ? 'ready' : 'empty'}`;
    if (lastAutoScrollKeyRef.current === key) return;
    lastAutoScrollKeyRef.current = key;

    const frame = requestAnimationFrame(() => {
      if (focusMessageId && focusRef.current) {
        scrollWithinContainer(container, focusRef.current, { align: 'nearest' });
      } else {
        scrollContainerToBottom(container);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [selectedMeta?.jobId, focusMessageId, isLoading, threadMessages.length]);

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
              <span className={styles.detailThreadCount}>
                {threadMessages.length}{' '}
                {threadMessages.length === 1 ? 'message' : 'messages'}
              </span>
            </div>
          </div>

          <div className={styles.chatThread} ref={threadScrollRef}>
            {error ? (
              <div className={styles.stateBlock}>
                {error.message || 'Failed to load conversation'}
              </div>
            ) : isLoading && threadMessages.length === 0 ? (
              <div className={`${styles.stateBlock} ${styles.stateMuted}`}>
                <Spinner animation="border" size="sm" className="me-2" />
                Loading conversation…
              </div>
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
              disabled={isSending}
              aria-label="Reply message"
            />
            <Button
              variant="primary"
              className={styles.chatComposerSend}
              onClick={() => onSend?.()}
              disabled={isSending || !draftMessage.trim()}
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
