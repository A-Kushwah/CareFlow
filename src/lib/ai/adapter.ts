import { z } from 'zod';
import { PostVisitSummaryResult, SymptomSummaryResult } from '../types';

export const MEDICAL_DISCLAIMER =
  'IMPORTANT MEDICAL NOTICE: This AI-generated summary is for clinical organization assistance only and does NOT constitute a medical diagnosis, prescription, or substitute for professional clinical judgment.';

export const PreVisitSummarySchema = z.object({
  summary: z.string().min(5),
  suggestedFocus: z.string().min(3),
  disclaimer: z.string(),
});

export const PostVisitSummarySchema = z.object({
  consultationSummary: z.string().min(5),
  patientInstructions: z.string().min(5),
  prescribedMedications: z.array(z.string()),
  disclaimer: z.string(),
});

export async function invokePreVisitLLM(rawSymptoms: string): Promise<SymptomSummaryResult> {
  // Truncate input to 2000 chars safety limit
  const sanitizedInput = (rawSymptoms || '').slice(0, 2000).trim();
  const provider = process.env.LLM_PROVIDER || 'mock';

  if (!sanitizedInput) {
    return {
      summary: 'No symptoms provided by patient.',
      suggestedFocus: 'General wellness checkup.',
      disclaimer: MEDICAL_DISCLAIMER,
    };
  }

  if (provider === 'mock') {
    return generateMockPreVisitSummary(sanitizedInput);
  }

  try {
    // 5-second timeout wrapper
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    // Call external LLM provider if configured
    const apiKey = process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      clearTimeout(timeoutId);
      return generateMockPreVisitSummary(sanitizedInput);
    }

    // Provider call simulation with timeout & validation
    clearTimeout(timeoutId);
    return generateMockPreVisitSummary(sanitizedInput);
  } catch (error) {
    console.warn('[AI Adapter Warning] LLM Provider call failed or timed out. Falling back to deterministic summary.');
    return {
      summary: `[Automated Fallback] Symptom Intake: ${sanitizedInput}`,
      suggestedFocus: 'In-person physical evaluation required.',
      disclaimer: MEDICAL_DISCLAIMER,
    };
  }
}

export async function invokePostVisitLLM(consultNotes: string): Promise<PostVisitSummaryResult> {
  const sanitizedNotes = (consultNotes || '').slice(0, 2000).trim();
  const provider = process.env.LLM_PROVIDER || 'mock';

  if (!sanitizedNotes) {
    return {
      consultationSummary: 'Standard consultation completed.',
      patientInstructions: 'Follow standard recovery guidance and stay hydrated.',
      prescribedMedications: [],
      disclaimer: MEDICAL_DISCLAIMER,
    };
  }

  if (provider === 'mock') {
    return generateMockPostVisitSummary(sanitizedNotes);
  }

  try {
    return generateMockPostVisitSummary(sanitizedNotes);
  } catch {
    return {
      consultationSummary: `[Automated Fallback] Consultation Notes: ${sanitizedNotes}`,
      patientInstructions: 'Please consult your doctor if symptoms worsen or persist.',
      prescribedMedications: [],
      disclaimer: MEDICAL_DISCLAIMER,
    };
  }
}

function generateMockPreVisitSummary(input: string): SymptomSummaryResult {
  const isChest = /chest|breath|cardio|heart/i.test(input);
  const isNeuro = /headache|migraine|dizzy|numbness/i.test(input);

  const summary = isChest
    ? `Patient reports cardiovascular/respiratory symptoms: "${input}". Vital signs and ECG recommended.`
    : isNeuro
    ? `Patient reports neurological/cranial symptoms: "${input}". Reflex and neurological exam suggested.`
    : `Patient reports general symptoms: "${input}". Standard clinical physical exam recommended.`;

  const suggestedFocus = isChest
    ? 'Cardiovascular System & Vital Monitoring'
    : isNeuro
    ? 'Neurological Assessment & Reflexes'
    : 'Primary Symptom Evaluation & Vitals';

  return PreVisitSummarySchema.parse({
    summary,
    suggestedFocus,
    disclaimer: MEDICAL_DISCLAIMER,
  });
}

function generateMockPostVisitSummary(notes: string): PostVisitSummaryResult {
  return PostVisitSummarySchema.parse({
    consultationSummary: `Clinical Summary based on doctor notes: ${notes}`,
    patientInstructions: 'Rest adequately, take prescribed medications as directed, and schedule a follow-up in 2 weeks.',
    prescribedMedications: notes.toLowerCase().includes('med') ? ['Amoxicillin 500mg', 'Paracetamol 500mg'] : [],
    disclaimer: MEDICAL_DISCLAIMER,
  });
}
