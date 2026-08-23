import crypto from 'crypto';
import { prisma } from '../prisma';
import {
  PreVisitSummary,
  PreVisitSummarySchema,
  PostVisitSummary,
  PostVisitSummarySchema,
  AiInvokeOptions,
} from './types';
import { callOpenAiPreVisit, callOpenAiPostVisit, redactPHI, validateAiProviderConfig } from './openaiProvider';

const PROMPT_VERSION = '1.0';

// In-Memory sliding window rate limiter
const rateLimitMap = new Map<string, number[]>();

export async function checkAiRateLimitPersistent(key: string, limit = 10, windowMs = 60000): Promise<boolean> {
  const now = Date.now();
  const windowStart = new Date(now - windowMs);

  // 1. Check in-memory sliding window
  const timestamps = (rateLimitMap.get(key) || []).filter((t) => now - t < windowMs);
  if (timestamps.length >= limit) {
    return false;
  }

  // 2. Check persistent database log entries if table exists
  try {
    if ((prisma as any).aiGenerationLog) {
      const recentDbLogsCount = await (prisma as any).aiGenerationLog.count({
        where: {
          OR: [{ patientId: key }, { doctorId: key }],
          createdAt: { gte: windowStart },
        },
      });

      if (recentDbLogsCount >= limit) {
        return false;
      }
    }
  } catch {
    // Ignore DB errors if DB table is uninitialized
  }

  timestamps.push(now);
  rateLimitMap.set(key, timestamps);
  return true;
}

export function hashInput(text: string): string {
  return crypto.createHash('sha256').update(text.trim().toLowerCase()).digest('hex').slice(0, 16);
}

// Helper to safely persist audit logs without throwing if Prisma client is regenerating
async function safeCreateAuditLog(data: any): Promise<string | undefined> {
  try {
    if ((prisma as any).aiGenerationLog) {
      const record = await (prisma as any).aiGenerationLog.create({ data });
      return record?.id;
    }
  } catch (e) {
    console.warn('[AI AUDIT LOG WARNING] Could not persist AiGenerationLog record:', (e as any)?.message);
  }
  return undefined;
}

// ----------------------------------------------------------------------
// PRE-VISIT INTAKE AI ADAPTER
// ----------------------------------------------------------------------
export async function invokePreVisitLLM(
  symptoms: string,
  options: AiInvokeOptions = {}
): Promise<{ summary: PreVisitSummary; provider: string; model: string; auditId?: string }> {
  // Validate startup configuration
  const config = validateAiProviderConfig();
  if (!config.valid) {
    throw new Error(`AI Provider Configuration Error: ${config.error}`);
  }

  const provider = options.overrideProvider || config.provider;
  const truncatedSymptoms = symptoms.slice(0, 2000);
  const inputHash = hashInput(truncatedSymptoms);
  const startTime = Date.now();

  const rateLimitKey = options.patientId || 'anonymous-previsit';
  const allowed = await checkAiRateLimitPersistent(rateLimitKey);
  if (!allowed) {
    throw new Error('AI rate limit exceeded. Please wait 1 minute before submitting another request.');
  }

  let resultData: PreVisitSummary | null = null;
  let modelName = 'mock-v1';
  let latencyMs = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let requestId: string | undefined;

  try {
    if (provider === 'openai') {
      const openAiRes = await callOpenAiPreVisit(truncatedSymptoms);
      resultData = openAiRes.data;
      modelName = openAiRes.model;
      latencyMs = openAiRes.latencyMs;
      promptTokens = openAiRes.tokens.prompt;
      completionTokens = openAiRes.tokens.completion;
      requestId = openAiRes.requestId;
    } else if (provider === 'test') {
      latencyMs = Date.now() - startTime;
      modelName = 'test-provider-v1';
      if (options.testOutput) {
        resultData = PreVisitSummarySchema.parse(options.testOutput);
      } else {
        resultData = {
          urgencyLevel: 'Low',
          chiefComplaint: 'Automated test symptom evaluation',
          suggestedQuestions: [
            'How long have you experienced these symptoms?',
            'Have you tried any over-the-counter treatments?',
            'Do you have relevant medical history or allergies?',
          ],
          redFlagsIdentified: [],
          summary: 'Test provider symptom summary.',
          disclaimer: 'AI-generated preparation notes help organize the consultation. They are not a diagnosis or medical advice.',
        };
      }
    } else {
      // Mock provider for offline development
      latencyMs = Date.now() - startTime;
      modelName = 'mock-clinical-triage-v1';
      const isUrgent = /chest pain|shortness of breath|severe bleeding|fainting/i.test(symptoms);
      resultData = {
        urgencyLevel: isUrgent ? 'High' : 'Low',
        chiefComplaint: isUrgent ? 'Urgent Symptom Complaint' : 'General Symptom Evaluation',
        suggestedQuestions: [
          'When did these symptoms first manifest?',
          'Have you experienced similar symptoms before?',
          'Do you have relevant medical history or allergies?',
        ],
        redFlagsIdentified: isUrgent ? ['Potentially severe symptom pattern detected'] : [],
        summary: `Pre-visit preparation notes generated for symptom pattern: ${redactPHI(truncatedSymptoms.slice(0, 100))}`,
        disclaimer: 'AI-generated preparation notes help organize the consultation. They are not a diagnosis or medical advice.',
      };
    }
  } catch (err: any) {
    latencyMs = Date.now() - startTime;
    const errorReason = err.message || 'LLM provider failure';

    await safeCreateAuditLog({
      appointmentId: options.appointmentId || null,
      patientId: options.patientId || null,
      doctorId: options.doctorId || null,
      action: 'PRE_VISIT',
      provider,
      model: modelName,
      promptVersion: PROMPT_VERSION,
      status: 'FAILED',
      latencyMs,
      inputHash,
      outputJson: JSON.stringify({ error: errorReason }),
      errorReason,
    });

    if (provider === 'openai') {
      throw new Error(`Live AI Provider Error: ${errorReason}`);
    } else {
      throw err;
    }
  }

  // Persist Audit Record safely
  const auditId = await safeCreateAuditLog({
    appointmentId: options.appointmentId || null,
    patientId: options.patientId || null,
    doctorId: options.doctorId || null,
    action: 'PRE_VISIT',
    provider,
    model: modelName,
    promptVersion: PROMPT_VERSION,
    status: 'SUCCESS',
    requestId: requestId || null,
    latencyMs,
    promptTokens,
    completionTokens,
    inputHash,
    outputJson: JSON.stringify(resultData),
  });

  return {
    summary: resultData!,
    provider,
    model: modelName,
    auditId,
  };
}

