--**********
--Created By: Chris Mascareñas
--Date Created: 04/18/2023
--Description: Update Service Call Actvities (SCL5)
--**********

--**********
--Created By: Chris Mascareñas
--Date Modified: 04/25/2023
--Description: Commented script is for the process when the adhoc jobs are included
--**********

--**********
--Created By: Chris Mascareñas
--Date Modified: 12/12/2023
--Description: Changed the trigger of update from per Job Number to per Sales Order for Type 2: Automation
--**********

--**********
--Created By: Pixelcare
--Date Modified: 10/26/2026
--Description: Type 2 (invoice / credit memo) no longer writes U_API_Tech. The add-on looked up
--             the tech list by job number only, so a duplicate SCL5 row on another call blanked it.
--**********

CREATE OR ALTER PROCEDURE "_SPPXC_Activities_Handler_Data"
	@Type NVARCHAR(10),
	@CallID NVARCHAR(20),
	@JobNumber NVARCHAR(20),
	@JobStatusID NVARCHAR(50),
	@JobStatus NVARCHAR(50),
	@InvStatus NVARCHAR(200),
	@InvNumber NVARCHAR(50),
	@CMStatus NVARCHAR(200),
	@CMNumber NVARCHAR(50),
	@RefNumber NVARCHAR(20),
	@SOAmount FLOAT,
	@InvAmount FLOAT,
	@JobIncome FLOAT,
	@TechList NVARCHAR(300)
AS
-- Type 1: AIFM Sync
-- Type 2: Automation
BEGIN
	IF (@Type = 1)
		BEGIN
			UPDATE			SCL5
			SET				U_API_JobStatusID = @JobStatusID
							,U_API_JobStatus = @JobStatus
							,U_JobStatus = @InvStatus
							,U_InvNumber = @InvNumber
							,U_API_PONo = @RefNumber
							,U_SOAmt = @SOAmount
							,U_API_Tech = @TechList
			WHERE			SrvcCallId = @CallID
							AND U_API_JobNumber = @JobNumber

			UPDATE			OCLG
			SET				U_API_JobStatusID = @JobStatusID
							,U_API_JobStatus = @JobStatus
			WHERE			parentId = @CallID
							AND U_API_JobNumber = @JobNumber
		END
	ELSE IF (@Type = 2)
		BEGIN
			UPDATE			SCL5
			SET				U_JobStatus = @InvStatus
							,U_InvNumber = @InvNumber
							,U_CMStatus = @CMStatus
							,U_CMNumber = @CMNumber
							,U_InvAmt = @InvAmount
							,U_JobIncome = @JobIncome
			WHERE			SrvcCallId = @CallID
							AND U_API_JobNumber = @JobNumber
							AND U_API_PONo = @RefNumber
		END
END
