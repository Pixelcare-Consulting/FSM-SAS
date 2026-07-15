import { runPortalLogout } from '../../lib/auth/runPortalLogout';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  return runPortalLogout(req, res);
}
