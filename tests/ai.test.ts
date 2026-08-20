import test from 'node:test';
import assert from 'node:assert/strict';
import { invokePreVisitLLM, invokePostVisitLLM, MEDICAL_DISCLAIMER } from '../src/lib/ai/adapter';

test('AI Module: Pre-Visit Symptom Summary Generation & Zod Validation', async () => {
  const result = await invokePreVisitLLM('Patient experiences severe dizziness and intermittent chest pressure');
  
  assert.ok(result.summary, 'Summary must be present');
  assert.ok(result.suggestedFocus, 'Suggested focus must be present');
  assert.equal(result.disclaimer, MEDICAL_DISCLAIMER, 'Medical disclaimer must be included');
});

test('AI Module: Input Truncation Safety Limit (Max 2000 chars)', async () => {
  const oversizedInput = 'A'.repeat(5000);
  const result = await invokePreVisitLLM(oversizedInput);
  
  assert.ok(result.summary.length < 3000, 'Output must handle oversized input safely');
});

test('AI Module: Post-Visit Summary & Patient Instructions', async () => {
  const result = await invokePostVisitLLM('Diagnosed mild acute bronchitis. Prescribed Amoxicillin 500mg daily.');
  
  assert.ok(result.consultationSummary, 'Consultation summary must exist');
  assert.ok(result.patientInstructions, 'Patient instructions must exist');
  assert.equal(result.disclaimer, MEDICAL_DISCLAIMER, 'Medical disclaimer must be included');
});
