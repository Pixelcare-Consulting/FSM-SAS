-- =============================================================================
-- CHECK: are the SPPXC stored procedures on this database the latest versions
--        from the repo's fix_SPPXC_*.sql scripts?
--
-- Read-only. Select the database in SSMS first (SASME_LIVEDB or TESTING02).
--
-- Result 1, one row per SP:
--   LATEST    every change from its fix script is in the SP
--   OUTDATED  at least one change is missing (result 2 shows which):
--             run the FixScript named on that row
--   MISSING   the SP does not exist in this database
-- Result 2: every change checked. Whitespace and indentation are ignored.
--
-- LastModified is when the SP was last created or altered. OUTDATED with a
-- LastModified after you ran the fix means something put an older version
-- back (e.g. Document Automation deploying its SPs with CreateUtilities = Y).
-- =============================================================================
SET NOCOUNT ON;

DECLARE @Checks TABLE (
	Seq INT IDENTITY(1,1),
	SP SYSNAME,
	FixScript NVARCHAR(100),
	Change NVARCHAR(200),
	Marker NVARCHAR(400),	-- the changed code with all whitespace removed
	MinHits INT,
	MaxHits INT NULL
);

INSERT INTO @Checks (SP, FixScript, Change, Marker, MinHits, MaxHits) VALUES
	(N'_SPPXC_Technician_Data', N'fix_SPPXC_Technician_Data.sql', N'Invoice join uses TRY_CONVERT(INT, T0.U_InvNumber)', N'T1.DocNum=TRY_CONVERT(INT,T0.U_InvNumber)', 1, NULL),
	(N'_SPPXC_Technician_Data', N'fix_SPPXC_Technician_Data.sql', N'Credit memo join uses TRY_CONVERT(INT, T0.U_CMNumber)', N'T1.DocNum=TRY_CONVERT(INT,T0.U_CMNumber)', 1, NULL),
	(N'_SPPXC_Technician_Data', N'fix_SPPXC_Technician_Data.sql', N'@Year filter applied', N'COALESCE(@Year,'''')=''''ORYEAR(Z.[DocumentDate])=@Year', 1, NULL),
	(N'_SPPXC_Technician_Data', N'fix_SPPXC_Technician_Data.sql', N'Doc number range uses TRY_CONVERT (WODT and ALL)', N'TRY_CONVERT(INT,Z.[DocumentNumber])BETWEEN@DocNumFromAND@DocNumTo', 2, NULL),

	(N'_SPPXC_DocNum_Data', N'fix_SPPXC_Technician_Data.sql', N'Invoice join uses TRY_CONVERT(INT, T0.U_InvNumber)', N'T1.DocNum=TRY_CONVERT(INT,T0.U_InvNumber)', 1, NULL),
	(N'_SPPXC_DocNum_Data', N'fix_SPPXC_Technician_Data.sql', N'Credit memo join uses TRY_CONVERT(INT, T0.U_CMNumber)', N'T1.DocNum=TRY_CONVERT(INT,T0.U_CMNumber)', 1, NULL),
	(N'_SPPXC_DocNum_Data', N'fix_SPPXC_Technician_Data.sql', N'@Year filter applied (invoice and credit memo)', N'COALESCE(@Year,'''')=''''ORYEAR(T3.Recontact)=@Year', 2, NULL),

	(N'_SPPXC_Invoice_Data', N'fix_SPPXC_Invoice_Data_v3.sql', N'v3: SCL5 joined on its own service call (T2.SrvcCallId = T0.callID)', N'T2.SrvcCallId=T0.callID', 1, NULL),
	(N'_SPPXC_Invoice_Data', N'fix_SPPXC_Invoice_Data_v3.sql', N'FIX 1: invoice join uses TRY_CONVERT(INT, T2.U_InvNumber)', N'T4.DocNum=TRY_CONVERT(INT,T2.U_InvNumber)', 1, NULL),
	(N'_SPPXC_Invoice_Data', N'fix_SPPXC_Invoice_Data_v3.sql', N'FIX 2: job number check compares text (COALESCE(..., '''') <> '''')', N'COALESCE(T1.U_API_JobNumber,'''')<>''''', 1, NULL),
	(N'_SPPXC_Invoice_Data', N'fix_SPPXC_Invoice_Data_v3.sql', N'FIX 3: tech join casts callID to text', N'T3.U_CallID=CAST(T0.callIDASNVARCHAR(50))', 1, NULL),
	(N'_SPPXC_Invoice_Data', N'fix_SPPXC_Invoice_Data_v3.sql', N'SO amount lookup compares as text', N'T2.U_API_PONo=CAST(DocNumASNVARCHAR(50))', 1, NULL),
	(N'_SPPXC_Invoice_Data', N'fix_SPPXC_Invoice_Data_v3.sql', N'Invoice amount lookup compares as text', N'T2.U_InvNumber=CAST(DocNumASNVARCHAR(50))', 1, NULL),

	-- Type 1 (AIFM sync) still sets U_API_Tech; Type 2 (automation) must not, so exactly one.
	(N'_SPPXC_Activities_Handler_Data', N'fix_SPPXC_Activities_Handler_Data.sql', N'Only Type 1 writes U_API_Tech (Type 2 no longer does)', N'U_API_Tech=@TechList', 1, 1);

DECLARE @Result TABLE (
	Seq INT,
	SP SYSNAME,
	FixScript NVARCHAR(100),
	LastModified DATETIME NULL,
	Readable INT,
	Change NVARCHAR(200),
	Hits INT NULL,
	Present INT
);

INSERT INTO @Result (Seq, SP, FixScript, LastModified, Readable, Change, Hits, Present)
SELECT			c.Seq,
				c.SP,
				c.FixScript,
				o.modify_date,
				CASE WHEN d.Body IS NULL THEN 0 ELSE 1 END,
				c.Change,
				h.Hits,
				CASE WHEN h.Hits >= c.MinHits AND (c.MaxHits IS NULL OR h.Hits <= c.MaxHits) THEN 1 ELSE 0 END
FROM			@Checks c
LEFT JOIN		sys.objects o ON o.object_id = OBJECT_ID(c.SP) AND o.[type] = 'P'
CROSS APPLY		(
					SELECT REPLACE(REPLACE(REPLACE(REPLACE(OBJECT_DEFINITION(o.object_id),
						N' ', N''), NCHAR(9), N''), NCHAR(13), N''), NCHAR(10), N'') AS Body
				) d
CROSS APPLY		(SELECT (LEN(d.Body) - LEN(REPLACE(d.Body, c.Marker, N''))) / LEN(c.Marker) AS Hits) h;

-- Result 1: one row per SP.
SELECT			SP,
				CASE
					WHEN MAX(LastModified) IS NULL THEN 'MISSING'
					WHEN MIN(Readable) = 0 THEN 'CANNOT READ (needs VIEW DEFINITION)'
					WHEN MIN(Present) = 1 THEN 'LATEST'
					ELSE 'OUTDATED'
				END AS "Status",
				CONCAT(SUM(Present), '/', COUNT(*)) AS "ChangesPresent",
				MAX(LastModified) AS "LastModified",
				MAX(FixScript) AS "FixScript"
FROM			@Result
GROUP BY		SP
ORDER BY		MIN(Seq);

-- Result 2: each change.
SELECT			SP,
				Change,
				Hits,
				CASE WHEN Present = 1 THEN 'yes' ELSE 'NO' END AS "Present"
FROM			@Result
ORDER BY		Seq;
