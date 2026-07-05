import React, { useEffect, useMemo, useRef } from 'react';
import { useQuill } from 'react-quilljs';
import 'quill/dist/quill.snow.css';
import { memoBodyForQuill } from '../../../../lib/utils/memoHtml';
import styles from './CompanyMemoBodyEditor.module.css';

const TOOLBAR = [
  [{ header: [1, 2, 3, false] }],
  ['bold', 'italic', 'underline', 'strike'],
  [{ list: 'ordered' }, { list: 'bullet' }],
  ['blockquote', 'link'],
  ['clean'],
];

const FORMATS = [
  'header',
  'bold',
  'italic',
  'underline',
  'strike',
  'list',
  'blockquote',
  'link',
];

/**
 * Rich text body for company memos (Quill via dangerouslyPasteHTML for real HTML).
 * @param {{ value: string, onChange: (html: string) => void, disabled?: boolean, editorKey?: string }} props
 */
export default function CompanyMemoBodyEditor({
  value,
  onChange,
  disabled,
  editorKey = 'default',
}) {
  const modules = useMemo(() => ({ toolbar: TOOLBAR }), []);
  const { quill, quillRef } = useQuill({
    theme: 'snow',
    modules,
    formats: FORMATS,
    placeholder: 'Write the announcement — use headings, lists, bold, and links.',
  });

  const isBootRef = useRef(false);
  const lastExternalRef = useRef('');
  const lastEditorKeyRef = useRef(editorKey);

  const quillHtml = useMemo(() => memoBodyForQuill(value), [value]);

  useEffect(() => {
    if (lastEditorKeyRef.current !== editorKey) {
      lastEditorKeyRef.current = editorKey;
      isBootRef.current = false;
      lastExternalRef.current = '';
    }
  }, [editorKey]);

  useEffect(() => {
    if (!quill) return;
    quill.enable(!disabled);
  }, [quill, disabled]);

  useEffect(() => {
    if (!quill) return;

    const normalized = quillHtml || '';
    const current = quill.root.innerHTML.trim();
    const isEmpty =
      !current || current === '<p><br></p>' || current === '<p><br/></p>';

    if (!isBootRef.current) {
      quill.clipboard.dangerouslyPasteHTML(normalized, 'silent');
      isBootRef.current = true;
      lastExternalRef.current = normalized;
      return;
    }

    if (normalized === lastExternalRef.current) return;

    const matchesLast =
      current === (lastExternalRef.current || '').trim() ||
      (isEmpty && !lastExternalRef.current);

    if (isEmpty || matchesLast) {
      quill.clipboard.dangerouslyPasteHTML(normalized, 'silent');
      lastExternalRef.current = normalized;
    }
  }, [quill, quillHtml]);

  useEffect(() => {
    if (!quill) return;

    const handler = () => {
      const html = quill.root.innerHTML.trim();
      const out =
        !html || html === '<p><br></p>' || html === '<p><br/></p>' ? '' : html;
      onChange(out);
    };

    quill.on('text-change', handler);
    return () => {
      quill.off('text-change', handler);
    };
  }, [quill, onChange]);

  return (
    <div className={styles.wrap}>
      <div ref={quillRef} />
    </div>
  );
}
