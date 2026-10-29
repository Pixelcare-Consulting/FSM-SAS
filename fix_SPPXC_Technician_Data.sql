-- =============================================================================
-- FIX: Job Incentives add-on, Technician Report drill-down is empty.
--      Alters _SPPXC_Technician_Data and _SPPXC_DocNum_Data.
--
-- ROOT CAUSE (confirmed 2026-10-29 with diag_SPPXC_Technician_Data.sql):
--   EXEC _SPPXC_Technician_Data ... fails with
--       Msg 245, Line 85: Conversion failed when converting the nvarchar
--       value '2026-003647' to data type int.
--   Both detail SPs join SCL5's nvarchar U_InvNumber / U_CMNumber straight to
--   the int OINV/ORIN.DocNum, so SQL Server converts every SCL5 value to int.
--   One non-numeric value anywhere in SCL5 (here a job number) kills the SP
--   for every tech and every month. The add-on swallows the error and shows
--   an empty grid. _SPPXC_Technician_Data builds its full doc list before
--   filtering by tech, so it always hits the bad row. _SPPXC_DocNum_Data
--   filters first and only fails depending on the query plan.
--   The summary (_SPPXC_Job_Incentive_Data) never joins OINV/ORIN, which is
--   why it still shows income.
--
-- WHAT THIS CHANGES:
--   1. Invoice / CM joins use TRY_CONVERT(INT, ...). A non-numeric number
--      no longer matches any document, and the SP no longer fails.
--   2. The doc number range filter (WODT / ALL) uses TRY_CONVERT too.
--   3. @Year is now applied. Both SPs took it but filtered by month only, so
--      January 2027 also listed January invoices from every other year. The
--      summary filters by year, so the drill-down now matches it. A blank
--      @Year keeps the old behaviour.
--   Columns and parameters are unchanged, so the add-on needs no rebuild.
--
-- NOT FIXED HERE (data): the SCL5 row holding '2026-003647' in U_InvNumber
--   or U_CMNumber is still wrong and its job is left out of the drill-down.
--   Find it with test_SPPXC_Technician_Data.sql (section 1) and correct it
--   in SAP.
--
-- ROLLBACK: re-run the original definitions (OBJECT_DEFINITION output from
--   diag_SPPXC_Technician_Data.sql section 1), changing CREATE to ALTER.
--
-- Run against SASME_PORTAL_TESTING02 first, verify with
-- test_SPPXC_Technician_Data.sql, then SASME_LIVEDB. Select the database in
-- SSMS before executing; this script has no USE on purpose.
-- =============================================================================
GO

--**********
--Created By: Chris
--Date Created: 08/17/2023
--Description: Technician Data
--**********

--**********
--Modified By: Chris
--Date Modified: 10/3/2024
--Description: Adjust to exclude service call where status is cancelled or rejected
--**********

--**********
--Modified By: Pixelcare
--Date Modified: 10/29/2026
--Description: TRY_CONVERT on the U_InvNumber / U_CMNumber joins and the doc
--             number range, so a non-numeric SCL5 value cannot fail the SP.
--             Applied the @Year filter.
--**********

ALTER PROCEDURE _SPPXC_Technician_Data
	@FilterType NVARCHAR(50),
	@Year NVARCHAR(4),
	@Quarter NVARCHAR(1),
	@Month NVARCHAR(2),
	@Tech NVARCHAR(100),
	@FilterCategory NVARCHAR(10),
	@DocType NVARCHAR(10),
	@DocNumFrom INT,
	@DocNumTo INT,
	@DateFrom DATETIME,
	@DateTo DATETIME
AS
--EXECUTE _SPPXC_Technician_Data 'Q', '2024', '3', '9', 'C4Yoga', 'NF', '', '', '', '', ''

