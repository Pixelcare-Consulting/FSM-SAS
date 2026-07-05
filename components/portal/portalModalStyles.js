export const PORTAL_MODAL_STYLE_ID = "portal-modal-theme";

export function injectPortalModalStyles() {
  if (typeof document === "undefined") return;
  let el = document.getElementById(PORTAL_MODAL_STYLE_ID);
  if (!el) {
    el = document.createElement("style");
    el.id = PORTAL_MODAL_STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = `
    div.modal.portal-modal-bs .modal-dialog.portal-modal-dialog.portal-modal-sm {
      max-width: 420px !important;
      margin: 1rem auto !important;
    }
    div.modal.portal-modal-bs .modal-dialog.portal-modal-dialog.portal-modal-md {
      max-width: 560px !important;
      margin: 1rem auto !important;
    }
    div.modal.portal-modal-bs .modal-dialog.portal-modal-dialog.portal-modal-lg {
      max-width: 720px !important;
      margin: 1rem auto !important;
    }
    div.modal.portal-modal-bs .modal-dialog.portal-modal-dialog.portal-modal-xl {
      margin: 1rem auto !important;
    }
    div.modal.portal-modal-bs .modal-content.portal-modal-content {
      border: 1px solid #e5e7eb !important;
      border-radius: 14px !important;
      overflow: hidden !important;
      box-shadow: 0 25px 50px -12px rgba(15, 23, 42, 0.18) !important;
      background: #fff !important;
    }
    div.modal.portal-modal-bs .portal-modal-accent-bar {
      height: 4px;
      width: 100%;
      background: linear-gradient(90deg, #3b82f6 0%, #06b6d4 100%);
    }
    div.modal.portal-modal-bs .modal-header.portal-modal-header {
      border-bottom: 1px solid #e5e7eb !important;
      padding: 1rem 1.25rem !important;
      background: #fff !important;
    }
    div.modal.portal-modal-bs .portal-modal-title-row {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      width: 100%;
    }
    div.modal.portal-modal-bs .portal-modal-title-row.is-inline {
      flex-direction: row;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    div.modal.portal-modal-bs .modal-title.portal-modal-title {
      font-size: 1.0625rem !important;
      font-weight: 600 !important;
      color: #1e293b !important;
      margin: 0 !important;
      line-height: 1.35 !important;
    }
    div.modal.portal-modal-bs .portal-modal-subtitle {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.35rem 0.5rem;
      font-size: 0.8125rem;
      color: #64748b;
    }
    div.modal.portal-modal-bs .portal-modal-header .btn-close {
      opacity: 0.55 !important;
      padding: 0.5rem !important;
      margin: -0.25rem -0.25rem -0.25rem auto !important;
    }
    div.modal.portal-modal-bs .portal-modal-header .btn-close:hover {
      opacity: 1 !important;
    }
    div.modal.portal-modal-bs .modal-body.portal-modal-body {
      padding: 1rem 1.25rem 1.125rem !important;
      background: #fff !important;
    }
    div.modal.portal-modal-bs .portal-modal-body.is-scrollable {
      max-height: min(62vh, 480px);
      overflow-y: auto;
    }
    div.modal.portal-modal-bs .portal-form-body .form-label {
      font-size: 0.8125rem;
      font-weight: 600;
      color: #334155;
      margin-bottom: 0.35rem;
    }
    div.modal.portal-modal-bs .portal-form-body .form-control,
    div.modal.portal-modal-bs .portal-form-body .form-select {
      border: 1px solid #e2e8f0 !important;
      border-radius: 8px !important;
      font-size: 0.875rem !important;
      color: #1e293b !important;
      padding: 0.5rem 0.75rem !important;
      background: #fff !important;
      box-shadow: none !important;
    }
    div.modal.portal-modal-bs .portal-form-body .form-control:focus,
    div.modal.portal-modal-bs .portal-form-body .form-select:focus {
      border-color: #93c5fd !important;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15) !important;
    }
    div.modal.portal-modal-bs .portal-form-body .form-control::placeholder {
      color: #94a3b8;
    }
    div.modal.portal-modal-bs .portal-form-body .form-text {
      font-size: 0.75rem;
      color: #64748b;
      margin-top: 0.35rem;
    }
    div.modal.portal-modal-bs .portal-modal-type-pill {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.75rem;
      font-weight: 600;
      color: #1e293b;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 999px;
      padding: 0.15rem 0.55rem;
    }
    div.modal.portal-modal-bs .portal-modal-type-swatch {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      flex-shrink: 0;
    }
    div.modal.portal-modal-bs .modal-footer.portal-modal-footer {
      border-top: 1px solid #e5e7eb !important;
      padding: 0.75rem 1.25rem !important;
      background: #fafafa !important;
      gap: 0.5rem !important;
    }
    div.modal.portal-modal-bs .portal-modal-footer.is-column {
      flex-direction: column !important;
      align-items: stretch !important;
      gap: 0.625rem !important;
    }
    div.modal.portal-modal-bs .portal-modal-footer .btn {
      border-radius: 8px !important;
      font-weight: 500 !important;
      font-size: 0.875rem !important;
      padding: 0.45rem 1rem !important;
    }
    div.modal.portal-modal-bs .portal-modal-footer .btn-secondary {
      background: #64748b !important;
      border-color: #64748b !important;
    }
    div.modal.portal-modal-bs .portal-modal-footer .btn-secondary:hover {
      background: #475569 !important;
      border-color: #475569 !important;
    }
    div.modal.portal-modal-bs .portal-modal-footer .btn-primary {
      background: #3b82f6 !important;
      border-color: #3b82f6 !important;
    }
    div.modal.portal-modal-bs .portal-modal-footer .btn-primary:hover {
      background: #2563eb !important;
      border-color: #2563eb !important;
    }
    div.modal.portal-modal-bs .portal-modal-footer .btn-outline-danger {
      padding: 0.45rem 0.875rem !important;
    }
    div.modal.portal-modal-bs .portal-modal-alert {
      border-radius: 8px !important;
      font-size: 0.875rem !important;
      margin-bottom: 1rem !important;
    }
    div.modal.portal-modal-bs .portal-confirm-panel {
      background: #f9fafb;
      border-radius: 8px;
      padding: 16px;
      margin-top: 12px;
      border: 1px solid #e5e7eb;
    }
    div.modal.portal-modal-bs .portal-confirm-row {
      display: flex;
      gap: 12px;
      padding: 8px 0;
    }
    div.modal.portal-modal-bs .portal-confirm-row:first-child {
      padding-top: 0;
    }
    div.modal.portal-modal-bs .portal-confirm-row:last-child {
      padding-bottom: 0;
    }
    div.modal.portal-modal-bs .portal-confirm-row strong {
      min-width: 100px;
      color: #6b7280;
      font-size: 14px;
      font-weight: 600;
    }
    div.modal.portal-modal-bs .portal-confirm-row span {
      flex: 1;
      color: #111827;
      font-size: 14px;
      font-weight: 500;
    }
    div.modal.portal-modal-bs .portal-welcome-new-pill {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      font-size: 0.6875rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #1d4ed8;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 999px;
      padding: 0.15rem 0.5rem;
      line-height: 1.2;
    }
    div.modal.portal-modal-bs .portal-welcome-section + .portal-welcome-section {
      margin-top: 0.875rem;
    }
    div.modal.portal-modal-bs .portal-welcome-section-title {
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #64748b;
      margin-bottom: 0.35rem;
    }
    div.modal.portal-modal-bs .portal-welcome-text {
      font-size: 0.875rem;
      color: #475569;
      line-height: 1.5;
      margin-bottom: 0;
    }
    div.modal.portal-modal-bs .portal-welcome-list {
      margin: 0;
      padding-left: 1rem;
      font-size: 0.875rem;
      color: #475569;
      line-height: 1.45;
    }
    div.modal.portal-modal-bs .portal-welcome-list li + li {
      margin-top: 0.25rem;
    }
    div.modal.portal-modal-bs .portal-welcome-legend-cards {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }
    div.modal.portal-modal-bs .portal-welcome-legend-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 0.625rem 0.75rem;
    }
    div.modal.portal-modal-bs .portal-welcome-legend-title {
      font-size: 0.8125rem;
      font-weight: 600;
      color: #1e293b;
      margin-bottom: 0.1rem;
    }
    div.modal.portal-modal-bs .portal-welcome-legend-subtitle {
      font-size: 0.75rem;
      color: #94a3b8;
      margin-bottom: 0.4rem;
    }
    div.modal.portal-modal-bs .portal-welcome-legend-items {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem 1rem;
    }
    div.modal.portal-modal-bs .portal-welcome-legend-item {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.8125rem;
      color: #475569;
    }
    div.modal.portal-modal-bs .portal-welcome-swatch {
      width: 10px;
      height: 10px;
      border-radius: 999px;
      flex-shrink: 0;
    }
    div.modal.portal-modal-bs .portal-welcome-footer-actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      flex-wrap: wrap;
    }
    div.modal.portal-modal-bs .portal-welcome-footer-links {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem 1rem;
      font-size: 0.8125rem;
      padding-top: 0.125rem;
      border-top: 1px solid #f1f5f9;
      width: 100%;
    }
    div.modal.portal-modal-bs .portal-welcome-footer-links a {
      color: #3b82f6;
      text-decoration: none;
      font-weight: 500;
    }
    div.modal.portal-modal-bs .portal-welcome-footer-links a:hover {
      color: #2563eb;
      text-decoration: underline;
    }
    div.modal.portal-modal-bs .portal-welcome-checkbox {
      font-size: 0.8125rem;
      color: #64748b;
      margin-bottom: 0;
    }
    div.modal.portal-modal-bs .portal-memo-body {
      max-height: min(56vh, 360px);
      overflow-y: auto;
    }
    div.modal.portal-modal-bs .portal-memo-body::-webkit-scrollbar {
      width: 8px;
    }
    div.modal.portal-modal-bs .portal-memo-body::-webkit-scrollbar-track {
      background: #f1f5f9;
      border-radius: 4px;
    }
    div.modal.portal-modal-bs .portal-memo-body::-webkit-scrollbar-thumb {
      background: #cbd5e1;
      border-radius: 4px;
    }
    div.modal.portal-modal-bs .portal-memo-block + .portal-memo-block {
      margin-top: 1.25rem;
      padding-top: 1.25rem;
      border-top: 1px solid #f1f5f9;
    }
    div.modal.portal-modal-bs .portal-memo-subject-row {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 0.75rem;
      margin-bottom: 0.75rem;
    }
    div.modal.portal-modal-bs .portal-memo-subject {
      font-size: 0.9375rem;
      font-weight: 600;
      color: #1e293b;
      margin: 0;
      line-height: 1.35;
    }
    div.modal.portal-modal-bs .portal-memo-html {
      color: #475569 !important;
      font-size: 0.9375rem !important;
      line-height: 1.65 !important;
      margin-bottom: 0.75rem;
      word-break: break-word;
    }
    div.modal.portal-modal-bs .portal-memo-html p {
      margin-bottom: 0.5rem;
    }
    div.modal.portal-modal-bs .portal-memo-html p:last-child {
      margin-bottom: 0;
    }
    div.modal.portal-modal-bs .portal-memo-html h1 {
      font-size: 1.125rem;
      font-weight: 600;
      margin: 0 0 0.5rem;
    }
    div.modal.portal-modal-bs .portal-memo-html h2 {
      font-size: 1.05rem;
      font-weight: 600;
      margin: 0 0 0.45rem;
    }
    div.modal.portal-modal-bs .portal-memo-html h3 {
      font-size: 1rem;
      font-weight: 600;
      margin: 0 0 0.4rem;
    }
    div.modal.portal-modal-bs .portal-memo-html ul,
    div.modal.portal-modal-bs .portal-memo-html ol {
      padding-left: 1.25rem;
      margin: 0 0 0.5rem;
    }
    div.modal.portal-modal-bs .portal-memo-html a {
      color: #2563eb;
    }
    div.modal.portal-modal-bs .portal-memo-from {
      font-size: 0.8125rem !important;
      color: #94a3b8 !important;
      margin-bottom: 0;
    }
    @media (max-width: 576px) {
      div.modal.portal-modal-bs .modal-dialog.portal-modal-dialog.portal-modal-md,
      div.modal.portal-modal-bs .modal-dialog.portal-modal-dialog.portal-modal-sm {
        max-width: calc(100vw - 1.5rem) !important;
      }
      div.modal.portal-modal-bs .modal-body.portal-modal-body {
        padding: 0.875rem 1rem !important;
      }
      div.modal.portal-modal-bs .modal-footer.portal-modal-footer {
        padding: 0.75rem 1rem !important;
      }
    }
    div.modal.portal-modal-bs .portal-recurrence-tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
      margin-bottom: 1rem;
    }
    div.modal.portal-modal-bs .portal-recurrence-tab {
      border: 1px solid #e2e8f0;
      background: #f8fafc;
      color: #475569;
      border-radius: 999px;
      padding: 0.35rem 0.85rem;
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    div.modal.portal-modal-bs .portal-recurrence-tab.is-active {
      background: #2563eb;
      border-color: #2563eb;
      color: #fff;
    }
    div.modal.portal-modal-bs .portal-recurrence-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 1rem;
      font-size: 0.875rem;
      color: #334155;
    }
    div.modal.portal-modal-bs .portal-recurrence-section {
      margin-bottom: 1rem;
    }
    div.modal.portal-modal-bs .portal-recurrence-section-title {
      font-size: 0.8125rem;
      font-weight: 600;
      color: #334155;
      margin-bottom: 0.5rem;
    }
    div.modal.portal-modal-bs .portal-recurrence-chip-row {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
    }
    div.modal.portal-modal-bs .portal-recurrence-chip {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 0.35rem 0.55rem;
      font-size: 0.8125rem;
      color: #475569;
      background: #fff;
      cursor: pointer;
    }
    div.modal.portal-modal-bs .portal-recurrence-chip.is-selected {
      border-color: #2563eb;
      background: #eff6ff;
      color: #1d4ed8;
    }
    div.modal.portal-modal-bs .portal-recurrence-summary-panel {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 0.75rem;
      font-size: 0.875rem;
      color: #475569;
      min-height: 2.75rem;
    }
    div.modal.portal-modal-bs .portal-recurrence-summary-actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      margin-bottom: 0.5rem;
    }
  `;
}
