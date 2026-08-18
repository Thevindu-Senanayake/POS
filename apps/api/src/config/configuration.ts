/**
 * Typed application configuration, loaded once and injected via ConfigService.
 * Values are read from process.env (populated by dotenv in dev, real env in prod).
 */
export interface JwtConfig {
  accessSecret: string;
  refreshSecret: string;
  accessTtl: string;
  refreshTtl: string;
}

export interface AppConfig {
  port: number;
  corsOrigin: string[];
  jwt: JwtConfig;
  printAgentToken: string;
  currencySymbol: string;
}

export default (): AppConfig => ({
  port: parseInt(process.env.API_PORT ?? '4000', 10),
  corsOrigin: (process.env.CORS_ORIGIN ?? 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret',
    accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    refreshTtl: process.env.JWT_REFRESH_TTL ?? '7d',
  },
  printAgentToken: process.env.PRINT_AGENT_TOKEN ?? 'dev-print-agent-token',
  currencySymbol: process.env.CURRENCY_SYMBOL ?? '₨',
});
