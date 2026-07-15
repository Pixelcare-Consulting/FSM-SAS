import { applyMobileCors } from '../../lib/api/corsMobile';
import { withApiMetrics } from '../../lib/api/withApiMetrics';
import { runPortalLogin } from '../../lib/auth/runPortalLogin';

export const config = {
  api: {
    externalResolver: true,
    bodyParser: true,
  },
};

async function handler(req, res) {
  if (
    applyMobileCors(req, res, {
      methods: 'GET,DELETE,PATCH,POST,PUT,OPTIONS',
      fallbackStar: true,
    })
  ) {
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  return runPortalLogin(req, res, { requireTechnician: false });
}

export default withApiMetrics(handler);
