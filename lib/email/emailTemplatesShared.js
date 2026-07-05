/**
 * Shared defaults and placeholder helpers for Dashboard → Settings → Email templates.
 * Stored under settings.id = emailSettings → value.emailTemplates
 */

import DOMPurify from 'isomorphic-dompurify';

export const EMAIL_TEMPLATE_KEYS = ['jobAssigned', 'jobCompleted', 'followUpReminder'];

/** DOMPurify config for rich template bodies (toolbar: bold, lists, links, images). */
const EMAIL_BODY_PURIFY = {
  ALLOWED_TAGS: [
    'p',
    'br',
    'strong',
    'em',
    'b',
    'i',
    'u',
    's',
    'strike',
    'sub',
    'sup',
    'a',
    'ul',
    'ol',
    'li',
    'h1',
    'h2',
    'h3',
    'h4',
    'blockquote',
    'pre',
    'code',
    'img',
    'span',
    'div',
    'hr',
  ],
  ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'width', 'height', 'style', 'class', 'target', 'rel'],
  ALLOW_DATA_ATTR: false,
};

/**
 * @param {unknown} s
 */
export function bodyLooksLikeHtml(s) {
  return typeof s === 'string' && /<[a-z][\s\S]*>/i.test(s.trim());
}

/**
 * Sanitize stored or rendered HTML before save or send.
 * @param {unknown} dirty
 */
export function sanitizeEmailTemplateHtml(dirty) {
  const s = typeof dirty === 'string' ? dirty : '';
  return DOMPurify.sanitize(s, EMAIL_BODY_PURIFY);
}

/**
 * Legacy plain-text bodies → simple HTML for the rich editor.
 * @param {unknown} body
 */
export function migratePlainTemplateBodyToHtml(body) {
  const t = typeof body === 'string' ? body : '';
  if (!t.trim()) return '<p><br></p>';
  if (bodyLooksLikeHtml(t)) return t;
  const escape = (x) =>
    x.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return t
    .split(/\n\n+/)
    .map((block) => `<p>${escape(block).replace(/\r?\n/g, '<br />')}</p>`)
    .join('');
}

/** @type {Record<string, { subject: string, body: string }>} */
export const DEFAULT_EMAIL_TEMPLATES = {
  jobAssigned: {
    subject: 'Job {{job_number}} assigned — {{job_title}}',
    body: `Hi {{technician_name}},

You've been assigned:
• Job: {{job_number}} — {{job_title}}
• Customer: {{customer_name}}
• Site: {{location_name}}
• Service location: {{service_location}}
• Contacts: {{contacts}}
• Scheduled: {{scheduled_date}}

Open in the app: {{job_url}}

Sent from {{company_name}}`,
  },
  jobCompleted: {
    subject: 'Job {{job_number}} marked complete',
    body: `Hello {{customer_name}},

Job {{job_number}} ({{job_title}}) was completed on {{completed_at}}.

Technician: {{technician_name}}

Service location: {{service_location}}
Site: {{location_name}}
Contacts: {{contacts}}

Thank you for choosing {{company_name}}.`,
  },
  followUpReminder: {
    subject: 'Reminder: {{follow_up_title}}',
    body: `Hi {{assignee_name}},

This is a reminder about: {{follow_up_title}}

• Related job: {{job_number}} — {{job_title}}
• Site: {{location_name}}
• Service location: {{service_location}}
• Contacts: {{contacts}}
• Due: {{due_date}}
{{notes_line}}

Open the follow-up: {{follow_up_url}}

— {{company_name}}`,
  },
};

/**
 * @param {unknown} input
 * @returns {Record<string, { subject: string, body: string }>}
 */
export function normalizeEmailTemplates(input) {
  const out = {};
  for (const key of EMAIL_TEMPLATE_KEYS) {
    const d = DEFAULT_EMAIL_TEMPLATES[key];
    const chunk = input && typeof input === 'object' ? input[key] : null;
    const subject =
      chunk && typeof chunk.subject === 'string' && chunk.subject.trim() !== ''
        ? chunk.subject
        : d.subject;
    const body =
      chunk && typeof chunk.body === 'string' && chunk.body.trim() !== '' ? chunk.body : d.body;
    out[key] = { subject, body };
  }
  return out;
}

/**
 * Normalize templates and upgrade plain bodies to HTML for the dashboard editor.
 * @param {unknown} input
 */
export function normalizeEmailTemplatesForUi(input) {
  const norm = normalizeEmailTemplates(input);
  /** @type {Record<string, { subject: string, body: string }>} */
  const out = {};
  for (const key of EMAIL_TEMPLATE_KEYS) {
    out[key] = {
      subject: norm[key].subject,
      body: migratePlainTemplateBodyToHtml(norm[key].body),
    };
  }
  return out;
}

/**
 * Simple conditional blocks: {{#if field}}...{{/if}}
 * @param {string} template
 * @param {Record<string, string>} vars
 */
