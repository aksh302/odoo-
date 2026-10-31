import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  port: parseInt(process.env.PORT || '4000', 10),
  databaseUrl: process.env.DATABASE_URL!,

  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '8h',
  },

  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',

  smtp: {
    host: process.env.SMTP_HOST || 'sandbox.smtp.mailtrap.io',
    port: parseInt(process.env.SMTP_PORT || '2525', 10),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || 'noreply@brightloop.dev',
  },

  cron: {
    billing: process.env.BILLING_CRON || '30 1 * * *',
    lifecycle: process.env.LIFECYCLE_CRON || '0 1 * * *',
  },

  demoMode: process.env.DEMO_MODE === 'true',
  tz: process.env.TZ || 'Asia/Kolkata',

  ai: {
    enabled: process.env.AI_ENABLED === 'true',
    provider: (process.env.LLM_PROVIDER || 'gemini') as 'gemini' | 'anthropic' | 'openai',
    apiKey: process.env.LLM_API_KEY || '',
    model: process.env.LLM_MODEL || 'gemini-2.0-flash',
    timeoutMs: parseInt(process.env.AI_TIMEOUT_MS || '8000', 10),
    cache: process.env.AI_CACHE !== 'false',
  },
};