BEGIN
	SELECT			*
	FROM			(
						SELECT			T2.U_JobTech AS 'Job Technician',
										'Invoice' AS 'Document Type',
										T0.Recontact AS 'Document Date',
										T1.DocEntry AS 'Document Entry',
										T0.U_InvNumber AS 'Document Number',
										T1.CardCode AS 'BP Code',
										T1.CardName AS 'BP Name',
										T1.DocTotal AS 'Document Amount',
										SUM(T0.U_JobIncome) AS 'Incentive Amount'
						FROM			(
											SELECT		A.Recontact,
														B.U_API_JobNumber,
														B.U_InvNumber,
														B.U_JobIncome
											FROM		OCLG A
											INNER JOIN	SCL5 B ON A.ClgCode = B.ClgID
											INNER JOIN	OSCL C ON B.SrvcCallId = C.callID
											INNER JOIN	OSCS D ON C.[status] = D.statusID
											WHERE		D.[Name] NOT IN ('Cancelled', 'Rejected')
										) T0
						INNER JOIN		OINV T1 ON T1.DocNum = TRY_CONVERT(INT, T0.U_InvNumber)	-- FIX: was T0.U_InvNumber = T1.DocNum
						LEFT JOIN		(
											SELECT		DISTINCT
														A.U_JobNo,
														A.U_JobTech
											FROM		[@API_JOB_SCHEDULE] A
										) T2 ON T0.U_API_JobNumber = T2.U_JobNo
						GROUP BY		T2.U_JobTech,
										T0.Recontact,
										T1.DocEntry,
										T0.U_InvNumber,
										T1.CardCode,
										T1.CardName,
										T1.DocTotal

						UNION ALL

						SELECT			T2.U_JobTech AS 'Job Technician',
										'Credit Memo' AS 'Document Type',
										T0.Recontact AS 'Document Date',
										T1.DocEntry AS 'Document Entry',
										T0.U_CMNumber AS 'Document Number',
										T1.CardCode AS 'BP Code',
										T1.CardName AS 'BP Name',
										T1.DocTotal AS 'Document Amount',
										SUM(T0.U_JobIncome) AS 'Incentive Amount'
						FROM			(
											SELECT		A.Recontact,
														B.U_API_JobNumber,
														B.U_CMNumber,
														B.U_JobIncome
											FROM		OCLG A
											INNER JOIN	SCL5 B ON A.ClgCode = B.ClgID
											INNER JOIN	OSCL C ON B.SrvcCallId = C.callID
											INNER JOIN	OSCS D ON C.[status] = D.statusID
											WHERE		D.[Name] NOT IN ('Cancelled', 'Rejected')
										) T0
						INNER JOIN		ORIN T1 ON T1.DocNum = TRY_CONVERT(INT, T0.U_CMNumber)	-- FIX: was T0.U_CMNumber = T1.DocNum
						LEFT JOIN		(
											SELECT		DISTINCT
														A.U_JobNo,
														A.U_JobTech
											FROM		[@API_JOB_SCHEDULE] A
										) T2 ON T0.U_API_JobNumber = T2.U_JobNo
						GROUP BY		T2.U_JobTech,
										T0.Recontact,
										T1.DocEntry,
										T0.U_CMNumber,
										T1.CardCode,
										T1.CardName,
										T1.DocTotal
					) Z
	WHERE			Z.[Job Technician] = @Tech
					AND (COALESCE(@Year, '') = '' OR YEAR(Z.[Document Date]) = @Year)	-- FIX: @Year was never applied
					AND ((@FilterType = 'M' AND MONTH(Z.[Document Date]) = @Month) OR
						(@FilterType = 'Q' AND MONTH(Z.[Document Date]) BETWEEN
							CASE WHEN @Quarter = 1 THEN 1 WHEN @Quarter = 2 THEN 4 WHEN @Quarter = 3 THEN 7 ELSE 10 END
							AND CASE WHEN @Quarter = 1 THEN 3 WHEN @Quarter = 2 THEN 6 WHEN @Quarter = 3 THEN 9 ELSE 12 END))
					AND ((@FilterCategory = 'WODT' AND (TRY_CONVERT(INT, Z.[Document Number]) BETWEEN @DocNumFrom AND @DocNumTo)) OR	-- FIX: TRY_CONVERT
						(@FilterCategory = 'WODN' AND Z.[Document Type] = @DocType) OR
						(@FilterCategory = 'ALL' AND Z.[Document Type] = @DocType AND (TRY_CONVERT(INT, Z.[Document Number]) BETWEEN @DocNumFrom AND @DocNumTo) AND (Z.[Document Date] BETWEEN @DateFrom AND @DateTo)) OR	-- FIX: TRY_CONVERT
						(@FilterCategory = 'NF' AND (Z.[Document Date] BETWEEN @DateFrom AND @DateTo)))
	ORDER BY		Z.[Document Date],
					Z.[Document Number]