export function applyConditionalBlocks(template, vars) {
  if (typeof template !== 'string') return '';
  return template.replace(
    /\{\{#if\s+([a-zA-Z0-9_]+)\s*\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_, field, content) => {
      const v = vars[field];
      const truthy = v != null && String(v).trim() !== '';
      return truthy ? content : '';
    }
  );
}

/**
 * Replace {{token}} (trimmed) in a string. Unknown tokens become empty string.
 * @param {string} template
 * @param {Record<string, string>} vars
 */
export function applyEmailPlaceholders(template, vars) {
  if (typeof template !== 'string') return '';
  const withConditionals = applyConditionalBlocks(template, vars);
  return withConditionals.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, name) => {
    const v = vars[name];
    return v != null ? String(v) : '';
  });
}

/**
 * Minimal plain-text → HTML for mail clients (escape + newlines).
 * @param {string} text
 */
export function plainTextToEmailHtml(text) {
  const s = typeof text === 'string' ? text : '';
  const escaped = s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  return `<div style="font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;font-size:15px;line-height:1.5;color:#1a1a1a;">${escaped
    .split(/\r?\n/)
    .join('<br />')}</div>`;
}

/**
 * Strip tags for multipart/plain part (rough but readable).
 * @param {string} html
 */
export function htmlToPlainTextEmail(html) {
  const s = typeof html === 'string' ? html : '';
  return s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote)>/gi, '\n')
    .replace(/<\/(ul|ol|table)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Email clients (Outlook, Gmail, etc.) apply large default margins to block tags.
 * Quill emits one <p> per line, which reads as double-spacing. Inject tight inline
 * margins so the sent HTML matches the editor density.
 * @param {string} html
 */
export function applyInlineEmailBodyTypography(html) {
  let s = typeof html === 'string' ? html : '';
  if (!s.trim()) return s;

  const mergeOpeningTag = (tag, attrPart, rules) => {
    const attrs = attrPart || '';
    const styleMatch = attrs.match(/\sstyle\s*=\s*"([^"]*)"/i);
    const ruleStr = rules;
    if (styleMatch) {
      let st = styleMatch[1].trim().replace(/;+$/, '');
      for (const r of ruleStr.split(';')) {
        const part = r.trim();
        if (!part) continue;
        const prop = part.split(':')[0].trim().toLowerCase();
        if (!new RegExp(`(^|;)\\s*${prop.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:`, 'i').test(st)) {
          st = `${st};${part}`;
        }
      }
      st = st.replace(/;;+/g, ';');
      const nextAttrs = attrs.replace(/\sstyle\s*=\s*"[^"]*"/i, ` style="${st}"`);
      return `<${tag}${nextAttrs}>`;
    }
    const rest = attrs.trim();
    return `<${tag} style="${ruleStr}"${rest ? ` ${rest}` : ''}>`;
  };

  s = s.replace(/<p\b([^>]*)>/gi, (_, a) => mergeOpeningTag('p', a, 'margin:0 0 6px 0;line-height:1.45'));
  s = s.replace(/<h1\b([^>]*)>/gi, (_, a) => mergeOpeningTag('h1', a, 'margin:0 0 6px 0;line-height:1.25;font-size:1.25em'));
  s = s.replace(/<h2\b([^>]*)>/gi, (_, a) => mergeOpeningTag('h2', a, 'margin:0 0 6px 0;line-height:1.25;font-size:1.15em'));
  s = s.replace(/<h3\b([^>]*)>/gi, (_, a) => mergeOpeningTag('h3', a, 'margin:0 0 6px 0;line-height:1.25;font-size:1.05em'));
  s = s.replace(/<h4\b([^>]*)>/gi, (_, a) => mergeOpeningTag('h4', a, 'margin:0 0 6px 0;line-height:1.25;font-size:1em'));
  s = s.replace(/<ul\b([^>]*)>/gi, (_, a) => mergeOpeningTag('ul', a, 'margin:0 0 8px 0;padding-left:1.25em'));
  s = s.replace(/<ol\b([^>]*)>/gi, (_, a) => mergeOpeningTag('ol', a, 'margin:0 0 8px 0;padding-left:1.25em'));
  s = s.replace(/<li\b([^>]*)>/gi, (_, a) => mergeOpeningTag('li', a, 'margin:0 0 2px 0;line-height:1.45'));
  s = s.replace(/<blockquote\b([^>]*)>/gi, (_, a) =>
    mergeOpeningTag('blockquote', a, 'margin:0 0 8px 0;padding-left:10px;border-left:3px solid #ddd')
  );

  return s;
}

function wrapEmailHtmlInner(innerHtml) {
  const inner = typeof innerHtml === 'string' ? innerHtml.trim() : '';
  if (!inner) {
    return plainTextToEmailHtml('');
  }
  const tightened = applyInlineEmailBodyTypography(inner);
  return `<div style="font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;font-size:15px;line-height:1.5;color:#1a1a1a;">${tightened}</div>`;
}

