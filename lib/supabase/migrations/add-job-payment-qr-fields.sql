-- Migration: Add Payment QR Code fields to jobs table
-- Date: 2026-01-09
-- Description: Adds fields to store Paynow QR code data for payment confirmation

-- Add payment QR code fields to jobs table
ALTER TABLE jobs 
ADD COLUMN IF NOT EXISTS payment_qr_uen VARCHAR(50),
ADD COLUMN IF NOT EXISTS payment_qr_amount INTEGER,
ADD COLUMN IF NOT EXISTS payment_qr_editable BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS payment_qr_expiry VARCHAR(8),
ADD COLUMN IF NOT EXISTS payment_qr_ref_number VARCHAR(255),
ADD COLUMN IF NOT EXISTS payment_qr_company VARCHAR(255),
ADD COLUMN IF NOT EXISTS payment_qr_code_string TEXT;

-- Add comments for documentation
COMMENT ON COLUMN jobs.payment_qr_uen IS 'UEN (Unique Entity Number) for Paynow QR code';
COMMENT ON COLUMN jobs.payment_qr_amount IS 'Payment amount in cents for Paynow QR code';
COMMENT ON COLUMN jobs.payment_qr_editable IS 'Whether payment amount can be edited in Paynow QR code';
COMMENT ON COLUMN jobs.payment_qr_expiry IS 'Expiry date for Paynow QR code in YYYYMMDD format';
COMMENT ON COLUMN jobs.payment_qr_ref_number IS 'Reference number for Paynow transaction tracking';
COMMENT ON COLUMN jobs.payment_qr_company IS 'Company name to embed in Paynow QR code';
COMMENT ON COLUMN jobs.payment_qr_code_string IS 'Generated Paynow QR code string';
