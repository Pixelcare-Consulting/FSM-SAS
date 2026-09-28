import { useEffect, useState } from 'react';
import { Button, Badge, Spinner, Alert } from 'react-bootstrap';
import PortalModal, { PortalConfirmPanel, PortalConfirmRow } from '../portal/PortalModal';

const ACTION_LABELS = {
  promote: { label: 'Promote', variant: 'warning' },
  insert: { label: 'Create', variant: 'success' },
  update: { label: 'Update', variant: 'primary' },
  skip: { label: 'Skip', variant: 'secondary' },
};

const ADDRESS_ACTION_LABELS = {
  add: { label: 'Add', variant: 'success' },
  update: { label: 'Update', variant: 'primary' },
  unchanged: { label: 'Unchanged', variant: 'secondary' },
  remove: { label: 'Remove from FSM', variant: 'danger' },
  keep: { label: 'Keep in FSM', variant: 'warning' },
};

function actionBadge(action) {
  const meta = ACTION_LABELS[action] || ACTION_LABELS.skip;
  return (
    <Badge bg={meta.variant} className="fw-normal">
      {meta.label}
    </Badge>
  );
}

function addressActionBadge(row) {
  if (row.action === 'remove' && row.willSkip) {
    const meta = ADDRESS_ACTION_LABELS.keep;
    const jobs = Number(row.jobCount) || 0;
    return (
      <Badge bg={meta.variant} className="fw-normal" style={{ fontSize: '0.7rem' }}>
        {`${meta.label} (${jobs} job${jobs === 1 ? '' : 's'})`}
      </Badge>
    );
  }
  const meta = ADDRESS_ACTION_LABELS[row.action] || ADDRESS_ACTION_LABELS.unchanged;
  return (
    <Badge bg={meta.variant} className="fw-normal" style={{ fontSize: '0.7rem' }}>
      {meta.label}
    </Badge>
  );
}

function filterPreviewItems(items, entityFilter) {
  if (!entityFilter || entityFilter === 'all') return items || [];
  return (items || []).filter((item) => item.entityType === entityFilter);
}

/** Address rows the sync will actually change — unchanged rows and job-linked keeps are hidden. */
function effectiveAddressChanges(addressChanges) {
  if (!Array.isArray(addressChanges)) return [];
  return addressChanges.filter(
    (row) => row.action === 'add' || row.action === 'update' || (row.action === 'remove' && !row.willSkip)
  );
}

function formatModeLabel(preview) {
  if (!preview) return '';
  if (preview.mode === 'promotion') return 'CP → SAP promotion';
  if (preview.mode === 'targeted') return `Targeted sync (${preview.customerCode})`;
  const start = preview.dateRange?.start_date;
  const end = preview.dateRange?.end_date;
  return start && end ? `Delta sync (${start} → ${end})` : 'Delta sync (last 14 days)';
}

function BatchProgress({ batch, batchNumber }) {
  if (!batch) return null;
  const { size, totalHits, reviewedBefore, inBatch, remainingAfter } = batch;
  const isBatched = totalHits > size || batchNumber > 1;
  if (!isBatched) return null;
  const first = reviewedBefore + 1;
  const last = reviewedBefore + inBatch;

  if (!inBatch) {
    return (
      <Alert variant="success" className="small">
        All {totalHits} SAP record{totalHits === 1 ? '' : 's'} in this date range have been checked.
      </Alert>
    );
  }

  return (
    <Alert variant={remainingAfter > 0 ? 'warning' : 'info'} className="small">
      <div className="fw-semibold mb-1">
        Batch {batchNumber}: checking records {first}–{last} of {totalHits}
      </div>
      <div>
        SAP returned {totalHits} records edited in this date range. The preview checks {size} at a
        time.
      </div>
      {remainingAfter > 0 ? (
        <div className="mt-1">
          <strong>
            {remainingAfter} record{remainingAfter === 1 ? '' : 's'} not checked yet.
          </strong>{' '}
          After you sync or skip this batch, the next one loads here.
        </div>
      ) : (
        <div className="mt-1">This is the last batch.</div>
      )}
    </Alert>
  );
}

