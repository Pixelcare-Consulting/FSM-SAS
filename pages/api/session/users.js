import { requireSession } from '../../../lib/auth/requireSession';
import { getSupabaseAdmin } from '../../../lib/supabase/server';
import {
  applyMultiTokenIlikeFilters,
  getListCache,
  logResponseSize,
  paginatedSelect,
  parseSearchTokens,
  setListCache,
} from '../../../lib/supabase/listQueryHelpers';

const CACHE_TTL_MS = 30000;
const USERS_LIST_SELECT =
  'id, username, role, status, is_logged_in, updated_at, current_session_id';
const ALLOWED_ROLES = ['TECHNICIAN', 'ADMIN', 'MANAGER'];

function isAdminRequest(req, session) {
  if (req.cookies?.isAdmin === 'true') return true;
  const role = session?.user?.role;
  return role === 'ADMIN';
}

function normalizeUserListRow(row, displayName = null) {
  const sessionId = row?.current_session_id ?? null;
  const sessionPresent = sessionId != null && String(sessionId).trim() !== '';
  const dn = displayName != null && String(displayName).trim() !== '' ? String(displayName).trim() : null;
  const isLoggedInRaw = row?.is_logged_in;
  const isLoggedIn =
    isLoggedInRaw === null || isLoggedInRaw === undefined ? null : Boolean(isLoggedInRaw);
  return {
    id: row.id,
    username: row.username ?? null,
    display_name: dn || row.username || row.id,
    role: row.role ?? null,
    status: row.status ?? null,
    // Keep tri-state so UI can show Unknown when DB has nulls
    is_logged_in: isLoggedIn,
    updated_at: row.updated_at ?? null,
    current_session_id_present: sessionPresent,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Cache-Control', 'private, max-age=30');

  const session = await requireSession(req, res);
  if (!session) return;

  if (!isAdminRequest(req, session)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(Math.max(1, Number(req.query.limit) || 20), 200);
  const q = String(req.query.q || '').trim();
  const rawRole = String(req.query.role || '').trim().toUpperCase();
  const roleFilter = ALLOWED_ROLES.includes(rawRole) ? rawRole : '';

  const tokens = parseSearchTokens(q);
  const cacheKey = `session-users:${page}:${limit}:${roleFilter || 'ALL'}:${tokens.join('|')}`;
  const cached = getListCache(cacheKey, CACHE_TTL_MS);
  if (cached) {
    logResponseSize('session/users (cached)', cached);
    return res.status(200).json(cached);
  }

  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return res.status(503).json({ error: 'Database unavailable' });
    }

    const { data: rows, totalCount } = await paginatedSelect(
      supabase,
      'users',
      USERS_LIST_SELECT,
      {
        page,
        limit,
        order: { column: 'updated_at', ascending: false },
        countMode: tokens.length > 0 ? 'planned' : 'exact',
        filters: (query) => {
          let qq = query;
          if (roleFilter) {
            qq = qq.eq('role', roleFilter);
          }
          if (tokens.length > 0) {
            qq = applyMultiTokenIlikeFilters(qq, tokens, ['username']);
          }
          return qq;
        },
      }
    );

    const userIds = [...new Set((rows || []).map((r) => r?.id).filter(Boolean))];
    const technicianNameByUserId = {};

    if (userIds.length > 0) {
      try {
        const { data: technicians, error: techError } = await supabase
          .from('technicians')
          .select('user_id, full_name')
          .in('user_id', userIds)
          .is('deleted_at', null);

        if (techError) throw techError;
        for (const t of technicians || []) {
          if (!t?.user_id) continue;
          const name = t?.full_name != null ? String(t.full_name).trim() : '';
          if (name) technicianNameByUserId[t.user_id] = name;
        }
      } catch (error) {
        console.warn('[session/users] Failed to enrich technician full_name:', error?.message || error);
      }
    }

    const users = (rows || []).map((row) =>
      normalizeUserListRow(row, technicianNameByUserId[row?.id] || null)
    );

    const payload = {
      users,
      totalCount,
      page,
      limit,
      fetchedAt: new Date().toISOString(),
    };

    setListCache(cacheKey, payload, CACHE_TTL_MS);
    logResponseSize('session/users', payload);
    return res.status(200).json(payload);
  } catch (error) {
    console.error('[session/users] Error:', error);
    return res.status(500).json({ error: error.message || 'Unable to load users.' });
  }
}

