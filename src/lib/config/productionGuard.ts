export interface ProductionGuardResult {
  isProduction: boolean;
  isValid: boolean;
  errors: string[];
}

export function validateProductionEnvironment(): ProductionGuardResult {
  const isProduction = process.env.NODE_ENV === 'production';
  const isDevModeBypass = process.env.DEVELOPMENT_MODE === 'true';

  const errors: string[] = [];

  if (isProduction && !isDevModeBypass) {
    const emailProvider = process.env.EMAIL_PROVIDER || 'console';
    if (emailProvider === 'console' || emailProvider === 'mock') {
      errors.push('EMAIL_PROVIDER cannot be "console" or "mock" in production. Configured SMTP provider is required.');
    }

    const llmProvider = process.env.LLM_PROVIDER || 'openai';
    if (llmProvider === 'mock') {
      errors.push('LLM_PROVIDER cannot be "mock" in production. Live OpenAI provider is required.');
    }

    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      errors.push('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured for per-user Google OAuth.');
    }

    if (!process.env.GOOGLE_TOKEN_ENCRYPTION_KEY && !process.env.JWT_SECRET) {
      errors.push('GOOGLE_TOKEN_ENCRYPTION_KEY or JWT_SECRET must be set to encrypt Google OAuth tokens at rest.');
    }

    const dbUrl = process.env.DATABASE_URL || '';
    if (dbUrl.startsWith('file:') || dbUrl.includes('dev.db')) {
      errors.push('DATABASE_URL cannot point to SQLite in production. PostgreSQL connection URI is required.');
    }
  }

  return {
    isProduction,
    isValid: errors.length === 0,
    errors,
  };
}
