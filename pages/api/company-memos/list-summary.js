import {
  COMPANY_MEMO_LIST_SELECT,
  COMPANY_MEMO_SEARCH_FIELDS,
  formatCompanyMemoListRow,
} from '../../../lib/companyMemos/companyMemoListSummary';
import {
  applyMultiTokenIlikeFilters,
  getListCache,
  logResponseSize,
  paginatedSelect,
  parseSearchTokens,
  setListCache,
} from '../../../lib/supabase/listQueryHelpers';
import { requireAdminUser } from './_auth';

const CACHE_TTL_MS = 45000;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await requireAdminUser(req, res);
  if (!auth) return;

  res.setHeader('Cache-Control', 'private, max-age=30');

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(Math.max(1, Number(req.query.limit) || 25), 200);
  const search = String(req.query.search || '').trim();
  const folder = String(req.query.folder || '').trim();
  const priority = String(req.query.priority || '').trim().toLowerCase();

  const cacheKey = ['company-memos-summary', page, limit, search, folder, priority].join(':');
  const cached = getListCache(cacheKey, CACHE_TTL_MS);
  if (cached) {
    logResponseSize('company-memos/list-summary (cached)', cached);
    return res.status(200).json(cached);
  }

  try {
    const supabase = auth.admin;
    const tokens = parseSearchTokens(search);

    const { data: dbRows, totalCount } = await paginatedSelect(
      supabase,
      'company_memos',
      COMPANY_MEMO_LIST_SELECT,
      {
        page,
        limit,
        order: { column: 'created_at', ascending: false },
        filters: (query) => {
          let q = query;
          if (tokens.length > 0) {
            q = applyMultiTokenIlikeFilters(q, tokens, COMPANY_MEMO_SEARCH_FIELDS);
          }
          if (folder && folder !== 'all') {
            q = q.eq('folder', folder);
          }
          if (priority && priority !== 'all') {
            q = q.eq('priority', priority);
          }
          return q;
        },
      }
    );

    const memos = (dbRows || []).map(formatCompanyMemoListRow).filter(Boolean);

    const payload = {
      memos,
      totalCount,
      page,
      limit,
      fetchedAt: new Date().toISOString(),
    };

    setListCache(cacheKey, payload, CACHE_TTL_MS);
    logResponseSize('company-memos/list-summary', payload);

    return res.status(200).json(payload);
  } catch (error) {
    console.error('Company memos list-summary API error:', error);
    return res.status(500).json({
      error: error.message || 'Unable to load company memos summary.',
    });
  }
}
