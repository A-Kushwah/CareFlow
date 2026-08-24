import crypto from 'crypto';
import { prisma } from '../prisma';
import {
  PreVisitSummary,
  PreVisitSummarySchema,
  PostVisitSummary,
  PostVisitSummarySchema,
  DoctorPrescription,
  AiInvokeOptions,
} from './types';
import { callOpenAiPreVisit, callOpenAiPostVisit, redactPHI, validateAiProviderConfig } from './openaiProvider';

const PROMPT_VERSION = '1.0';

const rateLimitMap = new Map<string, number[]>();

export async function checkAiRateLimitPersistent(key: string, limit = 10, windowMs = 60000): Promise<boolean> {
  const now = Date.now();
  const windowStart = new Date(now - windowMs);

  const timestamps = (rateLimitMap.get(key) || []).filter((t) => now - t < windowMs);
  if (timestamps.length >= limit) {
    return false;
  }

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
  const config = validateAiProviderConfig();
  const provider = options.overrideProvider || config.provider;

  if (['openai', 'groq'].includes(provider) && !config.valid) {
    throw new Error(`AI Provider Configuration Error: ${config.error}`);
  }

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
    if (['openai', 'groq'].includes(provider)) {
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
      latencyMs = Date.now() - startTime;
      modelName = 'mock-clinical-triage-v1';
      const isUrgent = /chest pain|shortness of breath|severe bleeding|fainting|stroke/i.test(symptoms);
      const isEndocrine = /blood sugar|glucose|diabetes|thirst|frequent urination|blood pressure|hypertension/i.test(symptoms);

      let summaryText = '';
      if (isEndocrine) {
        summaryText = `Patient reports ${redactPHI(truncatedSymptoms.slice(0, 150))}. Clinical triage notes: Indicates potential cardiovascular and metabolic dysregulation. Recommend pre-visit evaluation of home glucose and blood pressure logs, baseline HbA1c, and renal/metabolic panel.`;
      } else if (isUrgent) {
        summaryText = `Patient reports acute symptom pattern: ${redactPHI(truncatedSymptoms.slice(0, 150))}. High triage priority. Immediate clinical assessment recommended: baseline ECG, vitals monitoring, and targeted cardiovascular/respiratory examination.`;
      } else {
        summaryText = `Patient reports chief complaint: ${redactPHI(truncatedSymptoms.slice(0, 150))}. Routine triage classification. Recommended focus: take targeted clinical history, evaluate onset and severity, and review relevant medical history.`;
      }

      resultData = {
        urgencyLevel: isUrgent ? 'High' : isEndocrine ? 'Medium' : 'Low',
        chiefComplaint: isUrgent ? 'Urgent Symptom Complaint' : isEndocrine ? 'Cardiovascular & Endocrine Evaluation' : 'General Symptom Evaluation',
        suggestedQuestions: [
          'When did these symptoms first manifest?',
          'Have you experienced similar symptoms before?',
          'Do you have relevant medical history or allergies?',
        ],
        redFlagsIdentified: isUrgent ? ['Potentially severe symptom pattern detected'] : [],
        summary: summaryText,
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

    console.warn(`[AI PROVIDER WARNING] Live AI provider '${provider}' error (${errorReason}). Generating structured deterministic fallback...`);

    const isUrgent = /chest pain|shortness of breath|severe bleeding|fainting|stroke/i.test(symptoms);
    const isEndocrine = /blood sugar|glucose|diabetes|thirst|frequent urination|blood pressure|hypertension/i.test(symptoms);

    let summaryText = '';
    if (isEndocrine) {
      summaryText = `Patient reports ${redactPHI(truncatedSymptoms.slice(0, 150))}. Indicates potential cardiovascular and metabolic dysregulation. Recommend pre-visit evaluation of home glucose and blood pressure logs, baseline HbA1c, and renal/metabolic panel.`;
    } else if (isUrgent) {
      summaryText = `Patient reports acute symptom pattern: ${redactPHI(truncatedSymptoms.slice(0, 150))}. High triage priority. Immediate clinical assessment recommended: baseline ECG, vitals monitoring, and targeted examination.`;
    } else {
      summaryText = `Patient reports chief complaint: ${redactPHI(truncatedSymptoms.slice(0, 150))}. Routine triage classification. Recommended focus: take targeted clinical history, evaluate onset and severity, and review relevant medical history.`;
    }

    resultData = {
      urgencyLevel: isUrgent ? 'High' : isEndocrine ? 'Medium' : 'Low',
      chiefComplaint: isUrgent ? 'Urgent Symptom Complaint' : isEndocrine ? 'Cardiovascular & Endocrine Evaluation' : 'General Symptom Evaluation',
      suggestedQuestions: [
        'When did these symptoms first manifest?',
        'Have you experienced similar symptoms before?',
        'Do you have relevant medical history or allergies?',
      ],
      redFlagsIdentified: isUrgent ? ['Potentially severe symptom pattern detected'] : [],
      summary: summaryText,
      disclaimer: 'AI-generated preparation notes help organize the consultation. They are not a diagnosis or medical advice.',
    };
    modelName = `${provider}-fallback`;
  }

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
  arg2?: string | DoctorPrescription[] | AiInvokeOptions,
  arg3?: DoctorPrescription[] | AiInvokeOptions,
  arg4?: AiInvokeOptions
): Promise<{ summary: PostVisitSummary; provider: string; model: string; auditId?: string }> {
  let followUpInstructions = '';
  let prescriptions: DoctorPrescription[] = [];
  let options: AiInvokeOptions = {};

  if (typeof arg2 === 'string') {
    followUpInstructions = arg2;
    if (Array.isArray(arg3)) {
      prescriptions = arg3;
      if (arg4 && typeof arg4 === 'object') options = arg4;
    } else if (arg3 && typeof arg3 === 'object') {
      options = arg3;
    }
  } else if (Array.isArray(arg2)) {
    prescriptions = arg2;
    if (arg3 && typeof arg3 === 'object' && !Array.isArray(arg3)) options = arg3;
  } else if (arg2 && typeof arg2 === 'object') {
    options = arg2;
  }

  const config = validateAiProviderConfig();
  const provider = options.overrideProvider || config.provider;

  if (provider === 'openai' && !config.valid) {
    throw new Error(`AI Provider Configuration Error: ${config.error}`);
  }

  const truncatedNotes = consultationNotes.slice(0, 2000);
  const compositeInput = `${truncatedNotes} | ${followUpInstructions} | ${JSON.stringify(prescriptions)}`;
  const inputHash = hashInput(compositeInput);
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
      const openAiRes = await callOpenAiPostVisit(truncatedNotes, followUpInstructions, prescriptions);
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
          patientInstructions: [followUpInstructions || 'Follow doctor notes as discussed during consultation.'],
          medicationSummary: prescriptions.map((p) => ({
            medication: p.medication,
            dosage: p.dosage,
            frequency: p.frequency,
            duration: p.duration,
            instructions: p.instructions || 'Take as directed',
          })),
          followUpSchedule: followUpInstructions || 'As needed',
          summary: 'Test provider post-visit summary.',
          disclaimer: 'AI-generated consultation summaries organize clinical instructions only. Refer directly to clinician advice.',
        };
      }
    } else {
      // Mock provider: strictly uses provided prescriptions
      latencyMs = Date.now() - startTime;
      modelName = 'mock-clinical-postvisit-v1';

      const medsSummary = prescriptions.map((p) => ({
        medication: p.medication,
        dosage: p.dosage,
        frequency: p.frequency,
        duration: p.duration,
        instructions: p.instructions || 'Take with food and complete full course',
      }));

      resultData = {
        patientInstructions: [
          followUpInstructions || 'Rest, drink fluids, and follow clinician recommendations.',
          'Contact the clinic if symptoms worsen or fail to improve.',
        ],
        medicationSummary: medsSummary,
        followUpSchedule: followUpInstructions || 'As needed',
        summary: `Clinical Summary based on consultation notes: ${redactPHI(truncatedNotes.slice(0, 150))}`,
        disclaimer: 'AI-generated consultation summaries organize clinical instructions only. Refer directly to clinician advice.',
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

    console.warn(`[AI PROVIDER WARNING] Live AI post-visit provider '${provider}' error (${errorReason}). Generating structured deterministic fallback...`);

    const medsSummary = prescriptions.map((p) => ({
      medication: p.medication,
      dosage: p.dosage,
      frequency: p.frequency,
      duration: p.duration,
      instructions: p.instructions || 'Take with food and complete full course',
    }));

    resultData = {
      patientInstructions: [
        followUpInstructions || 'Rest, drink fluids, and follow clinician recommendations.',
        'Contact the clinic if symptoms worsen or fail to improve.',
      ],
      medicationSummary: medsSummary,
      followUpSchedule: followUpInstructions || 'As needed',
      summary: `Clinical Summary based on consultation notes: ${redactPHI(truncatedNotes.slice(0, 150))}`,
      disclaimer: 'AI-generated consultation summaries organize clinical instructions only. Refer directly to clinician advice.',
    };
    modelName = `${provider}-fallback`;
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
