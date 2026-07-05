import React from 'react';
import { TelephoneFill } from 'react-bootstrap-icons';
import { digitsForPhoneLinks } from '../../lib/utils/toTelHref';

/**
 * Plain digit display for Yeastar Linkus for Google — it detects contiguous numbers (default length 7–15),
 * shows a popup on hover, then you click that popup to dial. Avoid `tel:` links here; direct clicks
 * often hit Chrome/Windows tel handling instead of Linkus.
 *
 * @param {object} props
 * @param {unknown} props.raw
 * @param {boolean} [props.showIcon]
 * @param {number} [props.iconSize]
 * @param {string} [props.className]
 * @param {string} [props.iconClassName]
 * @param {string} [props.numberClassName] — classes on the digit span (default matches mailto link styling)
 */
export function ExtensionFriendlyPhone({
  raw,
  showIcon = true,
  iconSize = 14,
  className = '',
  iconClassName = 'text-primary me-2 flex-shrink-0',
  numberClassName = 'text-primary text-decoration-none',
}) {
  const trimmed = raw == null ? '' : String(raw).trim();
  if (!trimmed) return null;
  const cleanedFallback = trimmed.replace(/^65-000-\s*/i, '').trim();
  const display = digitsForPhoneLinks(trimmed) || cleanedFallback;
  const digitSpan = (
    <span className={numberClassName} style={{ fontSize: '14px' }} translate="no">
      {display}
    </span>
  );
  if (!showIcon) return digitSpan;
  return (
    <span className={`d-inline-flex align-items-center ${className}`}>
      <TelephoneFill size={iconSize} className={iconClassName} aria-hidden />
      {digitSpan}
    </span>
  );
}
