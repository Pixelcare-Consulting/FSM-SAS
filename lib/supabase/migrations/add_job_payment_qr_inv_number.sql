-- Migration: Add payment_qr_inv_number to jobs table
-- Description: Invoice number (open field) for Payment Confirmation / Paynow QR

ALTER TABLE jobs
ADD COLUMN IF NOT EXISTS payment_qr_inv_number VARCHAR(255);

COMMENT ON COLUMN jobs.payment_qr_inv_number IS 'Invoice number (open field) for Payment Confirmation QR';
