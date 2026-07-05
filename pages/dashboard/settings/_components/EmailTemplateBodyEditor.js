import React, {
  useEffect,
  useMemo,
  useRef,
  useImperativeHandle,
  forwardRef,
} from 'react';
import { useQuill } from 'react-quilljs';
import 'quill/dist/quill.snow.css';

const TOOLBAR = [
  [{ header: [1, 2, 3, false] }],
  ['bold', 'italic', 'underline', 'strike'],
  [{ list: 'ordered' }, { list: 'bullet' }],
  ['link', 'image'],
  ['clean'],
];

const FORMATS = [
  'header',
  'bold',
  'italic',
  'underline',
  'strike',
  'list',
  'link',
  'image',
];

function isEmptyQuillHtml(html) {
  const trimmed = (html || '').trim();
  return !trimmed || trimmed === '<p><br></p>' || trimmed === '<p><br/></p>';
}

const EmailTemplateBodyEditor = forwardRef(function EmailTemplateBodyEditor(
  { value, onChange, className },
  ref
) {
  const modules = useMemo(() => ({ toolbar: TOOLBAR }), []);
  const { quill, quillRef } = useQuill({
    theme: 'snow',
    modules,
    formats: FORMATS,
    placeholder: 'Write your message. Use merge tags below.',
  });

  const isBootRef = useRef(false);
  const lastExternalRef = useRef('');

  useImperativeHandle(
    ref,
    () => ({
      insertAtCursor(text) {
        if (!quill) return false;
        const range = quill.getSelection(true);
        const index = range ? range.index : quill.getLength();
        quill.insertText(index, text, 'user');
        quill.setSelection(index + text.length, 0);
        return true;
      },
      focus() {
        try {
          quill?.focus?.();
        } catch {
          /* ignore */
        }
      },
    }),
    [quill]
  );

  useEffect(() => {
    if (!quill) return;

    const normalized = value || '';
    const current = quill.root.innerHTML.trim();
    const isEmpty = isEmptyQuillHtml(current);

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
  }, [quill, value]);

  useEffect(() => {
    if (!quill) return;

    const handler = () => {
      const html = quill.root.innerHTML.trim();
      const out = isEmptyQuillHtml(html) ? '' : html;
      lastExternalRef.current = out;
      onChange(out);
    };

    quill.on('text-change', handler);
    return () => {
      quill.off('text-change', handler);
    };
  }, [quill, onChange]);

  return (
    <div className={className}>
      <div ref={quillRef} />
    </div>
  );
});

export default EmailTemplateBodyEditor;
