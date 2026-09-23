import { env } from 'cloudflare:workers';
import { httpServerHandler } from 'cloudflare:node';

import { createApp } from './app';
import { configurePrisma } from './lib/prisma';
import { configureRuntime } from './lib/config';

configureRuntime({
  jwtSecret: env.JWT_SECRET,
  frontendUrl: env.FRONTEND_URL,
  cookieSecure: true,
  cookieSameSite: 'none',
});

configurePrisma(env.DB);

const app = createApp({ rateLimit: true });

app.listen(3000);

export default httpServerHandler({
  port: 3000,
});
