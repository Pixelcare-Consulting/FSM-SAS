import { requireSession } from '../auth/requireSession';
import { applyMobileCors } from './corsMobile';
import { withApiMetrics } from './withApiMetrics';

/**
 * Field BFF wrapper: CORS (MOBILE_CORS_ORIGINS) + session (cookie or Bearer) + api_timing.
 * @param {(req: import('next').NextApiRequest, res: import('next').NextApiResponse, session: { user: object }) => any} handler
 */
export function withFieldApi(handler) {
  return withApiMetrics(async function fieldApiWrapped(req, res) {
    if (
      applyMobileCors(req, res, {
        methods: 'GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS',
      })
    ) {
      return;
    }

    const session = await requireSession(req, res);
    if (!session) return;

    return handler(req, res, session);
  });
}
