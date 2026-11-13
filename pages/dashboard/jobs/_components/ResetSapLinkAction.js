import React, { useState } from 'react';
import { Button, Spinner } from 'react-bootstrap';

const STEP = {
  IDLE: 'IDLE',
  CHECKING: 'CHECKING',
  CONFIRM: 'CONFIRM',
  APPLYING: 'APPLYING',
  DONE: 'DONE',
  ERROR: 'ERROR',
};

async function callResetSapLink(jobId, mode) {
  let response;
  try {
    response = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/reset-sap-link`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    });
  } catch {
    return { success: false, error: 'Could not reach the portal server. Check your connection and try again.' };
  }
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.success) {
    return { success: false, error: data?.error || data?.message || `Request failed (${response.status}).` };
  }
  return data;
}

function confirmText(plan) {
  if (plan.outcome === 'RELINK') {
    return `Activity ${plan.previous.sap_activity_id} no longer exists, but SAP has activity ${plan.nextActivityId} for this job. The job will be linked to ${plan.nextActivityId}.`;
  }
  const where = plan.serviceCallNumber ? ` and add it to service call ${plan.serviceCallNumber}` : '';
  return `Activity ${plan.previous.sap_activity_id} no longer exists in SAP. Resetting clears the link, and the next sync will create a new activity${where}.`;
}

function doneText(plan) {
  if (plan.outcome === 'RELINK') {
    return `Linked to activity ${plan.nextActivityId}. Sync this job again to update it.`;
  }
  return 'Link cleared. Sync this job again to create the new activity.';
}

/**
 * Two-step reset for a job whose SAP Activity was deleted: the server checks SAP
 * first, the user confirms, then the server re-checks and clears the link.
 */
export default function ResetSapLinkAction({ jobId }) {
  const [step, setStep] = useState(STEP.IDLE);
  const [plan, setPlan] = useState(null);
  const [message, setMessage] = useState('');

  const run = async (mode, busyStep, nextStep) => {
    setStep(busyStep);
    const result = await callResetSapLink(jobId, mode);
    if (!result.success) {
      setMessage(result.error);
      setStep(STEP.ERROR);
      return;
    }
    setPlan(result.plan);
    setStep(nextStep);
  };

  if (step === STEP.DONE) {
    return <div className="text-success small mt-1">{doneText(plan)}</div>;
  }

  if (step === STEP.CONFIRM || step === STEP.APPLYING) {
    const applying = step === STEP.APPLYING;
    return (
      <div className="border rounded p-2 mt-1 text-dark bg-light small">
        <p className="mb-2">{confirmText(plan)}</p>
        <div className="d-flex gap-2">
          <Button
            size="sm"
            variant="danger"
            disabled={applying}
            onClick={() => run('APPLY', STEP.APPLYING, STEP.DONE)}
          >
            {applying ? <Spinner animation="border" size="sm" role="status" aria-label="Resetting" /> : 'Reset link'}
          </Button>
          <Button size="sm" variant="outline-secondary" disabled={applying} onClick={() => setStep(STEP.IDLE)}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  const checking = step === STEP.CHECKING;
  return (
    <div className="mt-1">
      <Button
        size="sm"
        variant="outline-danger"
        disabled={checking}
        onClick={() => run('PREVIEW', STEP.CHECKING, STEP.CONFIRM)}
      >
        {checking ? <Spinner animation="border" size="sm" role="status" aria-label="Checking SAP" /> : 'Reset SAP link'}
      </Button>
      {step === STEP.ERROR && <div className="text-danger small mt-1">{message}</div>}
    </div>
  );
}
