-- CreateTable GoogleCalendarConnection
CREATE TABLE "GoogleCalendarConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'google',
    "providerAccountEmail" TEXT NOT NULL,
    "encryptedAccessToken" TEXT NOT NULL,
    "encryptedRefreshToken" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "scopes" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CONNECTED',
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoogleCalendarConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable AppointmentCalendarEvent
CREATE TABLE "AppointmentCalendarEvent" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "connectionId" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'google',
    "providerEventId" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL DEFAULT 'primary',
    "status" TEXT NOT NULL DEFAULT 'SYNCED',
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppointmentCalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes
CREATE UNIQUE INDEX "GoogleCalendarConnection_userId_provider_key" ON "GoogleCalendarConnection"("userId", "provider");
CREATE INDEX "GoogleCalendarConnection_userId_idx" ON "GoogleCalendarConnection"("userId");
CREATE INDEX "GoogleCalendarConnection_status_idx" ON "GoogleCalendarConnection"("status");

CREATE UNIQUE INDEX "AppointmentCalendarEvent_appointmentId_userId_provider_key" ON "AppointmentCalendarEvent"("appointmentId", "userId", "provider");
CREATE INDEX "AppointmentCalendarEvent_appointmentId_idx" ON "AppointmentCalendarEvent"("appointmentId");
CREATE INDEX "AppointmentCalendarEvent_userId_idx" ON "AppointmentCalendarEvent"("userId");

-- AddForeignKeys
ALTER TABLE "GoogleCalendarConnection" ADD CONSTRAINT "GoogleCalendarConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AppointmentCalendarEvent" ADD CONSTRAINT "AppointmentCalendarEvent_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AppointmentCalendarEvent" ADD CONSTRAINT "AppointmentCalendarEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AppointmentCalendarEvent" ADD CONSTRAINT "AppointmentCalendarEvent_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "GoogleCalendarConnection"("id") ON DELETE SET NULL ON UPDATE CASCADE;
