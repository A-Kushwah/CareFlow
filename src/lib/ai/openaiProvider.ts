import OpenAI from 'openai';
import { PreVisitSummary, PreVisitSummarySchema, PostVisitSummary, PostVisitSummarySchema, DoctorPrescription } from './types';

const provider = (process.env.LLM_PROVIDER || 'mock').toLowerCase();
const isGroq = provider === 'groq';
const apiKey = isGroq ? process.env.GROQ_API_KEY : process.env.OPENAI_API_KEY;

export const openaiClient = apiKey
  ? new OpenAI({
      apiKey,
      baseURL: process.env.OPENAI_BASE_URL || (isGroq ? 'https://api.groq.com/openai/v1' : undefined),
    })
  : null;

const MODEL = isGroq
  ? (process.env.GROQ_MODEL || 'llama-3.3-70b-versatile')
  : (process.env.OPENAI_MODEL || 'gpt-4o-mini');
const TIMEOUT_MS = parseInt(process.env.OPENAI_TIMEOUT_MS || '10000', 10);

export function validateAiProviderConfig(): { valid: boolean; provider: string; error?: string } {
  const configuredProvider = (process.env.LLM_PROVIDER || 'mock').toLowerCase();
  if (configuredProvider === 'openai' && !process.env.OPENAI_API_KEY) {
    return { valid: false, provider: configuredProvider, error: 'OPENAI_API_KEY environment variable is missing' };
  }
  if (configuredProvider === 'groq' && !process.env.GROQ_API_KEY) {
    return { valid: false, provider: configuredProvider, error: 'GROQ_API_KEY environment variable is missing' };
  }
  return { valid: true, provider: configuredProvider };
}

export function redactPHI(text: string): string {
  return text.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[REDACTED_EMAIL]')
             .replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[REDACTED_PHONE]');
}

// ----------------------------------------------------------------------
// STRICT OPENAI JSON SCHEMAS FOR STRUCTURED OUTPUTS
// ----------------------------------------------------------------------
const PreVisitJsonSchema = {
  name: "pre_visit_triage",
  strict: true,
  schema: {
    type: "object",
    properties: {
      urgencyLevel: { type: "string", enum: ["Low", "Medium", "High"] },
      chiefComplaint: { type: "string" },
      suggestedQuestions: {
        type: "array",
        items: { type: "string" },
        minItems: 3,
        maxItems: 3
      },
      redFlagsIdentified: {
        type: "array",
        items: { type: "string" }
      },
      summary: { type: "string" },
      disclaimer: { type: "string" }
    },
    required: ["urgencyLevel", "chiefComplaint", "suggestedQuestions", "redFlagsIdentified", "summary", "disclaimer"],
    additionalProperties: false
  }
};

const PostVisitJsonSchema = {
  name: "post_visit_summary",
  strict: true,
  schema: {
    type: "object",
    properties: {
      patientInstructions: {
        type: "array",
        items: { type: "string" }
      },
      medicationSummary: {
        type: "array",
        items: {
          type: "object",
          properties: {
            medication: { type: "string" },
            dosage: { type: "string" },
            frequency: { type: "string" },
            duration: { type: "string" },
            instructions: { type: "string" }
          },
          required: ["medication", "dosage", "frequency", "duration", "instructions"],
          additionalProperties: false
        }
      },
      followUpSchedule: { type: "string" },
      summary: { type: "string" },
      disclaimer: { type: "string" }
    },
    required: ["patientInstructions", "medicationSummary", "followUpSchedule", "summary", "disclaimer"],
    additionalProperties: false
  }
};

