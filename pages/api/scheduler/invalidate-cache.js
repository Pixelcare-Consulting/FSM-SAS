import { invalidateListCache } from '../../../lib/supabase/listQueryHelpers';
import { bumpSchedulerWindowCacheGeneration } from '../../../lib/scheduler/schedulerServerWindowCache';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  bumpSchedulerWindowCacheGeneration();
  invalidateListCache('scheduler-window:');
  invalidateListCache('scheduler-technicians');
  return res.status(200).json({ ok: true });
}
