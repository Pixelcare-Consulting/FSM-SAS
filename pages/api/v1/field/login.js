import { applyMobileCors } from '../../../../lib/api/corsMobile';
import { withApiMetrics } from '../../../../lib/api/withApiMetrics';
import { runPortalLogin } from '../../../../lib/auth/runPortalLogin';

export const config = {
  api: {
    externalResolver: true,
    bodyParser: true,
  },
};

/**
 * POST /api/v1/field/login
 * Mobile field login — same portal session model as /api/login, requires technician profile.
 * Send X-Client-Source: mobile for api_timing attribution.
 */
async function handler(req, res) {
  if (
    applyMobileCors(req, res, {
      methods: 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS',
      fallbackStar: true,
    })
  ) {
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  return runPortalLogin(req, res, { requireTechnician: true });
}

export default withApiMetrics(handler);
