-- Materialized per-assignment FSM labor hours for incentive rollups (1:1 with technician_jobs).

CREATE TABLE IF NOT EXISTS technician_hours (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    technician_job_id UUID NOT NULL REFERENCES technician_jobs(id) ON DELETE CASCADE,
    technician_id UUID NOT NULL REFERENCES technicians(id) ON DELETE CASCADE,
    labor_hours NUMERIC(14, 4) NOT NULL DEFAULT 0,
    period_anchor_at TIMESTAMPTZ,
    computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_synced BOOLEAN NOT NULL DEFAULT FALSE,
    synced_at TIMESTAMPTZ,
    CONSTRAINT technician_hours_technician_job_id_unique UNIQUE (technician_job_id)
);

CREATE INDEX IF NOT EXISTS idx_technician_hours_technician_period
    ON technician_hours (technician_id, period_anchor_at);

COMMENT ON TABLE technician_hours IS 'Cached labor hours per technician_jobs row for FSM incentive rollups; refresh from application when assignments or job schedules change.';
COMMENT ON COLUMN technician_hours.labor_hours IS 'Hours from same math as calculateTechnicianJobIncentive (portal labor)';
COMMENT ON COLUMN technician_hours.period_anchor_at IS 'Assignment period anchor for filtering by calendar month/quarter';

-- Aggregate for incentives UI (avoids client-side scan limits on technician_jobs).
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

COMMENT ON FUNCTION public.fsm_hours_sum_by_technician(TIMESTAMPTZ, TIMESTAMPTZ) IS 'Sum technician_hours.labor_hours by technician for incentive period window';

GRANT EXECUTE ON FUNCTION public.fsm_hours_sum_by_technician(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fsm_hours_sum_by_technician(TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;

ALTER TABLE technician_hours ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can select technician_hours"
    ON technician_hours FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert technician_hours"
    ON technician_hours FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update technician_hours"
    ON technician_hours FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Authenticated users can delete technician_hours"
    ON technician_hours FOR DELETE TO authenticated USING (true);

-- Browser client uses anon key (app cookie auth, not Supabase Auth JWT)
CREATE POLICY "Allow anon read technician_hours"
    ON technician_hours FOR SELECT TO anon USING (true);

CREATE POLICY "Allow anon insert technician_hours"
    ON technician_hours FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Allow anon update technician_hours"
    ON technician_hours FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Allow anon delete technician_hours"
    ON technician_hours FOR DELETE TO anon USING (true);
