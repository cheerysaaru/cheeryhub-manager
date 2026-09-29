import { env } from 'cloudflare:workers';
import { httpServerHandler } from 'cloudflare:node';

import { createApp } from './app';
import { configurePrisma } from './lib/prisma';
import { configureRuntime } from './lib/config';

configureRuntime({
  jwtSecret: env.JWT_SECRET ?? process.env.JWT_SECRET,
  frontendUrl: env.FRONTEND_URL ?? process.env.FRONTEND_URL,
  cookieSecure: true,
  cookieSameSite: 'none',
  emailApiKey: env.EMAIL_API_KEY,
  emailFrom: env.EMAIL_FROM,
  appUrl: env.APP_URL,
});

configurePrisma(env.DB);

const app = createApp({ rateLimit: true });

app.listen(3000);

export default httpServerHandler({
  port: 3000,
});
