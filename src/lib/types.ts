export enum Role {
  ADMIN = 'ADMIN',
  DOCTOR = 'DOCTOR',
  PATIENT = 'PATIENT',
}

export enum LeaveStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  CANCELLED = 'CANCELLED',
}

export enum AppointmentStatus {
  HELD = 'HELD',
  CONFIRMED = 'CONFIRMED',
  CANCELLED = 'CANCELLED',
  COMPLETED = 'COMPLETED',
}

export enum NotificationChannel {
  EMAIL = 'EMAIL',
  SMS = 'SMS',
  CALENDAR = 'CALENDAR',
}

export enum NotificationStatus {
  QUEUED = 'QUEUED',
  PROCESSING = 'PROCESSING',
  SENT = 'SENT',
  FAILED = 'FAILED',
  DLQ = 'DLQ',
}

export interface AvailableSlot {
  startTime: string; // ISO string
  endTime: string;   // ISO string
  doctorId: string;
  isAvailable: boolean;
  reason?: string;
}

export interface SymptomSummaryRequest {
  patientId: string;
  symptoms: string;
  medicalHistory?: string;
}

export interface SymptomSummaryResult {
  summary: string;
  suggestedFocus: string;
  disclaimer: string;
}

export interface PostVisitSummaryResult {
  consultationSummary: string;
  patientInstructions: string;
  prescribedMedications: string[];
  disclaimer: string;
}
