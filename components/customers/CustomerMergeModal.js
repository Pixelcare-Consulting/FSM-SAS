import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Button,
  Table,
  Spinner,
  Alert,
  Form,
  Badge,
} from 'react-bootstrap';
import toast from 'react-hot-toast';

function accountBadgeVariant(type) {
  if (type === 'C') return 'primary';
  if (type === 'CP') return 'info';
  if (type === 'L') return 'warning';
  return 'secondary';
}

/**
 * Admin merge preview + confirm for duplicate L / CP / C accounts.
 */
export default function CustomerMergeModal({
  show,
  onHide,
  customerId = null,
  customerCode = null,
  onMerged,
}) {
  const [loading, setLoading] = useState(false);
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [recommendedSurvivorId, setRecommendedSurvivorId] = useState(null);
  const [survivorId, setSurvivorId] = useState(null);
  const [selectedLoserKeys, setSelectedLoserKeys] = useState(() => new Set());
  const [step, setStep] = useState('preview'); // preview | confirm

  const customerCandidates = useMemo(
    () => candidates.filter((c) => c.entityType === 'customer'),
    [candidates]
  );

  const loadDuplicates = useCallback(async () => {
    if (!customerId && !customerCode) return;
    setLoading(true);
    setError(null);
    setStep('preview');
    try {
      const params = new URLSearchParams();
      if (customerId) params.set('customerId', customerId);
      else if (customerCode) params.set('customerCode', customerCode);
      const res = await fetch(`/api/customers/duplicates?${params.toString()}`, {
        credentials: 'include',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to find duplicates');
      }
      const list = Array.isArray(data.candidates) ? data.candidates : [];
      setCandidates(list);
      const recommended = data.recommendedSurvivorId || null;
      setRecommendedSurvivorId(recommended);
      setSurvivorId(recommended || list.find((c) => c.entityType === 'customer')?.id || null);

      const defaultLosers = new Set();
      for (const row of list) {
        const key = `${row.entityType}:${row.id}`;
        if (row.entityType === 'customer' && row.id === recommended) continue;
        if (row.entityType === 'customer' && row.isSeed && list.length > 1) {
          // seed selected as loser only when not survivor
          if (row.id !== recommended) defaultLosers.add(key);
          continue;
        }
        if (row.entityType === 'sap_lead') {
          defaultLosers.add(key);
          continue;
        }
        if (row.entityType === 'customer' && row.id !== recommended) {
          defaultLosers.add(key);
        }
      }
      setSelectedLoserKeys(defaultLosers);
    } catch (err) {
      setError(err.message || 'Failed to load duplicates');
      setCandidates([]);
    } finally {
      setLoading(false);
    }
  }, [customerId, customerCode]);

  useEffect(() => {
    if (!show) return;
    loadDuplicates();
  }, [show, loadDuplicates]);

  const toggleLoser = (row) => {
    const key = `${row.entityType}:${row.id}`;
    if (row.entityType === 'customer' && row.id === survivorId) return;
    setSelectedLoserKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSurvivorChange = (id) => {
    setSurvivorId(id);
    setSelectedLoserKeys((prev) => {
      const next = new Set(prev);
      next.delete(`customer:${id}`);
      for (const row of customerCandidates) {
        if (row.id !== id) next.add(`customer:${row.id}`);
      }
      return next;
    });
  };

  const selectedLosers = useMemo(() => {
    return candidates.filter((row) => selectedLoserKeys.has(`${row.entityType}:${row.id}`));
  }, [candidates, selectedLoserKeys]);

  const otherDuplicates = useMemo(() => {
    return candidates.filter((c) => {
      if (c.entityType === 'customer' && c.id === (customerId || null)) return false;
      if (c.isSeed) return false;
      return true;
    });
  }, [candidates, customerId]);

  const canMerge =
    Boolean(survivorId) &&
    selectedLosers.length > 0 &&
    !selectedLosers.some((l) => l.entityType === 'customer' && l.id === survivorId);

  const handleConfirmMerge = async () => {
    if (!canMerge) return;
    setMerging(true);
    setError(null);
    try {
      const loserCustomerIds = selectedLosers
        .filter((l) => l.entityType === 'customer')
        .map((l) => l.id);
      const loserSapLeadIds = selectedLosers
        .filter((l) => l.entityType === 'sap_lead')
        .map((l) => l.id);

      const res = await fetch('/api/customers/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          survivorId,
          loserCustomerIds,
          loserSapLeadIds,
          confirm: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Merge failed');
      }
      toast.success(`Merged into ${data.survivor?.code || 'survivor'}`);
      onHide?.();
      onMerged?.(data);
    } catch (err) {
      setError(err.message || 'Merge failed');
      setStep('preview');
      toast.error(err.message || 'Merge failed');
    } finally {
      setMerging(false);
    }
  };

  const duplicateCount = otherDuplicates.length;

  return (
    <Modal show={show} onHide={merging ? undefined : onHide} size="lg" backdrop="static">
      <Modal.Header closeButton={!merging}>
        <Modal.Title>
          {step === 'confirm' ? 'Confirm customer merge' : 'Find duplicates'}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && (
          <Alert variant="danger" className="mb-3">
            {error}
          </Alert>
        )}

        {loading ? (
          <div className="text-center py-4">
            <Spinner animation="border" size="sm" className="me-2" />
            Searching for matching accounts…
          </div>
        ) : step === 'preview' ? (
          <>
            <p className="text-muted small mb-3">
              Matching by email, phone (last 8 digits), and name. Choose the surviving
              account; selected duplicates are soft-deleted after their jobs and related
              records move over.
            </p>
            {duplicateCount === 0 && customerCandidates.length <= 1 && candidates.filter((c) => c.entityType === 'sap_lead').length === 0 ? (
              <Alert variant="info" className="mb-0">
                No duplicate accounts found for this customer.
              </Alert>
            ) : (
              <div className="table-responsive">
                <Table hover size="sm" className="align-middle mb-0">
                  <thead>
                    <tr>
                      <th>Merge</th>
                      <th>Survivor</th>
                      <th>Code</th>
                      <th>Type</th>
                      <th>Name</th>
                      <th>Jobs</th>
                      <th>Match</th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidates.map((row) => {
                      const key = `${row.entityType}:${row.id}`;
                      const isSurvivor =
                        row.entityType === 'customer' && row.id === survivorId;
                      const isLoser = selectedLoserKeys.has(key);
                      return (
                        <tr key={key} className={isSurvivor ? 'table-success' : undefined}>
                          <td>
                            {row.entityType === 'customer' && isSurvivor ? (
                              <span className="text-muted small">—</span>
                            ) : (
                              <Form.Check
                                type="checkbox"
                                checked={isLoser}
                                onChange={() => toggleLoser(row)}
                                aria-label={`Select ${row.code} for merge`}
                              />
                            )}
                          </td>
                          <td>
                            {row.entityType === 'customer' ? (
                              <Form.Check
                                type="radio"
                                name="survivor"
                                checked={isSurvivor}
                                onChange={() => handleSurvivorChange(row.id)}
                                aria-label={`Keep ${row.code} as survivor`}
                              />
                            ) : (
                              <span className="text-muted small">Lead</span>
                            )}
                          </td>
                          <td>
                            <code>{row.code}</code>
                            {row.id === recommendedSurvivorId && (
                              <Badge bg="success" className="ms-1">
                                Suggested
                              </Badge>
                            )}
                          </td>
                          <td>
                            <Badge bg={accountBadgeVariant(row.accountType)}>
                              {row.accountType}
                            </Badge>
                          </td>
                          <td>
                            <div>{row.name}</div>
                            <div className="small text-muted">
                              {[row.email, row.phone].filter(Boolean).join(' · ') || '—'}
                            </div>
                          </td>
                          <td>{row.jobCount ?? 0}</td>
                          <td className="small text-muted">
                            {(row.matchReasons || []).join(', ') || (row.isSeed ? 'current' : '—')}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </div>
            )}
          </>
        ) : (
          <>
            <Alert variant="warning">
              This will move jobs and related records onto{' '}
              <strong>
                {candidates.find((c) => c.id === survivorId && c.entityType === 'customer')?.code ||
                  'the survivor'}
              </strong>{' '}
              and soft-delete {selectedLosers.length} duplicate
              {selectedLosers.length === 1 ? '' : 's'}. This cannot be undone from the UI.
            </Alert>
            <ul className="mb-0">
              {selectedLosers.map((l) => (
                <li key={`${l.entityType}:${l.id}`}>
                  <code>{l.code}</code> ({l.accountType}
                  {l.entityType === 'sap_lead' ? ' lead' : ''}) — {l.jobCount || 0} job
                  {(l.jobCount || 0) === 1 ? '' : 's'}
                </li>
              ))}
            </ul>
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide} disabled={merging}>
          Cancel
        </Button>
        {step === 'preview' ? (
          <Button
            variant="primary"
            disabled={!canMerge || loading}
            onClick={() => setStep('confirm')}
          >
            Review merge
          </Button>
        ) : (
          <>
            <Button
              variant="outline-secondary"
              disabled={merging}
              onClick={() => setStep('preview')}
            >
              Back
            </Button>
            <Button variant="danger" disabled={!canMerge || merging} onClick={handleConfirmMerge}>
              {merging ? (
                <>
                  <Spinner animation="border" size="sm" className="me-2" />
                  Merging…
                </>
              ) : (
                'Confirm merge'
              )}
            </Button>
          </>
        )}
      </Modal.Footer>
    </Modal>
  );
}
