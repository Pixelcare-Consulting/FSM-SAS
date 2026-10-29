-- =============================================================================
-- CLEANUP: SCL5.U_InvNumber holding the job number instead of an invoice number.
--
-- FOUND 2026-10-29 (test_SPPXC_Technician_Data.sql section 1): hundreds of
--   SCL5 lines have U_InvNumber = U_API_JobNumber (e.g. '2026-003647'), with
--   U_JobStatus NULL or 'NI' and U_JobIncome 0. These broke every SPPXC SP
--   that joins U_InvNumber to OINV.DocNum (see fix_SPPXC_Technician_Data.sql).
--
-- SOURCE: the portal's SCL5 sync up to 2026-08-18 wrote
--   U_InvNumber = jobs.payment_qr_inv_number, and the payment QR form defaults
--   that field to the job number. Removed in 418d56c (v3.30.6); the portal no
--   longer writes U_InvNumber, only Document Automation does. So these rows
--   are leftovers and nothing should recreate them.
--
-- WHAT THIS DOES: clears U_InvNumber only where it equals the line's own job
--   number and the line is not invoiced (U_JobStatus <> 'I'). A real invoice
--   number is never a job number, so no real invoice link is touched. Every
--   cleared row is copied to a backup table first.
--
-- Runs in a transaction that ROLLS BACK by default. Check the counts, then
-- change ROLLBACK to COMMIT at the bottom and run again.
-- TESTING02 first, then SASME_LIVEDB. Select the database in SSMS first.
--
-- ROLLBACK after COMMIT:
--   UPDATE T0 SET T0.U_InvNumber = B.U_InvNumber
--   FROM SCL5 T0 INNER JOIN PXC_SCL5_InvNumber_Backup_20261029 B
--       ON B.SrvcCallId = T0.SrvcCallId AND B.LineNum = T0.LineNum;
-- Drop the backup table once the fix is confirmed.
-- =============================================================================

SET XACT_ABORT ON;

-- 1. Preview. "ToClear" is what step 3 changes; "OtherNonNumeric" is left
--    alone and needs a look by hand (expected 0).
SELECT			SUM(CASE WHEN T0.U_InvNumber = T0.U_API_JobNumber AND COALESCE(T0.U_JobStatus, '') <> 'I' THEN 1 ELSE 0 END) AS "ToClear"
				,SUM(CASE WHEN T0.U_InvNumber = T0.U_API_JobNumber AND T0.U_JobStatus = 'I' THEN 1 ELSE 0 END) AS "InvoicedWithJobNo"
				,SUM(CASE WHEN COALESCE(T0.U_InvNumber, '') <> T0.U_API_JobNumber THEN 1 ELSE 0 END) AS "OtherNonNumeric"
FROM			SCL5 T0
WHERE			COALESCE(T0.U_InvNumber, '') <> ''
				AND TRY_CONVERT(INT, T0.U_InvNumber) IS NULL;

BEGIN TRANSACTION;

-- 2. Backup.
IF OBJECT_ID('PXC_SCL5_InvNumber_Backup_20261029') IS NULL
	SELECT			T0.SrvcCallId
					,T0.LineNum
					,T0.ClgID
					,T0.U_API_JobNumber
					,T0.U_JobStatus
					,T0.U_InvNumber
					,GETDATE() AS "BackedUpAt"
	INTO			PXC_SCL5_InvNumber_Backup_20261029
	FROM			SCL5 T0
	WHERE			T0.U_InvNumber = T0.U_API_JobNumber
					AND COALESCE(T0.U_JobStatus, '') <> 'I';

-- 3. Clear.
UPDATE			SCL5
SET				U_InvNumber = NULL
WHERE			U_InvNumber = U_API_JobNumber
				AND COALESCE(U_JobStatus, '') <> 'I';

SELECT @@ROWCOUNT AS "RowsCleared";

-- 4. Must return 0 rows apart from anything "OtherNonNumeric" flagged above.
SELECT			T0.SrvcCallId, T0.LineNum, T0.U_API_JobNumber, T0.U_JobStatus, T0.U_InvNumber
FROM			SCL5 T0
WHERE			COALESCE(T0.U_InvNumber, '') <> ''
				AND TRY_CONVERT(INT, T0.U_InvNumber) IS NULL;

ROLLBACK TRANSACTION;	-- change to COMMIT TRANSACTION once the counts look right
