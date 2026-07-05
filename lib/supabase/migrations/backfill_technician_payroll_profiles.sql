-- Migration: Ensure empty technician_payroll_profiles rows for active technicians
-- Enables Payroll tab editing without manual row creation.

INSERT INTO technician_payroll_profiles (technician_id)
SELECT t.id
FROM technicians t
INNER JOIN users u ON u.id = t.user_id
LEFT JOIN technician_payroll_profiles tpp
  ON tpp.technician_id = t.id AND tpp.deleted_at IS NULL
WHERE t.deleted_at IS NULL
  AND u.status = 'ACTIVE'
  AND tpp.id IS NULL;
