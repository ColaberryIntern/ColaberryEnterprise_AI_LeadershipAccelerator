-- CCPP Training Program Schema — AI Systems Architect Accelerator
-- Drafted 2026-05-30 (CC-20260530-execute). NOT YET EXECUTED.
-- Author: CB System on behalf of Ali Muwwakkil.
--
-- To apply: run this in a transaction against CCPP and verify before commit.
-- Pattern follows existing ADF_InternshipProgram / ADF_InternshipCancelReasons
-- (singular base table + numeric ID lookup tables).
--
-- Affected database: CCPP (MS SQL Server). Connection in backend prod env.

BEGIN TRANSACTION;

-- =====================================================================
-- 1. ADF_TrainingPrograms — lookup of available training programs
-- =====================================================================
-- Singleton-ish for now (one row for the Accelerator) but extensible.

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'ADF_TrainingPrograms')
BEGIN
  CREATE TABLE dbo.ADF_TrainingPrograms (
    TrainingProgramID       INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    ProgramName             VARCHAR(200) NOT NULL,
    ProgramDescription      VARCHAR(2000) NULL,
    ProgramCode             VARCHAR(50) NOT NULL UNIQUE,
    ProgramIsActive         INT NOT NULL DEFAULT 1,
    LaunchDate              DATETIME NULL,
    DefaultCohortSizeCap    INT NULL,
    CreatedDate             DATETIME NOT NULL DEFAULT GETDATE(),
    UpdatedDate             DATETIME NULL
  );

  INSERT INTO dbo.ADF_TrainingPrograms (ProgramName, ProgramDescription, ProgramCode, LaunchDate, DefaultCohortSizeCap)
  VALUES (
    'AI Systems Architect Accelerator',
    '12-week project-driven Anthropic-aligned residency. Sold as 4 stackable 3-week Architect Intensives at $499 each (TWC compliance) or as a $1,497 bundle. Hosted on enterprise.colaberry.com.',
    'AISA',
    '2026-07-10',
    40
  );
END;

-- =====================================================================
-- 2. ADF_TrainingCohorts — per-cohort enrollment header
-- =====================================================================

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'ADF_TrainingCohorts')
BEGIN
  CREATE TABLE dbo.ADF_TrainingCohorts (
    TrainingCohortID        INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    TrainingProgramID       INT NOT NULL,
    CohortNumber            INT NOT NULL,            -- 1, 2, 3, ...
    CohortStartDate         DATETIME NOT NULL,
    CohortEndDate           DATETIME NOT NULL,
    CohortIsActive          INT NOT NULL DEFAULT 1,
    EnrollmentOpenDate      DATETIME NULL,
    EnrollmentCloseDate     DATETIME NULL,
    SizeCap                 INT NULL,
    CreatedDate             DATETIME NOT NULL DEFAULT GETDATE(),
    UpdatedDate             DATETIME NULL,
    CONSTRAINT FK_TrainingCohorts_Program FOREIGN KEY (TrainingProgramID) REFERENCES dbo.ADF_TrainingPrograms (TrainingProgramID),
    CONSTRAINT UQ_TrainingCohorts_ProgramCohort UNIQUE (TrainingProgramID, CohortNumber)
  );

  -- Seed Cohort 1 (Founding Cohort)
  INSERT INTO dbo.ADF_TrainingCohorts (TrainingProgramID, CohortNumber, CohortStartDate, CohortEndDate, EnrollmentOpenDate, EnrollmentCloseDate, SizeCap)
  -- Dates updated 2026-06-19 (Ali): orientation 2026-07-23 start, Expo 2026-10-16 end, enrollment opens 2026-07-10, closes 2026-07-22.
  SELECT TrainingProgramID, 1, '2026-07-23', '2026-10-16', '2026-07-10', '2026-07-22', 40
  FROM dbo.ADF_TrainingPrograms WHERE ProgramCode = 'AISA';
END;

