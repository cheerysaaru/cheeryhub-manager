import { bootstrapEnv } from './loadEnv';
import http from 'http';
import { createApp } from './app';
import { initSocket } from './lib/socket';
import { logError } from './lib/logger';

// Fails fast with a readable message if JWT_SECRET / DATABASE_URL are missing
// or malformed — before a single request can be served.
const env = bootstrapEnv();

const app = createApp();
const server = http.createServer(app);

initSocket(server);

server.on('error', (error) => {
  logError(undefined, error, { stage: 'listen', port: env.PORT });
  console.error(`API failed to start on port ${env.PORT}: ${error.message}`);
  process.exit(1);
});

server.listen(env.PORT, '127.0.0.1', () => {
  console.log(`API listening on 127.0.0.1:${env.PORT} (${env.NODE_ENV})`);
});
