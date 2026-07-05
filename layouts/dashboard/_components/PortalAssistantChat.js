import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/router';
import {
  ChatBubbleLeftRightIcon,
  PaperAirplaneIcon,
  SparklesIcon,
  UserCircleIcon,
  XMarkIcon,
} from '@heroicons/react/24/solid';
import toast from 'react-hot-toast';
import FriendlyAssistantMessage from './FriendlyAssistantMessage';
import styles from './PortalAssistantChat.module.css';

const PORTAL_ID = 'fsm-dashboard-help-root';

async function handleSessionExpired(router, message) {
  try {
    await fetch('/api/logout', { method: 'POST', credentials: 'include' });
  } catch {
    /* ignore */
  }
  router.replace(
    '/sign-in?toast=' +
      encodeURIComponent(message || 'Session expired. Please log in again.')
  );
}

export default function PortalAssistantChat() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [portalEl, setPortalEl] = useState(null);
  const threadRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    let el = document.getElementById(PORTAL_ID);
    const created = !el;
    if (!el) {
      el = document.createElement('div');
      el.id = PORTAL_ID;
      el.setAttribute('data-fsm-dashboard-help', '');
      document.body.appendChild(el);
    }
    setPortalEl(el);
    return () => {
      setPortalEl(null);
      if (created && el.parentNode) {
        el.parentNode.removeChild(el);
      }
    };
  }, []);

  useEffect(() => {
    const node = threadRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages, loading, open]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const nextThread = [...messages, { role: 'user', content: text }];
    setInput('');
    setMessages(nextThread);
    setLoading(true);

    try {
      const res = await fetch('/api/assistant/chat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: nextThread,
          page_path: router.asPath || router.pathname || '',
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 401 && data.requiresLogin) {
        await handleSessionExpired(router, data.message);
        setLoading(false);
        return;
      }

      if (!res.ok) {
        const msg =
          data.message ||
          (res.status === 503
            ? 'Assistant is not configured on the server.'
            : 'Could not get a response. Try again.');
        toast.error(msg);
        setLoading(false);
        return;
      }

      if (data.success && typeof data.message === 'string') {
        setMessages((prev) => [...prev, { role: 'assistant', content: data.message }]);
      } else {
        toast.error('Unexpected response from assistant.');
      }
    } catch {
      toast.error('Network error. Check your connection.');
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, router]);

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  if (!portalEl) {
    return null;
  }

  const layer = (
    <div className={styles.layer}>
      {open && (
        <button
          type="button"
          className={styles.backdrop}
          aria-label="Close help"
          onClick={() => setOpen(false)}
        />
      )}

      <button
        type="button"
        className={styles.fab}
        aria-label={open ? 'Close help' : 'Open help'}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <ChatBubbleLeftRightIcon className={styles.fabIcon} aria-hidden />
      </button>

      {open && (
        <aside className={styles.panel} aria-label="Help chat">
          <header className={styles.head}>
            <div className={styles.headText}>
              <div className={styles.titleRow}>
                <span className={styles.brandIcon} aria-hidden>
                  <SparklesIcon className={styles.brandIconSvg} aria-hidden />
                </span>
                <h2 className={styles.title}>Pixelcare Assistant</h2>
                <span className={styles.statusPill} aria-label={loading ? 'Assistant is typing' : 'Assistant is ready'}>
                  <span
                    className={`${styles.statusDot} ${loading ? styles.statusDotBusy : ''}`}
                    aria-hidden
                  />
                  {loading ? 'Typing' : 'Ready'}
                </span>
              </div>
              <p className={styles.subtitle}>
                How-to for this portal only (jobs, customers, technicians, scheduling, follow-ups). Not your live
                data.
              </p>
            </div>
            <button
              type="button"
              className={styles.iconBtn}
              onClick={() => setOpen(false)}
              aria-label="Close assistant"
            >
              <XMarkIcon className={styles.iconBtnSvg} aria-hidden />
            </button>
          </header>

          <div className={styles.body}>
            <div ref={threadRef} className={styles.thread} role="log" aria-live="polite" aria-relevant="additions">
              {messages.length === 0 && !loading && (
                <p className={styles.empty}>
                  Ask how to use a screen or workflow in this app — general topics outside the portal are not
                  covered.
                </p>
              )}
              {messages.map((m, i) => (
                <div
                  key={`${m.role}-${i}`}
                  className={`${styles.row} ${m.role === 'user' ? styles.rowUser : styles.rowAssistant}`}
                >
                  <div className={styles.meta}>
                    <span className={styles.avatar} aria-hidden>
                      {m.role === 'user' ? (
                        <UserCircleIcon className={styles.avatarIconUser} aria-hidden />
                      ) : (
                        <SparklesIcon className={styles.avatarIconAssistant} aria-hidden />
                      )}
                    </span>
                    <span className={styles.badge}>{m.role === 'user' ? 'You' : 'Assistant'}</span>
                  </div>

                  <div className={styles.bubbleWrap}>
                    <div className={`${styles.msg} ${m.role === 'user' ? styles.msgUser : styles.msgAssistant}`}>
                      {m.role === 'assistant' ? <FriendlyAssistantMessage text={m.content} /> : m.content}
                    </div>
                  </div>
                </div>
              ))}
              {loading && (
                <div className={`${styles.row} ${styles.rowAssistant}`}>
                  <div className={styles.meta}>
                    <span className={styles.avatar} aria-hidden>
                      <SparklesIcon className={styles.avatarIconAssistant} aria-hidden />
                    </span>
                    <span className={styles.badge}>Assistant</span>
                  </div>
                  <div className={styles.bubbleWrap}>
                    <div className={styles.thinking} aria-label="Assistant is typing">
                      <span className={styles.dots} aria-hidden>
                        <span className={styles.dot} />
                        <span className={styles.dot} />
                        <span className={styles.dot} />
                      </span>
                      Typing
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <footer className={styles.footer}>
            <textarea
              className={styles.textarea}
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Message… (Enter to send, Shift+Enter for a new line)"
              disabled={loading}
              rows={2}
              autoComplete="off"
            />
            <div className={styles.footerActions}>
              <button
                type="button"
                className={styles.send}
                onClick={send}
                disabled={loading || !input.trim()}
              >
                <span>Send</span>
                <PaperAirplaneIcon className={styles.sendIcon} aria-hidden />
              </button>
            </div>
          </footer>
        </aside>
      )}
    </div>
  );

  return createPortal(layer, portalEl);
}