-- =====================================================================
-- 3. ADF_TrainingEnrollments — per-student-per-cohort enrollment
-- =====================================================================
-- One row per (student, cohort). Tracks status, payment, and progress
-- pointers. Detailed per-module progress lives in StudentTrainingProgress.

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'ADF_TrainingEnrollments')
BEGIN
  CREATE TABLE dbo.ADF_TrainingEnrollments (
    TrainingEnrollmentID    INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    TrainingCohortID        INT NOT NULL,
    StudentUserID           INT NULL,                          -- joins to existing User table when student is also in Colaberry user pool
    StudentName             NVARCHAR(200) NOT NULL,
    StudentEmail            NVARCHAR(200) NOT NULL,
    EnrollmentSKU           VARCHAR(50) NOT NULL,              -- 'AISA-BUNDLE' | 'AISA-S1' | 'AISA-S2' | 'AISA-S3' | 'AISA-S4'
    EnrollmentAmountUSD     DECIMAL(10,2) NOT NULL,
    StripeChargeID          VARCHAR(200) NULL,
    StripeSubscriptionID    VARCHAR(200) NULL,                 -- for $79/$149 memberships post-grad
    EnrollmentDate          DATETIME NOT NULL DEFAULT GETDATE(),
    IsActive                INT NOT NULL DEFAULT 1,
    DropDate                DATETIME NULL,
    DropReasonID            INT NULL,                          -- joins to ADF_TrainingDropReasons (new lookup, see below)
    BaseCampProjectID       INT NULL,                          -- the student's Basecamp project for their build
    GitHubLogin             VARCHAR(100) NULL,                 -- captured at enrollment, used for sync
    ProjectDNAJson          NVARCHAR(MAX) NULL,                -- Project DNA captured Week 1 (industry, problem, MCP needs, etc.)
    AnthropicSkilljarEmail  NVARCHAR(200) NULL,                -- if different from StudentEmail
    AnthropicCertEarnedDate DATETIME NULL,
    InternalReadinessScore  INT NULL,                          -- 0-100, computed nightly by Portfolio Agent
    CreatedDate             DATETIME NOT NULL DEFAULT GETDATE(),
    UpdatedDate             DATETIME NULL,
    CONSTRAINT FK_TrainingEnrollments_Cohort FOREIGN KEY (TrainingCohortID) REFERENCES dbo.ADF_TrainingCohorts (TrainingCohortID),
    CONSTRAINT UQ_TrainingEnrollments_CohortEmail UNIQUE (TrainingCohortID, StudentEmail)
  );

  CREATE INDEX IX_TrainingEnrollments_Email ON dbo.ADF_TrainingEnrollments (StudentEmail);
  CREATE INDEX IX_TrainingEnrollments_Active ON dbo.ADF_TrainingEnrollments (IsActive, TrainingCohortID);
END;

-- =====================================================================
-- 4. ADF_TrainingDropReasons — lookup (mirrors ADF_InternshipCancelReasons)
-- =====================================================================

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'ADF_TrainingDropReasons')
BEGIN
  CREATE TABLE dbo.ADF_TrainingDropReasons (
    TrainingDropReasonID    INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    TrainingDropReason      VARCHAR(100) NOT NULL UNIQUE,
    Description             VARCHAR(500) NULL
  );

  INSERT INTO dbo.ADF_TrainingDropReasons (TrainingDropReason, Description) VALUES
    ('Refunded', 'Within 7-day refund window'),
    ('Withdrew', 'After 7-day window, requested out'),
    ('Removed - Inactive', 'Removed by program for 10+ days dark'),
    ('Removed - Policy', 'Removed for code of conduct or policy violation'),
    ('Completed', 'Graduated, normal program end'),
    ('Transferred', 'Moved to a future cohort');
END;

-- =====================================================================
-- 5. (Optional) View for portal use
-- =====================================================================
-- Convenience view that the Architect Dashboard reads from.

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.VIEWS WHERE TABLE_NAME = 'vw_ADF_ActiveTrainingEnrollments')
BEGIN
  EXEC('
    CREATE VIEW dbo.vw_ADF_ActiveTrainingEnrollments AS
    SELECT
      e.TrainingEnrollmentID,
      e.StudentName,
      e.StudentEmail,
      e.EnrollmentSKU,
      e.EnrollmentDate,
      e.GitHubLogin,
      e.InternalReadinessScore,
      e.AnthropicCertEarnedDate,
      c.CohortNumber,
      c.CohortStartDate,
      c.CohortEndDate,
      p.ProgramName,
      p.ProgramCode
    FROM dbo.ADF_TrainingEnrollments e
    JOIN dbo.ADF_TrainingCohorts c ON e.TrainingCohortID = c.TrainingCohortID
    JOIN dbo.ADF_TrainingPrograms p ON c.TrainingProgramID = p.TrainingProgramID
    WHERE e.IsActive = 1 AND c.CohortIsActive = 1 AND p.ProgramIsActive = 1
  ');
END;

-- =====================================================================
-- COMMIT or ROLLBACK
-- =====================================================================
-- Verify the new tables look right, then COMMIT TRANSACTION.
-- If anything looks wrong: ROLLBACK TRANSACTION.

-- Final sanity check:
SELECT 'ADF_TrainingPrograms', COUNT(*) AS row_count FROM dbo.ADF_TrainingPrograms
UNION ALL SELECT 'ADF_TrainingCohorts', COUNT(*) FROM dbo.ADF_TrainingCohorts
UNION ALL SELECT 'ADF_TrainingEnrollments', COUNT(*) FROM dbo.ADF_TrainingEnrollments
UNION ALL SELECT 'ADF_TrainingDropReasons', COUNT(*) FROM dbo.ADF_TrainingDropReasons;

-- COMMIT TRANSACTION;
-- ROLLBACK TRANSACTION;
