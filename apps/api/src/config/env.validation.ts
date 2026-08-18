import { z } from 'zod';

/**
 * Fail fast at boot if required environment variables are missing or malformed.
 * Runs against the raw process.env before the app is created.
 */
const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  API_PORT: z.string().optional(),
  CORS_ORIGIN: z.string().optional(),
  JWT_ACCESS_SECRET: z.string().min(1, 'JWT_ACCESS_SECRET is required'),
  JWT_REFRESH_SECRET: z.string().min(1, 'JWT_REFRESH_SECRET is required'),
  JWT_ACCESS_TTL: z.string().optional(),
  JWT_REFRESH_TTL: z.string().optional(),
  PRINT_AGENT_TOKEN: z.string().min(1, 'PRINT_AGENT_TOKEN is required'),
  CURRENCY_SYMBOL: z.string().optional(),
});

export function validate(config: Record<string, unknown>): Record<string, unknown> {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return config;
}
