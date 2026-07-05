-- Allow locations to be created without a linked customer.
-- AIFM-imported jobs often have service_location address data before a SAP
-- customer match is found.  We now create a location record immediately
-- (customer_id = NULL) so that jobs.location_id is always populated when an
-- address is known.  Once a customer is later matched (via assign-customers),
-- the location row is updated with the customer_id in-place.
--
-- Safe to run multiple times (IF NOT EXISTS guard is implicit because ALTER
-- COLUMN operates on the column definition, not its constraint object).

ALTER TABLE locations ALTER COLUMN customer_id DROP NOT NULL;

COMMENT ON COLUMN locations.customer_id IS
  'FK to customer. Nullable: AIFM-imported locations may exist before a '
  'customer is matched.  Set to the customer id once the job is assigned.';
