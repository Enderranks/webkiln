import { betterAuth } from 'better-auth';
import type { Env } from './env';

export function getAuth(env: Env) {
  if (!env.BETTER_AUTH_SECRET) throw new Error('BETTER_AUTH_SECRET is not configured');
  return betterAuth({
    database: env.DB,
    baseURL: env.AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.APP_ORIGIN],
    emailAndPassword: { enabled: true },
    advanced: { database: { validateSchema: false } },
  });
}
