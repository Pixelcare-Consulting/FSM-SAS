-- =============================================================================
-- DIAG: Job Incentives add-on, Technician Report drill-down is empty.
--
-- SYMPTOM (2026-10-29): Technician Report, Year 2027, January. The summary
--   (_SPPXC_Job_Incentive_Data) shows income for A0GOPAL. (283.40), but the
--   detail popup has an empty Document Number dropdown (_SPPXC_DocNum_Data)
--   and an empty grid (_SPPXC_Technician_Data).
--
-- Both detail SPs are empty, the summary is not. The summary only sums
-- SCL5.U_JobIncome; the detail SPs also have to resolve the invoice / CM
-- (OINV / ORIN). So the break is in that join, or the SP throws and the
-- add-on swallows the error (Document Automation does the same).
--
-- Read-only. Select the database in SSMS first (TESTING02, then LIVE).
-- Change @Tech / @Year / @Month to match the row you clicked.
-- =============================================================================

DECLARE @Tech NVARCHAR(100) = N'A0GOPAL.';
DECLARE @Year INT = 2027;
DECLARE @Month INT = 1;
DECLARE @Quarter INT = (@Month + 2) / 3;

-- -----------------------------------------------------------------------------
-- 1. SP source. Send these three back: the fix depends on what they join on.
-- -----------------------------------------------------------------------------
SELECT	'_SPPXC_Technician_Data' AS "SP", OBJECT_DEFINITION(OBJECT_ID('_SPPXC_Technician_Data')) AS "Definition"
UNION ALL
SELECT	'_SPPXC_DocNum_Data', OBJECT_DEFINITION(OBJECT_ID('_SPPXC_DocNum_Data'))
UNION ALL
SELECT	'_SPPXC_Job_Incentive_Data', OBJECT_DEFINITION(OBJECT_ID('_SPPXC_Job_Incentive_Data'));

-- -----------------------------------------------------------------------------
-- 2. Run the detail SPs directly. An error here (e.g. "Conversion failed when
--    converting the nvarchar value ... to data type int") is the root cause.
--    0 rows without an error means the joins/filters drop the data: see 3.
-- -----------------------------------------------------------------------------
EXEC _SPPXC_DocNum_Data 'M', @Year, @Quarter, @Month, @Tech;
EXEC _SPPXC_Technician_Data 'M', @Year, @Quarter, @Month, @Tech, 'ALL', '', '', '', '', '';
EXEC _SPPXC_Technician_Data 'M', @Year, @Quarter, @Month, @Tech, 'NF', '', '', '', '', '';

-- -----------------------------------------------------------------------------
-- 3. The tech's jobs in the period, with every link the detail SPs need.
--    Look for: InvNumber empty, InvDocEntry NULL (no OINV with that DocNum),
--    InvDocDate outside the selected month (job is Jan 2027, invoice dated
--    2026), CANCELED = 'Y', or ScheduleName ending in "__<tech>" (rows added
--    by the one-row-per-tech sync on 2026-10-20).
-- -----------------------------------------------------------------------------
SELECT			S.Code AS "ScheduleCode"
				,S.Name AS "ScheduleName"
				,S.U_JobTech
				,S.U_CallID
				,S.U_JobNo
				,L.ClgCode
				,L.Recontact
				,C.SrvcCallId
				,C.LineNum
				,C.U_JobStatus
				,C.U_InvNumber
				,C.U_CMStatus
				,C.U_CMNumber
				,C.U_JobIncome
				,I.DocEntry AS "InvDocEntry"
				,I.DocDate AS "InvDocDate"
				,I.CANCELED AS "InvCanceled"
				,I.CardCode AS "InvCardCode"
FROM			[@API_JOB_SCHEDULE] S
INNER JOIN		SCL5 C ON C.SrvcCallId = TRY_CONVERT(INT, S.U_CallID)
						AND C.U_API_JobNumber = S.U_JobNo
LEFT JOIN		OCLG L ON L.parentId = C.SrvcCallId
						AND L.U_API_JobNumber = C.U_API_JobNumber
LEFT JOIN		OINV I ON I.DocNum = TRY_CONVERT(INT, C.U_InvNumber)
WHERE			S.U_JobTech = @Tech
				AND YEAR(L.Recontact) = @Year
				AND MONTH(L.Recontact) = @Month
ORDER BY		S.U_JobNo, S.Name;

-- -----------------------------------------------------------------------------
-- 4. Values that break an implicit NVARCHAR -> INT join anywhere in the DB
--    (the same class of crash fixed in _SPPXC_Invoice_Data v2). The SP throws
--    on the first bad row even when it belongs to another tech or month.
-- -----------------------------------------------------------------------------
SELECT 'SCL5.U_InvNumber' AS "Field", U_InvNumber AS "Value", COUNT(*) AS "Rows"
FROM SCL5 WHERE COALESCE(U_InvNumber, '') <> '' AND TRY_CONVERT(INT, U_InvNumber) IS NULL
GROUP BY U_InvNumber
UNION ALL
SELECT 'SCL5.U_CMNumber', U_CMNumber, COUNT(*)
FROM SCL5 WHERE COALESCE(U_CMNumber, '') <> '' AND TRY_CONVERT(INT, U_CMNumber) IS NULL
GROUP BY U_CMNumber
UNION ALL
SELECT '@API_JOB_SCHEDULE.U_CallID', CAST(U_CallID AS NVARCHAR(50)), COUNT(*)
FROM [@API_JOB_SCHEDULE] WHERE COALESCE(CAST(U_CallID AS NVARCHAR(50)), '') <> '' AND TRY_CONVERT(INT, U_CallID) IS NULL
GROUP BY U_CallID;