/**
 * Sample merge fields for “Send sample” from Settings (test-smtp preview).
 * `technician_name` / `assignee_name` here are fallbacks; the API overlays real
 * technician rows when available.
 *
 * @param {'jobAssigned' | 'jobCompleted' | 'followUpReminder'} kind
 * @param {{ companyName: string, appOrigin: string }} ctx
 */
export function getSampleVarsForTemplateKind(kind, ctx) {
  const companyName = ctx.companyName || 'Your company';
  const origin = (ctx.appOrigin || '').replace(/\/$/, '');
  const jobUrl = origin ? `${origin}/dashboard/jobs/sample-job-id` : '/dashboard/jobs/sample-job-id';
  const followUrl = origin ? `${origin}/dashboard/follow-ups` : '/dashboard/follow-ups';

  const base = {
    company_name: companyName,
    job_number: '1042',
    job_title: 'Annual HVAC inspection',
    customer_name: 'Sample Customer LLC',
    technician_name: 'Sample technician',
    assignee_name: 'Sample assignee',
    scheduled_date: 'Wed, May 14, 2026 at 9:00 AM',
    completed_at: 'May 14, 2026 at 2:30 PM',
    follow_up_title: 'Call customer for feedback',
    due_date: 'May 16, 2026',
    notes_line: 'Notes: Please confirm satisfaction with the visit.',
    job_url: jobUrl,
    follow_up_url: followUrl,
    location_name: 'ACME HQ — Level 3',
    service_location: '100 Example Street, Building A, Singapore 408123',
    contacts: 'Jamie Lee — jamie.lee@customer.com — +65 9123 4567',
    contact_name: 'Jamie Lee',
    contact_email: 'jamie.lee@customer.com',
    contact_phone: '+65 9123 4567',
  };

  if (kind === 'jobAssigned') {
    return {
      company_name: base.company_name,
      job_number: base.job_number,
      job_title: base.job_title,
      customer_name: base.customer_name,
      technician_name: base.technician_name,
      scheduled_date: base.scheduled_date,
      job_url: base.job_url,
      location_name: base.location_name,
      service_location: base.service_location,
      contacts: base.contacts,
      contact_name: base.contact_name,
      contact_email: base.contact_email,
      contact_phone: base.contact_phone,
    };
  }
  if (kind === 'jobCompleted') {
    return {
      company_name: base.company_name,
      job_number: base.job_number,
      job_title: base.job_title,
      customer_name: base.customer_name,
      technician_name: base.technician_name,
      completed_at: base.completed_at,
      scheduled_date: base.scheduled_date,
      location_name: base.location_name,
      service_location: base.service_location,
      contacts: base.contacts,
      contact_name: base.contact_name,
      contact_email: base.contact_email,
      contact_phone: base.contact_phone,
    };
  }
  if (kind === 'followUpReminder') {
    return {
      company_name: base.company_name,
      follow_up_title: base.follow_up_title,
      due_date: base.due_date,
      job_number: base.job_number,
      job_title: base.job_title,
      notes_line: base.notes_line,
      assignee_name: base.assignee_name,
      follow_up_url: base.follow_up_url,
      location_name: base.location_name,
      service_location: base.service_location,
      contacts: base.contacts,
      contact_name: base.contact_name,
      contact_email: base.contact_email,
      contact_phone: base.contact_phone,
    };
  }
  return {};
}

/**
 * Render subject + bodies from explicit template content.
 * @param {{ subject: string, body: string }} templateContent
 * @param {Record<string, string>} vars
 */
export function renderEmailTemplateContent(templateContent, vars) {
  const subject = applyEmailPlaceholders(templateContent.subject, vars).trim();
  const rawBody = applyEmailPlaceholders(templateContent.body, vars);
  const looksRich = bodyLooksLikeHtml(rawBody);
  const sanitizedInner = sanitizeEmailTemplateHtml(rawBody);

  let text;
  let html;
  if (looksRich) {
    html = wrapEmailHtmlInner(sanitizedInner);
    text = htmlToPlainTextEmail(sanitizedInner);
  } else {
    text = sanitizedInner;
    html = plainTextToEmailHtml(text);
  }

  return {
    subject,
    text,
    html,
  };
}

/**
 * Resolved subject + bodies for one template (job handlers, crons, etc.).
 * @param {'jobAssigned' | 'jobCompleted' | 'followUpReminder'} templateKey
 * @param {unknown} templatesPartial settings value.emailTemplates
 * @param {Record<string, string>} vars
 */
export function renderEmailTemplate(templateKey, templatesPartial, vars) {
  const t = normalizeEmailTemplates(templatesPartial)[templateKey];
  return renderEmailTemplateContent(t, vars);
}