// ----------------------------------------------------------------------
// POST-VISIT CLINICAL AI ADAPTER
// ----------------------------------------------------------------------
export async function invokePostVisitLLM(
  consultationNotes: string,
  options: AiInvokeOptions = {}
): Promise<{ summary: PostVisitSummary; provider: string; model: string; auditId?: string }> {
  const config = validateAiProviderConfig();
  if (!config.valid) {
    throw new Error(`AI Provider Configuration Error: ${config.error}`);
  }

  const provider = options.overrideProvider || config.provider;
  const truncatedNotes = consultationNotes.slice(0, 2000);
  const inputHash = hashInput(truncatedNotes);
  const startTime = Date.now();

  const rateLimitKey = options.doctorId || 'anonymous-postvisit';
  const allowed = await checkAiRateLimitPersistent(rateLimitKey);
  if (!allowed) {
    throw new Error('AI rate limit exceeded. Please wait 1 minute before submitting another request.');
  }

  let resultData: PostVisitSummary | null = null;
  let modelName = 'mock-v1';
  let latencyMs = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let requestId: string | undefined;

  try {
    if (provider === 'openai') {
      const openAiRes = await callOpenAiPostVisit(truncatedNotes);
      resultData = openAiRes.data;
      modelName = openAiRes.model;
      latencyMs = openAiRes.latencyMs;
      promptTokens = openAiRes.tokens.prompt;
      completionTokens = openAiRes.tokens.completion;
      requestId = openAiRes.requestId;
    } else if (provider === 'test') {
      latencyMs = Date.now() - startTime;
      modelName = 'test-provider-v1';
      if (options.testOutput) {
        resultData = PostVisitSummarySchema.parse(options.testOutput);
      } else {
        resultData = {
          patientInstructions: ['Follow doctor notes as discussed during consultation.'],
          medicationSummary: [],
          followUpSchedule: 'As needed',
          summary: 'Test provider post-visit summary.',
          disclaimer: 'AI-generated consultation summaries organize clinical instructions only. Refer to direct doctor advice.',
        };
      }
    } else {
      // Mock provider: Summarizes ONLY provided notes without inventing non-existent medications
      latencyMs = Date.now() - startTime;
      modelName = 'mock-clinical-postvisit-v1';

      const meds: any[] = [];
      const amoxMatch = truncatedNotes.match(/amoxicillin\s*(\d+mg)?/i);
      if (amoxMatch) {
        meds.push({
          medication: 'Amoxicillin',
          dosage: amoxMatch[1] || '500mg',
          frequency: 'As prescribed by physician',
          instructions: 'Take with food and complete full course',
        });
      }

      resultData = {
        patientInstructions: [
          'Rest and drink plenty of fluids.',
          'Contact the clinic if symptoms worsen or fail to improve.',
        ],
        medicationSummary: meds,
        followUpSchedule: truncatedNotes.toLowerCase().includes('2 weeks') ? 'In 2 weeks' : 'As needed',
        summary: `Clinical Summary based on consultation notes: ${redactPHI(truncatedNotes.slice(0, 150))}`,
        disclaimer: 'AI-generated consultation summaries organize clinical instructions only. Refer to direct doctor advice.',
      };
    }
  } catch (err: any) {
    latencyMs = Date.now() - startTime;
    const errorReason = err.message || 'LLM provider failure';

    await safeCreateAuditLog({
      appointmentId: options.appointmentId || null,
      patientId: options.patientId || null,
      doctorId: options.doctorId || null,
      action: 'POST_VISIT',
      provider,
      model: modelName,
      promptVersion: PROMPT_VERSION,
      status: 'FAILED',
      latencyMs,
      inputHash,
      outputJson: JSON.stringify({ error: errorReason }),
      errorReason,
    });

    if (provider === 'openai') {
      throw new Error(`Live AI Provider Error: ${errorReason}`);
    } else {
      throw err;
    }
  }

  const auditId = await safeCreateAuditLog({
    appointmentId: options.appointmentId || null,
    patientId: options.patientId || null,
    doctorId: options.doctorId || null,
    action: 'POST_VISIT',
    provider,
    model: modelName,
    promptVersion: PROMPT_VERSION,
    status: 'SUCCESS',
    requestId: requestId || null,
    latencyMs,
    promptTokens,
    completionTokens,
    inputHash,
    outputJson: JSON.stringify(resultData),
  });

  return {
    summary: resultData!,
    provider,
    model: modelName,
    auditId,
  };
}
