import { z } from 'zod';

export const PreVisitSummarySchema = z.object({
  urgencyLevel: z.enum(['Low', 'Medium', 'High']),
  chiefComplaint: z.string().min(1),
  suggestedQuestions: z.array(z.string()).min(1),
  redFlagsIdentified: z.array(z.string()).default([]),
  summary: z.string(),
  disclaimer: z.string(),
});

export type PreVisitSummary = z.infer<typeof PreVisitSummarySchema>;

export const PostVisitSummarySchema = z.object({
  patientInstructions: z.array(z.string()).min(1),
  medicationSummary: z.array(
    z.object({
      medication: z.string(),
      dosage: z.string(),
      frequency: z.string(),
      instructions: z.string().optional(),
    })
  ).default([]),
  followUpSchedule: z.string().default('As needed'),
  summary: z.string(),
  disclaimer: z.string(),
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
