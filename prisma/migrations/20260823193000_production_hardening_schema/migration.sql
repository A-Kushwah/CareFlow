-- Prisma Migration: Production Hardening Schema
-- Includes User, DoctorProfile (with isPublished and isTestFixture flags), WorkingHours, DoctorLeave,
-- SlotHold, Appointment, MedicationReminder, NotificationLog, and AiGenerationLog.

-- CreateTable User
CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'PATIENT',
    "isTestFixture" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable DoctorProfile
CREATE TABLE IF NOT EXISTS "DoctorProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "specialty" TEXT NOT NULL,
    "consultFee" REAL NOT NULL,
    "slotDurationMin" INTEGER NOT NULL DEFAULT 30,
    "bufferTimeMin" INTEGER NOT NULL DEFAULT 10,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "isTestFixture" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "DoctorProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable WorkingHours
CREATE TABLE IF NOT EXISTS "WorkingHours" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "doctorId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "breakStartTime" TEXT,
    "breakEndTime" TEXT,
    CONSTRAINT "WorkingHours_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "DoctorProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable DoctorLeave
CREATE TABLE IF NOT EXISTS "DoctorLeave" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "doctorId" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'APPROVED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DoctorLeave_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "DoctorProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable SlotHold
CREATE TABLE IF NOT EXISTS "SlotHold" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "doctorId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "startTime" DATETIME NOT NULL,
    "endTime" DATETIME NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable Appointment
CREATE TABLE IF NOT EXISTS "Appointment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "patientId" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "startTime" DATETIME NOT NULL,
    "endTime" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "symptoms" TEXT,
    "aiPreSummary" TEXT,
    "aiPostSummary" TEXT,
    "consultNotes" TEXT,
    "calendarEventId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Appointment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Appointment_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "DoctorProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable MedicationReminder
CREATE TABLE IF NOT EXISTS "MedicationReminder" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "patientId" TEXT NOT NULL,
    "medication" TEXT NOT NULL,
    "dosage" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "lastSentAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable NotificationLog
CREATE TABLE IF NOT EXISTS "NotificationLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "idempotencyKey" TEXT,
    "recipient" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'EMAIL',
    "template" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "nextRetryAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "claimToken" TEXT,
    "claimedAt" DATETIME,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable AiGenerationLog
CREATE TABLE IF NOT EXISTS "AiGenerationLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "appointmentId" TEXT,
    "patientId" TEXT,
    "doctorId" TEXT,
    "action" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL DEFAULT '1.0',
    "status" TEXT NOT NULL,
    "requestId" TEXT,
    "latencyMs" INTEGER NOT NULL,
    "promptTokens" INTEGER NOT NULL DEFAULT 0,
    "completionTokens" INTEGER NOT NULL DEFAULT 0,
    "inputHash" TEXT NOT NULL,
    "outputJson" TEXT NOT NULL,
    "errorReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndexes
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "DoctorProfile_userId_key" ON "DoctorProfile"("userId");
CREATE INDEX IF NOT EXISTS "SlotHold_doctorId_startTime_endTime_idx" ON "SlotHold"("doctorId", "startTime", "endTime");
CREATE INDEX IF NOT EXISTS "Appointment_doctorId_startTime_endTime_idx" ON "Appointment"("doctorId", "startTime", "endTime");
CREATE UNIQUE INDEX IF NOT EXISTS "NotificationLog_idempotencyKey_key" ON "NotificationLog"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "NotificationLog_status_nextRetryAt_idx" ON "NotificationLog"("status", "nextRetryAt");
CREATE INDEX IF NOT EXISTS "NotificationLog_claimToken_idx" ON "NotificationLog"("claimToken");
CREATE INDEX IF NOT EXISTS "AiGenerationLog_appointmentId_idx" ON "AiGenerationLog"("appointmentId");
CREATE INDEX IF NOT EXISTS "AiGenerationLog_patientId_idx" ON "AiGenerationLog"("patientId");
CREATE INDEX IF NOT EXISTS "AiGenerationLog_doctorId_idx" ON "AiGenerationLog"("doctorId");
CREATE INDEX IF NOT EXISTS "AiGenerationLog_createdAt_idx" ON "AiGenerationLog"("createdAt");
