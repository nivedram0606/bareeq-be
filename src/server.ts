import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';

const server = createApp().listen(env.PORT, () => {
  logger.info(`API listening on http://localhost:${env.PORT}/api/v1`);
});

function shutdown(signal: string): void {
  logger.info(`${signal} received, shutting down`);
  server.close(() => process.exit(0));
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