/** Shown on every batched screen so users know closing loses their place. */
function KeepWindowOpenNotice({ busy, loading, batched, batchNumber }) {
  let headline;
  if (loading && !busy) {
    headline =
      batched && batchNumber > 1
        ? `Loading batch ${batchNumber} from SAP. Please keep this window open.`
        : 'Loading from SAP. Please keep this window open.';
  } else if (busy) {
    headline = batched
      ? `Syncing batch ${batchNumber}. Please keep this window open.`
      : 'Syncing now. Please keep this window open until it finishes.';
  } else {
    headline = 'Keep this window open until all batches are done.';
  }
  return (
    <Alert variant="danger" className="small d-flex align-items-start gap-2 py-2 px-3 mt-2 mb-0 fw-normal w-100">
      <span aria-hidden>⚠️</span>
      <div>
        <strong>{headline}</strong>{' '}
        {batched
          ? 'Closing it or leaving the page stops the sync here, and the next run starts again from batch 1. Records already synced stay saved.'
          : 'Leaving the page before it finishes may leave the sync incomplete.'}
      </div>
    </Alert>
  );
}

function LastBatchResult({ result }) {
  if (!result) return null;
  if (result.skipped) {
    return (
      <Alert variant="secondary" className="small">
        Batch {result.batchNumber} skipped
        {result.pendingChanges
          ? `: ${result.pendingChanges} change${result.pendingChanges === 1 ? ' was' : 's were'} not synced.`
          : '.'}
      </Alert>
    );
  }
  return (
    <Alert variant={result.errors ? 'warning' : 'success'} className="small">
      Batch {result.batchNumber} synced: {result.written} record{result.written === 1 ? '' : 's'} written
      {result.errors ? `, ${result.errors} error${result.errors === 1 ? '' : 's'} (see the notification)` : ''}.
    </Alert>
  );
}

function itemRowKey(item) {
  return `${item.action}-${item.cardCode}-${item.portalCode || ''}`;
}

function collectFsmAddressImpact(items) {
  let removeCount = 0;
  let skipCount = 0;
  const skipSamples = [];
  for (const item of items || []) {
    for (const row of item.addressChanges || []) {
      if (row.action !== 'remove') continue;
      if (row.willSkip) {
        skipCount += 1;
        if (skipSamples.length < 5) {
          const jobs = Number(row.jobCount) || 0;
          skipSamples.push(`${row.label} (${jobs} job${jobs === 1 ? '' : 's'})`);
        }
      } else {
        removeCount += 1;
      }
    }
  }
  return { removeCount, skipCount, skipSamples };
}

function AddressValue({ value, muted = false }) {
  if (!value) {
    return <span className="text-muted fst-italic">—</span>;
  }
  return (
    <span className={muted ? 'text-muted' : undefined} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
      {value}
    </span>
  );
}

