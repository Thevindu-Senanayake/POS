import { PrintAgent } from './agent';
import { ApiClient } from './api-client';
import { loadConfig } from './config';
import { error, log } from './log';
import { PrinterMap } from './printers';

async function main(): Promise<void> {
  const config = loadConfig(process.env);
  const api = new ApiClient(config.apiBaseUrl, config.token);
  const printers = new PrinterMap(api, config);
  const agent = new PrintAgent(api, printers, config);

  const shutdown = (signal: string): void => {
    log(`received ${signal}, shutting down`);
    agent.stop();
    setTimeout(() => process.exit(0), 200);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  await agent.start();
}

main().catch((err) => {
  error(`fatal: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
  process.exit(1);
});
