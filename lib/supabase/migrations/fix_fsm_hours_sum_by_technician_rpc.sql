-- RPC was joining technician_jobs; RLS on that table can hide rows while technician_hours is visible.
-- Soft-deleted assignments already remove technician_hours rows in app code.

CREATE OR REPLACE FUNCTION public.fsm_hours_sum_by_technician(p_start TIMESTAMPTZ, p_end TIMESTAMPTZ)
RETURNS TABLE (technician_id UUID, total_hours NUMERIC)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT th.technician_id,
           COALESCE(SUM(th.labor_hours), 0)::NUMERIC AS total_hours
    FROM technician_hours th
    WHERE th.period_anchor_at IS NOT NULL
      AND th.period_anchor_at >= p_start
      AND th.period_anchor_at <= p_end
    GROUP BY th.technician_id;
$$;
