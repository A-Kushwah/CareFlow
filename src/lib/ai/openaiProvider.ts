import OpenAI from 'openai';
import { PreVisitSummary, PreVisitSummarySchema, PostVisitSummary, PostVisitSummarySchema } from './types';

const apiKey = process.env.OPENAI_API_KEY;

export const openaiClient = apiKey
  ? new OpenAI({ apiKey })
  : null;

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const TIMEOUT_MS = 10000;

export function redactPHI(text: string): string {
  // Simple PHI logger redaction to prevent patient data leaks in log streams
  return text.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[REDACTED_EMAIL]')
             .replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[REDACTED_PHONE]');
}

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

  const promptText = `You are a clinical intake assistant for a medical practice.
Analyze the following patient symptoms for visit preparation only:
"${symptoms.slice(0, 2000)}"

Return a strictly valid JSON object matching this structure:
{
  "urgencyLevel": "Low" | "Medium" | "High",
  "chiefComplaint": "string",
  "suggestedQuestions": ["string"],
  "redFlagsIdentified": ["string"],
  "summary": "string",
  "disclaimer": "AI-generated preparation notes help organize the consultation. They are not a diagnosis or medical advice."
}`;

  try {
    const response = await openaiClient.chat.completions.create(
      {
        model: MODEL,
        messages: [
          { role: 'system', content: 'You format clinical intake summaries as strict JSON objects.' },
          { role: 'user', content: promptText },
        ],
        response_format: { type: 'json_object' },
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
      throw new Error('OpenAI request timed out after 10 seconds');
    }
    throw new Error(`OpenAI Pre-Visit Provider Error: ${err.message}`);
  }
}

export async function callOpenAiPostVisit(notes: string): Promise<{
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

  const promptText = `You are a clinical documentation assistant.
Summarize ONLY the doctor-entered consultation notes below.
STRICT RULE: Do NOT invent, assume, or add any medications, dosages, or treatments that are NOT explicitly stated in the doctor notes.

Doctor Consultation Notes:
"${notes.slice(0, 2000)}"

Return a strictly valid JSON object matching this structure:
{
  "patientInstructions": ["string"],
  "medicationSummary": [
    { "medication": "string", "dosage": "string", "frequency": "string", "instructions": "string" }
  ],
  "followUpSchedule": "string",
  "summary": "string",
  "disclaimer": "AI-generated consultation summaries organize clinical instructions only. Refer to direct doctor advice."
}`;

  try {
    const response = await openaiClient.chat.completions.create(
      {
        model: MODEL,
        messages: [
          { role: 'system', content: 'You format clinical consultation summaries as strict JSON objects.' },
          { role: 'user', content: promptText },
        ],
        response_format: { type: 'json_object' },
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
      throw new Error('OpenAI request timed out after 10 seconds');
    }
    throw new Error(`OpenAI Post-Visit Provider Error: ${err.message}`);
  }
}
