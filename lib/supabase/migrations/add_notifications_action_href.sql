-- Deep link target for in-app notification rows (e.g. /dashboard/jobs/{uuid})
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS action_href TEXT;

COMMENT ON COLUMN public.notifications.action_href IS
  'Optional in-app path to open when the user clicks the notification (e.g. job details).';