END
GO

--**********
--Created By: Chris Mascareñas
--Date Created: 08/23/2023
--Description: Document Number Data (For Filter Value)
--**********

--**********
--Modified By: Chris Mascareñas
--Date Modified: 03/15/2024
--Description: Adjustment on the date filter from invoice/credit memo date to activity date
--**********

--**********
--Modified By: Pixelcare
--Date Modified: 10/29/2026
--Description: TRY_CONVERT on the U_InvNumber / U_CMNumber joins, so a
--             non-numeric SCL5 value cannot fail the SP. Applied the @Year filter.
--**********

ALTER PROCEDURE "_SPPXC_DocNum_Data"
	@FilterType NVARCHAR(50),
	@Year NVARCHAR(4),
	@Quarter NVARCHAR(1),
	@Month NVARCHAR(2),
	@Tech NVARCHAR(100)
AS
--EXECUTE _SPPXC_DocNum_Data 'M', '2024', '1', '1', 'A1EdsonBeh'

BEGIN
	SELECT			DISTINCT
					T0.U_InvNumber AS 'Document Number',
					'Invoice' AS 'Document Type'
	FROM			SCL5 T0
	INNER JOIN		OINV T1 ON T1.DocNum = TRY_CONVERT(INT, T0.U_InvNumber)	-- FIX: was T0.U_InvNumber = T1.DocNum
	LEFT JOIN		(
						SELECT		A.U_JobNo,
									A.U_JobTech
						FROM		[@API_JOB_SCHEDULE] A
					) T2 ON T0.U_API_JobNumber = T2.U_JobNo
	INNER JOIN		OCLG T3 ON T0.ClgID = T3.ClgCode
	WHERE			T2.U_JobTech = @Tech
					AND T0.U_JobStatus = 'I'
					AND (COALESCE(@Year, '') = '' OR YEAR(T3.Recontact) = @Year)	-- FIX: @Year was never applied
					AND ((@FilterType = 'M' AND MONTH(T3.Recontact) = @Month) OR
						(@FilterType = 'Q' AND MONTH(T3.Recontact) BETWEEN
							CASE WHEN @Quarter = 1 THEN 1 WHEN @Quarter = 2 THEN 4 WHEN @Quarter = 3 THEN 7 ELSE 10 END
							AND CASE WHEN @Quarter = 1 THEN 3 WHEN @Quarter = 2 THEN 6 WHEN @Quarter = 3 THEN 9 ELSE 12 END))

	UNION ALL

	SELECT			DISTINCT
					T0.U_CMNumber,
					'Credit Memo'
	FROM			SCL5 T0
	INNER JOIN		ORIN T1 ON T1.DocNum = TRY_CONVERT(INT, T0.U_CMNumber)	-- FIX: was T0.U_CMNumber = T1.DocNum
	LEFT JOIN		(
						SELECT		A.U_JobNo,
									A.U_JobTech
						FROM		[@API_JOB_SCHEDULE] A
					) T2 ON T0.U_API_JobNumber = T2.U_JobNo
	INNER JOIN		OCLG T3 ON T0.ClgID = T3.ClgCode
	WHERE			T2.U_JobTech = @Tech
					AND T0.U_CMStatus = 'WCM'
					AND (COALESCE(@Year, '') = '' OR YEAR(T3.Recontact) = @Year)	-- FIX: @Year was never applied
					AND ((@FilterType = 'M' AND MONTH(T3.Recontact) = @Month) OR
						(@FilterType = 'Q' AND MONTH(T3.Recontact) BETWEEN
							CASE WHEN @Quarter = 1 THEN 1 WHEN @Quarter = 2 THEN 4 WHEN @Quarter = 3 THEN 7 ELSE 10 END
							AND CASE WHEN @Quarter = 1 THEN 3 WHEN @Quarter = 2 THEN 6 WHEN @Quarter = 3 THEN 9 ELSE 12 END))
END
GO
