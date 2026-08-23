import { z } from 'zod';

export const PreVisitSummarySchema = z.object({
  urgencyLevel: z.enum(['Low', 'Medium', 'High']),
  chiefComplaint: z.string().min(1, 'Chief complaint required'),
  suggestedQuestions: z.array(z.string()).length(3, 'Must provide exactly 3 suggested clinical questions'),
  redFlagsIdentified: z.array(z.string()).default([]),
  summary: z.string().min(1, 'Summary required'),
  disclaimer: z.string().min(1, 'Disclaimer required'),
});

export type PreVisitSummary = z.infer<typeof PreVisitSummarySchema>;

export const DoctorPrescriptionSchema = z.object({
  medication: z.string().min(1, 'Medication name is required'),
  dosage: z.string().min(1, 'Dosage is required'),
  frequency: z.string().min(1, 'Frequency is required'),
  duration: z.string().min(1, 'Duration is required'),
  instructions: z.string().optional().default('Take as directed by physician'),
});

export type DoctorPrescription = z.infer<typeof DoctorPrescriptionSchema>;

export const PostVisitInputSchema = z.object({
  appointmentId: z.string().min(1, 'Appointment ID is required'),
  notes: z.string().min(1, 'Doctor consultation notes are required'),
  followUpInstructions: z.string().optional().default(''),
  prescriptions: z.array(DoctorPrescriptionSchema).default([]),
});

export type PostVisitInput = z.infer<typeof PostVisitInputSchema>;

export const PostVisitSummarySchema = z.object({
  patientInstructions: z.array(z.string()).min(1, 'Patient instructions required'),
  medicationSummary: z.array(
    z.object({
      medication: z.string(),
      dosage: z.string(),
      frequency: z.string(),
      duration: z.string().optional().default('As directed'),
      instructions: z.string().optional().default('Take as directed'),
    })
  ).default([]),
  followUpSchedule: z.string().default('As needed'),
  summary: z.string().min(1, 'Summary required'),
  disclaimer: z.string().min(1, 'Disclaimer required'),
});

export type PostVisitSummary = z.infer<typeof PostVisitSummarySchema>;

export interface AiInvokeOptions {
  appointmentId?: string;
  patientId?: string;
  doctorId?: string;
  overrideProvider?: 'openai' | 'test' | 'mock';
  testOutput?: PreVisitSummary | PostVisitSummary;
}

export interface AiGenerationResult<T> {
  success: boolean;
  data: T | null;
  provider: string;
  model: string;
  promptVersion: string;
  latencyMs: number;
  tokensUsed: { prompt: number; completion: number };
  requestId?: string;
  error?: string;
}
