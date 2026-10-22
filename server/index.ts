import { createApp } from './app.js';
try {
  process.loadEnvFile();
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}
const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('PORT must be an integer between 1 and 65535');
const instance = createApp({ seed: process.env.AUTO_SEED === 'true' });
const server = instance.app.listen(port, '127.0.0.1', () => {
  console.log(`3legant API listening on port ${port}. Payment mode: demo (no charges).`);
});
const shutdown = () => {
  server.close(() => {
    instance.close();
    process.exit(0);
  });
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