function FieldChangesPanel({ fieldChanges }) {
  if (!Array.isArray(fieldChanges) || fieldChanges.length === 0) return null;
  return (
    <div className="bg-light border-top">
      <table className="table table-sm table-borderless mb-0 small">
        <thead>
          <tr className="text-muted text-uppercase" style={{ fontSize: '0.68rem', letterSpacing: '0.04em' }}>
            <th style={{ width: '32%' }}>Field</th>
            <th style={{ width: '34%' }}>Before (portal)</th>
            <th style={{ width: '34%' }}>After (SAP sync)</th>
          </tr>
        </thead>
        <tbody>
          {fieldChanges.map((row) => (
            <tr key={row.field}>
              <td className="align-top fw-medium">{row.label}</td>
              <td className="align-top">
                <AddressValue value={row.before} />
              </td>
              <td className="align-top">
                <AddressValue value={row.after} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AddressChangesPanel({ addressChanges }) {
  if (!Array.isArray(addressChanges) || addressChanges.length === 0) return null;

  return (
    <div className="bg-light border-top">
      <table className="table table-sm table-borderless mb-0 small">
        <thead>
          <tr className="text-muted text-uppercase" style={{ fontSize: '0.68rem', letterSpacing: '0.04em' }}>
            <th style={{ width: '18%' }}>Site</th>
            <th style={{ width: '14%' }}>Change</th>
            <th style={{ width: '34%' }}>Before (portal)</th>
            <th style={{ width: '34%' }}>After (SAP sync)</th>
          </tr>
        </thead>
        <tbody>
          {addressChanges.map((row) => (
            <tr key={`${row.label}-${row.action}-${row.willSkip ? 'skip' : 'go'}`}>
              <td className="align-top fw-medium">
                {row.label}
                {row.willSkip && Array.isArray(row.jobNumbers) && row.jobNumbers.length > 0 ? (
                  <div className="text-muted fw-normal" style={{ fontSize: '0.72rem' }}>
                    Jobs: {row.jobNumbers.join(', ')}
                    {(row.jobCount || 0) > row.jobNumbers.length ? '…' : ''}
                  </div>
                ) : null}
              </td>
              <td className="align-top">{addressActionBadge(row)}</td>
              <td className="align-top">
                <AddressValue value={row.before} muted={row.action === 'add'} />
              </td>
              <td className="align-top">
                <AddressValue value={row.after} muted={row.action === 'remove'} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PreviewItemRow({ item }) {
  const [expanded, setExpanded] = useState(false);
  const addressChanges = effectiveAddressChanges(item.addressChanges);
  const addressChangeCount = addressChanges.length;
  const fieldChangeCount = Array.isArray(item.fieldChanges) ? item.fieldChanges.length : 0;
  const canExpand = addressChangeCount > 0 || fieldChangeCount > 0;
  const toggleExpanded = () => {
    if (canExpand) setExpanded((prev) => !prev);
  };

  return (
    <>
      <tr
        className={canExpand ? 'cursor-pointer' : undefined}
        onClick={toggleExpanded}
        style={canExpand ? { cursor: 'pointer' } : undefined}
      >
        <td>{actionBadge(item.action)}</td>
        <td>
          <code className="small">
            {item.action === 'promote' ? `${item.portalCode} → ${item.cardCode}` : item.cardCode}
          </code>
        </td>
        <td className="text-truncate" style={{ maxWidth: 200 }} title={item.cardName}>
          {item.cardName}
        </td>
        <td className="text-muted small text-uppercase">{item.entityType}</td>
        <td className="small text-muted text-nowrap">
          {canExpand ? (
            <span>
              <span className="me-1" aria-hidden>
                {expanded ? '▾' : '▸'}
              </span>
              {[
                fieldChangeCount > 0
                  ? `${fieldChangeCount} field change${fieldChangeCount === 1 ? '' : 's'}`
                  : null,
                addressChangeCount > 0
                  ? `${addressChangeCount} address change${addressChangeCount === 1 ? '' : 's'}`
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          ) : (
            '—'
          )}
        </td>
      </tr>
      {expanded && canExpand ? (
        <tr>
          <td colSpan={5} className="p-0">
            <FieldChangesPanel fieldChanges={item.fieldChanges} />
            <AddressChangesPanel addressChanges={addressChanges} />
          </td>
        </tr>
      ) : null}
    </>
  );
}

export default function SapDeltaSyncPreviewModal({
  show,
  onHide,
  preview,
  loading = false,
  error = null,
  onConfirm,
  onSkipBatch,
  batchNumber = 1,
  lastBatchResult = null,
  confirming = false,
  entityFilter = 'all',
  title = 'Sync from SAP — Preview',
}) {
  const counts = preview?.counts || {};
  const entityItems = filterPreviewItems(preview?.items, entityFilter);
  // SAP bumps UpdateDate on any BP edit; items that already match the portal are not listed.
  const visibleItems = entityItems.filter((item) => item.action !== 'unchanged');
  const unchangedCount = entityItems.length - visibleItems.length;
  const totalVisible = visibleItems.length;
  const totalPlannedChanges =
    (counts.promotions || 0) +
    (counts.customersToInsert || 0) +
    (counts.customersToUpdate || 0) +
    (counts.leadsToInsert || 0) +
    (counts.leadsToUpdate || 0);
  const hasBlockingError = Boolean(error) || (preview?.errors?.length > 0 && !preview?.counts?.sapHits);
  const canConfirm = !loading && !confirming && !hasBlockingError && totalPlannedChanges > 0;
  const batch = preview?.batch || null;
  const hasMoreBatches = (batch?.remainingAfter || 0) > 0;
  const isBatched = Boolean(batch) && (batch.totalHits > batch.size || batchNumber > 1);
  const confirmLabel = hasMoreBatches
    ? `Sync ${totalPlannedChanges} change${totalPlannedChanges === 1 ? '' : 's'} & load next batch`
    : totalPlannedChanges > 0
      ? `Sync ${totalPlannedChanges} change${totalPlannedChanges === 1 ? '' : 's'}`
      : 'Confirm sync';
  const { removeCount, skipCount, skipSamples } = collectFsmAddressImpact(visibleItems);
  const hasFsmAddressImpact = removeCount > 0 || skipCount > 0;

  // Progress lives in this window: warn before anything throws it away mid-run.
  // batchNumber > 1 keeps this on while the next batch loads (preview is briefly null).
  const inBatchRun = isBatched || batchNumber > 1;
  const progressAtRisk = inBatchRun && (hasMoreBatches || confirming || loading);
  // Header (pinned, visible during loading) — only while a sync is actually in progress:
  // loading from SAP, writing, or partway through a multi-batch run.
  const showKeepOpenNotice = !error && (loading || confirming || (batchNumber > 1 && hasMoreBatches));
  const guardUnload = progressAtRisk || confirming;

  useEffect(() => {
    if (!show || !guardUnload || typeof window === 'undefined') return undefined;
    const onBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [show, guardUnload]);

  const handleClose = () => {
    if (confirming) return;
    if (progressAtRisk && typeof window !== 'undefined') {
      const left = batch?.remainingAfter || 0;
      const lines = [];
      if (totalPlannedChanges > 0) {
        lines.push(`${totalPlannedChanges} change${totalPlannedChanges === 1 ? '' : 's'} in this batch will not be synced.`);
      }
      if (left > 0) {
        lines.push(`${left} record${left === 1 ? '' : 's'} after this batch ${left === 1 ? 'has' : 'have'} not been checked yet.`);
      }
      lines.push('If you close now, the next sync starts again from batch 1. Records already synced stay saved.');
      lines.push('Close anyway?');
      const message = lines.join('\n\n');
      if (!window.confirm(message)) return;
    }
    onHide();
  };

  const handleConfirm = () => {
    if (!onConfirm) return;
    if (hasFsmAddressImpact) {
      const lines = [
        'Address removals apply to the FSM portal only. SAP Business Partner addresses are not modified.',
      ];
      if (removeCount > 0) {
        lines.push(
          `${removeCount} portal service location${removeCount === 1 ? '' : 's'} will be removed from FSM.`
        );
      }
      if (skipCount > 0) {
        lines.push(
          `${skipCount} portal location${skipCount === 1 ? '' : 's'} will be kept in FSM because of linked jobs` +
            (skipSamples.length ? `: ${skipSamples.join('; ')}` : '.')
        );
      }
      lines.push('Proceed with sync?');
      if (typeof window !== 'undefined' && !window.confirm(lines.join('\n\n'))) {
        return;
      }
    }
    onConfirm();
  };

  return (
    <PortalModal
      show={show}
      onHide={handleClose}
      title={title}
      subtitle={
        <>
          Review planned changes before writing to the portal masterlist.
          {showKeepOpenNotice ? (
            <KeepWindowOpenNotice
              busy={confirming}
              loading={loading}
              batched={inBatchRun}
              batchNumber={batchNumber}
            />
          ) : null}
        </>
      }
      size="xl"
      scrollable
      hideCloseButton={confirming}
      footer={
        <>
          <Button variant="outline-secondary" onClick={handleClose} disabled={confirming}>
            {isBatched && !hasMoreBatches ? 'Close' : 'Cancel'}
          </Button>
          {hasMoreBatches && onSkipBatch ? (
            <Button
              variant={totalPlannedChanges > 0 ? 'outline-primary' : 'primary'}
              onClick={onSkipBatch}
              disabled={loading || confirming}
            >
              {totalPlannedChanges > 0 ? 'Skip this batch' : 'Check next batch'}
            </Button>
          ) : null}
          <Button variant="primary" onClick={handleConfirm} disabled={!canConfirm || confirming}>
            {confirming ? (
              <>
                <Spinner animation="border" size="sm" className="me-2" />
                Syncing…
              </>
            ) : (
              confirmLabel
            )}
          </Button>
        </>
      }
    >
      <LastBatchResult result={lastBatchResult} />
      {loading ? (
        <div className="text-center py-4">
          <Spinner animation="border" variant="primary" className="mb-3" />
          <p className="mb-0 text-muted">
            {batchNumber > 1 ? `Loading batch ${batchNumber}…` : 'Loading SAP preview…'}
          </p>
        </div>
      ) : error ? (
        <Alert variant="danger" className="mb-0">
          {error}
        </Alert>
      ) : preview ? (
        <>
          <PortalConfirmPanel className="mb-3">
            <PortalConfirmRow label="Mode" value={formatModeLabel(preview)} />
            {preview.customerCode ? (
              <PortalConfirmRow label="SAP code" value={preview.customerCode} />
            ) : null}
            <PortalConfirmRow label="SAP hits" value={String(counts.sapHits || 0)} />
            {isBatched ? (
              <PortalConfirmRow
                label="This batch"
                value={`${batch.inBatch} record${batch.inBatch === 1 ? '' : 's'} (batch ${batchNumber})`}
              />
            ) : null}
            <PortalConfirmRow
              label="Customers"
              value={`${counts.customersToInsert || 0} create · ${counts.customersToUpdate || 0} update${
                counts.customersUnchanged ? ` · ${counts.customersUnchanged} already up to date` : ''
              }${counts.promotions ? ` · ${counts.promotions} promote` : ''}`}
            />
            <PortalConfirmRow
              label="Leads"
              value={`${counts.leadsToInsert || 0} create · ${counts.leadsToUpdate || 0} update${
                counts.leadsUnchanged ? ` · ${counts.leadsUnchanged} already up to date` : ''
              }`}
            />
          </PortalConfirmPanel>

          <BatchProgress batch={batch} batchNumber={batchNumber} />

          <Alert variant="info" className="small">
            Address removals apply to the <strong>FSM portal only</strong>. SAP Business Partner
            addresses are never deleted or modified by this sync.
          </Alert>

          {hasFsmAddressImpact ? (
            <Alert variant="warning" className="small">
              {removeCount > 0 ? (
                <div>
                  {removeCount} portal service location{removeCount === 1 ? '' : 's'} will be{' '}
                  <strong>removed from FSM</strong> (already gone in SAP).
                </div>
              ) : null}
              {skipCount > 0 ? (
                <div>
                  {skipCount} portal location{skipCount === 1 ? '' : 's'} will be{' '}
                  <strong>kept in FSM</strong> because active jobs still reference them
                  {skipSamples.length ? ` — ${skipSamples.join('; ')}` : ''}.
                </div>
              ) : null}
            </Alert>
          ) : null}

          {Array.isArray(preview.errors) && preview.errors.length > 0 && (
            <Alert variant="warning" className="small">
              {preview.errors.slice(0, 3).map((msg) => (
                <div key={msg}>{msg}</div>
              ))}
            </Alert>
          )}

          {totalVisible === 0 ? (
            <Alert variant="info" className="mb-0">
              {totalPlannedChanges > 0
                ? `No ${entityFilter === 'lead' ? 'lead' : 'customer'} rows match this view, but ${totalPlannedChanges} other masterlist change${totalPlannedChanges === 1 ? '' : 's'} will still run.`
                : unchangedCount > 0
                  ? `Already up to date — SAP data matches the portal for ${unchangedCount} ${entityFilter === 'lead' ? 'lead' : 'record'}${unchangedCount === 1 ? '' : 's'}${isBatched ? ' in this batch' : ''}. Nothing to sync${hasMoreBatches ? ' here — use "Check next batch" to continue' : ''}.`
                  : isBatched && !batch?.inBatch
                    ? 'Nothing left to check.'
                  : 'No masterlist changes planned. Adjust the SAP code or date range and try again.'}
            </Alert>
          ) : (
            <>
              <div className="d-flex align-items-center justify-content-between mb-2">
                <span className="fw-semibold small text-uppercase text-muted" style={{ letterSpacing: '0.04em' }}>
                  Planned changes
                </span>
                <span className="small text-muted">
                  {totalVisible} item{totalVisible === 1 ? '' : 's'}
                  {isBatched ? ` in batch ${batchNumber}` : ''}
                  {unchangedCount > 0 ? ` · ${unchangedCount} already up to date (hidden)` : ''}
                </span>
              </div>
              <p className="small text-muted mb-2">
                Click a row to expand field and address Before / After details.
              </p>
              <div className="table-responsive border rounded" style={{ maxHeight: 420 }}>
                <table className="table table-sm table-hover mb-0 align-middle">
                  <thead className="table-light sticky-top">
                    <tr>
                      <th>Action</th>
                      <th>Code</th>
                      <th>Name</th>
                      <th>Type</th>
                      <th>Addresses</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleItems.map((item) => (
                      <PreviewItemRow key={itemRowKey(item)} item={item} />
                    ))}
                  </tbody>
                </table>
              </div>
              {visibleItems.some((item) => item.note) && (
                <p className="small text-muted mt-2 mb-0">
                  {visibleItems.find((item) => item.note)?.note}
                </p>
              )}
            </>
          )}
        </>
      ) : null}
    </PortalModal>
  );
}
