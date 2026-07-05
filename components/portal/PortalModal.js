import React, { useEffect } from "react";
import { Modal, Form } from "react-bootstrap";
import { injectPortalModalStyles } from "./portalModalStyles";

const VALID_SIZES = new Set(["sm", "md", "lg", "xl"]);

export function PortalConfirmPanel({ children, className = "" }) {
  return (
    <div className={`portal-confirm-panel ${className}`.trim()}>{children}</div>
  );
}

export function PortalConfirmRow({ label, value, children }) {
  const displayLabel = label?.endsWith(":") ? label : `${label}:`;
  return (
    <div className="portal-confirm-row">
      <strong>{displayLabel}</strong>
      <span>{children ?? value}</span>
    </div>
  );
}

export default function PortalModal({
  show,
  onHide,
  title,
  subtitle = null,
  size = "md",
  centered = true,
  scrollable = false,
  footer = null,
  footerLeft = null,
  footerClassName = "",
  bodyClassName = "",
  headerClassName = "",
  titleClassName = "",
  hideHeader = false,
  hideCloseButton = false,
  onSubmit = null,
  contentExtraClassName = "",
  modalClassName = "",
  backdrop = true,
  children,
}) {
  useEffect(() => {
    injectPortalModalStyles();
  }, []);

  const resolvedSize = VALID_SIZES.has(size) ? size : "md";
  const dialogClassName = [
    "portal-modal-dialog",
    resolvedSize !== "xl" ? `portal-modal-size-${resolvedSize}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const header = hideHeader ? null : (
    <Modal.Header
      closeButton={!hideCloseButton}
      className={`portal-modal-header ${headerClassName}`.trim()}
    >
      <div className="portal-modal-title-row">
        <Modal.Title className={`portal-modal-title ${titleClassName}`.trim()}>
          {title}
        </Modal.Title>
        {subtitle ? <div className="portal-modal-subtitle">{subtitle}</div> : null}
      </div>
    </Modal.Header>
  );

  const body = (
    <Modal.Body className={`portal-modal-body ${bodyClassName}`.trim()}>
      {children}
    </Modal.Body>
  );

  const footerNode =
    footer || footerLeft ? (
      <Modal.Footer
        className={`portal-modal-footer ${footerLeft ? "d-flex justify-content-between" : ""} ${footerClassName}`.trim()}
      >
        {footerLeft ? (
          <>
            <div>{footerLeft}</div>
            <div className="d-flex gap-2 flex-wrap">{footer}</div>
          </>
        ) : (
          footer
        )}
      </Modal.Footer>
    ) : null;

  const content = (
    <>
      <div className="portal-modal-accent-bar" aria-hidden />
      {header}
      {body}
      {footerNode}
    </>
  );

  return (
    <Modal
      show={show}
      onHide={onHide}
      centered={centered}
      scrollable={scrollable}
      backdrop={backdrop}
      size={resolvedSize === "xl" ? "xl" : undefined}
      className={`portal-modal-bs ${modalClassName}`.trim()}
      dialogClassName={dialogClassName}
      contentClassName={`portal-modal-content ${contentExtraClassName}`.trim()}
    >
      {onSubmit ? <Form onSubmit={onSubmit}>{content}</Form> : content}
    </Modal>
  );
}
