-- Run AFTER applying fix_SPPXC_Invoice_Data_v3.sql.
-- Select the target database in SSMS first (SASME_PORTAL_TESTING02, then SASME_LIVEDB).

-- 1. Status ID behind "Unconfirmed" in the Job Status combo (used in step 2).
SELECT U_JobStatusID, U_JobStatus FROM [@API_JOB_STATUS] WHERE U_JobStatus = 'Unconfirmed';
GO

-- 2. The client's screen: Invoice, Unconfirmed, customer C000005, Job Date 01.01.26 - 31.12.27.
--    Expected on TESTING02: no rows for calls 20897 / 20898 (their lines are invoiced).
--    Rows for 20665 / 20130 may still appear: those are the stale activities on
--    their own calls, now showing their own SO and amount.
DECLARE @UnconfirmedID NVARCHAR(50) =
	(SELECT TOP 1 U_JobStatusID FROM [@API_JOB_STATUS] WHERE U_JobStatus = 'Unconfirmed');

EXEC "_SPPXC_Invoice_Data"
	@DocType        = 'I',
	@DateFrom       = '2026-01-01',
	@DateTo         = '2027-12-31',
	@CustomerIDFrom = 'C000005',
	@CustomerIDTo   = 'C000005',
	@JobStatusID    = @UnconfirmedID,
	@JobNumber      = '',
	@FilterType     = 'WOJ';
GO

-- 3. Same screen with Job Status = Confirmed. Expected: 20897 / 20898 jobs absent
--    (U_JobStatus = 'I'), so they no longer show anywhere under Invoice.
DECLARE @ConfirmedID NVARCHAR(50) =
	(SELECT TOP 1 U_JobStatusID FROM [@API_JOB_STATUS] WHERE U_JobStatus = 'Confirmed');

EXEC "_SPPXC_Invoice_Data"
	@DocType        = 'I',
	@DateFrom       = '2026-01-01',
	@DateTo         = '2027-12-31',
	@CustomerIDFrom = 'C000005',
	@CustomerIDTo   = 'C000005',
	@JobStatusID    = @ConfirmedID,
	@JobNumber      = '',
	@FilterType     = 'WOJ';
GO

-- 4. Every job number that sits on more than one service call. Each of these
--    was mixing rows before v3. Use it to size the issue on SASME_LIVEDB and to
--    list stale lines to clean up.
SELECT		S.U_API_JobNumber
			,S.SrvcCallId
			,S.ClgID
			,S.U_API_JobStatus
			,S.U_JobStatus
			,S.U_InvNumber
			,S.U_API_PONo
FROM		SCL5 S
WHERE		S.U_API_JobNumber IN (
				SELECT		U_API_JobNumber
				FROM		SCL5
				WHERE		COALESCE(U_API_JobNumber, '') <> ''
				GROUP BY	U_API_JobNumber
				HAVING		COUNT(DISTINCT SrvcCallId) > 1
			)
ORDER BY	S.U_API_JobNumber, S.SrvcCallId;
GO
