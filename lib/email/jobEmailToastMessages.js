const SKIP_REASON_MESSAGES = {
  smtp_incomplete: 'Configure SMTP in Email Settings',
  no_customer_email: 'No customer email found',
  toggle_off: 'Job completed email is disabled in Email Settings',
  already_sent: 'Completion email was already sent for this job',
  already_completed: 'Job was already complete',
  not_completed: 'Job is not marked as complete',
  no_recipients: 'No valid email recipients',
};

/**
 * @param {{ ok?: boolean, skipped?: boolean, reason?: string, error?: string }} result
 * @param {string} [contactEmail]
 * @returns {{ variant: 'success' | 'warning' | 'error', message: string }}
 */
export function getJobCompletedEmailToast(result, contactEmail = '') {
  if (!result) {
    return { variant: 'error', message: 'Failed to send completion email' };
  }

  if (result.error && !result.skipped) {
    return { variant: 'error', message: result.error };
  }

  if (result.skipped) {
    const reason = result.reason || '';
    const message =
      SKIP_REASON_MESSAGES[reason] ||
      (reason ? `Completion email not sent: ${reason}` : 'Completion email not sent');
    return { variant: 'warning', message };
  }

  if (result.ok) {
    const email = String(contactEmail || '').trim();
    return {
      variant: 'success',
      message: email ? `Completion email sent to ${email}` : 'Completion email sent',
    };
  }

  return { variant: 'error', message: 'Failed to send completion email' };
}

/**
 * @param {import('react-hot-toast').Toast} toastFn
 * @param {{ ok?: boolean, skipped?: boolean, reason?: string, error?: string }} result
 * @param {string} [contactEmail]
 */
export function showJobCompletedEmailToast(toastFn, result, contactEmail = '') {
  const { variant, message } = getJobCompletedEmailToast(result, contactEmail);
  if (variant === 'success') {
    toastFn.success(message);
  } else if (variant === 'warning') {
    toastFn(message);
  } else {
    toastFn.error(message);
  }
}
