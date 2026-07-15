import { withFieldApi } from '../../../../lib/api/withFieldApi';
import { runPortalLogout } from '../../../../lib/auth/runPortalLogout';

/**
 * POST /api/v1/field/logout
 * Invalidate portal single-device session (Bearer + X-Uid or cookies). Clears DB + cookies.
 */
export default withFieldApi(async function handler(req, res, session) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  return runPortalLogout(req, res, { user: session.user });
});
