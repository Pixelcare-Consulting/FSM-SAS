-- Run AFTER applying fix_SPPXC_Technician_Data.sql. Read-only.
-- Change @Tech / @Year / @Month to match the row you clicked.

DECLARE @Tech NVARCHAR(100) = N'A0GOPAL.';
DECLARE @Year NVARCHAR(4) = '2027';
DECLARE @Month NVARCHAR(2) = '1';
DECLARE @Quarter NVARCHAR(1) = CAST((CAST(@Month AS INT) + 2) / 3 AS NVARCHAR(1));
DECLARE @DateFrom DATETIME = DATEFROMPARTS(CAST(@Year AS INT), CAST(@Month AS INT), 1);
DECLARE @DateTo DATETIME = EOMONTH(@DateFrom);

-- -----------------------------------------------------------------------------
-- 1. SCL5 rows with a non-numeric invoice / CM number. These broke the SP and
--    are now left out of the drill-down. Correct them in SAP. Expected: the
--    '2026-003647' row (a job number written into the doc number field).
-- -----------------------------------------------------------------------------
SELECT			T0.SrvcCallId
				,T0.LineNum
				,T0.ClgID
				,T0.U_API_JobNumber
				,T0.U_JobStatus
				,T0.U_InvNumber
				,T0.U_CMStatus
				,T0.U_CMNumber
				,T0.U_API_PONo
				,T0.U_JobIncome
FROM			SCL5 T0
WHERE			(COALESCE(T0.U_InvNumber, '') <> '' AND TRY_CONVERT(INT, T0.U_InvNumber) IS NULL)
				OR (COALESCE(T0.U_CMNumber, '') <> '' AND TRY_CONVERT(INT, T0.U_CMNumber) IS NULL);

-- -----------------------------------------------------------------------------
-- 2. Both SPs must run without an error. Expected: the dropdown lists only
--    @Year's invoices (fewer than the 97 before the fix), and the grid
--    returns rows whose Incentive Amount adds up to the summary's Income for
--    the tech (283.40 for A0GOPAL., January 2027).
-- -----------------------------------------------------------------------------
EXEC _SPPXC_DocNum_Data 'M', @Year, @Quarter, @Month, @Tech;
EXEC _SPPXC_Technician_Data 'M', @Year, @Quarter, @Month, @Tech, 'NF', '', '', '', @DateFrom, @DateTo;
EXEC _SPPXC_Technician_Data 'M', @Year, @Quarter, @Month, @Tech, 'WODN', 'Invoice', '', '', '', '';
