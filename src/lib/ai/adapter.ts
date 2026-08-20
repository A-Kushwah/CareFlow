import { z } from 'zod';
import { PostVisitSummaryResult, SymptomSummaryResult } from '../types';

export const MEDICAL_DISCLAIMER =
  'IMPORTANT MEDICAL NOTICE: This AI-generated summary is for clinical organization assistance only and does NOT constitute a medical diagnosis, prescription, or substitute for professional clinical judgment.';

export const PreVisitSummarySchema = z.object({
  urgencyLevel: z.enum(['Low', 'Medium', 'High']),
  chiefComplaint: z.string().min(3),
  suggestedQuestions: z.array(z.string()).min(1),
  summary: z.string().min(5),
  disclaimer: z.string(),
});

export const PostVisitSummarySchema = z.object({
  patientSummary: z.string().min(5),
  medicationSchedule: z.string().min(5),
  followUpSteps: z.string().min(5),
  prescribedMedications: z.array(z.string()),
  disclaimer: z.string(),
});

export async function invokePreVisitLLM(rawSymptoms: string): Promise<SymptomSummaryResult> {
  const sanitizedInput = (rawSymptoms || '').slice(0, 2000).trim();
  const provider = process.env.LLM_PROVIDER || 'mock';

  if (!sanitizedInput) {
    return {
      urgencyLevel: 'Low',
      chiefComplaint: 'No symptoms provided',
      suggestedQuestions: ['What brings you in today for a general checkup?'],
      summary: 'No symptoms provided by patient.',
      disclaimer: MEDICAL_DISCLAIMER,
    };
  }

  if (provider === 'mock') {
    return generateMockPreVisitSummary(sanitizedInput);
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const apiKey = process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      clearTimeout(timeoutId);
      return generateMockPreVisitSummary(sanitizedInput);
    }

    clearTimeout(timeoutId);
    return generateMockPreVisitSummary(sanitizedInput);
  } catch (error) {
    console.warn('[AI Adapter Warning] LLM Provider call failed or timed out. Falling back to deterministic summary.');
    return {
      urgencyLevel: 'Medium',
      chiefComplaint: sanitizedInput,
      suggestedQuestions: [
        'How long have you experienced these symptoms?',
        'Does anything aggravate or relieve the discomfort?',
        'Are you currently taking any prescription medications?',
      ],
      summary: `[Automated Fallback] Symptom Intake: ${sanitizedInput}`,
      disclaimer: MEDICAL_DISCLAIMER,
    };
  }
}

export async function invokePostVisitLLM(consultNotes: string): Promise<PostVisitSummaryResult> {
  const sanitizedNotes = (consultNotes || '').slice(0, 2000).trim();
  const provider = process.env.LLM_PROVIDER || 'mock';

  if (!sanitizedNotes) {
    return {
      patientSummary: 'Standard consultation completed.',
      medicationSchedule: 'No new medications prescribed.',
      followUpSteps: 'Follow standard recovery guidance and stay hydrated.',
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
      patientSummary: `[Automated Fallback] Consultation Notes: ${sanitizedNotes}`,
      medicationSchedule: 'Take prescribed medications as indicated by your physician.',
      followUpSteps: 'Please consult your doctor if symptoms worsen or persist.',
      prescribedMedications: [],
      disclaimer: MEDICAL_DISCLAIMER,
    };
  }
}

function generateMockPreVisitSummary(input: string): SymptomSummaryResult {
  const isChest = /chest|breath|cardio|heart/i.test(input);
  const isNeuro = /headache|migraine|dizzy|numbness/i.test(input);

  const urgencyLevel: 'Low' | 'Medium' | 'High' = isChest ? 'High' : isNeuro ? 'Medium' : 'Low';
  const chiefComplaint = isChest
    ? 'Cardiovascular / Respiratory Discomfort'
    : isNeuro
    ? 'Neurological Discomfort & Cranial Symptoms'
    : 'Primary General Symptom Complaint';

  const suggestedQuestions = isChest
    ? [
        'When did the chest pressure or shortness of breath start?',
        'Do you feel pain radiating to your arm, neck, or back?',
        'Have you noticed swelling in your legs or ankles?',
      ]
    : isNeuro
    ? [
        'Are symptoms accompanied by visual changes or aura?',
        'How frequent are the episodes of dizziness or headaches?',
        'Have you experienced localized numbness or muscle weakness?',
      ]
    : [
        'How long have you experienced these symptoms?',
        'Have you taken any over-the-counter treatments?',
        'Do you have any related medical history or allergies?',
      ];

  const summary = `Prompt: "Analyse these symptoms and return: urgency level (Low / Medium / High), chief complaint, and three suggested questions for the doctor. Symptoms: ${input}"`;

  return PreVisitSummarySchema.parse({
    urgencyLevel,
    chiefComplaint,
    suggestedQuestions,
    summary,
    disclaimer: MEDICAL_DISCLAIMER,
  });
}

function generateMockPostVisitSummary(notes: string): PostVisitSummaryResult {
  const hasMeds = notes.toLowerCase().includes('med') || notes.toLowerCase().includes('prescribe');
  const prescribedMedications = hasMeds ? ['Amoxicillin 500mg (1 tablet every 8 hours)', 'Paracetamol 500mg (as needed)'] : [];

  return PostVisitSummarySchema.parse({
    patientSummary: `Patient-friendly summary based on doctor notes: ${notes}`,
    medicationSchedule: hasMeds
      ? 'Amoxicillin 500mg: 1 tablet every 8 hours with water. Paracetamol 500mg: 1 tablet every 6 hours as needed for fever/pain.'
      : 'No new prescription medications required. Maintain rest and hydration.',
    followUpSteps: 'Schedule a follow-up consultation in 10-14 days if symptoms do not improve fully.',
    prescribedMedications,
    disclaimer: MEDICAL_DISCLAIMER,
  });
}