export async function callOpenAiPreVisit(symptoms: string): Promise<{
  data: PreVisitSummary;
  model: string;
  latencyMs: number;
  tokens: { prompt: number; completion: number };
  requestId?: string;
}> {
  if (!openaiClient) {
    throw new Error('OPENAI_API_KEY is not configured on the server');
  }

  const startTime = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const promptText = `Analyze the following patient symptoms for visit preparation only:
"${symptoms.slice(0, 2000)}"

Provide exactly 3 clinical questions to help organize the patient consultation.`;

  try {
    const response = await openaiClient.chat.completions.create(
      {
        model: MODEL,
        messages: [
          { role: 'system', content: 'You format clinical intake summaries using strict JSON Schema outputs.' },
          { role: 'user', content: promptText },
        ],
        response_format: process.env.OPENAI_BASE_URL || isGroq
          ? { type: 'json_object' }
          : {
              type: 'json_schema',
              json_schema: PreVisitJsonSchema,
            },
        temperature: 0.2,
      },
      { signal: controller.signal }
    );

    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;
    const content = response.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(content);
    const validated = PreVisitSummarySchema.parse(parsed);

    return {
      data: validated,
      model: MODEL,
      latencyMs,
      tokens: {
        prompt: response.usage?.prompt_tokens || 0,
        completion: response.usage?.completion_tokens || 0,
      },
      requestId: response.id,
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error(`OpenAI request timed out after ${TIMEOUT_MS}ms`);
    }
      throw new Error(`${isGroq ? 'Groq' : 'OpenAI'} Pre-Visit Provider Error: ${err.message}`);
  }
}

export async function callOpenAiPostVisit(
  notes: string,
  followUpInstructions = '',
  prescriptions: DoctorPrescription[] = []
): Promise<{
  data: PostVisitSummary;
  model: string;
  latencyMs: number;
  tokens: { prompt: number; completion: number };
  requestId?: string;
}> {
  if (!openaiClient) {
    throw new Error('OPENAI_API_KEY is not configured on the server');
  }

  const startTime = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const formattedMeds = prescriptions.length > 0
    ? prescriptions.map((p, idx) => `${idx + 1}. ${p.medication} - Dosage: ${p.dosage}, Frequency: ${p.frequency}, Duration: ${p.duration}, Instructions: ${p.instructions || 'None'}`).join('\n')
    : 'None prescribed by clinician.';

  const promptText = `Summarize the clinician-entered consultation details below for patient follow-up.

CRITICAL CLINICAL BOUNDARIES:
1. Summarize ONLY the doctor-entered consultation notes and follow-up instructions.
2. Explain ONLY the doctor-authored prescriptions listed below. Preserve medication names, dosage, frequency, duration, and instructions EXACTLY as authored by the doctor.
3. NEVER diagnose independently.
4. NEVER create, add, alter, or remove any medication, dosage, frequency, or duration.
5. NEVER invent a medication or treatment.

Doctor Consultation Notes:
"${notes.slice(0, 2000)}"

Doctor Follow-Up Instructions:
"${(followUpInstructions || 'Follow up as needed.').slice(0, 1000)}"

Doctor-Authored Prescriptions:
${formattedMeds}`;

  try {
    const response = await openaiClient.chat.completions.create(
      {
        model: MODEL,
        messages: [
          {
            role: 'system',
            content: 'You format clinical consultation summaries using strict JSON Schema outputs. You never invent, alter, or omit doctor-authored prescriptions.'
          },
          { role: 'user', content: promptText },
        ],
        response_format: process.env.OPENAI_BASE_URL || isGroq
          ? { type: 'json_object' }
          : {
              type: 'json_schema',
              json_schema: PostVisitJsonSchema,
            },
        temperature: 0.1,
      },
      { signal: controller.signal }
    );

    clearTimeout(timeoutId);
    const latencyMs = Date.now() - startTime;
    const content = response.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(content);
    const validated = PostVisitSummarySchema.parse(parsed);

    return {
      data: validated,
      model: MODEL,
      latencyMs,
      tokens: {
        prompt: response.usage?.prompt_tokens || 0,
        completion: response.usage?.completion_tokens || 0,
      },
      requestId: response.id,
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error(`OpenAI request timed out after ${TIMEOUT_MS}ms`);
    }
      throw new Error(`${isGroq ? 'Groq' : 'OpenAI'} Post-Visit Provider Error: ${err.message}`);
  }
}
