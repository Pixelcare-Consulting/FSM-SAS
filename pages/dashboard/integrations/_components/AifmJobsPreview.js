import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Row, Col, Card, Button, Form, Table, Spinner, Alert, Collapse, Modal, ProgressBar } from 'react-bootstrap';
import { format, subDays } from 'date-fns';
import {
  aifmCustomerNameForImport,
  customerLookupKeyFromAifmJob,
} from '../../../../lib/utils/aifmJobCustomerName';
import { formatAifmAssignedTechsDisplay } from '../../../../lib/utils/aifmAssignedTechs';

function formatCustomerName(row) {
  return aifmCustomerNameForImport(row) || customerLookupKeyFromAifmJob(row) || '—';
}

/** Formats the enriched service_location object returned by the API. */
function formatLocation(row) {
  const loc = row.service_location;
  if (!loc) return '—';
  const parts = [
    [loc.flat_number, loc.street_address].map((s) => String(s || '').trim()).filter(Boolean).join(' '),
    loc.city,
    loc.state,
    loc.zip
  ].map((s) => String(s || '').trim()).filter(Boolean);
  if (!parts.length) return loc.nick_name || '—';
  return parts.join(', ');
}

/** Formats the customer_equipments array returned by the API. */
function formatEquipment(row) {
  const list = row.customer_equipments;
  if (!list || list.length === 0) return '—';
  return list
    .map((e) =>
      [e.equipment_type, e.model, e.serial_number ? `(S/N: ${e.serial_number})` : '']
        .filter(Boolean)
        .join(' ')
    )
    .join(' · ');
}

