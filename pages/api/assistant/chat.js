/**
 * Portal copilot: DashScope (Qwen) chat via OpenAI-compatible API.
 * Key stays server-side. Requires portal session.
 */

import { requireSession } from '../../../lib/auth/requireSession';

const REGION_BASES = {
  cn: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  intl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
  us: 'https://dashscope-us.aliyuncs.com/compatible-mode/v1',
};

const MAX_CLIENT_MESSAGES = 24;
const MAX_CONTENT_LENGTH = 12000;

function normalizeKey(value) {
  return (value || '').trim().replace(/^["']|["']$/g, '');
}

function normalizeBase(url) {
  const fallback = REGION_BASES.cn;
  const u = (url || fallback).trim().replace(/\/+$/, '');
  return u || fallback;
}

/** Resolved base when QWEN_API_BASE_URL is not set: QWEN_DASHSCOPE_REGION or cn */
function defaultBaseFromRegion() {
  const r = (process.env.QWEN_DASHSCOPE_REGION || 'cn').toLowerCase();
  return normalizeBase(REGION_BASES[r] || REGION_BASES.cn);
}

function resolveConfiguredBase() {
  const explicit = (process.env.QWEN_API_BASE_URL || '').trim();
  if (explicit) return normalizeBase(explicit);
  return defaultBaseFromRegion();
}

function buildSystemPrompt(pagePath) {
  const pathLine = pagePath
    ? `The user is currently viewing this path in the portal: ${pagePath}`
    : 'The user did not specify their current page path.';

  const scopeBlock = [
    'ROLE: You are the in-app Help assistant for the SAS M&E Field Services Management (FSM) web portal only.',
    '',
    'SCOPE — YOU MUST STAY INSIDE THIS PRODUCT:',
    'Answer only questions about how to use this portal: navigation, screens, typical workflows, and what features are for.',
    'Core areas users work in:',
    '- Dashboard overview and metrics',
    '- Customers: Portal Customers (leads), SAP-linked customers',
    '- Technicians (workers): technician list, technician scheduler',
    '- Jobs / work orders: creating, viewing, assigning, scheduling, calendars where available',
    '- Follow-ups',
    '- Account: profile, settings, notifications, sign-in / session (high level only)',
    '- Integrations: SAP Business One and AI Field Management (AIFM) at a "where to look in the portal" level — no live ERP data',
    '',
    'OUT OF SCOPE — REFUSE BRIEFLY AND REDIRECT:',
    'If the user asks general knowledge, unrelated products, coding, math, legal/medical advice, politics, creative writing, or anything not tied to using this FSM portal, reply in one short paragraph.',
    'Say you only help with this SAS M&E portal and suggest they rephrase their question in terms of the app (e.g. jobs, technicians, customers, scheduling, follow-ups, settings).\nDo not answer the off-topic request.',
    '',
    'DATA AND ACCURACY:',
    'You do not have access to live data. Never invent job IDs, customer names, technician assignments, SAP documents, or integration statuses.',
    'If specifics are unknown, say so and point to the relevant menu or page in this portal (use the path above when helpful).',
    '',
    'FORMATTING — PLAIN TEXT ONLY (no Markdown in the product UI):',
    'Do NOT use Markdown: no # headings, no **bold**, no code fences, no blockquotes, no tables.',
    'Use short paragraphs with a blank line between them. For steps, use numbered lines: 1. Like this',
    'For options, use lines starting with a hyphen and space. For tips use "Tip:" or "Note:" as plain text.',
  ].join('\n');

  return [scopeBlock, '', pathLine].join('\n');
}

function sanitizeMessages(raw) {
  if (!Array.isArray(raw)) return null;
  const sliced = raw.slice(-MAX_CLIENT_MESSAGES);
  const out = [];
  for (const m of sliced) {
    if (!m || typeof m !== 'object') continue;
    const role = m.role === 'assistant' ? 'assistant' : m.role === 'user' ? 'user' : null;
    if (!role) continue;
    let content = m.content;
    if (typeof content !== 'string') content = content == null ? '' : String(content);
    const trimmed = content.trim();
    if (!trimmed) continue;
    if (trimmed.length > MAX_CONTENT_LENGTH) {
      return { error: 'Message too long' };
    }
    out.push({ role, content: trimmed });
  }
  if (!out.length) return { error: 'No valid messages' };
  if (out[out.length - 1].role !== 'user') {
    return { error: 'Last message must be from the user' };
  }
  return { messages: out };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  const session = await requireSession(req, res);
  if (!session) return;

  const apiKey = normalizeKey(process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY);
  if (!apiKey) {
    return res.status(503).json({
      success: false,
      message: 'Assistant is not configured. Set QWEN_API_KEY or DASHSCOPE_API_KEY.',
    });
  }

  let body = req.body || {};
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body || '{}');
    } catch {
      body = {};
    }
  }

  const pagePath =
    typeof body.page_path === 'string' ? body.page_path.trim().slice(0, 512) : '';
  const parsed = sanitizeMessages(body.messages);
  if (parsed.error) {
    return res.status(400).json({ success: false, message: parsed.error });
  }

  const model = normalizeKey(process.env.QWEN_MODEL) || 'qwen-plus';
  const explicitBase = (process.env.QWEN_API_BASE_URL || '').trim();
  let baseUrl = resolveConfiguredBase();

  const systemContent = buildSystemPrompt(pagePath || null);
  const upstreamMessages = [{ role: 'system', content: systemContent }, ...parsed.messages];
  const payload = JSON.stringify({ model, messages: upstreamMessages });

  async function dashscopeFetch(base) {
    const url = `${normalizeBase(base)}/chat/completions`;
    return fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: payload,
    });
  }

  let upstreamRes;
  try {
    upstreamRes = await dashscopeFetch(baseUrl);
  } catch (e) {
    console.error('[assistant/chat] fetch error:', e?.message);
    return res.status(502).json({
      success: false,
      message: 'Could not reach the assistant service. Try again later.',
    });
  }

  // Keys from the international console often require dashscope-intl; retry once if user did not set an explicit base.
  if (
    !upstreamRes.ok &&
    (upstreamRes.status === 401 || upstreamRes.status === 403) &&
    !explicitBase &&
    normalizeBase(baseUrl) !== normalizeBase(REGION_BASES.intl)
  ) {
    console.warn('[assistant/chat] auth failed on default region; retrying intl endpoint');
    try {
      upstreamRes = await dashscopeFetch(REGION_BASES.intl);
      baseUrl = REGION_BASES.intl;
    } catch (e) {
      console.error('[assistant/chat] intl retry fetch error:', e?.message);
    }
  }

  const raw = await upstreamRes.text();
  let json;
  try {
    json = raw ? JSON.parse(raw) : {};
  } catch {
    json = {};
  }

  if (!upstreamRes.ok) {
    const msg =
      json?.error?.message ||
      json?.message ||
      (typeof json?.msg === 'string' ? json.msg : null) ||
      'Assistant request failed';
    console.error('[assistant/chat] upstream', upstreamRes.status, msg);
    const authFailed = upstreamRes.status === 401 || upstreamRes.status === 403;
    return res.status(502).json({
      success: false,
      message: authFailed
        ? 'DashScope rejected the request (often wrong region or key). Use the API key from Model Studio, set QWEN_DASHSCOPE_REGION=intl (or QWEN_API_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1) for Singapore/international keys, or QWEN_DASHSCOPE_REGION=us for US. Confirm QWEN_MODEL matches your console.'
        : 'Assistant returned an error. Try again or contact support.',
    });
  }

  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    return res.status(502).json({
      success: false,
      message: 'Empty response from assistant.',
    });
  }

  return res.status(200).json({
    success: true,
    message: content.trim(),
  });
}
