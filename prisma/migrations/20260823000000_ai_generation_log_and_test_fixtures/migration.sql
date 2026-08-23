-- Migration 3: AI Generation Audit Persistence & Performance Indexes

-- CreateTable AiGenerationLog
CREATE TABLE "AiGenerationLog" (
    "id" TEXT NOT NULL,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiGenerationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes
CREATE INDEX "AiGenerationLog_appointmentId_idx" ON "AiGenerationLog"("appointmentId");
CREATE INDEX "AiGenerationLog_patientId_idx" ON "AiGenerationLog"("patientId");
CREATE INDEX "AiGenerationLog_doctorId_idx" ON "AiGenerationLog"("doctorId");
CREATE INDEX "AiGenerationLog_createdAt_idx" ON "AiGenerationLog"("createdAt");
