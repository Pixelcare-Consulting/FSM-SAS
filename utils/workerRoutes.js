export function getWorkerViewPath(workerId, { tab } = {}) {
  const base = `/dashboard/workers/view/${workerId}`;
  return tab ? `${base}?tab=${encodeURIComponent(tab)}` : base;
}
