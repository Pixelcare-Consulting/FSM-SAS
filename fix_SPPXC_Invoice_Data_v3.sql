-- =============================================================================
-- FIX v3: joins SCL5 (T2) to its own service call. Supersedes
--         fix_SPPXC_Invoice_Data_v2.sql (keeps all v2 conversion fixes).
--
-- ROOT CAUSE (confirmed 2026-10-29 against SASME_PORTAL_TESTING02):
--   The SCL5 join only matched on job number:
--       T2 ON T0.callID = T1.parentId AND T2.U_API_JobNumber = T1.U_API_JobNumber
--   The first condition repeats the OCLG join, so T2.SrvcCallId was never
--   constrained. When the same job number exists on two service calls, each
--   activity pairs with BOTH SCL5 lines, and the stale line's values win the
--   filters:
--       SrvcCallId  ClgID  JobNumber     U_API_JobStatus  U_JobStatus  PONo
--       20665       40471  2026-010272   Unconfirmed      NI           1007492
--       20897       40874  2026-010272   Confirmed        I            1007536
--   Call 20897's activity was listed as "to invoice" with SO 1007492, its SO
--   amount and status Unconfirmed, although its own line is invoiced (8009141).
--   Same for 2026-010273/-002/-003/-004 (stale call 20130 vs real call 20898).
--
-- WHAT THIS CHANGES:
--   T2 is matched on SrvcCallId = T0.callID AND job number. T3 (techs) already
--   matched on call ID; T2 now does the same. No columns, parameters or
--   filters change, so the add-on needs no rebuild.
--
-- NOT FIXED HERE (data): the stale activities on the other call are real
--   OCLG + SCL5 pairs. If they are NI and match the filters, they still list
--   under their OWN call ID, which is correct for this query. Close or remove
--   them in SAP if they are leftover data.
--
-- ROLLBACK: re-run fix_SPPXC_Invoice_Data_v2.sql.
--
-- Run against SASME_PORTAL_TESTING02 first, verify with
-- test_SPPXC_Invoice_Data_v3.sql, then SASME_LIVEDB. Select the database in
-- SSMS before executing; this script has no USE on purpose. If you add one,
-- keep the GO below it: ALTER PROCEDURE must start its own batch.
-- =============================================================================
GO

--**********
--Created By: Chris Mascareñas
--Date Created: 04/18/2023
--Description: Populate Invoice Automation Matrix
--**********

--**********
--Date Modified: 08/21/2026
--Description: Hardened all implicit NVARCHAR -> INT conversions (see v2 header)
--**********

--**********
--Created By: Pixelcare
--Date Modified: 10/29/2026
--Description: SCL5 (T2) now joined on SrvcCallId as well as job number, so a
--             same-numbered line on another service call cannot supply this
--             activity's SO, status or invoice flag (see v3 header)
--**********

ALTER PROCEDURE "_SPPXC_Invoice_Data"
	@DocType NVARCHAR(50),
	@DateFrom DATETIME,
	@DateTo DATETIME,
	@CustomerIDFrom NVARCHAR(100),
	@CustomerIDTo NVARCHAR(100),
	@JobStatusID NVARCHAR(50),
	@JobNumber NVARCHAR(50),
	@FilterType NVARCHAR(10)
AS
--EXECUTE _SPPXC_Invoice_Data 'I','20260801','20260821','','','-1','','WOCJ'

--Filter Types:
--WOD - WIthout Date,
--WOC - WIthout Customer,
--WOJ - WIthout Job Number,
--WODC - WIthout Date and Customer,
--WOCJ - WIthout Customer and Job Number,
--WODJ - WIthout Date and Job Number

