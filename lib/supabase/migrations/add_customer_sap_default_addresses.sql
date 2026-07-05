-- Persist SAP Business Partner default bill-to / ship-to site ids on customer.
ALTER TABLE public.customer
  ADD COLUMN IF NOT EXISTS bill_to_default VARCHAR(100),
  ADD COLUMN IF NOT EXISTS ship_to_default VARCHAR(100);

COMMENT ON COLUMN public.customer.bill_to_default IS 'SAP BilltoDefault AddressName for this customer.';
COMMENT ON COLUMN public.customer.ship_to_default IS 'SAP ShipToDefault / ShiptoDefault AddressName for this customer.';
