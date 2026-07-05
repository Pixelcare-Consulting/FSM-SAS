-- =============================================
-- MIGRATION: Fix technician_hours completion trigger
-- =============================================
-- Replaces raw (completed_at - started_at) math with guarded fn_compute_technician_labor_hours.
-- UPSERT on conflict so bad cached rows are corrected (not left by ON CONFLICT DO NOTHING).
-- Mobile app owns started_at / completed_at / accumulated_hours on technician_jobs.

-- Column for mobile-maintained session totals (multi-day / incremental work)
ALTER TABLE technician_jobs
ADD COLUMN IF NOT EXISTS accumulated_hours NUMERIC;

COMMENT ON COLUMN technician_jobs.accumulated_hours IS
  'Mobile-maintained labor total (sum of sessions). Preferred over timestamp span when set.';

-- ---------------------------------------------------------------------------
-- Shared labor compute (prefer accumulated_hours, else guarded timestamp span)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_compute_technician_labor_hours(
  p_started_at        TIMESTAMPTZ,
  p_completed_at      TIMESTAMPTZ,
  p_accumulated_hours NUMERIC,
  p_assignment_status TEXT,
  p_scheduled_start   TIMESTAMPTZ,
  p_scheduled_end     TIMESTAMPTZ,
  p_max_hours_per_day NUMERIC DEFAULT 16
) RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_span_h    NUMERIC;
  v_days      INT;
  v_cap_h     NUMERIC;
  v_slot_h    NUMERIC;
  v_stale     BOOLEAN;
BEGIN
  -- Per-row labor result guards below (RETURN 0) are business rules, NOT SQL row
  -- LIMITs — every technician_job row is still evaluated by triggers/backfill.

  -- Not completed → no labor in technician_hours
  IF UPPER(COALESCE(p_assignment_status, '')) <> 'COMPLETED' THEN
    RETURN 0;
  END IF;

  -- Mobile-maintained total (multi-day / sessions) — preferred
  IF p_accumulated_hours IS NOT NULL AND p_accumulated_hours > 0 THEN
    RETURN ROUND(p_accumulated_hours::NUMERIC, 4);
  END IF;

  -- Missing/invalid timestamps → 0 labor (not a batch cap)
  IF p_started_at IS NULL OR p_completed_at IS NULL OR p_completed_at <= p_started_at THEN
    RETURN 0;
  END IF;

  -- Corruption guard: started_at far before schedule (catches year-mismatch / stale started_at)
  v_stale := p_scheduled_start IS NOT NULL
    AND p_started_at < p_scheduled_start - INTERVAL '7 days';
  IF v_stale THEN
    IF p_scheduled_start IS NOT NULL AND p_scheduled_end IS NOT NULL
       AND p_scheduled_end > p_scheduled_start THEN
      RETURN ROUND(
        (EXTRACT(EPOCH FROM (p_scheduled_end - p_scheduled_start)) / 3600.0)::NUMERIC, 4
      );
    END IF;
    RETURN 0;
  END IF;

  -- Completion long after appointment window → use schedule slot
  IF p_scheduled_end IS NOT NULL
     AND p_completed_at > p_scheduled_end + INTERVAL '2 days' THEN
    IF p_scheduled_start IS NOT NULL AND p_scheduled_end > p_scheduled_start THEN
      RETURN ROUND(
        (EXTRACT(EPOCH FROM (p_scheduled_end - p_scheduled_start)) / 3600.0)::NUMERIC, 4
      );
    END IF;
    RETURN 0;
  END IF;

  v_span_h := EXTRACT(EPOCH FROM (p_completed_at - p_started_at)) / 3600.0;

  -- Per-calendar-day ceiling (allows overnight, blocks month-long garbage)
  v_days := GREATEST(
    1,
    (DATE(p_completed_at AT TIME ZONE 'Asia/Singapore')
   - DATE(p_started_at   AT TIME ZONE 'Asia/Singapore')) + 1
  );
  v_cap_h := v_days * p_max_hours_per_day;
  v_span_h := LEAST(v_span_h, v_cap_h);

  IF p_scheduled_start IS NOT NULL AND p_scheduled_end IS NOT NULL
     AND p_scheduled_end > p_scheduled_start THEN
    v_slot_h := EXTRACT(EPOCH FROM (p_scheduled_end - p_scheduled_start)) / 3600.0;
    IF v_span_h > v_slot_h * 4 THEN
      v_span_h := v_slot_h;
    END IF;
  END IF;

  RETURN ROUND(v_span_h::NUMERIC, 4);
END;
$$;

COMMENT ON FUNCTION public.fn_compute_technician_labor_hours(
  TIMESTAMPTZ, TIMESTAMPTZ, NUMERIC, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, NUMERIC
) IS 'Guarded FSM labor hours per assignment; prefers accumulated_hours from mobile.';

-- ---------------------------------------------------------------------------
-- Period anchor for incentive month/quarter rollups
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_technician_hours_period_anchor(
  p_completed_at      TIMESTAMPTZ,
  p_assignment_status TEXT
) RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN UPPER(COALESCE(p_assignment_status, '')) = 'COMPLETED'
     AND p_completed_at IS NOT NULL
    THEN p_completed_at
    ELSE NULL
  END;
$$;

COMMENT ON FUNCTION public.fn_technician_hours_period_anchor(TIMESTAMPTZ, TEXT) IS
  'period_anchor_at for technician_hours when assignment is COMPLETED.';

-- ---------------------------------------------------------------------------
-- Completion trigger: UPSERT technician_hours (not ON CONFLICT DO NOTHING)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_create_technician_hours_on_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_job RECORD;
  v_labor NUMERIC;
  v_anchor TIMESTAMPTZ;
BEGIN
  IF NEW.assignment_status = 'COMPLETED'
     AND (OLD.assignment_status IS DISTINCT FROM 'COMPLETED') THEN

    SELECT scheduled_start, scheduled_end INTO v_job
    FROM jobs WHERE id = NEW.job_id;

    v_labor := fn_compute_technician_labor_hours(
      NEW.started_at, NEW.completed_at, NEW.accumulated_hours,
      NEW.assignment_status, v_job.scheduled_start, v_job.scheduled_end
    );
    v_anchor := fn_technician_hours_period_anchor(NEW.completed_at, NEW.assignment_status);

    IF v_anchor IS NULL THEN
      RETURN NEW;
    END IF;

    INSERT INTO technician_hours (
      technician_job_id, technician_id, labor_hours, period_anchor_at, computed_at
    ) VALUES (
      NEW.id, NEW.technician_id, v_labor, v_anchor, NOW()
    )
    ON CONFLICT (technician_job_id) DO UPDATE SET
      technician_id    = EXCLUDED.technician_id,
      labor_hours      = EXCLUDED.labor_hours,
      period_anchor_at = EXCLUDED.period_anchor_at,
      computed_at      = EXCLUDED.computed_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_technician_hours_on_job_completion ON technician_jobs;
CREATE TRIGGER trg_technician_hours_on_job_completion
  AFTER UPDATE ON technician_jobs
  FOR EACH ROW
  EXECUTE FUNCTION fn_create_technician_hours_on_completion();
