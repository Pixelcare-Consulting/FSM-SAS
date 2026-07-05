-- Migration: Add Pay Now columns to company_details
-- Date: 2025-03-19
-- Description: Enables dynamic Pay Now / bank transfer settings for jobsheet PDFs

-- Add Pay Now columns if they don't exist
DO $$
BEGIN
  -- pay_to: Company name for "Pay To" field
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'company_details' AND column_name = 'pay_to') THEN
    ALTER TABLE company_details ADD COLUMN pay_to VARCHAR(255);
  END IF;
  
  -- bank_name: Bank name for transfer
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'company_details' AND column_name = 'bank_name') THEN
    ALTER TABLE company_details ADD COLUMN bank_name VARCHAR(255);
  END IF;
  
  -- account_no: Bank account number
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'company_details' AND column_name = 'account_no') THEN
    ALTER TABLE company_details ADD COLUMN account_no VARCHAR(100);
  END IF;
  
  -- paynow: PayNow UEN/reference number
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'company_details' AND column_name = 'paynow') THEN
    ALTER TABLE company_details ADD COLUMN paynow VARCHAR(50);
  END IF;
  
  -- payment_instruction: Custom instruction (e.g., "Please quote job no in your reference")
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'company_details' AND column_name = 'payment_instruction') THEN
    ALTER TABLE company_details ADD COLUMN payment_instruction TEXT;
  END IF;
END $$;
