import React from "react";
import { Button, Form, Spinner } from "react-bootstrap";
import PortalModal, {
  PortalConfirmPanel,
  PortalConfirmRow,
} from "../../../../components/portal/PortalModal";

function getTitle(mode, count) {
  if (mode === "self") return "Reset your session";
  if (mode === "batch") return `Reset ${count} session${count === 1 ? "" : "s"}`;
  return "Reset session";
}

function getWarningText(mode) {
  if (mode === "self") {
    return "This will sign you out of the portal and allow the mobile app to sign in.";
  }
  return "This will force them to sign in again on all devices.";
}

export default function SessionResetConfirmModal({
  show,
  onHide,
  mode = "single",
  user = null,
  userIds = [],
  count = 0,
  reason = "",
  onReasonChange,
  onConfirm,
  submitting = false,
}) {
  const displayName =
    user?.display_name || user?.username || user?.id || "—";
  const resolvedCount = mode === "batch" ? count || userIds.length : 1;

  return (
    <PortalModal
      show={show}
      onHide={onHide}
      title={getTitle(mode, resolvedCount)}
      size="md"
      footer={
        <>
          <Button
            variant="outline-secondary"
            className="rounded-3"
            onClick={onHide}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            className="rounded-3"
            onClick={onConfirm}
            disabled={submitting}
          >
            {submitting ? (
              <>
                <Spinner animation="border" size="sm" className="me-2" />
                Resetting…
              </>
            ) : (
              "Confirm Reset"
            )}
          </Button>
        </>
      }
    >
      <p className="text-muted mb-3">{getWarningText(mode)}</p>

      <PortalConfirmPanel>
        {mode === "single" && user ? (
          <PortalConfirmRow label="User" value={displayName} />
        ) : null}
        {mode === "batch" ? (
          <PortalConfirmRow
            label="Selected users"
            value={`${resolvedCount} user${resolvedCount === 1 ? "" : "s"}`}
          />
        ) : null}
        {mode === "self" ? (
          <PortalConfirmRow label="Action" value="Log out all devices" />
        ) : null}
      </PortalConfirmPanel>

      <Form.Group className="mt-3 mb-0">
        <Form.Label className="small text-muted mb-1">
          Optional reason (stored in audit log)
        </Form.Label>
        <Form.Control
          as="textarea"
          rows={2}
          value={reason}
          onChange={(e) => onReasonChange?.(e.target.value)}
          disabled={submitting}
          placeholder="admin_initiated_user_session_reset"
        />
      </Form.Group>
    </PortalModal>
  );
}