export default function AifmJobsPreview() {
  const initialRange = useMemo(() => {
    const end = new Date();
    const start = subDays(end, 13);
    return {
      start: format(start, 'yyyy-MM-dd'),
      end: format(end, 'yyyy-MM-dd')
    };
  }, []);

  const [startDate, setStartDate] = useState(initialRange.start);
  const [endDate, setEndDate] = useState(initialRange.end);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [payload, setPayload] = useState(null);
  const [showRaw, setShowRaw] = useState(false);
  /** Default on: AIFM job rows usually omit inline address and only send customer_service_location_id; API resolves full address per customer. */
  const [resolveLocations, setResolveLocations] = useState(true);
  const [resolveEquipment, setResolveEquipment] = useState(false);
  const [loadingStep, setLoadingStep] = useState('');
  // { current: number, total: number } | null — null = indeterminate
  const [loadingProgress, setLoadingProgress] = useState(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const timerRef = useRef(null);

  // Save-to-DB state
  const [saving, setSaving] = useState(false);
  const [saveStep, setSaveStep] = useState('');
  const [saveProgress, setSaveProgress] = useState(null);
  const [saveElapsedSec, setSaveElapsedSec] = useState(0);
  const [saveResult, setSaveResult] = useState(null); // { created, updated, failed, total, results }
  const saveTimerRef = useRef(null);

  // Assign Customers state
  const [assigning, setAssigning] = useState(false);
  const [assignStep, setAssignStep] = useState('');
  const [assignProgress, setAssignProgress] = useState(null);
  const [assignElapsedSec, setAssignElapsedSec] = useState(0);
  const [assignResult, setAssignResult] = useState(null);
  const assignTimerRef = useRef(null);

  // Tick elapsed-seconds counter while loading
  useEffect(() => {
    if (loading) {
      setElapsedSec(0);
      timerRef.current = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [loading]);

  // Tick elapsed-seconds counter while saving
  useEffect(() => {
    if (saving) {
      setSaveElapsedSec(0);
      saveTimerRef.current = setInterval(() => setSaveElapsedSec((s) => s + 1), 1000);
    } else {
      clearInterval(saveTimerRef.current);
    }
    return () => clearInterval(saveTimerRef.current);
  }, [saving]);

  // Tick elapsed-seconds counter while assigning
  useEffect(() => {
    if (assigning) {
      setAssignElapsedSec(0);
      assignTimerRef.current = setInterval(() => setAssignElapsedSec((s) => s + 1), 1000);
    } else {
      clearInterval(assignTimerRef.current);
    }
    return () => clearInterval(assignTimerRef.current);
  }, [assigning]);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPayload(null);
    setLoadingStep('Connecting…');
    setLoadingProgress(null);

    let resultToken = null;

    try {
      const res = await fetch('/api/integrations/aifm/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          start_date: startDate,
          end_date: endDate,
          resolve_service_locations: resolveLocations,
          resolve_equipment: resolveEquipment
        })
      });

      // Pre-SSE errors (401, 503 …) are still plain JSON
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = data.error || data.message || `Request failed (${res.status})`;
        if (data.code === 'AIFM_NOT_CONFIGURED' || /AIFM_API_TOKEN|not configured/i.test(msg)) {
          setError(
            `${msg} This value must be on the server (e.g. .env.local beside the app), not in the browser — restart Next.js after saving.`
          );
        } else {
          setError(msg);
        }
        return;
      }

      // Read SSE stream — only carries lightweight progress events + token
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      console.log('[aifm] SSE stream opened');

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log('[aifm] SSE stream closed by server');
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          let event;
          try { event = JSON.parse(line.slice(6)); } catch (parseErr) {
            console.warn('[aifm] SSE parse error:', parseErr.message, '| line:', line.slice(0, 120));
            continue;
          }

          console.log(`[aifm] SSE event: type=${event.type} phase=${event.phase ?? '-'} msg="${event.message ?? ''}"`,
            event.type === 'progress' ? `${event.current}/${event.total}` : '');

          if (event.type === 'step') {
            setLoadingStep(event.message ?? '');
            if (event.phase !== 'customers') setLoadingProgress(null);
          } else if (event.type === 'progress') {
            if (event.message) setLoadingStep(event.message);
            setLoadingProgress({ current: event.current, total: event.total });
          } else if (event.type === 'error') {
            console.error('[aifm] SSE error event:', event.error);
            setError(event.error || 'AIFM request failed');
          } else if (event.type === 'done') {
            console.log('[aifm] SSE done — token:', event.token);
            resultToken = event.token;
          }
        }
      }

      // Fetch the cached result by token
      if (resultToken) {
        console.log('[aifm] Fetching result by token:', resultToken);
        setLoadingStep('Downloading results…');
        setLoadingProgress(null);
        const dataRes = await fetch(
          `/api/integrations/aifm/jobs?token=${encodeURIComponent(resultToken)}`,
          { credentials: 'include' }
        );
        console.log('[aifm] Result response status:', dataRes.status);
        const data = await dataRes.json().catch(() => ({}));
        console.log('[aifm] Result payload:', { success: data.success, jobs: data.jobs?.length, meta: data.meta });
        if (!dataRes.ok) {
          setError(data.error || `Failed to retrieve results (${dataRes.status})`);
        } else {
          setPayload(data);
        }
      } else {
        console.warn('[aifm] SSE stream ended with no token — check server logs');
      }
    } catch (e) {
      setError(e?.message || 'Network error');
    } finally {
      setLoading(false);
      setLoadingStep('');
      setLoadingProgress(null);
    }
  }, [startDate, endDate, resolveLocations, resolveEquipment]);

  const saveJobs = useCallback(async () => {
    const jobsToSave = payload?.jobs ?? [];
    if (!jobsToSave.length) return;

    setSaving(true);
    setSaveResult(null);
    setSaveStep('Connecting…');
    setSaveProgress(null);

    try {
      const res = await fetch('/api/integrations/aifm/import-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ jobs: jobsToSave }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSaveStep('');
        setSaveResult({ error: data.error || data.message || `Request failed (${res.status})` });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      console.log('[aifm-import] SSE stream opened');

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log('[aifm-import] SSE stream closed by server');
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          let event;
          try { event = JSON.parse(line.slice(6)); } catch (parseErr) {
            console.warn('[aifm-import] SSE parse error:', parseErr.message, '| line:', line.slice(0, 120));
            continue;
          }

          console.log(`[aifm-import] SSE event: type=${event.type} msg="${event.message ?? ''}"`,
            event.type === 'progress' ? `${event.current}/${event.total}` : '');

          if (event.type === 'step') {
            setSaveStep(event.message ?? '');
            setSaveProgress(null);
          } else if (event.type === 'progress') {
            if (event.message) setSaveStep(event.message);
            setSaveProgress({ current: event.current, total: event.total });
          } else if (event.type === 'error') {
            console.error('[aifm-import] SSE error event:', event.error);
            setSaveResult({ error: event.error || 'Import failed' });
          } else if (event.type === 'done') {
            console.log('[aifm-import] SSE done:', { created: event.created, updated: event.updated, failed: event.failed });
            setSaveResult({
              created: event.created,
              updated: event.updated,
              failed: event.failed,
              total: event.total,
              results: event.results,
            });
          }
        }
      }
    } catch (e) {
      setSaveResult({ error: e?.message || 'Network error' });
    } finally {
      setSaving(false);
      setSaveStep('');
      setSaveProgress(null);
    }
  }, [payload]);

  const assignCustomers = useCallback(async () => {
    setAssigning(true);
    setAssignResult(null);
    setAssignStep('Connecting…');
    setAssignProgress(null);

    try {
      const res = await fetch('/api/integrations/aifm/assign-customers', {
        method: 'POST',
        credentials: 'include',
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setAssignResult({ error: data.error || data.message || `Request failed (${res.status})` });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      console.log('[aifm-assign] SSE stream opened');

      while (true) {
        const { done, value } = await reader.read();
        if (done) { console.log('[aifm-assign] SSE closed'); break; }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          let event;
          try { event = JSON.parse(line.slice(6)); } catch (_) { continue; }

          console.log('[aifm-assign] event:', event.type, event.message ?? '');

          if (event.type === 'step') {
            setAssignStep(event.message ?? '');
            if (event.total != null) setAssignProgress({ current: 0, total: event.total });
            else setAssignProgress(null);
          } else if (event.type === 'progress') {
            if (event.message) setAssignStep(event.message);
            setAssignProgress({ current: event.current, total: event.total });
          } else if (event.type === 'error') {
            setAssignResult({ error: event.error || 'Assignment failed' });
          } else if (event.type === 'done') {
            setAssignResult({
              matched: event.matched,
              updated: event.updated,
              failed: event.failed,
              skipped: event.skipped,
              total: event.total,
              message: event.message,
              linkedLocationEnrichment: event.linkedLocationEnrichment,
            });
          }
        }
      }
    } catch (e) {
      setAssignResult({ error: e?.message || 'Network error' });
    } finally {
      setAssigning(false);
      setAssignStep('');
      setAssignProgress(null);
    }
  }, []);

  const jobs = payload?.jobs ?? [];

  return (
    <Card className="shadow-sm">
      <Card.Body>
        <Row className="g-3 mb-4 align-items-end">
          <Col xs={12} md={3}>
            <Form.Group>
              <Form.Label>Start date</Form.Label>
              <Form.Control
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                disabled={loading}
              />
            </Form.Group>
          </Col>
          <Col xs={12} md={3}>
            <Form.Group>
              <Form.Label>End date</Form.Label>
              <Form.Control
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                disabled={loading}
              />
            </Form.Group>
          </Col>
          <Col xs={12} md={6}>
            <div className="d-flex flex-wrap align-items-center gap-2">
              <Button variant="primary" onClick={fetchJobs} disabled={loading || saving}>
                {loading ? (
                  <>
                    <Spinner animation="border" size="sm" className="me-1" />
                    Fetching…
                  </>
                ) : 'Fetch from AIFM'}
              </Button>

              {jobs.length > 0 && (
                <Button
                  variant="success"
                  onClick={saveJobs}
                  disabled={saving || loading || assigning}
                >
                  {saving ? (
                    <>
                      <Spinner animation="border" size="sm" className="me-1" />
                      Importing…
                    </>
                  ) : (
                    `Import ${jobs.length} job(s) to DB`
                  )}
                </Button>
              )}

              <Button
                variant="outline-warning"
                onClick={assignCustomers}
                disabled={assigning || saving || loading}
                title="First sync [ADDRESS] tags into job schedule (from AIFM import), then scan for AIFM jobs with no customer and match by Supabase masterlist name/CardCode."
              >
                {assigning ? (
                  <>
                    <Spinner animation="border" size="sm" className="me-1" />
                    Assigning…
                  </>
                ) : 'Auto-Assign Customers'}
              </Button>

              <Form.Check
                type="checkbox"
                id="aifm-resolve-locations"
                label="Service locations (full address)"
                checked={resolveLocations}
                onChange={(e) => setResolveLocations(e.target.checked)}
                disabled={loading || saving}
                className="user-select-none"
                title="Uses customer_service_location_id: one POST /customers/service_locations per unique AIFM customer to load street address."
              />
              <Form.Check
                type="checkbox"
                id="aifm-resolve-equipment"
                label="Equipment"
                checked={resolveEquipment}
                onChange={(e) => setResolveEquipment(e.target.checked)}
                disabled={loading || saving}
                className="user-select-none"
              />
            </div>
            <div className="text-muted small mt-2">
              Fetch then click <strong>Import to DB</strong> to save jobs. Account names come from the AIFM customer
              directory (<code className="small">id_customer</code>, not site contact on the job row). CardCodes are
              matched from the Supabase masterlist first, then live SAP Service Layer (customers C*, then leads L*).
              Only names with no match get a portal CP code. The job list often has no inline address
              (only <code className="small">customer_service_location_id</code>); keep{' '}
              <strong>Service locations</strong> on to resolve full addresses via AIFM before import. Equipment
              adds one extra AIFM call per unique customer.{' '}
              <strong>Assigned techs</strong> come from AIFM as text; on import we match each segment to portal{' '}
              <code className="small">technicians.full_name</code> (exact name, then all words in any order, then a
              narrow fallback) and create job assignments. Unmatched segments are skipped — align worker names with AIFM.
            </div>
          </Col>
        </Row>

        {error && (
          <Alert variant="danger" className="mb-3">
            {error}
            {payload?.meta?.code != null && (
              <div className="small mt-1 text-muted">AIFM code: {String(payload.meta.code)}</div>
            )}
          </Alert>
        )}

        {payload?.success && payload.meta && (
          <p className="text-muted small mb-2">
            {payload.meta.count} job(s) for {payload.meta.start_date} – {payload.meta.end_date}
            {payload.meta.masterlist_ms != null && (
              <span className="ms-2">
                · Masterlist matched {payload.meta.masterlist_matched ?? 0} /
                {payload.meta.masterlist_rows_with_customer ?? '—'} rows with customer ·{' '}
                {payload.meta.masterlist_rows} masterlist customer(s) · {payload.meta.masterlist_ms} ms
              </span>
            )}
            {payload.meta.sap_live_lookup === 'ok' && (
              <span className="ms-2">
                · SAP live {payload.meta.sap_live_matched ?? 0} job(s) ·{' '}
                {payload.meta.sap_live_unique_accounts ?? 0} account(s) · {payload.meta.sap_live_ms} ms
              </span>
            )}
            {payload.meta.resolve_service_locations && (
              <span className="ms-2">
                · Service locations: {payload.meta.service_locations_found ?? 0} matched /{' '}
                {payload.meta.unique_customers_fetched ?? 0} customers · {payload.meta.service_location_ms} ms
              </span>
            )}
            {payload.meta.resolve_equipment && (
              <span className="ms-2">
                · Equipment rows: {payload.meta.equipment_rows ?? 0}
              </span>
            )}
          </p>
        )}

        {payload?.meta?.masterlist_lookup === 'ok' &&
          (payload.meta.masterlist_matched === 0 || payload.meta.masterlist_matched == null) &&
          (payload.meta.masterlist_rows_with_customer ?? 0) > 0 && (
            <Alert variant="info" className="mb-3 py-2">
              The Supabase masterlist returned no CardCode for these AIFM customer names. Use{' '}
              <strong>Show raw JSON</strong> to compare AIFM name fields with imported masterlist customer names.
            </Alert>
          )}

        {payload?.meta?.masterlist_lookup === 'error' && payload.meta.masterlist_message && (
          <Alert variant="warning" className="mb-3 py-2">
            Supabase masterlist lookup: {payload.meta.masterlist_message}
          </Alert>
        )}

        <div className="table-responsive">
          <Table striped bordered hover size="sm" className="mb-0">
            <thead>
              <tr>
                <th>ID</th>
                <th>Personal / PO</th>
                <th>Status</th>
                <th>Customer</th>
                <th>Masterlist CardCode</th>
                <th>Description</th>
                <th>Service Location</th>
                <th>Equipment</th>
                <th>Start</th>
                <th>End</th>
                <th
                  title="AIFM assigned_teches. On Import to DB, each name is matched to a portal worker (technicians.full_name); codes like ZCSO are shown before ·."
                >
                  Assigned techs (AIFM)
                </th>
              </tr>
            </thead>
            <tbody>
              {jobs.length === 0 && !loading && (
                <tr>
                  <td colSpan={11} className="text-center text-muted py-4">
                    {payload?.success ? 'No jobs in range. Adjust dates and fetch again.' : 'Run a fetch to load jobs.'}
                  </td>
                </tr>
              )}
              {jobs.map((row) => (
                <tr key={String(row.id)}>
                  <td>{row.id ?? '—'}</td>
                  <td>
                    {[row.personal_job_id, row.job_po_number].filter(Boolean).join(' / ') || '—'}
                  </td>
                  <td>{row.status ?? '—'}</td>
                  <td>{formatCustomerName(row)}</td>
                  <td className="small text-nowrap">
                    {row.sap_card_code ? (
                      <>
                        <code>{row.sap_card_code}</code>
                        {(row.sap_card_match === 'ambiguous' ||
                          row.sap_card_match === 'contains_partial' ||
                          row.sap_card_match === 'substring_partial' ||
                          row.sap_card_match === 'indexof_partial' ||
                          row.sap_card_match === 'startswith_partial') && (
                          <span className="text-warning ms-1" title="Match may not be unique">
                            *
                          </span>
                        )}
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="small" style={{ maxWidth: '260px', whiteSpace: 'normal', wordBreak: 'break-word' }}>
                    {(row.job_description || row.description || row.remarks || row.note || row.notes || '').toString().trim() || (
                      <span className="text-muted fst-italic">—</span>
                    )}
                  </td>
                  <td className="small" style={{ maxWidth: '220px', whiteSpace: 'normal', wordBreak: 'break-word' }}>
                    {resolveLocations ? (
                      formatLocation(row)
                    ) : row.customer_service_location_id != null ? (
                      <span className="text-muted fst-italic" title="Enable “Service locations (full address)” and fetch again">
                        ID {row.customer_service_location_id} (resolve off)
                      </span>
                    ) : (
                      <span className="text-muted fst-italic">—</span>
                    )}
                  </td>
                  <td className="small" style={{ maxWidth: '240px', whiteSpace: 'normal', wordBreak: 'break-word' }}>
                    {resolveEquipment ? (
                      formatEquipment(row)
                    ) : (
                      <span className="text-muted fst-italic">—</span>
                    )}
                  </td>
                  <td>
                    {[row.job_start_date, row.job_start_time].filter(Boolean).join(' ') || '—'}
                  </td>
                  <td>
                    {[row.job_end_date, row.job_end_time].filter(Boolean).join(' ') || '—'}
                  </td>
                  <td
                    className="small"
                    style={{ maxWidth: '200px', whiteSpace: 'pre-line', wordBreak: 'break-word' }}
                  >
                    {row.assigned_teches ? (
                      formatAifmAssignedTechsDisplay(row.assigned_teches)
                    ) : (
                      <span className="text-muted fst-italic">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>

        {/* Save result banner */}
        {saveResult && !saveResult.error && (
          <Alert
            variant={saveResult.failed > 0 ? 'warning' : 'success'}
            className="mt-3 mb-0"
            dismissible
            onClose={() => setSaveResult(null)}
          >
            <strong>Import complete.</strong>{' '}
            {saveResult.created} created · {saveResult.updated} updated ·{' '}
            {saveResult.failed} failed — {saveResult.total} total job(s) processed.
            {saveResult.failed > 0 && saveResult.results && (
              <ul className="mb-0 mt-2 small">
                {saveResult.results
                  .filter((r) => r.status === 'FAILED')
                  .slice(0, 10)
                  .map((r) => (
                    <li key={r.aifmId}>
                      AIFM {r.aifmId}: {r.error}
                    </li>
                  ))}
              </ul>
            )}
          </Alert>
        )}
        {saveResult?.error && (
          <Alert variant="danger" className="mt-3 mb-0" dismissible onClose={() => setSaveResult(null)}>
            <strong>Import error:</strong> {saveResult.error}
          </Alert>
        )}

        {/* Auto-Assign result banners */}
        {assignResult && !assignResult.error && (
          <Alert
            variant={
              assignResult.failed > 0 || (assignResult.linkedLocationEnrichment?.failed ?? 0) > 0
                ? 'warning'
                : assignResult.updated > 0 || (assignResult.linkedLocationEnrichment?.updated ?? 0) > 0
                  ? 'success'
                  : 'info'
            }
            className="mt-3 mb-0"
            dismissible
            onClose={() => setAssignResult(null)}
          >
            <strong>Auto-Assign complete.</strong>{' '}
            {assignResult.message || `${assignResult.updated} job(s) assigned.`}
            {assignResult.skipped > 0 && (
              <div className="small mt-1 text-muted">
                {assignResult.skipped} job(s) still have no matching customer. Refresh the Supabase masterlist and run again.
              </div>
            )}
          </Alert>
        )}
        {assignResult?.error && (
          <Alert variant="danger" className="mt-3 mb-0" dismissible onClose={() => setAssignResult(null)}>
            <strong>Auto-Assign error:</strong> {assignResult.error}
          </Alert>
        )}

        <Button
          variant="link"
          className="px-0 mt-3"
          onClick={() => setShowRaw((v) => !v)}
          aria-expanded={showRaw}
        >
          {showRaw ? 'Hide' : 'Show'} raw JSON response
        </Button>
        <Collapse in={showRaw}>
          <pre
            className="bg-light border rounded p-3 small mt-2 mb-0"
            style={{ maxHeight: '420px', overflow: 'auto' }}
          >
            {JSON.stringify(payload?.raw ?? payload, null, 2)}
          </pre>
        </Collapse>
      </Card.Body>

      {/* Save / Import modal */}
      <Modal show={saving} centered backdrop="static" keyboard={false} size="sm">
        <Modal.Body className="text-center py-4 px-4">
          <div
            className="d-flex align-items-center justify-content-center mb-3"
            style={{
              width: 64, height: 64, borderRadius: '50%',
              background: 'linear-gradient(135deg, #198754 0%, #20c997 100%)',
              margin: '0 auto'
            }}
          >
            <Spinner animation="border" variant="light" style={{ width: 32, height: 32, borderWidth: 3 }} />
          </div>

          <h6 className="fw-semibold mb-1" style={{ fontSize: '15px' }}>
            Importing to Database
          </h6>

          <p className="text-muted mb-2" style={{ fontSize: '13px', minHeight: '20px' }}>
            {saveStep || 'Please wait…'}
          </p>

          <div className="mb-3" style={{ minHeight: '32px' }}>
            {saveProgress ? (
              <>
                <ProgressBar
                  now={Math.round((saveProgress.current / saveProgress.total) * 100)}
                  style={{ height: '8px', borderRadius: '4px' }}
                  variant="success"
                />
                <div className="d-flex justify-content-between mt-1" style={{ fontSize: '11px', color: '#6c757d' }}>
                  <span>{saveProgress.current} / {saveProgress.total} jobs</span>
                  <span>{Math.round((saveProgress.current / saveProgress.total) * 100)}%</span>
                </div>
              </>
            ) : (
              <ProgressBar
                animated
                striped
                now={100}
                style={{ height: '8px', borderRadius: '4px' }}
                variant="success"
              />
            )}
          </div>

          <p className="text-muted mb-0" style={{ fontSize: '11px' }}>
            {jobs.length} job(s) queued
            {saveElapsedSec > 0 && (
              <span className="ms-2" style={{ color: '#adb5bd' }}>· {saveElapsedSec}s elapsed</span>
            )}
          </p>
        </Modal.Body>
      </Modal>

      {/* Auto-Assign Customers modal */}
      <Modal show={assigning} centered backdrop="static" keyboard={false} size="sm">
        <Modal.Body className="text-center py-4 px-4">
          <div
            className="d-flex align-items-center justify-content-center mb-3"
            style={{
              width: 64, height: 64, borderRadius: '50%',
              background: 'linear-gradient(135deg, #fd7e14 0%, #ffc107 100%)',
              margin: '0 auto'
            }}
          >
            <Spinner animation="border" variant="light" style={{ width: 32, height: 32, borderWidth: 3 }} />
          </div>

          <h6 className="fw-semibold mb-1" style={{ fontSize: '15px' }}>
            Auto-Assigning Customers
          </h6>

          <p className="text-muted mb-2" style={{ fontSize: '13px', minHeight: '20px' }}>
            {assignStep || 'Please wait…'}
          </p>

          <div className="mb-3" style={{ minHeight: '32px' }}>
            {assignProgress ? (
              <>
                <ProgressBar
                  now={Math.round((assignProgress.current / assignProgress.total) * 100)}
                  style={{ height: '8px', borderRadius: '4px' }}
                  variant="warning"
                />
                <div className="d-flex justify-content-between mt-1" style={{ fontSize: '11px', color: '#6c757d' }}>
                  <span>{assignProgress.current} / {assignProgress.total} jobs</span>
                  <span>{Math.round((assignProgress.current / assignProgress.total) * 100)}%</span>
                </div>
              </>
            ) : (
              <ProgressBar
                animated
                striped
                now={100}
                style={{ height: '8px', borderRadius: '4px' }}
                variant="warning"
              />
            )}
          </div>

          <p className="text-muted mb-0" style={{ fontSize: '11px' }}>
            Matching by Supabase masterlist name/CardCode
            {assignElapsedSec > 0 && (
              <span className="ms-2" style={{ color: '#adb5bd' }}>· {assignElapsedSec}s elapsed</span>
            )}
          </p>
        </Modal.Body>
      </Modal>

      {/* Fetch / Loading modal */}
      <Modal show={loading} centered backdrop="static" keyboard={false} size="sm">
        <Modal.Body className="text-center py-4 px-4">
          {/* Icon */}
          <div
            className="d-flex align-items-center justify-content-center mb-3"
            style={{
              width: 64, height: 64, borderRadius: '50%',
              background: 'linear-gradient(135deg, #4171F5 0%, #3DAAF5 100%)',
              margin: '0 auto'
            }}
          >
            <Spinner animation="border" variant="light" style={{ width: 32, height: 32, borderWidth: 3 }} />
          </div>

          {/* Title */}
          <h6 className="fw-semibold mb-1" style={{ fontSize: '15px' }}>
            Fetching from AIFM
          </h6>

          {/* Step label */}
          <p className="text-muted mb-2" style={{ fontSize: '13px', minHeight: '20px' }}>
            {loadingStep || 'Please wait…'}
          </p>

          {/* Progress bar */}
          <div className="mb-3" style={{ minHeight: '32px' }}>
            {loadingProgress ? (
              <>
                <ProgressBar
                  now={Math.round((loadingProgress.current / loadingProgress.total) * 100)}
                  style={{ height: '8px', borderRadius: '4px' }}
                  variant="primary"
                />
                <div className="d-flex justify-content-between mt-1" style={{ fontSize: '11px', color: '#6c757d' }}>
                  <span>{loadingProgress.current} / {loadingProgress.total} customers</span>
                  <span>{Math.round((loadingProgress.current / loadingProgress.total) * 100)}%</span>
                </div>
              </>
            ) : (
              <ProgressBar
                animated
                striped
                now={100}
                style={{ height: '8px', borderRadius: '4px' }}
                variant="primary"
              />
            )}
          </div>

          {/* Active operation badges */}
          <div className="d-flex justify-content-center gap-2 flex-wrap mb-3">
            {[
              { label: 'Jobs', always: true },
              { label: 'Masterlist', always: true },
              { label: 'Service Locations', active: resolveLocations },
              { label: 'Equipment', active: resolveEquipment }
            ]
              .filter((s) => s.always || s.active)
              .map((s) => (
                <span
                  key={s.label}
                  style={{
                    background: 'rgba(65,113,245,0.1)', color: '#4171F5',
                    fontWeight: 500, fontSize: '11px',
                    padding: '3px 8px', borderRadius: '6px'
                  }}
                >
                  {s.label}
                </span>
              ))}
          </div>

          <p className="text-muted mb-0" style={{ fontSize: '11px' }}>
            {startDate} – {endDate}
            {elapsedSec > 0 && (
              <span className="ms-2" style={{ color: '#adb5bd' }}>· {elapsedSec}s elapsed</span>
            )}
          </p>
        </Modal.Body>
      </Modal>
    </Card>
  );
}