BEGIN
	SELECT			'N' AS "Select"
					,T0.callID AS "ServID"
					,T2.U_API_PONo AS "RefDoc"
					,T2.U_InvNumber AS "InvID"
					,T1.U_API_JobNumber AS "JobNo"
					,T1.CardCode AS "CustNo"
					,T0.custmrName AS "Cust"
					,T1.Details AS "JobCat"
					,T1.Notes AS "JobDesc"
					,T2.U_API_JobStatus AS "JobStat"
					,T1.Recontact AS "JSDate"
					,T1.endDate AS "JEDate"
					,RIGHT(CONVERT(NVARCHAR(20),TRY_CAST(STUFF(RIGHT('0000' + CONVERT(NVARCHAR(4), T1.BeginTime),4),3,0,':') AS DATETIME),100),7) AS "JSTime"
					,RIGHT(CONVERT(NVARCHAR(20),TRY_CAST(STUFF(RIGHT('0000' + CONVERT(NVARCHAR(4), T1.ENDTime),4),3,0,':') AS DATETIME),100),7) AS "JETime"
					,CASE
						WHEN T1.[Priority] = 0 THEN
							'Low'
						WHEN T1.[Priority] = 1 THEN
							'Normal'
						ELSE
							'High'
					END AS "JobPrio"
					,(SELECT DocTotal FROM ORDR WHERE T2.U_API_PONo = CAST(DocNum AS NVARCHAR(50))) AS "SOAmount"
					,(SELECT DocTotal FROM OINV WHERE T2.U_InvNumber = CAST(DocNum AS NVARCHAR(50))) AS "InvAmount"
					,T3.Techs AS "Tech"
	FROM			OSCL T0
	INNER JOIN		OCLG T1 ON T0.callID = T1.parentId
	INNER JOIN		(
						SELECT			A.SrvcCallId
										,A.U_API_JobNumber
										,A.U_API_JobStatusID
										,A.U_API_JobStatus
										,A.U_JobStatus
										,A.U_InvNumber
										,A.U_CMStatus
										,A.U_CMNumber
										,A.U_API_PONo
						FROM			SCL5 A
					) T2 ON T2.SrvcCallId = T0.callID		-- FIX v3: was T0.callID = T1.parentId (repeat of the OCLG join)
							AND T2.U_API_JobNumber = T1.U_API_JobNumber
	LEFT JOIN		(
						SELECT			A.U_CallID
										,A.U_JobNo
										,STRING_AGG(U_JobTech, ', ') AS "Techs"
						FROM			(
											SELECT			DISTINCT
															A1.U_CallID
															,A1.U_JobNo
															,A1.U_JobTech
											FROM			[@API_JOB_SCHEDULE] A1
										) A
						GROUP BY		A.U_CallID
										,A.U_JobNo
					) T3 ON T3.U_CallID = CAST(T0.callID AS NVARCHAR(50))	-- FIX 3: was T0.callID = T3.U_CallID (INT vs db_Alpha)
							AND T1.U_API_JobNumber = T3.U_JobNo
	LEFT JOIN		OINV T4 ON T4.DocNum = TRY_CONVERT(INT, T2.U_InvNumber)	-- FIX 1: was T2.U_InvNumber = T4.DocNum  <- THE CRASH
	WHERE			COALESCE(T1.U_API_JobNumber,'') <> ''					-- FIX 2: was COALESCE(..., 0) <> 0
					AND T2.U_API_JobStatusID = @JobStatusID
					AND (
						(@FilterType = 'WOD' AND (T1.CardCode >=  @CustomerIDFrom AND T1.CardCode <=  @CustomerIDTo) AND T1.U_API_JobNumber = @JobNumber)
						OR (@FilterType = 'WOC' AND (CAST(T1.Recontact AS DATE) >= CAST(@DateFrom AS DATE) AND CAST(T1.endDate AS DATE) <= CAST(@DateTo AS DATE)) AND T1.U_API_JobNumber = @JobNumber)
						OR (@FilterType = 'WOJ' AND (CAST(T1.Recontact AS DATE) >= CAST(@DateFrom AS DATE) AND CAST(T1.endDate AS DATE) <= CAST(@DateTo AS DATE)) AND (T1.CardCode >=  @CustomerIDFrom AND T1.CardCode <=  @CustomerIDTo))
						OR (@FilterType = 'WODC' AND (T1.U_API_JobNumber = @JobNumber))
						OR (@FilterType = 'WOCJ' AND (CAST(T1.Recontact AS DATE) >= CAST(@DateFrom AS DATE) AND CAST(T1.endDate AS DATE) <= CAST(@DateTo AS DATE)))
						OR (@FilterType = 'WODJ' AND (T1.CardCode >=  @CustomerIDFrom AND T1.CardCode <=  @CustomerIDTo))
						)
					AND ((@DocType = 'I' AND T2.U_JobStatus = 'NI')
						OR @DocType = 'CM' AND T2.U_JobStatus = 'I' AND T2.U_CMStatus = 'WOCM' AND T4.DocStatus = 'O')
	ORDER BY		T1.U_API_JobNumber
					,T1.CardCode
END
GO
